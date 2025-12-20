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
 * Match a spacing value to project spacing with "closest neighbor" logic
 * - Exact match first
 * - Then find closest value within tolerance (±2px or 20%)
 * - This allows mapping values like 18 to 16, or 22 to 24
 */
function matchSpacing(
  value: number,
  projectSpacing: Map<string | number, string> | undefined
): string {
  if (!projectSpacing || projectSpacing.size === 0) {
    return String(value);
  }

  // Try exact match first
  const exactMatch = projectSpacing.get(value);
  if (exactMatch) {
    return exactMatch;
  }

  // Fuzzy match: find closest value within tolerance
  let closestPath: string | null = null;
  let closestDiff = Infinity;
  const tolerance = Math.max(2, value * 0.2); // ±2px or 20%, whichever is larger

  for (const [spacingValue, path] of projectSpacing) {
    const numValue = typeof spacingValue === 'number' ? spacingValue : parseFloat(String(spacingValue));
    if (isNaN(numValue)) continue;

    const diff = Math.abs(numValue - value);
    if (diff <= tolerance && diff < closestDiff) {
      closestDiff = diff;
      closestPath = path;
    }
  }

  return closestPath || String(value);
}

/**
 * Match a radius value to project radii with tolerance-based fuzzy matching
 * - Exact match first
 * - Then find closest value within tolerance (±2px or 15%)
 * - Values >= 30 are matched to 'full' token if available (for circular elements)
 *   Note: lowered from 50 to 30 as many mobile buttons use 30+ for pills
 */
function matchRadii(
  value: number,
  projectRadii: Map<string | number, string> | undefined
): string {
  if (!projectRadii || projectRadii.size === 0) {
    return String(value);
  }

  // Try exact match first
  const exactMatch = projectRadii.get(value);
  if (exactMatch) {
    return exactMatch;
  }

  // For large values (>= 30), try to find a "full" or "round" token
  if (value >= 30) {
    for (const [radiiValue, path] of projectRadii) {
      const numValue = typeof radiiValue === 'number' ? radiiValue : parseFloat(String(radiiValue));
      if (numValue >= 30 || path.toLowerCase().includes('full') || path.toLowerCase().includes('round')) {
        return path;
      }
    }
  }

  // Fuzzy match: find closest value within tolerance
  let closestPath: string | null = null;
  let closestDiff = Infinity;
  const tolerance = Math.max(2, value * 0.15); // ±2px or 15%, whichever is larger

  for (const [radiiValue, path] of projectRadii) {
    const numValue = typeof radiiValue === 'number' ? radiiValue : parseFloat(String(radiiValue));
    if (isNaN(numValue)) continue;

    const diff = Math.abs(numValue - value);
    if (diff <= tolerance && diff < closestDiff) {
      closestDiff = diff;
      closestPath = path;
    }
  }

  return closestPath || String(value);
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

  for (const [id, hex] of Object.entries(figmaColors)) {
    // Use findClosestColor for fuzzy matching
    const match = findClosestColor(hex, hexToPath, threshold);
    const value = match || hex;
    // Support both ID key (for tests) and Hex key (for generator)
    mappings[id] = value;
    mappings[hex] = value;
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

  // Match spacing with fuzzy matching (closest neighbor)
  mappings.spacing = {};
  for (const [id, value] of Object.entries(extracted.spacing)) {
    const matched = matchSpacing(value as number, project.spacing);
    // Support both ID key (for tests) and Value key (for generator)
    mappings.spacing[id] = matched;
    mappings.spacing[value] = matched;
  }

  // Match radii with fuzzy matching (tolerance-based)
  mappings.radii = {};
  for (const [id, value] of Object.entries(extracted.radii)) {
    const matched = matchRadii(value, project.radii);
    // Support both ID key (for tests) and Value key (for generator)
    mappings.radii[id] = matched;
    mappings.radii[value] = matched;
  }

  // Match typography (by serialized key comparison)
  mappings.typography = {};
  if (extracted.typography) {
    for (const [_, value] of Object.entries(extracted.typography)) {
      // 1. Normalize Figma values
      // Normalize non-standard font weights (590→600, 510→500, etc.) to nearest 100
      const rawWeight = value.fontWeight || 400;
      const figmaWeight = Math.round(rawWeight / 100) * 100;
      const figmaSize = value.fontSize || 0;
      const figmaLH = Math.round(value.lineHeight || 0);
      const figmaTypoKey = `${value.fontFamily || ''}-${figmaSize}-${figmaWeight}-${figmaLH}`;
      
      // 2. Try exact match
      let match = project.typography?.get(figmaTypoKey);
      
      // 3. Fallback: Fuzzy match (Size + Weight bucket + LH tolerance)
      if (!match && project.typography) {
        const weightBucket = Math.floor(figmaWeight / 100) * 100;
        
        for (const [pKey, pPath] of project.typography.entries()) {
          const [pFamily, pSize, pWeight, pLH] = String(pKey).split('-');
          const pSizeNum = parseInt(pSize);
          const pWeightNum = parseInt(pWeight);
          const pLHNum = parseInt(pLH);
          const pWeightBucket = Math.floor(pWeightNum / 100) * 100;
          
          const sizeMatch = Math.abs(pSizeNum - figmaSize) <= 1; // +/- 1px tolerance for size
          const weightMatch = pWeightBucket === weightBucket;
          const lhMatch = Math.abs(pLHNum - figmaLH) <= 2; // +/- 2px tolerance for line-height
          
          if (sizeMatch && weightMatch && lhMatch) {
            match = pPath;
            break;
          }
        }
      }

      // Key by the content hash/string, not the ID
      mappings.typography[figmaTypoKey] = match || figmaTypoKey;
    }
  }

  // Match shadows (exact match only, by deterministic key)
  mappings.shadows = {};
  for (const [_, value] of Object.entries(extracted.shadows)) {
    // Use same deterministic key format as theme-extractor
    const shadowKey = `${value.offsetX ?? 0},${value.offsetY ?? 0},${value.blur ?? 0},${value.spread ?? 0}`;
    const match = project.shadows?.get(shadowKey);
    mappings.shadows[shadowKey] = match || shadowKey;
  }

  return mappings;
}
