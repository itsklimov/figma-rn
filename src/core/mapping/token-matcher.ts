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
 * - Then find closest value within tolerance
 * - For small values (< 20): ±3px tolerance
 * - For medium values (20-50): ±25% tolerance
 * - For large values (> 50): ±30% tolerance (or snap to largest token)
 *
 * This allows mapping values like 6→4 (xs), 7→8 (sm), 56→48 (3xl), etc.
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

  // Determine tolerance based on value size
  let tolerance: number;
  if (value < 20) {
    tolerance = 3; // Small values: ±3px
  } else if (value < 50) {
    tolerance = value * 0.25; // Medium values: ±25%
  } else {
    tolerance = value * 0.35; // Large values: ±35%
  }

  // Fuzzy match: find closest value within tolerance
  let closestPath: string | null = null;
  let closestDiff = Infinity;

  // Also track absolute closest (for large outliers)
  let absoluteClosestPath: string | null = null;
  let absoluteClosestDiff = Infinity;

  for (const [spacingValue, path] of projectSpacing) {
    const numValue = typeof spacingValue === 'number' ? spacingValue : parseFloat(String(spacingValue));
    if (isNaN(numValue)) continue;

    const diff = Math.abs(numValue - value);

    // Track absolute closest
    if (diff < absoluteClosestDiff) {
      absoluteClosestDiff = diff;
      absoluteClosestPath = path;
    }

    // Check within tolerance
    if (diff <= tolerance && diff < closestDiff) {
      closestDiff = diff;
      closestPath = path;
    }
  }

  // If within tolerance, use that
  if (closestPath) {
    return closestPath;
  }

  // For very large outliers (like 87), snap to absolute closest if within 50%
  if (value > 30 && absoluteClosestDiff / value < 0.5) {
    return absoluteClosestPath || String(value);
  }

  return String(value);
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
  
  // IMPORTANT: Pre-populate with exact project spacing values
  // This allows layout gap/padding values to be matched directly
  if (project.spacing) {
    for (const [value, path] of project.spacing) {
      if (typeof value === 'number') {
        mappings.spacing[value] = path;
      }
    }
  }
  
  for (const [id, value] of Object.entries(extracted.spacing)) {
    const matched = matchSpacing(value as number, project.spacing);
    // Support both ID key (for tests) and Value key (for generator)
    mappings.spacing[id] = matched;
    mappings.spacing[value] = matched;
  }

  // Match radii with fuzzy matching (tolerance-based)
  mappings.radii = {};
  
  // Pre-populate with exact project radii values  
  if (project.radii) {
    for (const [value, path] of project.radii) {
      if (typeof value === 'number') {
        mappings.radii[value] = path;
      }
    }
  }
  
  for (const [id, value] of Object.entries(extracted.radii)) {
    const matched = matchRadii(value, project.radii);
    // Support both ID key (for tests) and Value key (for generator)
    mappings.radii[id] = matched;
    mappings.radii[value] = matched;
  }

  // Match typography (by serialized key comparison with wildcard support)
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
      
      let match: string | undefined;
      
      // 2. Try wildcard font family match first (most reliable for cross-platform)
      // Format: *-fontSize-weight-lineHeight
      if (project.typography) {
        const wildcardKey = `*-${figmaSize}-${figmaWeight}-${figmaLH}`;
        match = project.typography.get(wildcardKey);
       
        // 3. Fuzzy match with percentage tolerance (15% gap)
        if (!match) {
          let bestMatch: string | undefined;
          let bestScore = Infinity; // Lower is better
          const TOLERANCE_PERCENT = 0.15; // 15%

          for (const [pKey, pPath] of project.typography.entries()) {
            const keyStr = String(pKey);
            // Skip exact matches if we missed them above (or wildcards if we are looking for wildcards)
            // But we iterate everything to find closest numeric match
            
            const parts = keyStr.split('-');
            // Keys are typically: Family-Size-Weight-LH
            // Wildcard keys: *-Size-Weight-LH
            const pLH = parseInt(parts.pop() || '0');
            const pWeight = parseInt(parts.pop() || '0');
            const pSize = parseInt(parts.pop() || '0');
            // Family is the rest
            const pFamily = parts.join('-');

            // Only compare if families match OR project key is wildcard
            const figmaFamilySimple = (value.fontFamily || '').toLowerCase().replace(/\s/g, '');
            const pFamilySimple = pFamily.replace(/\*/g, '').toLowerCase().replace(/\s/g, '');
            
            // Allow wildcard match or partial family match
            const familyMatch = pFamily === '*' || 
                                figmaFamilySimple.includes(pFamilySimple) || 
                                pFamilySimple.includes(figmaFamilySimple);

            if (!familyMatch) continue;

            // Calculate percentage differences
            const sizeDiff = Math.abs(pSize - figmaSize) / Math.max(figmaSize, 1);
            const weightDiff = Math.abs(pWeight - figmaWeight) / Math.max(figmaWeight, 1);
            const lhDiff = Math.abs(pLH - figmaLH) / Math.max(figmaLH, 1);

            // Check individual thresholds (loose check)
            if (sizeDiff > TOLERANCE_PERCENT) continue;
            // For weight, 15% of 590 is ~88. 590-88=502. So 500 is just slightly out?
            // User asked for "15% gap".
            if (weightDiff > TOLERANCE_PERCENT) continue;
            if (lhDiff > TOLERANCE_PERCENT) continue;

            // Composite score (weighted)
            // Weight size deviations more heavily
            const score = sizeDiff * 2 + weightDiff * 1 + lhDiff * 1;

            if (score < bestScore) {
              bestScore = score;
              bestMatch = pPath;
            }
          }
          
          if (bestMatch) {
            match = bestMatch;
          }
        }
        
        // Original 3. Try with tolerance on lineHeight (±2px) - now 4.
        if (!match) {
          for (const lhOffset of [1, -1, 2, -2]) {
            const tolerantKey = `*-${figmaSize}-${figmaWeight}-${figmaLH + lhOffset}`;
            match = project.typography.get(tolerantKey);
            if (match) break;
          }
        }
        
        // Original 4. Try with tolerance on fontSize (±1px) - now 5.
        if (!match) {
          for (const sizeOffset of [1, -1]) {
            const tolerantKey = `*-${figmaSize + sizeOffset}-${figmaWeight}-${figmaLH}`;
            match = project.typography.get(tolerantKey);
            if (match) break;
          }
        }
      }
      
      // Original 5. Try exact match with full font family (fallback) - now 6.
      if (!match && project.typography) {
        match = project.typography.get(figmaTypoKey);
      }
      
      // Original 6. Fallback: Original fuzzy match (Size + Weight bucket + LH tolerance) - now 7.
      if (!match && project.typography) {
        const weightBucket = Math.floor(figmaWeight / 100) * 100;
        
        for (const [pKey, pPath] of project.typography.entries()) {
          const keyStr = String(pKey);
          // Skip wildcard entries (they're for lookup, not iteration)
          if (keyStr.startsWith('*-')) continue;
          
          const [pFamily, pSize, pWeight, pLH] = keyStr.split('-');
          const pSizeNum = parseInt(pSize);
          const pWeightNum = parseInt(pWeight);
          const pLHNum = parseInt(pLH);
          const pWeightBucket = Math.floor(pWeightNum / 100) * 100;
          
          const sizeMatch = Math.abs(pSizeNum - figmaSize) <= 1;
          const weightMatch = pWeightBucket === weightBucket;
          const lhMatch = Math.abs(pLHNum - figmaLH) <= 2;
          
          if (sizeMatch && weightMatch && lhMatch) {
            match = pPath;
            break;
          }
        }
      }

      // Use the raw (un-normalized) values for the key stored in the map
      // This ensures styles-builder can find it using its raw input
      // figmaWeight is normalized (600), rawWeight is (590) 
      // We must construct the key exactly how styles-builder does: 
      // `${fontFamily}-${fontSize}-${fontWeight}-${lineHeight}`
      // styles-builder uses raw values! (We reverted the normalization there)
      const rawKey = `${value.fontFamily || ''}-${figmaSize}-${rawWeight}-${figmaLH}`;
      if (match) {
        mappings.typography[rawKey] = match;
      }
      // Keep fuzzy key too just in case
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
