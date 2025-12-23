/**
 * Inline Delta-E color matching - no external dependencies
 *
 * Supports 6-digit hex colors (#RRGGBB). Alpha channel is ignored if present.
 */

type Lab = [number, number, number];

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
 * Find closest color from theme colors
 * @param hex - Hex color to match (e.g., "#3B82F6")
 * @param themeColors - Map of hex → theme path (e.g., Map<"#3B82F6", "theme.colors.primary">)
 * @param threshold - Max Delta-E distance for a match (default: 5)
 * @returns Theme path if match found, null otherwise
 */
export function findClosestColor(
  hex: string,
  themeColors: Map<string, string>,
  threshold: number = 8
): string | null {
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

  for (const [themeHex, themePath] of themeColors) {
    // Normalize theme hex for comparison
    let normThemeHex: string;
    try {
      const [tr, tg, tb] = toRgb(themeHex);
      const toHex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
      normThemeHex = `#${toHex(tr)}${toHex(tg)}${toHex(tb)}`;
    } catch {
      continue;
    }

    // Exact match after normalization
    if (normThemeHex === normHex) {
      return themePath;
    }

    try {
      const themeLab = xyzToLab(...linearRgbToXyz(...toRgb(themeHex).map(srgbToLinear) as [number, number, number]));
      const distance = labDistance(targetLab, themeLab);

      if (distance < bestDistance && distance <= threshold) {
        bestDistance = distance;
        bestMatch = themePath;
      }
    } catch {
      // Ignore invalid theme colors
      continue;
    }
  }

  return bestMatch;
}
