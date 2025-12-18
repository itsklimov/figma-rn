/**
 * Styles Builder - Generate StyleSheet from StylesBundle
 */

import type { StylesBundle, ExtractedStyle, LayoutMeta, IRNode } from '../types.js';
import type { TokenMappings } from '../mapping/token-matcher.js';
import { toValidIdentifier } from './utils.js';


/**
 * Map a color value using token mappings
 * Returns theme path if mapped, raw value otherwise
 */
function mapColor(hex: string, mappings: TokenMappings): { value: string; mapped: boolean } {
  const colorMappings = mappings.colors || {};


  // Direct lookup
  const mapped = colorMappings[hex];
  if (mapped && mapped !== hex) {
    return { value: mapped, mapped: true };
  }

  return { value: `'${hex}'`, mapped: false };
}

/**
 * Map a numeric value (spacing/radius) using token mappings
 */
function mapNumber(value: number, category: string, mappings: TokenMappings): { value: string; mapped: boolean } {
  const categoryMappings = mappings[category] || {};

  const mapped = categoryMappings[value];
  if (mapped && String(mapped) !== String(value)) {
    return { value: mapped, mapped: true };
  }

  return { value: String(value), mapped: false };
}

/**
 * Convert LayoutMeta to flex style properties
 */
function layoutToStyleProps(layout: LayoutMeta): string[] {
  const props: string[] = [];

  // Direction
  if (layout.type === 'row') {
    props.push(`    flexDirection: 'row',`);
  } else if (layout.type === 'column') {
    props.push(`    flexDirection: 'column',`);
  }

  // Main axis alignment
  const mainMap: Record<string, string> = {
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    'space-between': 'space-between',
    'space-around': 'space-around',
  };
  if (layout.mainAlign && layout.mainAlign !== 'start') {
    props.push(`    justifyContent: '${mainMap[layout.mainAlign]}',`);
  }

  // Cross axis alignment
  const crossMap: Record<string, string> = {
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    stretch: 'stretch',
    baseline: 'baseline',
  };
  if (layout.crossAlign && layout.crossAlign !== 'stretch') {
    props.push(`    alignItems: '${crossMap[layout.crossAlign]}',`);
  }

  // Gap
  if (layout.gap > 0) {
    props.push(`    gap: ${layout.gap},`);
  }

  // Padding
  const { top, right, bottom, left } = layout.padding;
  if (top > 0) props.push(`    paddingTop: ${top},`);
  if (right > 0) props.push(`    paddingRight: ${right},`);
  if (bottom > 0) props.push(`    paddingBottom: ${bottom},`);
  if (left > 0) props.push(`    paddingLeft: ${left},`);

  return props;
}

/**
 * Build style properties from ExtractedStyle
 */
function buildStyleProps(
  style: ExtractedStyle,
  layout: LayoutMeta | undefined,
  mappings: TokenMappings,
  unmapped: { colors: Set<string>; spacing: Set<number>; radii: Set<number> }
): string {
  const lines: string[] = [];

  // 1. Layout props (if container/card)
  if (layout) {
    lines.push(...layoutToStyleProps(layout));
  }

  // 2. Size
  if (style.width !== undefined) {
    lines.push(`    width: ${style.width},`);
  }
  if (style.height !== undefined) {
    lines.push(`    height: ${style.height},`);
  }

  // 3. Border
  if (style.borderWidth !== undefined) {
    lines.push(`    borderWidth: ${style.borderWidth},`);
  }
  if (style.borderColor) {
    const { value, mapped } = mapColor(style.borderColor, mappings);
    lines.push(`    borderColor: ${value},${!mapped ? ' // TODO: map to theme' : ''}`);
    if (!mapped) unmapped.colors.add(style.borderColor);
  }

  // 4. Border Radius
  if (style.borderRadius !== undefined) {
    if (typeof style.borderRadius === 'number') {
      const { value, mapped } = mapNumber(style.borderRadius, 'radii', mappings);
      lines.push(`    borderRadius: ${value},${!mapped ? ' // TODO: map to theme' : ''}`);
      if (!mapped) unmapped.radii.add(style.borderRadius);
    } else {
      // Individual corners
      const { topLeft, topRight, bottomRight, bottomLeft } = style.borderRadius;
      if (topLeft > 0) lines.push(`    borderTopLeftRadius: ${topLeft},`);
      if (topRight > 0) lines.push(`    borderTopRightRadius: ${topRight},`);
      if (bottomRight > 0) lines.push(`    borderBottomRightRadius: ${bottomRight},`);
      if (bottomLeft > 0) lines.push(`    borderBottomLeftRadius: ${bottomLeft},`);
    }
  }

  // 5. Background
  if (style.backgroundColor) {
    const { value, mapped } = mapColor(style.backgroundColor, mappings);
    lines.push(`    backgroundColor: ${value},${!mapped ? ' // TODO: map to theme' : ''}`);
    if (!mapped) unmapped.colors.add(style.backgroundColor);
  }

  // 6. Opacity
  if (style.opacity !== undefined && style.opacity < 1) {
    lines.push(`    opacity: ${style.opacity},`);
  }

  // 7. Shadow
  if (style.shadow) {
    const { color, offsetX, offsetY, blur } = style.shadow;
    const { value: shadowColor, mapped } = mapColor(color, mappings);
    lines.push(`    shadowColor: ${shadowColor},${!mapped ? ' // TODO: map to theme' : ''}`);
    lines.push(`    shadowOffset: { width: ${offsetX}, height: ${offsetY} },`);
    lines.push(`    shadowOpacity: 1,`);
    lines.push(`    shadowRadius: ${blur},`);
    lines.push(`    elevation: ${Math.ceil(blur / 2)},`);
    if (!mapped) unmapped.colors.add(color);
  }

  // 8. Typography
  if (style.typography) {
    const { fontFamily, fontSize, fontWeight, lineHeight, letterSpacing, textAlign, color } = style.typography;
    if (fontFamily) lines.push(`    fontFamily: '${fontFamily}',`);
    if (fontSize) lines.push(`    fontSize: ${fontSize},`);
    if (fontWeight) lines.push(`    fontWeight: '${fontWeight}',`);
    if (lineHeight) lines.push(`    lineHeight: ${lineHeight},`);
    if (letterSpacing) lines.push(`    letterSpacing: ${letterSpacing},`);
    if (textAlign && textAlign !== 'left') lines.push(`    textAlign: '${textAlign}',`);
    if (color) {
      const { value, mapped } = mapColor(color, mappings);
      lines.push(`    color: ${value},${!mapped ? ' // TODO: map to theme' : ''}`);
      if (!mapped) unmapped.colors.add(color);
    }
  }

  return lines.join('\n');
}

/**
 * Collect layout info for a node by name (used for style matching)
 */
function collectLayouts(node: IRNode, map: Map<string, LayoutMeta>): void {
  if (node.semanticType === 'Container' || node.semanticType === 'Card') {
    // Use node name as key since ExtractedStyle.id corresponds to node name
    map.set(node.name, node.layout);
    for (const child of node.children) {
      collectLayouts(child, map);
    }
  }
}

/**
 * Build StyleSheet.create() string from StylesBundle
 */
export function buildStyles(
  root: IRNode,
  stylesBundle: StylesBundle,
  mappings: TokenMappings
): { code: string; unmapped: { colors: string[]; spacing: number[]; radii: number[] } } {
  const unmapped = {
    colors: new Set<string>(),
    spacing: new Set<number>(),
    radii: new Set<number>(),
  };

  // Collect layout info by node ID
  const layoutMap = new Map<string, LayoutMeta>();
  collectLayouts(root, layoutMap);

  const styleEntries: string[] = [];

  for (const [styleRef, extractedStyle] of Object.entries(stylesBundle.styles)) {
    const styleName = toValidIdentifier(extractedStyle.id);
    const layout = layoutMap.get(extractedStyle.id);
    const props = buildStyleProps(extractedStyle, layout, mappings, unmapped);

    if (props.trim()) {
      styleEntries.push(`  ${styleName}: {\n${props}\n  },`);
    } else {
      styleEntries.push(`  ${styleName}: {},`);
    }
  }

  const code = `const styles = StyleSheet.create({
${styleEntries.join('\n')}
});`;

  return {
    code,
    unmapped: {
      colors: Array.from(unmapped.colors),
      spacing: Array.from(unmapped.spacing),
      radii: Array.from(unmapped.radii),
    },
  };
}
