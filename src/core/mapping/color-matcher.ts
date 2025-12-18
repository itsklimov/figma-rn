/**
 * Inline Delta-E color matching - no external dependencies
 *
 * Supports 6-digit hex colors (#RRGGBB). Alpha channel is ignored if present.
 */

type Lab = [number, number, number];

/**
 * Convert hex color to RGB (0-255)
 * Accepts #RRGGBB or RRGGBB format. Alpha channel (#RRGGBBAA) is ignored.
 */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  if (h.length < 6 || !/^[0-9A-Fa-f]+$/.test(h)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  // Only use first 6 characters (ignore alpha if present)
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
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
 * Convert hex color to LAB color space
 */
export function hexToLab(hex: string): Lab {
  const [r, g, b] = hexToRgb(hex);
  const [lr, lg, lb] = [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
  const [x, y, z] = linearRgbToXyz(lr, lg, lb);
  return xyzToLab(x, y, z);
}

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
  threshold: number = 5
): string | null {
  const targetLab = hexToLab(hex);
  let bestMatch: string | null = null;
  let bestDistance = Infinity;

  for (const [themeHex, themePath] of themeColors) {
    // Exact match - return immediately
    if (themeHex.toUpperCase() === hex.toUpperCase()) {
      return themePath;
    }

    const themeLab = hexToLab(themeHex);
    const distance = labDistance(targetLab, themeLab);

    if (distance < bestDistance && distance <= threshold) {
      bestDistance = distance;
      bestMatch = themePath;
    }
  }

  return bestMatch;
}
