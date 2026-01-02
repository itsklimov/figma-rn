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
  setAssetDetectionConfig,
  getAssetDetectionConfig,
} from './classifier.js';

export type { AssetDetectionConfig } from './classifier.js';
