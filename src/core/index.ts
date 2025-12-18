/**
 * Core module - entry point
 * Transforms FigmaNode into ScreenIR for code generation
 */

// Main pipeline
export { transformToScreenIR, stages } from './pipeline.js';

// Types
export type {
  // Core types
  NormalizedNode,
  LayoutNode,
  LayoutType,
  LayoutMeta,

  // Semantic IR types
  SemanticType,
  IRNode,
  ContainerIR,
  TextIR,
  ImageIR,
  ButtonIR,
  CardIR,
  IconIR,

  // Styles types
  ExtractedStyle,
  DesignTokens,
  StylesBundle,

  // Pipeline types
  PipelineOptions,
  ScreenIR,

  // Re-exported from API
  BoundingBox,
  Padding,
  Fill,
  Stroke,
  Effect,
  CornerRadius,
  TypographyInfo,
} from './types.js';

// Normalize module
export {
  normalizeTree,
  filterTree,
  filterNode,
  shouldFilter,
  unwrapUselessGroups,
  isUselessGroup,
  isWrapperGroup,
  flattenWrapperGroups,
} from './normalize/index.js';

// Layout module
export {
  detectLayoutType,
  isRowByPosition,
  isColumnByPosition,
  isStackByPosition,
  calculateRowGap,
  calculateColumnGap,
  extractLayoutMeta,
  addLayoutInfo,
  inferPadding,
  inferMainAxisAlign,
  inferCrossAxisAlign,
} from './layout/index.js';

// Recognize module
export {
  isText,
  isImage,
  isIcon,
  isButton,
  isCard,
  classifyNode,
  toIRNode,
  recognizeSemantics,
} from './recognize/index.js';

// Styles module
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
} from './styles/index.js';
