/**
 * Normalize module - entry point
 * Combines filtering and unwrapping to produce a clean tree
 */

import type { FigmaNode } from '../../api/types.js';
import type { NormalizedNode } from '../types.js';
import { filterTree, type FilterOptions } from './filter.js';
import { unwrapUselessGroups } from './unwrap.js';

export { filterTree, filterNode, shouldFilter, type FilterOptions } from './filter.js';
export { unwrapUselessGroups, isUselessGroup, isWrapperGroup, flattenWrapperGroups } from './unwrap.js';

/**
 * Normalize a Figma node tree by:
 * 1. Filtering out hidden and irrelevant nodes (including OS chrome via excludeIds)
 * 2. Unwrapping useless wrapper groups
 *
 * @param root - The root FigmaNode to normalize
 * @param optionsOrPatterns - Either FilterOptions object or legacy string[] of patterns
 * @returns NormalizedNode tree, or null if root is filtered
 */
export function normalizeTree(
  root: FigmaNode,
  optionsOrPatterns?: FilterOptions | string[]
): NormalizedNode | null {
  // Step 1: Filter out hidden, irrelevant, and OS chrome nodes
  const filtered = filterTree(root, optionsOrPatterns);

  if (filtered === null) {
    return null;
  }

  // Step 2: Unwrap useless groups
  const unwrapped = unwrapUselessGroups(filtered);

  return unwrapped;
}
