/**
 * Generation Layer - Transform ScreenIR to React Native TSX
 *
 * This module generates production-ready TSX + StyleSheet code from the
 * intermediate representation (ScreenIR) produced by the transformation pipeline.
 */

// Main API
export { generateComponent, generateComponentMultiFile } from './component-builder.js';
export type {
  GenerationResult,
  GenerationOptions,
  GeneratedFile,
  MultiFileResult,
} from './component-builder.js';

// Individual builders (for advanced use cases)
export { buildImports } from './imports-builder.js';
export { buildJSX, collectStyleNames } from './jsx-builder.js';
export { buildStyles } from './styles-builder.js';

// List generation
export { generateFlatList, generateItemComponent } from './list-generator.js';
export type { FlatListResult } from './list-generator.js';

// Token generation
export { generateTokensFile, generateTokensIfNeeded } from './tokens-generator.js';
export type { TokensGenerationResult } from './tokens-generator.js';

// Utilities
export { toValidIdentifier, escapeJSXText } from './utils.js';
