/**
 * Detection Layer - Pattern detection in IR trees
 *
 * Detects patterns that can improve code quality:
 * - Lists: Repeating items that should become FlatList
 * - Components: Repeated blocks that should be extracted
 */

import type { IRNode } from '../types.js';
import type { DetectionResult } from './types.js';
import { detectLists } from './list-detector.js';
import { detectRepetitions } from './repetition-detector.js';

// Re-export types
export type { ListHint, ComponentHint, DetectionResult } from './types.js';
export { createEmptyDetectionResult } from './types.js';

/**
 * Run all detectors on an IR tree
 *
 * @param root - Root IR node to analyze
 * @returns Combined detection results from all detectors
 *
 * @example
 * ```typescript
 * const screenIR = transformToScreenIR(figmaNode);
 * const hints = runDetectors(screenIR.root);
 *
 * if (hints.lists.length > 0) {
 *   // Generate FlatList instead of repeated Views
 * }
 * ```
 */
export function runDetectors(root: IRNode): DetectionResult {
  const lists = detectLists(root);
  const components = detectRepetitions(root);

  return {
    lists,
    components,
  };
}
