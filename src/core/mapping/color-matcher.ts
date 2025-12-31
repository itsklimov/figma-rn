/**
 * Inline Delta-E color matching - no external dependencies
 *
 * Supports hex colors (#RRGGBB, #RRGGBBAA) and rgba().
 * Alpha channel is now considered for matching solid vs transparent colors.
 */

import { pathComplexity } from '../utils/path-utils.js';

type Lab = [number, number, number];

/**
 * Extract alpha value from a color string
 * Returns 1 for solid colors, 0-1 for transparent
 */
export function getAlpha(color: string): number {
  // Handle rgba(r, g, b, a)
  const rgbaMatch = color.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/i);
  if (rgbaMatch) {
    return parseFloat(rgbaMatch[1]);
  }

  // Handle 8-digit hex (#RRGGBBAA)
  if (color.startsWith('#') && color.length === 9) {
    const alpha = parseInt(color.slice(7, 9), 16) / 255;
    return alpha;
  }

  // Solid color (hex without alpha, rgb())
  return 1;
}

/**
 * Check if a color is solid (alpha = 1)
 */
export function isSolidColor(color: string): boolean {
  return getAlpha(color) >= 0.99; // Allow small floating point tolerance
}

/**
 * Convert hex or rgba color to RGB (0-255)
 */
function toRgb(color: string): [number, number, number] {
  // Handle Hex
  if (color.startsWith('#') || /^[0-9A-Fa-f]{3,8}$/.test(color)) {
    let h = color.startsWith('#') ? color.replace('#', '') : color;
    
    // Skip if it is a shorthand hex like #ABC
    if (h.length === 3) {
      h = h.split('').map(c => c + c).join('');
    }

    // Support 3, 6, 8 (with alpha) but only use first 6 for RGB
    if (h.length === 8) h = h.slice(0, 6);

    if (h.length !== 6) {
      throw new Error(`Invalid hex color: ${color}`);
    }
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }

  // Handle RGBA/RGB
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (match) {
    return [
      parseInt(match[1], 10),
      parseInt(match[2], 10),
      parseInt(match[3], 10),
    ];
  }

  throw new Error(`Unsupported color format: ${color}`);
}

/**
 * Convert sRGB component to linear RGB (gamma correction)
 */
function srgbToLinear(c: number): number {
  c = c / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Convert linear RGB to XYZ (D65 illuminant)
 */
function linearRgbToXyz(r: number, g: number, b: number): [number, number, number] {
  return [
    r * 0.4124564 + g * 0.3575761 + b * 0.1804375,
    r * 0.2126729 + g * 0.7151522 + b * 0.0721750,
    r * 0.0193339 + g * 0.1191920 + b * 0.9503041,
  ];
}

// D65 reference white
const Xn = 0.95047, Yn = 1.0, Zn = 1.08883;

function f(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : (7.787 * t) + 16/116;
}

/**
 * Convert XYZ to LAB
 */
function xyzToLab(x: number, y: number, z: number): Lab {
  const L = 116 * f(y / Yn) - 16;
  const a = 500 * (f(x / Xn) - f(y / Yn));
  const b = 200 * (f(y / Yn) - f(z / Zn));
  return [L, a, b];
}

/**
 * Convert hex/rgba color to LAB color space
 */
export function colorToLab(color: string): Lab {
  const [r, g, b] = toRgb(color);
  const [lr, lg, lb] = [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
  const [x, y, z] = linearRgbToXyz(lr, lg, lb);
  return xyzToLab(x, y, z);
}

/**
 * Legacy alias for colorToLab
 */
export const hexToLab = colorToLab;

/**
 * Calculate Delta-E (CIE76) between two LAB colors
 */
export function labDistance(a: Lab, b: Lab): number {
  const dL = a[0] - b[0];
  const da = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dL * dL + da * da + db * db);
}

/**
 * Semantic color patterns for fallback matching
 * When a color doesn't match any theme color within threshold,
 * we try to match it to semantic color tokens based on luminance
 */
const SEMANTIC_FALLBACKS = {
  // Very dark colors (luminance < 0.1) → text.primary or gray90+
  dark: ['text.primary', 'text', 'gray.gray90', 'gray90', 'black'],
  // Very light colors (luminance > 0.9) → background or gray10
  light: ['background', 'gray.gray10', 'gray10', 'white'],
  // Secondary text colors (medium-dark, luminance 0.2-0.4)
  secondary: ['text.secondary', 'gray.gray70', 'gray70', 'gray.gray60', 'gray60'],
};

/**
 * Get relative luminance of a color (0-1 scale)
 */
function getLuminance(hex: string): number {
  try {
    const [r, g, b] = toRgb(hex);
    // Relative luminance formula (ITU-R BT.709)
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  } catch {
    return 0.5; // Default to middle
  }
}

/**
 * Try to find a semantic color token as fallback
 */
function findSemanticFallback(
  hex: string,
  themeColors: Map<string, string>
): string | null {
  const luminance = getLuminance(hex);

  // Determine which semantic patterns to try
  let patterns: string[];
  if (luminance < 0.15) {
    patterns = SEMANTIC_FALLBACKS.dark;
  } else if (luminance > 0.85) {
    patterns = SEMANTIC_FALLBACKS.light;
  } else if (luminance < 0.45) {
    patterns = SEMANTIC_FALLBACKS.secondary;
  } else {
    return null; // Mid-range colors don't get semantic fallback
  }

  // Search for theme paths containing these patterns
  for (const pattern of patterns) {
    for (const [_, themePath] of themeColors) {
      const pathLower = themePath.toLowerCase();
      if (pathLower.includes(pattern.toLowerCase())) {
        return themePath;
      }
    }
  }

  return null;
}

/**
 * Find closest color from theme colors
 * @param hex - Hex color to match (e.g., "#3B82F6")
 * @param themeColors - Map of hex → theme path (e.g., Map<"#3B82F6", "theme.colors.primary">)
 * @param threshold - Max Delta-E distance for a match (default: 5)
 * @returns Theme path if match found, null otherwise
 *
 * IMPORTANT: When matching solid colors (alpha=1), transparent theme tokens are skipped.
 * This prevents matching #F7F7F7 to rgba(247,247,247,0).
 *
 * If no match found within threshold, tries semantic fallback matching based on luminance.
 */
export function findClosestColor(
  hex: string,
  themeColors: Map<string, string>,
  threshold: number = 8
): string | null {
  // Check if source color is solid
  const sourceIsSolid = isSolidColor(hex);

  // Use colorToLab which parses Hex/RGB/RGBA
  let targetLab: Lab;
  try {
    targetLab = colorToLab(hex);
  } catch {
    return null; // Invalid target color
  }

  // Normalize target hex for comparison
  let normHex: string;
  try {
    const [r, g, b] = toRgb(hex);
    const toHex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
    normHex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  } catch {
    return null; // Invalid target color
  }

  let bestMatch: string | null = null;
  let bestDistance = Infinity;
  let bestComplexity = Infinity;

  // First pass: collect all exact RGB matches
  const exactMatches: Array<{ path: string; themeHex: string }> = [];

  for (const [themeHex, themePath] of themeColors) {
    // CRITICAL: Skip transparent tokens when matching solid colors
    if (sourceIsSolid && !isSolidColor(themeHex)) {
      continue;
    }

    // Normalize theme hex for comparison
    let normThemeHex: string;
    try {
      const [tr, tg, tb] = toRgb(themeHex);
      const toHex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
      normThemeHex = `#${toHex(tr)}${toHex(tg)}${toHex(tb)}`;
    } catch {
      continue;
    }

    // Collect exact matches (same RGB)
    if (normThemeHex === normHex) {
      exactMatches.push({ path: themePath, themeHex });
    }

    try {
      const themeLab = xyzToLab(...linearRgbToXyz(...toRgb(themeHex).map(srgbToLinear) as [number, number, number]));
      const distance = labDistance(targetLab, themeLab);
      const complexity = pathComplexity(themePath, { deprioritizeOverlays: true });

      // Prefer lower distance, then lower complexity
      if (distance <= threshold) {
        if (distance < bestDistance || (distance === bestDistance && complexity < bestComplexity)) {
          bestDistance = distance;
          bestComplexity = complexity;
          bestMatch = themePath;
        }
      }
    } catch {
      // Ignore invalid theme colors
      continue;
    }
  }

  // If we have exact matches, pick the one with simplest path
  if (exactMatches.length > 0) {
    exactMatches.sort((a, b) => pathComplexity(a.path, { deprioritizeOverlays: true }) - pathComplexity(b.path, { deprioritizeOverlays: true }));
    return exactMatches[0].path;
  }

  // If Delta-E matching found something, use it
  if (bestMatch) {
    return bestMatch;
  }

  // Fallback: try semantic color matching based on luminance
  // This helps match dark text colors to theme.text.primary, etc.
  return findSemanticFallback(hex, themeColors);
}
