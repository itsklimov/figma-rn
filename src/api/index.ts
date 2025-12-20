/**
 * Figma API Client - Barrel exports
 */

// Client
export { FigmaClient } from './client.js';

// Errors
export { FigmaApiError, createApiError, isFigmaApiError, hasErrorCode, retryOnError } from './errors.js';
export type { FigmaErrorCode } from './errors.js';

// Cache
export { FigmaCache, createCache } from './cache.js';
export type { CacheKey, CacheEntry, CacheOptions } from './cache.js';

// Config
export { defaultConventions, matchesPattern, shouldIgnoreNode, isComponent } from './config.js';
export type { FigmaConventions } from './config.js';

// Assets
export { downloadImage, downloadAssets, saveAssetManifest } from './assets.js';
export type { DownloadedAsset, AssetDownloadOptions } from './assets.js';

// Core types
export type {
  ParsedFigmaUrl,
  Color,
  GradientStop,
  Gradient,
  BoundingBox,
  Padding,
  CornerRadius,
  MainAxisAlign,
  CrossAxisAlign,
  LayoutInfo,
  TypographyInfo,
  ShadowEffect,
  BlurEffect,
  Effect,
  SolidFill,
  GradientFill,
  ImageFill,
  Fill,
  Stroke,
  ComponentPropertyType,
  ComponentProperty,
  NodeType,
  FigmaNode,
  FigmaFile,
  TransformedNode,
  FetchNodesResult,
  ImageFormat,
  ImageExportOptions,
  ImageExportResult,
  ColorVariable,
  VariablesResult,
  FigmaStyle,
  StylesResult,
} from './types.js';

// Transformers
export {
  transformColor,
  transformLayout,
  transformTypography,
  transformEffects,
  transformFills,
  transformStroke,
  transformCornerRadius,
  transformComponentProperties,
  transformNode,
  transformFile,
} from './transformers.js';
