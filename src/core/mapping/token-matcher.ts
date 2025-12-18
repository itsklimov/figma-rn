import type { DesignTokens } from '../types.js';
import type { ProjectTokens } from './theme-extractor.js';
import { findClosestColor } from './color-matcher.js';

/**
 * Token mappings from Figma values to project theme paths
 * Key: token category (colors, spacing, radii, shadows, typography)
 * Value: Record of Figma value → theme path (or original value if unmatched)
 */
export interface TokenMappings {
  [category: string]: Record<string | number, string>;
}

/**
 * Create empty token mappings
 * Used when no project theme is available
 */
export function createEmptyMappings(): TokenMappings {
  return {
    colors: {},
    spacing: {},
    radii: {},
    typography: {},
    shadows: {},
  };
}

/**
 * Match a single value to project tokens
 * Returns theme path if matched, original value as string otherwise
 */
function matchValue(
  value: string | number,
  projectTokens: Map<string | number, string> | undefined
): string {
  if (!projectTokens) {
    return String(value);
  }

  // Try exact match first
  const exactMatch = projectTokens.get(value);
  if (exactMatch) {
    return exactMatch;
  }

  // For numbers, try exact match only
  if (typeof value === 'number') {
    return String(value);
  }

  return String(value);
}

/**
 * Match Figma colors to project colors
 * Uses exact match first, then Delta-E fuzzy matching
 */
function matchColors(
  figmaColors: Record<string, string>,
  projectColors: Map<string | number, string> | undefined,
  threshold: number = 5
): Record<string, string> {
  const mappings: Record<string, string> = {};

  if (!projectColors) {
    // No project colors - return all as-is
    for (const [key, hex] of Object.entries(figmaColors)) {
      mappings[key] = hex;
    }
    return mappings;
  }

  // Invert map: value → path to hex → path for color matching
  const hexToPath = new Map<string, string>();
  for (const [hex, path] of projectColors) {
    if (typeof hex === 'string') {
      hexToPath.set(hex.toUpperCase(), path);
    }
  }

  for (const [key, hex] of Object.entries(figmaColors)) {
    // Use findClosestColor for fuzzy matching
    const match = findClosestColor(hex, hexToPath, threshold);
    mappings[key] = match || hex;
  }

  return mappings;
}

/**
 * Match Figma tokens to project tokens
 *
 * @param extracted - Design tokens from ScreenIR.stylesBundle.tokens
 * @param project - Project tokens from extractProjectTokens()
 * @param colorThreshold - Delta-E threshold for color matching (default: 5)
 * @returns Mappings of Figma values to theme paths
 */
export function matchTokens(
  extracted: DesignTokens,
  project: ProjectTokens,
  colorThreshold: number = 5
): TokenMappings {
  const mappings: TokenMappings = {};

  // Match colors with fuzzy matching
  mappings.colors = matchColors(extracted.colors, project.colors, colorThreshold);

  // Match spacing (exact match only)
  mappings.spacing = {};
  for (const [key, value] of Object.entries(extracted.spacing)) {
    mappings.spacing[key] = matchValue(value, project.spacing);
  }

  // Match radii (exact match only)
  mappings.radii = {};
  for (const [key, value] of Object.entries(extracted.radii)) {
    mappings.radii[key] = matchValue(value, project.radii);
  }

  // Match typography (exact match only, by stringified key)
  mappings.typography = {};
  for (const [key, value] of Object.entries(extracted.typography)) {
    // Typography matching would need fontSize/fontWeight comparison
    // For now, keep as-is (generation layer handles this)
    mappings.typography[key] = key;
  }

  // Match shadows (exact match only, by deterministic key)
  mappings.shadows = {};
  for (const [key, value] of Object.entries(extracted.shadows)) {
    // Use same deterministic key format as theme-extractor
    const shadowKey = `${value.offsetX ?? 0},${value.offsetY ?? 0},${value.blur ?? 0},${value.spread ?? 0}`;
    const match = project.shadows?.get(shadowKey);
    mappings.shadows[key] = match || key;
  }

  return mappings;
}
