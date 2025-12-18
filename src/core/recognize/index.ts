/**
 * Recognize module - entry point
 * Classifies nodes into semantic types
 */

export {
  isText,
  isImage,
  isIcon,
  isButton,
  isCard,
  classifyNode,
  toIRNode,
  recognizeSemantics,
} from './classifier.js';
