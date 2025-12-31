/**
 * Detection Layer - Pattern detection in IR trees
 *
 * Detects patterns that can improve code quality:
 * - Lists: Repeating items that should become FlatList
 * - Components: Repeated blocks that should be extracted
 * - Semantic States: Visual variations that represent UI states
 * - Safe Areas: OS chrome elements for proper layout
 */

import type { IRNode, StylesBundle } from '../types.js';
import type { DetectionResult } from './types.js';
import { detectLists } from './list-detector.js';
import { detectRepetitions } from './repetition-detector.js';
import { detectSemanticState, type SemanticState, type StateDetectionResult } from './state-detector.js';

// Re-export types
export type { ListHint, ComponentHint, DetectionResult } from './types.js';
export type { SemanticState, StateDetectionResult } from './state-detector.js';
export { createEmptyDetectionResult } from './types.js';
export { detectSemanticState } from './state-detector.js';

// Safe area detection
export {
  detectSafeArea,
  shouldExcludeFromRender,
  type SafeAreaInsets,
  type SafeAreaDetectionResult,
  type OSChromeElement,
} from './safe-area-detector.js';

/**
 * Run all detectors on an IR tree
 *
 * @param root - Root IR node to analyze
 * @param stylesBundle - Styles bundle for style-aware detection
 * @returns Combined detection results from all detectors
 *
 * @example
 * ```typescript
 * const screenIR = transformToScreenIR(figmaNode);
 * const hints = runDetectors(screenIR.root, screenIR.stylesBundle);
 *
 * if (hints.lists.length > 0) {
 *   // Generate FlatList instead of repeated Views
 * }
 * ```
 */
export function runDetectors(root: IRNode, stylesBundle?: StylesBundle): DetectionResult {
  const lists = detectLists(root);
  const components = detectRepetitions(root, stylesBundle);

  return {
    lists,
    components,
  };
}
