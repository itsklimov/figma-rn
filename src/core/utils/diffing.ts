import type { ExtractedStyle } from '../types.js';

/**
 * Compare two style objects and return keys of properties that differ.
 * Performs comparison for visual properties defined in ExtractedStyle.
 */
export function getStyleVariations(
  styleA: ExtractedStyle,
  styleB: ExtractedStyle
): string[] {
  const variations: string[] = [];
  
  // We only care about visual properties, not metadata like 'id'
  const keysToCompare = [
    'backgroundColor',
    'backgroundGradient',
    'borderColor',
    'borderWidth',
    'borderRadius',
    'shadow',
    'typography',
    'width',
    'height',
    'position',
    'left',
    'right',
    'top',
    'bottom',
    'opacity',
    'flexDirection',
    'justifyContent',
    'alignItems',
    'alignSelf',
    'gap',
    'padding',
    'flex'
  ] as (keyof ExtractedStyle)[];

  for (const key of keysToCompare) {
    if (key === 'id') continue;
    
    const valA = styleA[key];
    const valB = styleB[key];

    // Use JSON.stringify for stable deep comparison of style objects
    if (JSON.stringify(valA) !== JSON.stringify(valB)) {
      variations.push(key);
    }
  }

  return variations;
}
