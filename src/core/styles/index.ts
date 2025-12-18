/**
 * Styles module - entry point
 * Extracts visual styles from IR nodes
 */

export {
  fillsToBackground,
  strokesToBorder,
  effectsToShadow,
  cornerRadiusToStyle,
  typographyToStyle,
  extractStyleFromProps,
  extractTokens,
  collectStylesFromIR,
  createEmptyStylesBundle,
} from './extractor.js';
