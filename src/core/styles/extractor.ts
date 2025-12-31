/**
 * Styles extractor - extracts visual styles from IR nodes
 */

import type {
  IRNode,
  ExtractedStyle,
  StylesBundle,
  DesignTokens,
  Fill,
  Stroke,
  Effect,
  CornerRadius,
  TypographyInfo,
} from '../types.js';

/**
 * Resolve effective color by combining base color with fill opacity
 * Output is always uppercase (#RRGGBB or #RRGGBBAA)
 */
function resolveEffectiveColor(color: { hex: string; rgba: { r: number; g: number; b: number; a: number } }, opacity: number): string {
  const finalAlpha = color.rgba.a * opacity;
  const toHex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();

  if (finalAlpha >= 0.995) {
    // Return standard 6-digit hex (normalized to uppercase)
    return `#${toHex(color.rgba.r)}${toHex(color.rgba.g)}${toHex(color.rgba.b)}`;
  } else {
    // Return 8-digit hex for semi-transparent colors
    return `#${toHex(color.rgba.r)}${toHex(color.rgba.g)}${toHex(color.rgba.b)}${toHex(Math.round(finalAlpha * 255))}`;
  }
}

/**
 * Extract background style from fills
 */
export function fillsToBackground(
  fills: Fill[] | undefined
): Pick<ExtractedStyle, 'backgroundColor' | 'backgroundGradient'> {
  if (!fills || fills.length === 0) {
    return {};
  }

  // Find first visible fill
  const fill = fills.find(f => f.opacity > 0);
  if (!fill) {
    return {};
  }

  if (fill.type === 'solid') {
    return { backgroundColor: resolveEffectiveColor(fill.color, fill.opacity) };
  }

  if (fill.type === 'gradient') {
    return {
      backgroundGradient: {
        type: fill.gradient.type,
        colors: fill.gradient.stops.map(stop => resolveEffectiveColor(stop.color, fill.opacity)),
        positions: fill.gradient.stops.map(stop => stop.position),
        angle: fill.gradient.angle,
      },
    };
  }

  return {};
}

/**
 * Extract border style from strokes
 */
export function strokesToBorder(
  strokes: Stroke[] | undefined
): Pick<ExtractedStyle, 'borderColor' | 'borderWidth'> {
  if (!strokes || strokes.length === 0) {
    return {};
  }

  const stroke = strokes[0];
  return {
    borderColor: resolveEffectiveColor(stroke.color, stroke.opacity ?? 1),
    borderWidth: stroke.weight,
  };
}

/**
 * Extract shadow style from effects
 */
export function effectsToShadow(
  effects: Effect[] | undefined
): ExtractedStyle['shadow'] | undefined {
  if (!effects || effects.length === 0) {
    return undefined;
  }

  const shadow = effects.find(e => e.type === 'drop-shadow');
  if (!shadow || shadow.type !== 'drop-shadow') {
    return undefined;
  }

  return {
    color: resolveEffectiveColor(shadow.color, 1), // Effects already have color.rgba.a
    offsetX: shadow.offset.x,
    offsetY: shadow.offset.y,
    blur: shadow.radius,
    spread: shadow.spread,
  };
}

/**
 * Convert corner radius to style format
 */
export function cornerRadiusToStyle(
  cornerRadius: CornerRadius | undefined
): ExtractedStyle['borderRadius'] | undefined {
  if (cornerRadius === undefined) {
    return undefined;
  }

  if (typeof cornerRadius === 'number') {
    return cornerRadius === 0 ? undefined : cornerRadius;
  }

  // Per-corner radius
  return cornerRadius;
}

/**
 * Extract typography style
 */
export function typographyToStyle(
  typography: TypographyInfo | undefined,
  fills: Fill[] | undefined
): ExtractedStyle['typography'] | undefined {
  if (!typography) {
    return undefined;
  }

  // Get text color from fills
  let color = '#000000';
  if (fills) {
    const solidFill = fills.find(f => f.type === 'solid');
    if (solidFill && solidFill.type === 'solid') {
      color = resolveEffectiveColor(solidFill.color, solidFill.opacity);
    } else {
      // Fallback to first stop of gradient if present
      const gradientFill = fills.find(f => f.type === 'gradient');
      if (gradientFill && gradientFill.type === 'gradient' && gradientFill.gradient.stops.length > 0) {
        color = resolveEffectiveColor(gradientFill.gradient.stops[0].color, gradientFill.opacity);
      }
    }
  }

  return {
    fontFamily: typography.fontFamily,
    fontSize: typography.fontSize,
    fontWeight: typography.fontWeight,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing,
    textAlign: typography.textAlign,
    color,
  };
}

/**
 * Get the original LayoutNode properties from an IRNode
 * Since we don't store them directly, we need to use the styleRef to look them up
 */
interface NodeVisualProps {
  fills?: Fill[];
  strokes?: Stroke[];
  effects?: Effect[];
  cornerRadius?: CornerRadius;
  opacity?: number;
  typography?: TypographyInfo;
  width: number | string;
  height: number | string;
  // Positioning
  position?: 'absolute' | 'relative';
  left?: number | string;
  right?: number | string;
  top?: number | string;
  bottom?: number | string;
  // Layout Meta
  layout?: import('../types.js').LayoutMeta;
}

/**
 * Extract style from visual properties
 */
export function extractStyleFromProps(
  id: string,
  props: NodeVisualProps
): ExtractedStyle {
  const style: ExtractedStyle = { id };

  // Background
  const bgStyle = fillsToBackground(props.fills);
  if (bgStyle.backgroundColor) style.backgroundColor = bgStyle.backgroundColor;
  if (bgStyle.backgroundGradient) style.backgroundGradient = bgStyle.backgroundGradient;

  // Border
  const borderStyle = strokesToBorder(props.strokes);
  if (borderStyle.borderColor) style.borderColor = borderStyle.borderColor;
  if (borderStyle.borderWidth) style.borderWidth = borderStyle.borderWidth;

  // Border radius
  const borderRadius = cornerRadiusToStyle(props.cornerRadius);
  if (borderRadius) style.borderRadius = borderRadius;

  // Shadow
  const shadow = effectsToShadow(props.effects);
  if (shadow) style.shadow = shadow;

  // Typography
  const typography = typographyToStyle(props.typography, props.fills);
  if (typography) style.typography = typography;

  // Size
  if (typeof props.width === 'number') style.width = Math.round(props.width);
  else if (props.width !== undefined) style.width = props.width;

  if (typeof props.height === 'number') style.height = Math.round(props.height);
  else if (props.height !== undefined) style.height = props.height;
  
  // Positioning
  if (props.position) style.position = props.position;

  if (typeof props.left === 'number') style.left = Math.round(props.left);
  else if (props.left !== undefined) style.left = props.left;

  if (typeof props.right === 'number') style.right = Math.round(props.right);
  else if (props.right !== undefined) style.right = props.right;

  if (typeof props.top === 'number') style.top = Math.round(props.top);
  else if (props.top !== undefined) style.top = props.top;

  if (typeof props.bottom === 'number') style.bottom = Math.round(props.bottom);
  else if (props.bottom !== undefined) style.bottom = props.bottom;

  // Opacity
  if (props.opacity !== undefined && props.opacity !== 1) {
    style.opacity = props.opacity;
  }

  // Layout (Flexbox)
  if (props.layout) {
    const { layout } = props;
    
    if (layout.type === 'row' || layout.type === 'column' || layout.type === 'stack') {
      style.flexDirection = layout.type === 'row' ? 'row' : 'column';
      
      if (layout.gap) style.gap = layout.gap;
      if (layout.padding) style.padding = layout.padding;
      
      // Alignments
      if (layout.mainAlign !== 'start') {
        const map: Record<string, string> = {
          'center': 'center',
          'end': 'flex-end',
          'space-between': 'space-between',
          'space-around': 'space-around'
        };
        style.justifyContent = map[layout.mainAlign];
      }
      
      if (layout.crossAlign !== 'start') {
        const map: Record<string, string> = {
          'center': 'center',
          'end': 'flex-end',
          'stretch': 'stretch',
          'baseline': 'baseline'
        };
        style.alignItems = map[layout.crossAlign];
      }

      // Sizing (flex: 1 for fill)
      // Note: This logic might be refined based on parent's layout type
      if (layout.sizing.horizontal === 'fill' && layout.type === 'column') {
         // horizontal fill in column -> stretch (handled by alignItems: stretch usually, or width: '100%')
         // but if we want flex: 1, it only applies to main axis
      }
      
      if (layout.type === 'row' && layout.sizing.horizontal === 'fill') style.flex = 1;
      if (layout.type === 'column' && layout.sizing.vertical === 'fill') style.flex = 1;
      
      // If it's a "hug" container, we might want to remove explicit width/height
      if (layout.sizing.horizontal === 'hug') delete style.width;
      if (layout.sizing.vertical === 'hug') delete style.height;
    }
  }

  return style;
}

/**
 * Collect all unique colors from styles
 */
function collectColors(styles: Record<string, ExtractedStyle>): Record<string, string> {
  const colors: Record<string, string> = {};
  let colorIndex = 0;

  for (const style of Object.values(styles)) {
    if (style.backgroundColor && !Object.values(colors).includes(style.backgroundColor)) {
      colors[`color_${colorIndex++}`] = style.backgroundColor;
    }
    if (style.borderColor && !Object.values(colors).includes(style.borderColor)) {
      colors[`color_${colorIndex++}`] = style.borderColor;
    }
    if (style.shadow?.color && !Object.values(colors).includes(style.shadow.color)) {
      colors[`color_${colorIndex++}`] = style.shadow.color;
    }
    if (style.typography?.color && !Object.values(colors).includes(style.typography.color)) {
      colors[`color_${colorIndex++}`] = style.typography.color;
    }
  }

  return colors;
}

/**
 * Collect all unique spacing values
 */
function collectSpacing(styles: Record<string, ExtractedStyle>): Record<string, number> {
  const spacing: Record<string, number> = {};
  const values = new Set<number>();

  for (const style of Object.values(styles)) {
    if (typeof style.width === 'number') values.add(style.width);
    if (typeof style.height === 'number') values.add(style.height);
    if (style.borderWidth) values.add(style.borderWidth);
    if (style.shadow?.blur) values.add(style.shadow.blur);
  }

  let index = 0;
  for (const value of Array.from(values).sort((a, b) => a - b)) {
    spacing[`spacing_${index++}`] = value;
  }

  return spacing;
}

/**
 * Collect all unique border radii
 */
function collectRadii(styles: Record<string, ExtractedStyle>): Record<string, number> {
  const radii: Record<string, number> = {};
  const values = new Set<number>();

  for (const style of Object.values(styles)) {
    if (typeof style.borderRadius === 'number') {
      values.add(style.borderRadius);
    } else if (style.borderRadius) {
      values.add(style.borderRadius.topLeft);
      values.add(style.borderRadius.topRight);
      values.add(style.borderRadius.bottomRight);
      values.add(style.borderRadius.bottomLeft);
    }
  }

  let index = 0;
  for (const value of Array.from(values).sort((a, b) => a - b)) {
    if (value > 0) {
      radii[`radius_${index++}`] = value;
    }
  }

  return radii;
}

/**
 * Collect all unique typography styles
 */
function collectTypography(
  styles: Record<string, ExtractedStyle>
): Record<string, { fontFamily: string; fontSize: number; fontWeight: number; lineHeight: number }> {
  const typography: Record<string, { fontFamily: string; fontSize: number; fontWeight: number; lineHeight: number }> = {};
  const seen = new Set<string>();
  let index = 0;

  for (const style of Object.values(styles)) {
    if (style.typography) {
      const key = `${style.typography.fontFamily}-${style.typography.fontSize}-${style.typography.fontWeight}`;
      if (!seen.has(key)) {
        seen.add(key);
        typography[`text_${index++}`] = {
          fontFamily: style.typography.fontFamily,
          fontSize: style.typography.fontSize,
          fontWeight: style.typography.fontWeight,
          lineHeight: style.typography.lineHeight,
        };
      }
    }
  }

  return typography;
}

/**
 * Collect all unique shadows
 */
function collectShadows(
  styles: Record<string, ExtractedStyle>
): Record<string, NonNullable<ExtractedStyle['shadow']>> {
  const shadows: Record<string, NonNullable<ExtractedStyle['shadow']>> = {};
  const seen = new Set<string>();
  let index = 0;

  for (const style of Object.values(styles)) {
    if (style.shadow) {
      const key = `${style.shadow.offsetX}-${style.shadow.offsetY}-${style.shadow.blur}-${style.shadow.spread}-${style.shadow.color}`;
      if (!seen.has(key)) {
        seen.add(key);
        shadows[`shadow_${index++}`] = style.shadow;
      }
    }
  }

  return shadows;
}

/**
 * Extract tokens from collected styles
 */
export function extractTokens(styles: Record<string, ExtractedStyle>): DesignTokens {
  return {
    colors: collectColors(styles),
    spacing: collectSpacing(styles),
    radii: collectRadii(styles),
    typography: collectTypography(styles),
    shadows: collectShadows(styles),
  };
}

/**
 * Walk the IR tree and collect all styles
 * Note: This requires access to the original LayoutNode properties
 * which we don't have in IR. In practice, this would be called
 * during the pipeline with access to both trees.
 */
export function collectStylesFromIR(
  node: IRNode,
  styleMap: Map<string, NodeVisualProps>
): Record<string, ExtractedStyle> {
  const styles: Record<string, ExtractedStyle> = {};

  // Extract style for this node
  const props = styleMap.get(node.id);
  if (props) {
    styles[node.styleRef] = extractStyleFromProps(node.styleRef, props);
  }

  // Recurse into children
  if ('children' in node && node.children) {
    for (const child of node.children) {
      Object.assign(styles, collectStylesFromIR(child, styleMap));
    }
  }

  return styles;
}

/**
 * Create an empty styles bundle
 */
export function createEmptyStylesBundle(): StylesBundle {
  return {
    styles: {},
    tokens: {
      colors: {},
      spacing: {},
      radii: {},
      typography: {},
      shadows: {},
    },
  };
}
