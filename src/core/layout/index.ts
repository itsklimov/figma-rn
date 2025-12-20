/**
 * Layout module - entry point
 * Adds layout information to normalized nodes
 */

export {
  detectLayoutType,
  isRowByPosition,
  isColumnByPosition,
  isStackByPosition,
  calculateRowGap,
  calculateColumnGap,
} from './detector.js';

export {
  extractLayoutMeta,
  addLayoutInfo,
  inferPadding,
  inferMainAxisAlign,
  inferCrossAxisAlign,
} from './extractor.js';
