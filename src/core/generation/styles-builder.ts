/**
 * Styles Builder - Generate StyleSheet from StylesBundle
 */

import type { StylesBundle, ExtractedStyle, LayoutMeta, IRNode } from '../types.js';
import type { TokenMappings } from '../mapping/token-matcher.js';
import { formatInteger, formatSmart, formatFloat } from './utils.js';
import { normalizeHex } from '../utils/path-utils.js';

/**
 * Shadow size categories based on blur radius
 * Maps blur radius ranges to semantic shadow sizes
 */
const SHADOW_SIZE_RANGES = [
  { maxRadius: 2, size: 'none' },
  { maxRadius: 6, size: 'sm' },
  { maxRadius: 12, size: 'md' },
  { maxRadius: Infinity, size: 'lg' },
];

/**
 * Find fuzzy shadow match by blur radius
 * Falls back to semantic shadow tokens (theme.shadows.sm/md/lg) based on shadow intensity
 *
 * @param blur - Shadow blur radius from Figma
 * @param shadowMappings - Available shadow mappings (may contain theme paths)
 * @param hasProjectTheme - Whether project has theme infrastructure
 * @returns Theme path like 'theme.shadows.md' or null if no fuzzy match available
 */
function findFuzzyShadowMatch(
  blur: number,
  shadowMappings: Record<string, string>,
  hasProjectTheme: boolean = false
): string | null {
  // Determine shadow size category based on blur radius
  const category = SHADOW_SIZE_RANGES.find(r => blur <= r.maxRadius);
  if (!category) return null;

  const targetSize = category.size;

  // Skip 'none' - no point in spreading an empty shadow
  if (targetSize === 'none') return null;

  // 1. First, look for exact size match in shadow mappings
  // e.g., 'theme.shadows.md' matches size 'md'
  for (const themePath of Object.values(shadowMappings)) {
    if (themePath.endsWith(`.${targetSize}`)) {
      return themePath;
    }
  }

  // 2. If project has theme infrastructure, assume semantic shadows exist
  // This is a reasonable assumption for well-structured design systems
  if (hasProjectTheme) {
    return `theme.shadows.${targetSize}`;
  }

  return null;
}

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
   // Ensure strings (like "100%") are quoted in the output
   if (typeof val === 'string' && !val.startsWith("'") && !val.startsWith('"')) {
     return `'${val}'`;
   }
   return String(val);
}


/**
 * Map a color value using token mappings
 * Returns theme path if mapped, raw value otherwise
 * All colors are normalized to uppercase for consistent lookup
 */
export function mapColor(hex: string, mappings: TokenMappings): { value: string; mapped: boolean } {
  const colorMappings = mappings.colors || {};
  const normHex = normalizeHex(hex);

  const mapped = colorMappings[normHex];
  if (mapped && mapped !== normHex) {
    return { value: mapped, mapped: true };
  }

  return { value: `'${normHex}'`, mapped: false };
}

/**
 * Map a numeric value (spacing/radius) using token mappings
 *
 * NOTE: Fuzzy matching is handled by token-matcher.ts (matchSpacing/matchRadii).
 * The TokenMappings already contain fuzzy-matched values, so we only need
 * to do exact lookup here.
 */
function mapNumber(value: number, category: 'spacing' | 'radii', mappings: TokenMappings): { value: string; mapped: boolean } {
  const categoryMappings = mappings[category] || {};

  // Try exact lookup (mappings already include fuzzy-matched values from token-matcher)
  const mapped = categoryMappings[value];
  if (mapped && String(mapped) !== String(value)) {
    return { value: mapped, mapped: true };
  }

  // Fallback: format unmapped values based on category
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
/**
 * Common device widths for responsive heuristics
 */
const DEVICE_WIDTHS = {
  MIN_FULL_WIDTH: 340,  // Minimum width that looks like "full width"
  STANDARD: 375,        // iPhone 8/SE size
  PLUS: 414,            // iPhone Plus/Max size
};

/**
 * Detect if a fixed width should be treated as "100%"
 * Heuristic: if width is close to common device widths, use percentage
 */
function shouldUseFullWidth(width: string | number | undefined, parentType?: string): boolean {
  if (typeof width !== 'number') return false;
  // If width is >= 340 (common content width), treat as full width in column parent
  return width >= DEVICE_WIDTHS.MIN_FULL_WIDTH && parentType === 'column';
}

/**
 * Detect if height should use flex instead of fixed
 * Heuristic: very large heights (> 500) in column layouts likely want flex: 1
 */
function shouldUseFlex(height: string | number | undefined, parentType?: string): boolean {
  if (typeof height !== 'number') return false;
  // If height is very large in a column, it likely wants to fill available space
  return height >= 500 && parentType === 'column';
}

function buildStyleProps(
  style: ExtractedStyle,
  layout: LayoutWithContext | undefined,
  mappings: TokenMappings,
  unmapped: { colors: Set<string>; spacing: Set<number>; radii: Set<number> },
  options?: { suppressTodos?: boolean; scaleFunction?: string; hasProjectTheme?: boolean }
): string {
  const lines: string[] = [];
  const suppress = options?.suppressTodos;
  const scale = options?.scaleFunction;
  const hasProjectTheme = options?.hasProjectTheme ?? false;
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

      // Horizontal Sizing - following Figma's exact approach
      if (horizontal === 'fill') {
        if (parentType === 'row') {
          lines.push(`    flex: 1,`); // layoutGrow: 1 in row parent
        } else if (parentType === 'column') {
          lines.push(`    alignSelf: 'stretch',`); // layoutAlign: STRETCH in column parent
        }
      } else if (horizontal === 'hug') {
        // Hug: let content determine width (no explicit width)
        // No alignSelf needed - this is the default behavior
      } else if (horizontal === 'fixed' && style.width !== undefined) {
        // Fixed width - use exact Figma value
        lines.push(`    width: ${formatDim(style.width, scale)},`);
      }

      // Vertical Sizing - following Figma's exact approach
      if (vertical === 'fill') {
        if (parentType === 'column') {
          lines.push(`    flex: 1,`); // layoutGrow: 1 in column parent
        } else if (parentType === 'row') {
          lines.push(`    alignSelf: 'stretch',`); // layoutAlign: STRETCH in row parent
        }
      } else if (vertical === 'hug') {
        // Hug: let content determine height (no explicit height)
      } else if (vertical === 'fixed' && style.height !== undefined) {
        // Fixed height - use exact Figma value
        lines.push(`    height: ${formatDim(style.height, scale)},`);
      }

    } else {
      // Fallback to Fixed if no sizing info (legacy) - still apply heuristics
      if (style.width !== undefined) {
        if (shouldUseFullWidth(style.width, layout.parentType)) {
          lines.push(`    width: '100%',`);
        } else {
          lines.push(`    width: ${formatDim(style.width, scale)},`);
        }
      }
      if (style.height !== undefined) {
        if (shouldUseFlex(style.height, layout.parentType)) {
          lines.push(`    flex: 1,`);
        } else {
          lines.push(`    height: ${formatDim(style.height, scale)},`);
        }
      }
    }

  } else {
    // Non-layout nodes (Text, Image) - keep fixed sizing but omit for small elements
    // Large fixed dimensions on text/images are usually intentional
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
      if (topLeft > 0) {
        const { value, mapped } = mapNumber(topLeft, 'radii', mappings);
        lines.push(`    borderTopLeftRadius: ${mapped ? value : sc(value)},`);
        if (!mapped) unmapped.radii.add(topLeft);
      }
      if (topRight > 0) {
        const { value, mapped } = mapNumber(topRight, 'radii', mappings);
        lines.push(`    borderTopRightRadius: ${mapped ? value : sc(value)},`);
        if (!mapped) unmapped.radii.add(topRight);
      }
      if (bottomRight > 0) {
        const { value, mapped } = mapNumber(bottomRight, 'radii', mappings);
        lines.push(`    borderBottomRightRadius: ${mapped ? value : sc(value)},`);
        if (!mapped) unmapped.radii.add(bottomRight);
      }
      if (bottomLeft > 0) {
        const { value, mapped } = mapNumber(bottomLeft, 'radii', mappings);
        lines.push(`    borderBottomLeftRadius: ${mapped ? value : sc(value)},`);
        if (!mapped) unmapped.radii.add(bottomLeft);
      }
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

    // 1. Try exact match by shadow key
    const shadowKey = `${offsetX ?? 0},${offsetY ?? 0},${blur ?? 0},${spread ?? 0}`;
    const mappedShadow = shadowMappings[shadowKey];

    if (mappedShadow && mappedShadow !== shadowKey) {
      // Exact match found
      lines.push(`    ...${mappedShadow},`);
    } else {
      // 2. Try fuzzy match by blur radius
      const fuzzyMatch = findFuzzyShadowMatch(blur ?? 0, shadowMappings, hasProjectTheme);

      if (fuzzyMatch) {
        // Fuzzy match found - use semantic shadow token
        lines.push(`    ...${fuzzyMatch},`);
      } else {
        // 3. No match - generate raw shadow values
        const { value: shadowColor, mapped } = mapColor(color, mappings);
        lines.push(`    shadowColor: ${shadowColor},${!mapped && !suppress ? ' // TODO: map to theme' : ''}`);
        lines.push(`    shadowOffset: { width: ${formatSmart(offsetX)}, height: ${formatSmart(offsetY)} },`);
        lines.push(`    shadowOpacity: 1,`);
        lines.push(`    shadowRadius: ${formatSmart(blur)},`);
        lines.push(`    elevation: ${Math.ceil(blur / 2)},`);
        if (!mapped) unmapped.colors.add(color);
      }
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
      // Spread includes fontFamily, fontSize, fontWeight, lineHeight, letterSpacing
      lines.push(`    ...${mappedTypo},`);
    } else {
      // Fallback: output individual properties
      if (fontFamily) lines.push(`    fontFamily: '${fontFamily}',`);
      if (fontSize) lines.push(`    fontSize: ${sc(formatInteger(fontSize))},`);
      if (fontWeight) lines.push(`    fontWeight: '${fontWeight}',`);
      if (lineHeight) lines.push(`    lineHeight: ${sc(formatInteger(lineHeight))},`);
      // Only output letterSpacing when NOT using spread (spread includes it)
      if (letterSpacing) lines.push(`    letterSpacing: ${formatFloat(letterSpacing)},`);
    }

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
  // Check at runtime for nodes with layout and children (now includes Button/Icon/Image)
  if ('layout' in node && node.layout && 'children' in node && node.children) {
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
    stylePattern?: 'useTheme' | 'StyleSheet' | 'unistyles';
    hasProjectTheme?: boolean;
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
    // Use styleRef directly since JSX generation uses it as-is
    const styleName = styleRef;
    
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

  // Generate code based on style pattern
  const isUnistyles = options?.stylePattern === 'unistyles';

  let code: string;
  if (isUnistyles) {
    // Unistyles: wrap in theme callback - theme is injected by the library
    code = `const styles = StyleSheet.create(theme => ({
${styleEntries.join('\n')}
}));`;
  } else {
    // Standard StyleSheet.create
    code = `const styles = StyleSheet.create({
${styleEntries.join('\n')}
});`;
  }

  return {
    code,
    unmapped: {
      colors: Array.from(unmapped.colors),
      spacing: Array.from(unmapped.spacing),
      radii: Array.from(unmapped.radii),
    },
  };
}
