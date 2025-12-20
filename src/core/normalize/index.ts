/**
 * Normalize module - entry point
 * Combines filtering and unwrapping to produce a clean tree
 */

import type { FigmaNode } from '../../api/types.js';
import type { NormalizedNode } from '../types.js';
import { filterTree } from './filter.js';
import { unwrapUselessGroups } from './unwrap.js';

export { filterTree, filterNode, shouldFilter } from './filter.js';
export { unwrapUselessGroups, isUselessGroup, isWrapperGroup, flattenWrapperGroups } from './unwrap.js';

/**
 * Normalize a Figma node tree by:
 * 1. Filtering out hidden and irrelevant nodes
 * 2. Unwrapping useless wrapper groups
 *
 * @param root - The root FigmaNode to normalize
 * @param ignorePatterns - Optional patterns to filter out (e.g., '*annotation*')
 * @returns NormalizedNode tree, or null if root is filtered
 */
export function normalizeTree(
  root: FigmaNode,
  ignorePatterns?: string[]
): NormalizedNode | null {
  // Step 1: Filter out hidden and irrelevant nodes
  const filtered = filterTree(root, ignorePatterns);

  if (filtered === null) {
    return null;
  }

  // Step 2: Unwrap useless groups
  const unwrapped = unwrapUselessGroups(filtered);

  return unwrapped;
}
