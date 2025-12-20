/**
 * Asset download pipeline for Figma images
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import type { ImageExportResult } from './types.js';

export interface DownloadedAsset {
  nodeId: string;
  filename: string;
  filepath: string;
  format: string;
  size: number;
  url: string;
}

export interface AssetDownloadOptions {
  outputDir: string;
  naming?: 'nodeId' | 'nodeName';
  nameMap?: Record<string, string>;
  createDir?: boolean;
}

/**
 * Download a single image from URL to file
 */
export async function downloadImage(url: string, filepath: string): Promise<{ size: number }> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);

    https
      .get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            downloadImage(redirectUrl, filepath).then(resolve).catch(reject);
            return;
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: ${response.statusCode}`));
          return;
        }

        let size = 0;
        response.on('data', (chunk) => {
          size += chunk.length;
        });
        response.pipe(file);

        file.on('finish', () => {
          file.close();
          resolve({ size });
        });
      })
      .on('error', (err) => {
        fs.unlink(filepath, () => {});
        reject(err);
      });
  });
}

/**
 * Download multiple assets from Figma export results
 */
export async function downloadAssets(
  exportResults: ImageExportResult[],
  options: AssetDownloadOptions
): Promise<DownloadedAsset[]> {
  const { outputDir, naming = 'nodeId', nameMap, createDir = true } = options;

  if (createDir && !fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const downloaded: DownloadedAsset[] = [];

  for (const result of exportResults) {
    if (!result.url || result.error) {
      console.warn(`Skipping ${result.nodeId}: ${result.error || 'no URL'}`);
      continue;
    }

    const ext = getExtensionFromUrl(result.url);
    let filename: string;

    if (nameMap && nameMap[result.nodeId]) {
      filename = `${nameMap[result.nodeId]}.${ext}`;
    } else if (naming === 'nodeId') {
      filename = `${result.nodeId.replace(/:/g, '-')}.${ext}`;
    } else {
      filename = `asset-${result.nodeId.replace(/:/g, '-')}.${ext}`;
    }

    const filepath = path.join(outputDir, filename);

    try {
      const { size } = await downloadImage(result.url, filepath);
      downloaded.push({
        nodeId: result.nodeId,
        filename,
        filepath,
        format: ext,
        size,
        url: result.url,
      });
    } catch (error) {
      console.error(`Failed to download ${result.nodeId}:`, error);
    }
  }

  return downloaded;
}

function getExtensionFromUrl(url: string): string {
  if (url.includes('format=svg')) return 'svg';
  if (url.includes('format=pdf')) return 'pdf';
  if (url.includes('format=jpg')) return 'jpg';
  return 'png';
}

export function saveAssetManifest(assets: DownloadedAsset[], manifestPath: string): void {
  const manifest = {
    generatedAt: new Date().toISOString(),
    count: assets.length,
    assets: assets.map((a) => ({
      nodeId: a.nodeId,
      filename: a.filename,
      format: a.format,
      size: a.size,
    })),
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}
