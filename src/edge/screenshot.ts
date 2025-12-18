/**
 * Screenshot Edge Module
 *
 * Captures screenshots of Figma nodes for visual validation.
 */

import { writeFile } from 'fs/promises';
import type { FigmaClient } from '../api/client.js';

export interface ScreenshotResult {
  success: boolean;
  path?: string;
  error?: string;
}

/**
 * Capture screenshot of a Figma node
 *
 * @param client - FigmaClient instance
 * @param fileKey - Figma file key
 * @param nodeId - Node ID to capture
 * @param outputPath - Full path where to save (e.g., /path/to/folder/screenshot.png)
 * @returns Result with success status and path
 *
 * @example
 * const result = await captureScreenshot(
 *   client,
 *   'abc123',
 *   '1:2',
 *   '/path/to/screenshot.png'
 * );
 * if (result.success) {
 *   console.log(`Screenshot saved to ${result.path}`);
 * }
 */
export async function captureScreenshot(
  client: FigmaClient,
  fileKey: string,
  nodeId: string,
  outputPath: string
): Promise<ScreenshotResult> {
  try {
    // Export node as PNG at 2x scale
    const exportResults = await client.exportImages(fileKey, [nodeId], {
      format: 'png',
      scale: 2,
    });

    const result = exportResults[0];
    if (!result || result.error) {
      return {
        success: false,
        error: result?.error || 'Failed to export image',
      };
    }

    // Download image from temporary URL
    const response = await fetch(result.url);
    if (!response.ok) {
      return {
        success: false,
        error: `Failed to download image: ${response.statusText}`,
      };
    }

    // Convert to buffer and save to disk
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await writeFile(outputPath, buffer);

    return {
      success: true,
      path: outputPath,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
