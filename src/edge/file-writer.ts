/**
 * File Writer - Write all generated files to disk
 *
 * Orchestrates writing the complete generation result to the .figma workspace:
 * - Main component (via registerGeneration)
 * - Extracted sub-components
 * - Tokens file
 * - Assets (already downloaded)
 * - Screenshot
 */

import { writeFile } from 'fs/promises';
import { join } from 'path';
import type { MultiFileResult } from '../core/generation/index.js';
import type { DownloadedAsset } from './asset-downloader.js';
import type { ManifestCategory } from '../figma-workspace.js';
import {
  registerGeneration,
  saveScreenshot,
  type AssetInfo,
} from '../figma-workspace.js';

/**
 * Options for writing generated files
 */
export interface WriteOptions {
  /** Project root directory */
  projectRoot: string;
  /** Figma URL */
  figmaUrl: string;
  /** Category (screens, modals, etc.) */
  category: ManifestCategory;
  /** Component name (for folder naming) */
  componentName: string;
  /** Multi-file generation result */
  multiFileResult: MultiFileResult;
  /** Downloaded assets (already on disk) */
  assets?: DownloadedAsset[];
  /** Screenshot buffer */
  screenshot?: Buffer;
  /** Figma name (may differ from componentName) */
  figmaName?: string;
}

/**
 * Result of writing files
 */
export interface WriteResult {
  /** Success status */
  success: boolean;
  /** Folder path (relative to project root) */
  folder: string;
  /** Main component path */
  indexPath: string;
  /** Extracted component paths */
  extractedPaths: string[];
  /** Tokens file path */
  tokensPath?: string;
  /** Screenshot path */
  screenshotPath?: string;
  /** Number of assets saved */
  assetsCount: number;
  /** Whether this replaced an existing component */
  isUpdate: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Write all generated files to disk
 *
 * This function orchestrates writing the complete generation result:
 * 1. Uses registerGeneration() for the main component
 * 2. Writes extracted components as sibling files
 * 3. Writes tokens file if present
 * 4. Saves screenshot if provided
 *
 * @param options - Write options
 * @returns Write result with paths and status
 *
 * @example
 * ```typescript
 * const result = await writeGeneratedFiles({
 *   projectRoot: '/path/to/project',
 *   figmaUrl: 'https://figma.com/file/...',
 *   category: 'screens',
 *   componentName: 'HomeScreen',
 *   multiFileResult: {
 *     mainComponent: { path: '...', content: '...' },
 *     extractedComponents: [...],
 *     tokens: null,
 *     unmappedTokens: {...}
 *   },
 *   assets: [...],
 *   screenshot: Buffer.from(...),
 * });
 * ```
 */
export async function writeGeneratedFiles(options: WriteOptions): Promise<WriteResult> {
  const {
    projectRoot,
    figmaUrl,
    category,
    componentName,
    multiFileResult,
    assets = [],
    screenshot,
    figmaName,
  } = options;

  try {
    // Convert DownloadedAsset[] to AssetInfo[] for registerGeneration
    const assetInfos: AssetInfo[] = assets.map((asset) => ({
      filename: asset.filename,
      type: asset.category,
      nodeId: asset.nodeId,
      figmaName: asset.filename,
      format: asset.filename.endsWith('.svg')
        ? 'svg'
        : asset.filename.endsWith('.png')
        ? 'png'
        : 'jpg',
    }));

    // 1. Register main component with figma-workspace
    // This creates the folder, saves index.tsx, saves meta.json, updates manifest
    const generationResult = await registerGeneration(
      projectRoot,
      figmaUrl,
      category,
      componentName,
      multiFileResult.mainComponent.content,
      {
        assets: assetInfos,
        figmaName,
        // Note: tokensExtracted is computed inside registerGeneration from tokens
        // We don't have access to the DesignTokens object here, so we omit it
      }
    );

    const elementFolder = join(projectRoot, generationResult.folder);
    const extractedPaths: string[] = [];
    let tokensPath: string | undefined;
    let screenshotPath: string | undefined;

    // 2. Save extracted components as sibling files
    for (const extracted of multiFileResult.extractedComponents) {
      // Extract filename from path (e.g., "CardItem.tsx" from "components/CardItem.tsx")
      const filename = extracted.path.split('/').pop() || extracted.path;
      const componentPath = join(elementFolder, filename);

      await writeFile(componentPath, extracted.content, 'utf-8');
      extractedPaths.push(join(generationResult.folder, filename));
    }

    // 3. Save tokens file if present
    if (multiFileResult.tokens) {
      const tokensFilename = 'tokens.ts';
      const tokensFilePath = join(elementFolder, tokensFilename);

      await writeFile(tokensFilePath, multiFileResult.tokens.content, 'utf-8');
      tokensPath = join(generationResult.folder, tokensFilename);
    }

    // 4. Save screenshot if provided
    if (screenshot) {
      await saveScreenshot(elementFolder, screenshot);
      screenshotPath = join(generationResult.folder, 'screenshot.png');
    }

    return {
      success: true,
      folder: generationResult.folder,
      indexPath: generationResult.indexPath,
      extractedPaths,
      tokensPath,
      screenshotPath,
      assetsCount: assets.length,
      isUpdate: generationResult.wasReplaced,
    };
  } catch (error) {
    return {
      success: false,
      folder: '',
      indexPath: '',
      extractedPaths: [],
      assetsCount: 0,
      isUpdate: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
