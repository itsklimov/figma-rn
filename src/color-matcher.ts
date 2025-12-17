import chroma from 'chroma-js';
import { ColorToken } from './theme-parser.js';

/**
 * Color matching result
 * Color matching result
 */
export interface ColorMatch {
  token: ColorToken;      // Found theme token
  confidence: number;     // Match confidence (0-1)
  deltaE: number;         // Delta E distance (lower is better)
}

/**
 * Finds the closest theme color to a given Figma color
 * Finds the closest theme color to a given Figma color
 *
 * Uses Delta E (CIE2000) in LAB color space for
 * perceptual color matching
 *
 * @param figmaHex - Hex color from Figma (e.g., '#FF5733')
 * @param themeColors - Theme colors map (hex -> ColorToken)
 * @param minConfidence - Minimum confidence for match (0-1)
 * @returns Best match or null
 */
export function findClosestThemeColor(
  figmaHex: string,
  themeColors: Map<string, ColorToken>,
  minConfidence: number = 0.8
): ColorMatch | null {
  try {
    // 1. Convert Figma color to LAB space
    const figmaLab = chroma(figmaHex).lab();

    let bestMatch: ColorMatch | null = null;

    // 2. Calculate Delta E for each theme color
    for (const [hex, token] of themeColors) {
      try {
        const themeLab = chroma(hex).lab();

        // Calculate Delta E (Euclidean distance in LAB space)
        // More accurate Delta E 2000 requires complex calculations,
        // but simple LAB distance already provides good perceptual matching
        const deltaE = calculateDeltaE(figmaLab, themeLab);

        // Convert Delta E to confidence (0-1)
        // Delta E < 2.3 - imperceptible difference
        // Delta E < 5 - small difference
        // Delta E < 10 - noticeable difference
        // Delta E > 50 - completely different colors
        const confidence = deltaEToConfidence(deltaE);

        // Update best match
        if (confidence >= minConfidence && (!bestMatch || confidence > bestMatch.confidence)) {
          bestMatch = { token, confidence, deltaE };
        }
      } catch (error) {
        // Skip invalid colors
        console.warn(`Invalid color in theme: ${hex}`, error);
        continue;
      }
    }

    return bestMatch;
  } catch (error) {
    console.error(`Error finding closest color for ${figmaHex}:`, error);
    return null;
  }
}

/**
 * Calculates Delta E between two colors in LAB space
 * Calculates Delta E between two colors in LAB space
 *
 * Uses simplified formula (Euclidean distance)
 * which provides good approximation for most cases
 *
 * @param lab1 - First color in LAB [L, a, b]
 * @param lab2 - Second color in LAB [L, a, b]
 * @returns Delta E value
 */
function calculateDeltaE(lab1: number[], lab2: number[]): number {
  // Simple Delta E formula (CIE76)
  const deltaL = lab1[0] - lab2[0];
  const deltaA = lab1[1] - lab2[1];
  const deltaB = lab1[2] - lab2[2];

  return Math.sqrt(deltaL * deltaL + deltaA * deltaA + deltaB * deltaB);
}

/**
 * Converts Delta E to confidence (0-1)
 * Converts Delta E to confidence (0-1)
 *
 * @param deltaE - Delta E value
 * @returns Confidence from 0 to 1
 */
function deltaEToConfidence(deltaE: number): number {
  // Use exponential function for smooth confidence falloff
  // deltaE = 0 → confidence = 1.0 (perfect match)
  // deltaE = 2.3 → confidence ≈ 0.9 (imperceptible difference)
  // deltaE = 5 → confidence ≈ 0.8 (small difference)
  // deltaE = 10 → confidence ≈ 0.6 (noticeable difference)
  // deltaE = 50 → confidence ≈ 0.1 (very different colors)
  // deltaE = 100 → confidence ≈ 0.0 (completely different)

  const confidence = Math.exp(-deltaE / 20);
  return Math.max(0, Math.min(1, confidence));
}

/**
 * Matches all Figma colors with theme colors
 * Matches all Figma colors with theme colors
 *
 * @param figmaColors - Array of hex colors from Figma
 * @param themeColors - Theme colors map
 * @param minConfidence - Minimum confidence (default 0.7)
 * @returns Map: figmaHex -> ColorMatch
 */
export function matchAllColors(
  figmaColors: string[],
  themeColors: Map<string, ColorToken>,
  minConfidence: number = 0.7
): Map<string, ColorMatch> {
  const matches = new Map<string, ColorMatch>();

  // Unique colors (remove duplicates)
  const uniqueColors = Array.from(new Set(figmaColors));

  for (const figmaHex of uniqueColors) {
    const match = findClosestThemeColor(figmaHex, themeColors, minConfidence);
    if (match) {
      matches.set(figmaHex.toUpperCase(), match);
    }
  }

  return matches;
}

/**
 * Groups colors by similarity
 * Groups colors by similarity
 *
 * Useful for discovering color palettes in design
 *
 * @param colors - Array of hex colors
 * @param threshold - Delta E threshold for grouping (default 5)
 * @returns Array of similar color groups
 */
export function groupSimilarColors(
  colors: string[],
  threshold: number = 5
): string[][] {
  const groups: string[][] = [];
  const processed = new Set<string>();

  for (const color of colors) {
    if (processed.has(color)) continue;

    const group: string[] = [color];
    processed.add(color);

    try {
      const colorLab = chroma(color).lab();

      // Find similar colors
      for (const otherColor of colors) {
        if (processed.has(otherColor)) continue;

        try {
          const otherLab = chroma(otherColor).lab();
          const deltaE = calculateDeltaE(colorLab, otherLab);

          if (deltaE <= threshold) {
            group.push(otherColor);
            processed.add(otherColor);
          }
        } catch (error) {
          // Skip invalid colors
          continue;
        }
      }

      groups.push(group);
    } catch (error) {
      // Skip invalid colors
      continue;
    }
  }

  return groups;
}

/**
 * Analyzes color palette and returns statistics
 * Analyzes color palette and returns statistics
 */
export interface ColorPaletteStats {
  totalColors: number;           // Total unique colors
  matchedColors: number;          // Matched with theme
  unmatchedColors: number;        // Unmatched
  averageConfidence: number;      // Average confidence
  colorGroups: number;            // Number of color groups
}

export function analyzeColorPalette(
  figmaColors: string[],
  themeColors: Map<string, ColorToken>,
  minConfidence: number = 0.7
): ColorPaletteStats {
  const uniqueColors = Array.from(new Set(figmaColors));
  const matches = matchAllColors(uniqueColors, themeColors, minConfidence);
  const groups = groupSimilarColors(uniqueColors);

  let totalConfidence = 0;
  for (const match of matches.values()) {
    totalConfidence += match.confidence;
  }

  return {
    totalColors: uniqueColors.length,
    matchedColors: matches.size,
    unmatchedColors: uniqueColors.length - matches.size,
    averageConfidence: matches.size > 0 ? totalConfidence / matches.size : 0,
    colorGroups: groups.length,
  };
}

/**
 * Formats ColorMatch for display
 * Formats ColorMatch for display
 */
export function formatColorMatch(match: ColorMatch): string {
  const percent = (match.confidence * 100).toFixed(1);
  const deltaE = match.deltaE.toFixed(2);
  return `${match.token.path} (confidence: ${percent}%, ΔE: ${deltaE})`;
}

/**
 * Recommends whether to use theme token or hardcoded color
 * Recommends whether to use theme token or hardcoded color
 *
 * @param match - Color match result
 * @returns true if theme token is recommended
 */
export function shouldUseThemeToken(match: ColorMatch | null): boolean {
  if (!match) return false;

  // If confidence > 85% and Delta E < 5 - use token
  // This means colors are practically identical
  return match.confidence >= 0.85 && match.deltaE < 5;
}
