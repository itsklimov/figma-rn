/**
 * Styles Builder - Generate StyleSheet from StylesBundle
 */

import type { StylesBundle, ExtractedStyle, LayoutMeta, IRNode } from '../types.js';
import type { TokenMappings } from '../mapping/token-matcher.js';
import { toValidIdentifier, formatInteger, formatSmart, formatFloat } from './utils.js';

/**
 * Apply scaling function to a value if specified
 */
function applyScaling(value: string | number, scaleFunction?: string): string {
  if (!scaleFunction) return String(value);
  // Don't scale percentages
  if (typeof value === 'string' && value.endsWith('%')) return value;
  return `${scaleFunction}(${value})`;
}

/**
 * Helper to format width/height which can be string or number
 */
function formatDim(val: string | number, scaleFn?: string): string {
   if (typeof val === 'number') {
     return applyScaling(formatInteger(val), scaleFn);
   }
   return val; // Return string directly (e.g. "50%")
}


/**
 * Map a color value using token mappings
 * Returns theme path if mapped, raw value otherwise
 */
export function mapColor(hex: string, mappings: TokenMappings): { value: string; mapped: boolean } {
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
function mapNumber(value: number, category: 'spacing' | 'radii', mappings: TokenMappings): { value: string; mapped: boolean } {
  const categoryMappings = mappings[category] || {};

  const mapped = categoryMappings[value];
  if (mapped && String(mapped) !== String(value)) {
    return { value: mapped, mapped: true };
  }

  // Format unmapped values based on category
  if (category === 'spacing') {
    return { value: formatInteger(value), mapped: false };
  } else {
    // radii
    return { value: formatSmart(value), mapped: false };
  }
}

/**
 * Convert LayoutMeta to flex style properties
 */
function layoutToStyleProps(layout: LayoutMeta, mappings: TokenMappings, scaleFunction?: string): string[] {
  const props: string[] = [];
  const sc = (val: string | number) => applyScaling(val, scaleFunction);

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
    const { value, mapped } = mapNumber(layout.gap, 'spacing', mappings);
    props.push(`    gap: ${mapped ? value : sc(value)},`);
  }

  // Padding
  const { top, right, bottom, left } = layout.padding;
  if (top > 0) {
    const { value, mapped } = mapNumber(top, 'spacing', mappings);
    props.push(`    paddingTop: ${mapped ? value : sc(value)},`);
  }
  if (right > 0) {
    const { value, mapped } = mapNumber(right, 'spacing', mappings);
    props.push(`    paddingRight: ${mapped ? value : sc(value)},`);
  }
  if (bottom > 0) {
    const { value, mapped } = mapNumber(bottom, 'spacing', mappings);
    props.push(`    paddingBottom: ${mapped ? value : sc(value)},`);
  }
  if (left > 0) {
    const { value, mapped } = mapNumber(left, 'spacing', mappings);
    props.push(`    paddingLeft: ${mapped ? value : sc(value)},`);
  }

  return props;
}

/**
 * Build style properties from ExtractedStyle
 */
interface LayoutWithContext extends LayoutMeta {
  parentType?: 'row' | 'column' | 'stack' | 'absolute';
}

/**
 * Build style properties from ExtractedStyle
 */
/**
 * Build style properties from ExtractedStyle
 */
function buildStyleProps(
  style: ExtractedStyle,
  layout: LayoutWithContext | undefined,
  mappings: TokenMappings,
  unmapped: { colors: Set<string>; spacing: Set<number>; radii: Set<number> },
  options?: { suppressTodos?: boolean; scaleFunction?: string }
): string {
  const lines: string[] = [];
  const suppress = options?.suppressTodos;
  const scale = options?.scaleFunction;
  const sc = (val: string | number) => applyScaling(val, scale);

  // 1. Layout props (if container/card)
  if (layout) {
    lines.push(...layoutToStyleProps(layout, mappings, scale));
    
    // Detect root container (no parent, device-sized dimensions)
    const isRootContainer = !layout.parentType && 
      typeof style.width === 'number' && typeof style.height === 'number' &&
      style.width >= 350 && style.height >= 700;
    
    if (isRootContainer) {
      // Root container uses flex instead of fixed device dimensions
      lines.push(`    flex: 1,`);
    } else if (layout.sizing) {
      // Fluid Layout Sizing - prioritize Flexbox sizing over fixed width/height
      const { horizontal, vertical } = layout.sizing;
      const { parentType } = layout;

      // Horizontal Sizing
      if (horizontal === 'fill') {
        if (parentType === 'row') {
          lines.push(`    flex: 1,`); // Grow in Row
        } else {
          lines.push(`    width: '100%',`); // Stretch in Column
        }
      } else if (horizontal === 'hug') {
        lines.push(`    alignSelf: 'flex-start',`); // Default hug behavior
      } else if (style.width !== undefined) {
        // Fixed
        lines.push(`    width: ${formatDim(style.width, scale)},`);
      }

      // Vertical Sizing
      if (vertical === 'fill') {
        if (parentType === 'column') {
          lines.push(`    flex: 1,`); // Grow in Column
        } else {
          lines.push(`    height: '100%',`); // Stretch in Row
        }
      } else if (vertical === 'hug') {
         // managed by content
      } else if (style.height !== undefined) {
        // Fixed
        lines.push(`    height: ${formatDim(style.height, scale)},`);
      }

    } else {
      // Fallback to Fixed if no sizing info (legacy)
      if (style.width !== undefined) lines.push(`    width: ${formatDim(style.width, scale)},`);
      if (style.height !== undefined) lines.push(`    height: ${formatDim(style.height, scale)},`);
    }

  } else {
    // Non-layout nodes (Text, Image) - simple fixed sizing for now
    // TODO: They might also have sizing modes in the future
    if (style.width !== undefined) lines.push(`    width: ${formatDim(style.width, scale)},`);
    if (style.height !== undefined) lines.push(`    height: ${formatDim(style.height, scale)},`);
  }

  // 1.5 Positioning (Absolute)
  if (style.position) lines.push(`    position: '${style.position}',`);
  if (style.left !== undefined) lines.push(`    left: ${formatDim(style.left, scale)},`);
  if (style.right !== undefined) lines.push(`    right: ${formatDim(style.right, scale)},`);
  if (style.top !== undefined) lines.push(`    top: ${formatDim(style.top, scale)},`);
  if (style.bottom !== undefined) lines.push(`    bottom: ${formatDim(style.bottom, scale)},`);

  // 3. Border
  if (style.borderWidth !== undefined) {
    lines.push(`    borderWidth: ${formatSmart(style.borderWidth)},`);
  }
  if (style.borderColor) {
    const { value, mapped } = mapColor(style.borderColor, mappings);
    lines.push(`    borderColor: ${value},${!mapped && !suppress ? ' // TODO: map to theme' : ''}`);
    if (!mapped) unmapped.colors.add(style.borderColor);
  }

  // 4. Border Radius
  if (style.borderRadius !== undefined) {
    if (typeof style.borderRadius === 'number') {
      const { value, mapped } = mapNumber(style.borderRadius, 'radii', mappings);
      lines.push(`    borderRadius: ${mapped ? value : sc(value)},${!mapped && !suppress ? ' // TODO: map to theme' : ''}`);
      if (!mapped) unmapped.radii.add(style.borderRadius);
    } else {
      // Individual corners
      const { topLeft, topRight, bottomRight, bottomLeft } = style.borderRadius;
      if (topLeft > 0) lines.push(`    borderTopLeftRadius: ${sc(formatSmart(topLeft))},`);
      if (topRight > 0) lines.push(`    borderTopRightRadius: ${sc(formatSmart(topRight))},`);
      if (bottomRight > 0) lines.push(`    borderBottomRightRadius: ${sc(formatSmart(bottomRight))},`);
      if (bottomLeft > 0) lines.push(`    borderBottomLeftRadius: ${sc(formatSmart(bottomLeft))},`);
    }
  }

  // 5. Background (skip if gradient present or if this is a Text node)
  // Text nodes should only use `color`, not `backgroundColor`
  const isTextNode = style.typography != null;
  if (style.backgroundColor && !style.backgroundGradient && !isTextNode) {
    const { value, mapped } = mapColor(style.backgroundColor, mappings);
    lines.push(`    backgroundColor: ${value},${!mapped && !suppress ? ' // TODO: map to theme' : ''}`);
    if (!mapped) unmapped.colors.add(style.backgroundColor);
  }

  // 6. Opacity
  if (style.opacity !== undefined && style.opacity < 1) {
    lines.push(`    opacity: ${formatFloat(style.opacity)},`);
  }

  // 7. Shadow
  if (style.shadow) {
    const { color, offsetX, offsetY, blur, spread } = style.shadow;
    const shadowMappings = mappings.shadows || {};
    
    // Find if this shadow is mapped
    const shadowKey = `${offsetX ?? 0},${offsetY ?? 0},${blur ?? 0},${spread ?? 0}`;
    const mappedShadow = shadowMappings[shadowKey];

    if (mappedShadow && mappedShadow !== shadowKey) {
      lines.push(`    ...${mappedShadow},`);
    } else {
      const { value: shadowColor, mapped } = mapColor(color, mappings);
      lines.push(`    shadowColor: ${shadowColor},${!mapped && !suppress ? ' // TODO: map to theme' : ''}`);
      lines.push(`    shadowOffset: { width: ${formatSmart(offsetX)}, height: ${formatSmart(offsetY)} },`);
      lines.push(`    shadowOpacity: 1,`);
      lines.push(`    shadowRadius: ${formatSmart(blur)},`);
      lines.push(`    elevation: ${Math.ceil(blur / 2)},`); 
      if (!mapped) unmapped.colors.add(color);
    }
  }

  // 8. Typography
  if (style.typography) {
    const { fontFamily, fontSize, fontWeight, lineHeight, letterSpacing, textAlign, color } = style.typography;
    const typoMappings = mappings.typography || {};
    
    // Find if this specific typography is mapped
    const typoKey = `${fontFamily || ''}-${fontSize || 0}-${fontWeight || 0}-${lineHeight || 0}`;
    const mappedTypo = typoMappings[typoKey];

    if (mappedTypo && mappedTypo !== typoKey) {
      lines.push(`    ...${mappedTypo},`);
    } else {
      if (fontFamily) lines.push(`    fontFamily: '${fontFamily}',`);
      if (fontSize) lines.push(`    fontSize: ${sc(formatInteger(fontSize))},`);
      if (fontWeight) lines.push(`    fontWeight: '${fontWeight}',`);
      if (lineHeight) lines.push(`    lineHeight: ${sc(formatInteger(lineHeight))},`);
    }

    if (letterSpacing) lines.push(`    letterSpacing: ${formatFloat(letterSpacing)},`);
    if (textAlign && textAlign !== 'left') lines.push(`    textAlign: '${textAlign}',`);
    if (color) {
      const { value, mapped } = mapColor(color, mappings);
      lines.push(`    color: ${value},${!mapped && !suppress ? ' // TODO: map to theme' : ''}`);
      if (!mapped) unmapped.colors.add(color);
    }
  }

  return lines.join('\n');
}

/**
 * Collect layout info for a node by name (used for style matching)
 * Now context-aware and uses styleRef as key
 */
function collectLayouts(
  node: IRNode, 
  map: Map<string, LayoutWithContext>, 
  parentType?: 'row' | 'column' | 'stack' | 'absolute'
): void {
  if (node.semanticType === 'Container' || node.semanticType === 'Card' || node.semanticType === 'Component') {
    // Store layout with parent context
    map.set(node.styleRef, {
      ...node.layout,
      parentType
    });
    
    // Recurse with OUR type as parent
    for (const child of node.children) {
      collectLayouts(child, map, node.layout.type);
    }
  }
}

/**
 * Build StyleSheet.create() string from StylesBundle
 */
export function buildStyles(
  root: IRNode,
  stylesBundle: StylesBundle,
  mappings: TokenMappings,
  options?: { 
    usedStyles?: Set<string>;
    suppressTodos?: boolean;
    scaleFunction?: string;
  }
): { code: string; unmapped: { colors: string[]; spacing: number[]; radii: number[] } } {
  const unmapped = {
    colors: new Set<string>(),
    spacing: new Set<number>(),
    radii: new Set<number>(),
  };

  // Collect layout info by node ID
  const layoutMap = new Map<string, LayoutWithContext>();
  collectLayouts(root, layoutMap);

  const styleEntries: string[] = [];

  for (const [styleRef, extractedStyle] of Object.entries(stylesBundle.styles)) {
    const styleName = toValidIdentifier(extractedStyle.id);
    
    // Fix 8: Skip styles that aren't referenced in JSX (if usedStyles provided)
    if (options?.usedStyles && options.usedStyles.size > 0 && !options.usedStyles.has(styleName)) {
      continue;
    }
    
    const layout = layoutMap.get(styleRef);
    const props = buildStyleProps(extractedStyle, layout, mappings, unmapped, options);

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
