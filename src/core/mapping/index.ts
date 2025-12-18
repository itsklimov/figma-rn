/**
 * Mapping Layer - Token extraction and matching
 *
 * Simplified implementation for matching Figma tokens to project theme tokens.
 * No heavy dependencies (no ts-morph, no chroma-js).
 */

// Types
export type { ProjectTokens } from './theme-extractor.js';
export type { TokenMappings } from './token-matcher.js';

// Theme extraction
export { extractProjectTokens } from './theme-extractor.js';

// Token matching
export { matchTokens, createEmptyMappings } from './token-matcher.js';

// Color utilities (for advanced use cases)
export { hexToLab, labDistance, findClosestColor } from './color-matcher.js';
