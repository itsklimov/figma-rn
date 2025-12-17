/**
 * Download images from Figma and provide metadata for LLM to decide placement
 */

import https from 'https';
import { writeFile, mkdir } from 'fs/promises';
import { join, basename } from 'path';
import { createHash } from 'crypto';

interface ImageDownloadResult {
  nodeId: string;
  nodeName: string;
  format: string;
  downloadedPath: string;
  suggestedImportPath: string;
  width: number;
  height: number;
  fileSize: number;
}

/**
 * Fetch image URLs from Figma API
 */
async function fetchImageUrls(
  token: string,
  fileKey: string,
  nodeIds: string[],
  format: 'svg' | 'png' = 'svg',
  scale: number = 1
): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    const idsParam = nodeIds.join(',');
    const path = `/v1/images/${fileKey}?ids=${encodeURIComponent(idsParam)}&format=${format}&scale=${scale}`;

    const options = {
      hostname: 'api.figma.com',
      path,
      headers: {
        'X-Figma-Token': token,
      },
    };

    https.get(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.err) {
            reject(new Error(json.err));
            return;
          }

          resolve(json.images || {});
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

/**
 * Download image from URL
 */
async function downloadImage(
  url: string,
  outputPath: string
): Promise<{ size: number }> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks: Buffer[] = [];

      res.on('data', (chunk) => {
        chunks.push(chunk);
      });

      res.on('end', async () => {
        try {
          const buffer = Buffer.concat(chunks);
          await writeFile(outputPath, buffer);
          resolve({ size: buffer.length });
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

/**
 * Get image dimensions from buffer
 */
function getImageDimensions(
  buffer: Buffer,
  format: string
): { width: number; height: number } {
  if (format === 'png') {
    // PNG signature check and dimension extraction
    if (buffer[0] === 0x89 && buffer[1] === 0x50) {
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      return { width, height };
    }
  }
  // For SVG, return 0 (vector has no fixed dimensions)
  return { width: 0, height: 0 };
}

/**
 * Generate suggested import path based on image type
 */
function suggestImportPath(nodeName: string, format: string): string {
  const name = nodeName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  // Determine category based on name patterns
  if (name.includes('icon') || name.includes('arrow') || name.includes('check')) {
    return `@assets/icons/${name}.${format}`;
  }

  if (name.includes('avatar') || name.includes('photo') || name.includes('image')) {
    return `@assets/images/${name}.${format}`;
  }

  if (name.includes('logo') || name.includes('brand')) {
    return `@assets/images/${name}.${format}`;
  }

  // Default to images
  return `@assets/images/${name}.${format}`;
}

/**
 * Download Figma images and return metadata for LLM decision-making
 */
export async function downloadFigmaImages(
  token: string,
  fileKey: string,
  nodeIds: Array<{ id: string; name: string }>,
  outputDir: string,
  format: 'svg' | 'png' = 'svg',
  scale: number = 1
): Promise<ImageDownloadResult[]> {
  // Ensure output directory exists
  await mkdir(outputDir, { recursive: true });

  // Fetch image URLs from Figma
  const ids = nodeIds.map((n) => n.id);
  const imageUrls = await fetchImageUrls(token, fileKey, ids, format, scale);

  const results: ImageDownloadResult[] = [];

  // Download each image
  for (const nodeInfo of nodeIds) {
    const url = imageUrls[nodeInfo.id];
    if (!url) continue;

    // Generate filename
    const hash = createHash('md5').update(nodeInfo.id).digest('hex').slice(0, 8);
    const filename = `${nodeInfo.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${hash}.${format}`;
    const downloadPath = join(outputDir, filename);

    // Download image
    const { size } = await downloadImage(url, downloadPath);

    // Get dimensions (for PNG)
    const buffer = await import('fs/promises').then((fs) => fs.readFile(downloadPath));
    const dimensions = getImageDimensions(buffer, format);

    // Generate suggested import path
    const suggestedPath = suggestImportPath(nodeInfo.name, format);

    results.push({
      nodeId: nodeInfo.id,
      nodeName: nodeInfo.name,
      format,
      downloadedPath: downloadPath,
      suggestedImportPath: suggestedPath,
      width: dimensions.width,
      height: dimensions.height,
      fileSize: size,
    });
  }

  return results;
}

/**
 * Analyze images and provide recommendations
 */
export function analyzeImageDownloads(results: ImageDownloadResult[]): string {
  let analysis = '# Downloaded Images Analysis\n\n';

  // Group by category
  const byCategory: Record<string, ImageDownloadResult[]> = {};

  results.forEach((img) => {
    const category = img.suggestedImportPath.includes('/icons/')
      ? 'Icons'
      : img.suggestedImportPath.includes('/images/')
        ? 'Images'
        : 'Other';

    if (!byCategory[category]) byCategory[category] = [];
    byCategory[category].push(img);
  });

  // Generate report
  for (const [category, images] of Object.entries(byCategory)) {
    analysis += `## ${category} (${images.length})\n\n`;

    images.forEach((img) => {
      analysis += `### ${img.nodeName}\n`;
      analysis += `- **Node ID**: ${img.nodeId}\n`;
      analysis += `- **Format**: ${img.format.toUpperCase()}\n`;
      if (img.width > 0) {
        analysis += `- **Size**: ${img.width}x${img.height}px\n`;
      }
      analysis += `- **File Size**: ${(img.fileSize / 1024).toFixed(2)} KB\n`;
      analysis += `- **Downloaded to**: \`${img.downloadedPath}\`\n`;
      analysis += `- **Suggested import**: \`${img.suggestedImportPath}\`\n`;
      analysis += `\n`;
    });
  }

  analysis += `\n## Recommendations\n\n`;
  analysis += `1. Review suggested import paths and move files accordingly\n`;
  analysis += `2. Update image imports in generated components\n`;
  analysis += `3. For icons, consider using existing icon components if available\n`;
  analysis += `4. Optimize PNG images if file size is large (>100KB)\n`;

  return analysis;
}
