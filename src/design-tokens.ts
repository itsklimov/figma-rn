/**
 * Design tokens extractor from Figma API
 * Extracts colors, typography, gradients, shadows with 100% accuracy
 *
 * Design Tokens Extractor from Figma API
 * Extracts colors, typography, gradients, shadows with 100% accuracy
 */

import { rgbaToHex } from './color-utils.js';

// ============================================================================
// Figma API types for fills and gradients / Figma API types for fills and gradients
// ============================================================================

interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface GradientStop {
  position: number;
  color: FigmaColor;
}

interface Vector {
  x: number;
  y: number;
}

export interface FigmaFill {
  type: 'SOLID' | 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' | 'GRADIENT_ANGULAR' | 'GRADIENT_DIAMOND' | 'IMAGE' | 'EMOJI';
  visible?: boolean;
  opacity?: number;
  color?: FigmaColor;
  // For gradients / For gradients
  gradientHandlePositions?: Vector[];
  gradientStops?: GradientStop[];
  // For images / For images
  imageRef?: string;
  scaleMode?: 'FILL' | 'FIT' | 'CROP' | 'TILE';
}

export interface FigmaEffect {
  type: 'DROP_SHADOW' | 'INNER_SHADOW' | 'LAYER_BLUR' | 'BACKGROUND_BLUR';
  visible?: boolean;
  color?: FigmaColor;
  offset?: Vector;
  radius?: number;
  spread?: number;
  blendMode?: string;
}

export interface FigmaTextStyle {
  fontFamily: string;
  fontPostScriptName?: string;
  fontSize: number;
  fontWeight: number;
  letterSpacing: number;
  lineHeightPx: number;
  lineHeightPercent?: number;
  lineHeightPercentFontSize?: number;
  lineHeightUnit?: 'PIXELS' | 'FONT_SIZE_%' | 'INTRINSIC_%';
  textAlignHorizontal: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
  textAlignVertical: 'TOP' | 'CENTER' | 'BOTTOM';
  textCase?: 'ORIGINAL' | 'UPPER' | 'LOWER' | 'TITLE';
  textDecoration?: 'NONE' | 'UNDERLINE' | 'STRIKETHROUGH';
}

// ============================================================================
// Extracted tokens / Extracted tokens
// ============================================================================

export interface ExtractedColor {
  /** Unique key (hex or gradient-id) / Unique key */
  key: string;
  /** Type: solid or gradient / Type: solid or gradient */
  type: 'solid' | 'gradient';
  /** HEX for solid colors / HEX for solid colors */
  hex?: string;
  /** RGBA for solid colors / RGBA for solid colors */
  rgba?: { r: number; g: number; b: number; a: number };
  /** Gradient type / Gradient type */
  gradientType?: 'linear' | 'radial' | 'angular' | 'diamond';
  /** Gradient stops / Gradient stops */
  gradientStops?: Array<{ position: number; hex: string; opacity: number }>;
  /** Angle for linear gradient / Angle for linear gradient */
  angle?: number;
  /** Where used / Where used */
  usedIn: string[];
  /** Usage count / Usage count */
  usageCount: number;
  /** Suggested variable name / Suggested variable name */
  suggestedName?: string;
  /** Theme mapping / Theme mapping */
  themeMapping?: string;
}

export interface ExtractedTypography {
  /** Unique key (fontFamily/weight/size) */
  key: string;
  /** Figma values / Figma values */
  figma: {
    fontFamily: string;
    fontWeight: number;
    fontSize: number;
    lineHeight: number;
    letterSpacing: number;
    textAlign: string;
  };
  /** React Native values / React Native values */
  reactNative: {
    fontFamily: string;
    fontSize: string;
    lineHeight: string;
    letterSpacing: number;
    textAlign: 'left' | 'center' | 'right';
  };
  /** Where used / Where used */
  usedIn: string[];
  /** Usage count / Usage count */
  usageCount: number;
  /** Suggested name / Suggested name */
  suggestedName?: string;
  /** Theme mapping / Theme mapping */
  themeMapping?: string;
}

export interface ExtractedShadow {
  /** Unique key */
  key: string;
  /** Shadow type / Shadow type */
  type: 'drop' | 'inner';
  /** Values / Values */
  color: string;
  offset: { x: number; y: number };
  radius: number;
  spread: number;
  opacity: number;
  /** React Native style / React Native style */
  reactNative: {
    shadowColor: string;
    shadowOffset: { width: number; height: number };
    shadowOpacity: number;
    shadowRadius: number;
    elevation?: number;
  };
  /** Where used / Where used */
  usedIn: string[];
  usageCount: number;
}

export interface ExtractedCornerRadius {
  key: string;
  value: number | [number, number, number, number];
  isUniform: boolean;
  usedIn: string[];
  usageCount: number;
}

export interface ExtractedSpacing {
  key: string;
  value: number;
  type: 'padding' | 'gap' | 'margin';
  usedIn: string[];
  usageCount: number;
}

/**
 * Complete extraction result
 */
export interface DesignTokens {
  /** Version */
  version: string;
  /** Extraction timestamp */
  extractedAt: string;
  /** Source (Figma URL) */
  source: string;
  /** Colors and gradients */
  colors: ExtractedColor[];
  /** Typography */
  typography: ExtractedTypography[];
  /** Shadows */
  shadows: ExtractedShadow[];
  /** Corner radii */
  cornerRadii: ExtractedCornerRadius[];
  /** Spacing */
  spacing: ExtractedSpacing[];
}

// ============================================================================
// Utilities / Utilities
// ============================================================================

/**
 * Convert Figma RGBA (0-1) to standard format (0-255)
 */
function normalizeColor(color: FigmaColor): { r: number; g: number; b: number; a: number } {
  return {
    r: Math.round(color.r * 255),
    g: Math.round(color.g * 255),
    b: Math.round(color.b * 255),
    a: color.a,
  };
}

/**
 * Calculate gradient angle from handle positions
 */
function calculateGradientAngle(handles: Vector[]): number {
  if (!handles || handles.length < 2) return 0;

  const [start, end] = handles;
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  // Angle in degrees (0 = top to bottom, clockwise)
  let angle = Math.atan2(dx, -dy) * (180 / Math.PI);
  if (angle < 0) angle += 360;

  return Math.round(angle);
}

/**
 * Generate unique key for gradient
 */
function generateGradientKey(fill: FigmaFill): string {
  if (!fill.gradientStops) return 'gradient-unknown';

  const stops = fill.gradientStops
    .map(s => `${Math.round(s.position * 100)}-${rgbaToHex(s.color)}`)
    .join('_');

  return `gradient-${fill.type.replace('GRADIENT_', '').toLowerCase()}-${stops}`;
}

/**
 * Map fontWeight to SF Pro font name
 */
const SF_PRO_WEIGHTS: Record<number, string> = {
  100: 'SFProDisplay-Ultralight',
  200: 'SFProDisplay-Thin',
  300: 'SFProDisplay-Light',
  400: 'SFProDisplay-Regular',
  500: 'SFProDisplay-Medium',
  590: 'SFProDisplay-Semibold',
  600: 'SFProDisplay-Semibold',
  700: 'SFProDisplay-Bold',
  800: 'SFProDisplay-Heavy',
  900: 'SFProDisplay-Black',
};

function mapFontWeight(weight: number): string {
  // Find closest weight
  const weights = Object.keys(SF_PRO_WEIGHTS).map(Number).sort((a, b) => a - b);
  let closest = weights[0];

  for (const w of weights) {
    if (Math.abs(w - weight) < Math.abs(closest - weight)) {
      closest = w;
    }
  }

  return SF_PRO_WEIGHTS[closest] || 'SFProDisplay-Regular';
}

/**
 * Generate typography name based on size
 */
function suggestTypographyName(fontSize: number, fontWeight: number): string {
  // Base name by size
  if (fontSize >= 28) return 'heading1';
  if (fontSize >= 22) return 'heading2';
  if (fontSize >= 18) return 'heading3';
  if (fontSize >= 16) return 'bodyLarge';
  if (fontSize >= 14) return 'body';
  if (fontSize >= 12) return 'bodySmall';
  if (fontSize >= 10) return 'caption';
  return 'micro';
}

// ============================================================================
// Main extractor / Main extractor
// ============================================================================

/**
 * Extract design tokens from Figma node
 * Recursively traverses tree and collects all unique tokens
 */
export function extractDesignTokens(
  node: any,
  figmaUrl: string,
  scaleFunction: string = 'scale'
): DesignTokens {
  const colors = new Map<string, ExtractedColor>();
  const typography = new Map<string, ExtractedTypography>();
  const shadows = new Map<string, ExtractedShadow>();
  const cornerRadii = new Map<string, ExtractedCornerRadius>();
  const spacing = new Map<string, ExtractedSpacing>();

  /**
   * Recursive tree traversal / Recursive tree traversal
   */
  function traverse(n: any, path: string = ''): void {
    if (!n) return;

    const nodePath = path ? `${path}/${n.name}` : n.name;

    // ═══════════════════════════════════════════════════════════════════
    // Extract colors and gradients / Extract colors and gradients
    // ═══════════════════════════════════════════════════════════════════
    if (n.fills && Array.isArray(n.fills)) {
      for (const fill of n.fills as FigmaFill[]) {
        if (fill.visible === false) continue;

        if (fill.type === 'SOLID' && fill.color) {
          const hex = rgbaToHex(fill.color);
          const opacity = fill.opacity ?? fill.color.a ?? 1;
          const key = opacity < 1 ? `${hex}-${Math.round(opacity * 100)}` : hex;

          if (colors.has(key)) {
            const existing = colors.get(key)!;
            existing.usedIn.push(nodePath);
            existing.usageCount++;
          } else {
            colors.set(key, {
              key,
              type: 'solid',
              hex,
              rgba: { ...normalizeColor(fill.color), a: opacity },
              usedIn: [nodePath],
              usageCount: 1,
            });
          }
        } else if (fill.type.startsWith('GRADIENT_') && fill.gradientStops) {
          const key = generateGradientKey(fill);

          if (colors.has(key)) {
            const existing = colors.get(key)!;
            existing.usedIn.push(nodePath);
            existing.usageCount++;
          } else {
            const gradientStops = fill.gradientStops.map(stop => ({
              position: stop.position,
              hex: rgbaToHex(stop.color),
              opacity: stop.color.a,
            }));

            colors.set(key, {
              key,
              type: 'gradient',
              gradientType: fill.type.replace('GRADIENT_', '').toLowerCase() as any,
              gradientStops,
              angle: fill.gradientHandlePositions ? calculateGradientAngle(fill.gradientHandlePositions) : undefined,
              usedIn: [nodePath],
              usageCount: 1,
            });
          }
        }
      }
    }

    // Colors from strokes / Colors from strokes
    if (n.strokes && Array.isArray(n.strokes)) {
      for (const stroke of n.strokes) {
        if (stroke.type === 'SOLID' && stroke.color) {
          const hex = rgbaToHex(stroke.color);
          const key = hex;

          if (colors.has(key)) {
            const existing = colors.get(key)!;
            if (!existing.usedIn.includes(nodePath)) {
              existing.usedIn.push(nodePath);
              existing.usageCount++;
            }
          } else {
            colors.set(key, {
              key,
              type: 'solid',
              hex,
              rgba: normalizeColor(stroke.color),
              usedIn: [nodePath],
              usageCount: 1,
            });
          }
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // Extract typography / Extract typography
    // ═══════════════════════════════════════════════════════════════════
    if (n.type === 'TEXT' && n.style) {
      const style = n.style as FigmaTextStyle;
      const key = `${style.fontFamily}/${style.fontWeight}/${style.fontSize}`;

      if (typography.has(key)) {
        const existing = typography.get(key)!;
        existing.usedIn.push(nodePath);
        existing.usageCount++;
      } else {
        const rnFontFamily = style.fontFamily.includes('SF Pro')
          ? mapFontWeight(style.fontWeight)
          : style.fontFamily;

        typography.set(key, {
          key,
          figma: {
            fontFamily: style.fontFamily,
            fontWeight: style.fontWeight,
            fontSize: style.fontSize,
            lineHeight: style.lineHeightPx,
            letterSpacing: style.letterSpacing,
            textAlign: style.textAlignHorizontal,
          },
          reactNative: {
            fontFamily: rnFontFamily,
            fontSize: `${scaleFunction}(${style.fontSize})`,
            lineHeight: `${scaleFunction}(${Math.round(style.lineHeightPx)})`,
            letterSpacing: style.letterSpacing,
            textAlign: style.textAlignHorizontal.toLowerCase() as any,
          },
          usedIn: [nodePath],
          usageCount: 1,
          suggestedName: suggestTypographyName(style.fontSize, style.fontWeight),
        });
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // Extract shadows / Extract shadows
    // ═══════════════════════════════════════════════════════════════════
    if (n.effects && Array.isArray(n.effects)) {
      for (const effect of n.effects as FigmaEffect[]) {
        if (effect.visible === false) continue;

        if ((effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') && effect.color) {
          const hex = rgbaToHex(effect.color);
          const offset = effect.offset || { x: 0, y: 0 };
          const key = `shadow-${effect.type}-${hex}-${offset.x}-${offset.y}-${effect.radius}-${effect.spread}`;

          if (shadows.has(key)) {
            const existing = shadows.get(key)!;
            existing.usedIn.push(nodePath);
            existing.usageCount++;
          } else {
            shadows.set(key, {
              key,
              type: effect.type === 'DROP_SHADOW' ? 'drop' : 'inner',
              color: hex,
              offset: { x: offset.x, y: offset.y },
              radius: effect.radius || 0,
              spread: effect.spread || 0,
              opacity: effect.color.a,
              reactNative: {
                shadowColor: hex,
                shadowOffset: { width: offset.x, height: offset.y },
                shadowOpacity: effect.color.a,
                shadowRadius: (effect.radius || 0) / 2,
                elevation: Math.round((effect.radius || 0) / 2),
              },
              usedIn: [nodePath],
              usageCount: 1,
            });
          }
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // Extract corner radii / Extract corner radii
    // ═══════════════════════════════════════════════════════════════════
    if (n.cornerRadius !== undefined) {
      const value = n.cornerRadius;
      const key = `radius-${value}`;

      if (cornerRadii.has(key)) {
        const existing = cornerRadii.get(key)!;
        existing.usedIn.push(nodePath);
        existing.usageCount++;
      } else {
        cornerRadii.set(key, {
          key,
          value,
          isUniform: true,
          usedIn: [nodePath],
          usageCount: 1,
        });
      }
    } else if (n.rectangleCornerRadii) {
      const value = n.rectangleCornerRadii as [number, number, number, number];
      const key = `radius-${value.join('-')}`;

      if (cornerRadii.has(key)) {
        const existing = cornerRadii.get(key)!;
        existing.usedIn.push(nodePath);
        existing.usageCount++;
      } else {
        cornerRadii.set(key, {
          key,
          value,
          isUniform: false,
          usedIn: [nodePath],
          usageCount: 1,
        });
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // Extract spacing / Extract spacing
    // ═══════════════════════════════════════════════════════════════════
    // Padding
    const paddings = [
      { key: 'paddingTop', value: n.paddingTop },
      { key: 'paddingBottom', value: n.paddingBottom },
      { key: 'paddingLeft', value: n.paddingLeft },
      { key: 'paddingRight', value: n.paddingRight },
    ];

    for (const { key: padKey, value } of paddings) {
      if (value !== undefined && value > 0) {
        const key = `spacing-${value}`;

        if (spacing.has(key)) {
          const existing = spacing.get(key)!;
          existing.usedIn.push(`${nodePath}:${padKey}`);
          existing.usageCount++;
        } else {
          spacing.set(key, {
            key,
            value,
            type: 'padding',
            usedIn: [`${nodePath}:${padKey}`],
            usageCount: 1,
          });
        }
      }
    }

    // Gap (itemSpacing)
    if (n.itemSpacing !== undefined && n.itemSpacing > 0) {
      const key = `spacing-${n.itemSpacing}`;

      if (spacing.has(key)) {
        const existing = spacing.get(key)!;
        existing.usedIn.push(`${nodePath}:gap`);
        existing.usageCount++;
      } else {
        spacing.set(key, {
          key,
          value: n.itemSpacing,
          type: 'gap',
          usedIn: [`${nodePath}:gap`],
          usageCount: 1,
        });
      }
    }

    // Recurse into children
    if (n.children && Array.isArray(n.children)) {
      for (const child of n.children) {
        traverse(child, nodePath);
      }
    }
  }

  // Start traversal / Start traversal
  traverse(node);

  // Sort by usage count / Sort by usage count
  const sortByUsage = <T extends { usageCount: number }>(arr: T[]): T[] =>
    arr.sort((a, b) => b.usageCount - a.usageCount);

  return {
    version: '1.0.0',
    extractedAt: new Date().toISOString(),
    source: figmaUrl,
    colors: sortByUsage(Array.from(colors.values())),
    typography: sortByUsage(Array.from(typography.values())),
    shadows: sortByUsage(Array.from(shadows.values())),
    cornerRadii: sortByUsage(Array.from(cornerRadii.values())),
    spacing: sortByUsage(Array.from(spacing.values())),
  };
}

// ============================================================================
// Token merging / Token merging
// ============================================================================

/**
 * Merge new tokens into existing theme.json
 * Adds new tokens, updates usageCount for existing
 */
export function mergeDesignTokens(
  existing: DesignTokens,
  newTokens: DesignTokens
): DesignTokens {
  const merged: DesignTokens = {
    version: existing.version,
    extractedAt: new Date().toISOString(),
    source: `${existing.source}, ${newTokens.source}`,
    colors: [...existing.colors],
    typography: [...existing.typography],
    shadows: [...existing.shadows],
    cornerRadii: [...existing.cornerRadii],
    spacing: [...existing.spacing],
  };

  // Merge colors / Merge colors
  for (const newColor of newTokens.colors) {
    const existingColor = merged.colors.find(c => c.key === newColor.key);
    if (existingColor) {
      existingColor.usageCount += newColor.usageCount;
      existingColor.usedIn = [...new Set([...existingColor.usedIn, ...newColor.usedIn])];
    } else {
      merged.colors.push(newColor);
    }
  }

  // Merge typography / Merge typography
  for (const newTypo of newTokens.typography) {
    const existingTypo = merged.typography.find(t => t.key === newTypo.key);
    if (existingTypo) {
      existingTypo.usageCount += newTypo.usageCount;
      existingTypo.usedIn = [...new Set([...existingTypo.usedIn, ...newTypo.usedIn])];
    } else {
      merged.typography.push(newTypo);
    }
  }

  // Same for others / Same for others
  for (const newShadow of newTokens.shadows) {
    const existingShadow = merged.shadows.find(s => s.key === newShadow.key);
    if (existingShadow) {
      existingShadow.usageCount += newShadow.usageCount;
      existingShadow.usedIn = [...new Set([...existingShadow.usedIn, ...newShadow.usedIn])];
    } else {
      merged.shadows.push(newShadow);
    }
  }

  for (const newRadius of newTokens.cornerRadii) {
    const existingRadius = merged.cornerRadii.find(r => r.key === newRadius.key);
    if (existingRadius) {
      existingRadius.usageCount += newRadius.usageCount;
      existingRadius.usedIn = [...new Set([...existingRadius.usedIn, ...newRadius.usedIn])];
    } else {
      merged.cornerRadii.push(newRadius);
    }
  }

  for (const newSpace of newTokens.spacing) {
    const existingSpace = merged.spacing.find(s => s.key === newSpace.key);
    if (existingSpace) {
      existingSpace.usageCount += newSpace.usageCount;
      existingSpace.usedIn = [...new Set([...existingSpace.usedIn, ...newSpace.usedIn])];
    } else {
      merged.spacing.push(newSpace);
    }
  }

  return merged;
}

// ============================================================================
// Formatting for output / Formatting for output
// ============================================================================

/**
 * Format gradient as CSS/RN string
 */
export function formatGradient(color: ExtractedColor): string {
  if (color.type !== 'gradient' || !color.gradientStops) return '';

  const stops = color.gradientStops
    .map(s => `${s.hex} ${Math.round(s.position * 100)}%`)
    .join(', ');

  if (color.gradientType === 'linear') {
    return `linear-gradient(${color.angle || 0}deg, ${stops})`;
  }

  return `${color.gradientType}-gradient(${stops})`;
}

/**
 * Generate React Native gradient (for expo-linear-gradient)
 */
export function formatRNGradient(color: ExtractedColor): {
  colors: string[];
  locations: number[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
} | null {
  if (color.type !== 'gradient' || !color.gradientStops) return null;

  const colors = color.gradientStops.map(s => s.hex);
  const locations = color.gradientStops.map(s => s.position);

  // Convert angle to start/end for linear gradient
  if (color.gradientType === 'linear' && color.angle !== undefined) {
    const angleRad = (color.angle * Math.PI) / 180;
    return {
      colors,
      locations,
      start: { x: 0.5 - Math.sin(angleRad) / 2, y: 0.5 + Math.cos(angleRad) / 2 },
      end: { x: 0.5 + Math.sin(angleRad) / 2, y: 0.5 - Math.cos(angleRad) / 2 },
    };
  }

  return { colors, locations };
}
