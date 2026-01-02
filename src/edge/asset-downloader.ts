/**
 * Asset Downloader
 *
 * Downloads images and icons from Figma API and returns a mapping from imageRef to local file path.
 */

import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import type { IRNode, ComponentIR } from '../core/types.js';
import type { FigmaClient } from '../api/client.js';
import { sanitizeFilename } from '../core/generation/utils.js';

export interface DownloadedAsset {
  nodeId: string;
  imageRef?: string;
  filename: string;
  localPath: string; // Full path on disk
  relativePath: string; // Relative path for require() statement
  category: 'icon' | 'image';
}

export interface AssetDownloadResult {
  assets: DownloadedAsset[];
  pathMap: Map<string, string>; // imageRef → relativePath
}

interface AssetNode {
  nodeId: string;
  name: string;
  ref: string; // imageRef or iconRef
  category: 'icon' | 'image';
}

/**
 * Build a composite asset filename from component name and all meaningful properties
 * Pattern: {componentName}-{prop1}-{prop2}-{propN}
 *
 * Examples:
 *   {Property 1: "card", Property 2: "mir"} → "ic-card-mir"
 *   {Selected: "Yes", State: "Default"} → "radiobutton-yes"
 *   {Name: "gift-card 1"} → "icons-gift-card-1"
 */
function buildAssetFilename(comp: ComponentIR): string {
  const parts: string[] = [];

  // 1. Base name from component name
  parts.push(sanitizeFilename(comp.componentName));

  // 2. Add ALL meaningful properties (sorted for consistency)
  if (comp.componentProps) {
    const propEntries = Object.entries(comp.componentProps).sort();

    for (const [key, value] of propEntries) {
      const lowerKey = key.toLowerCase();
      const lowerValue = String(value).toLowerCase();

      // Skip size/dimension props
      if (lowerKey.includes('size') || lowerKey.includes('width') || lowerKey.includes('height')) {
        continue;
      }

      // Handle generic property names (Property 1, Property 2)
      if (/^property\s*\d+$/i.test(key)) {
        // Skip boolean-like values (Yes/No are state flags, not semantic names)
        if (lowerValue === 'yes' || lowerValue === 'no' || lowerValue === 'true' || lowerValue === 'false') {
          continue;
        }
        // Use the value
        parts.push(sanitizeFilename(value));
        continue;
      }

      // Handle named properties
      if (lowerValue === 'yes' || lowerValue === 'true') {
        // Boolean "yes" → use the key name (e.g., Selected: "Yes" → "selected")
        parts.push(sanitizeFilename(key));
      } else if (lowerValue === 'no' || lowerValue === 'false') {
        // Boolean "no" → skip (default state)
        continue;
      } else {
        // String value → use the value
        parts.push(sanitizeFilename(value));
      }
    }
  }

  // If only component name, return as-is
  // If we have additional parts, join with dashes
  return parts.join('-');
}

/**
 * Recursively extract image and icon nodes from IR tree
 */
function extractAssetNodes(node: IRNode, assets: AssetNode[]): void {
  // 1. Direct asset checks
  if (node.semanticType === 'Image') {
    const imageRef = (node as any).imageRef;
    if (imageRef) {
      // Standard image with IMAGE fill
      assets.push({
        nodeId: node.id,
        name: node.name,
        ref: imageRef,
        category: 'image',
      });
    } else if (node.children && node.children.length > 0) {
      // Vector illustration (FRAME/GROUP with vector children, no imageRef)
      // Export the whole node as SVG
      assets.push({
        nodeId: node.id,
        name: node.name,
        ref: node.id,
        category: 'icon', // Export as SVG
      });
      // Don't recurse - export as single unit
      return;
    }
  } else if (node.semanticType === 'Icon') {
    const iconRef = (node as any).iconRef;
    if (iconRef) {
      assets.push({
        nodeId: node.id,
        name: node.name,
        ref: iconRef,
        category: 'icon',
      });
    }
  } else if (node.semanticType === 'Button') {
    const iconRef = (node as any).iconRef;
    if (iconRef) {
      assets.push({
        nodeId: node.id,
        name: node.name,
        ref: iconRef,
        category: 'icon',
      });
    }
  } else if (node.semanticType === 'Component') {
    // Check for exportable component (contains vector content)
    const comp = node as ComponentIR;
    if (comp.isExportableAsset) {
      const assetName = buildAssetFilename(comp);
      assets.push({
        nodeId: node.id,  // Export parent component to include ALL vector children
        name: assetName,
        ref: node.id,
        category: 'icon',
      });
      // Don't recurse into exportable components - export as single unit
      return;
    }
  }

  // 2. Recursive traversal for any node with children
  if ('children' in node && Array.isArray(node.children)) {
    for (const child of node.children) {
      extractAssetNodes(child, assets);
    }
  }
}

/**
 * Deduplicate asset nodes by ref to prevent downloading the same asset multiple times.
 * Multiple component instances may share the same imageRef/iconRef - we only need to download once.
 */
function deduplicateAssetNodes(nodes: AssetNode[]): AssetNode[] {
  const seen = new Map<string, AssetNode>();
  for (const node of nodes) {
    if (!seen.has(node.ref)) {
      seen.set(node.ref, node);
    }
  }
  return Array.from(seen.values());
}

/**
 * Download a single asset from URL to local path
 */
async function downloadAsset(url: string, localPath: string): Promise<void> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download asset: ${response.status} ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  const uint8Array = new Uint8Array(buffer);

  // Ensure directory exists
  await mkdir(dirname(localPath), { recursive: true });

  // Write file
  await writeFile(localPath, uint8Array);
}

/**
 * Download assets from Figma API and save to local directory
 *
 * @param client - Figma API client
 * @param fileKey - Figma file key
 * @param root - Root IRNode to traverse
 * @param assetsDir - Directory to save assets (absolute path)
 * @returns Download result with asset list and path mapping
 */
export async function downloadAssets(
  client: FigmaClient,
  fileKey: string,
  root: IRNode,
  assetsDir: string
): Promise<AssetDownloadResult> {
  // 1. Extract all asset nodes from IR tree
  const assetNodes: AssetNode[] = [];
  extractAssetNodes(root, assetNodes);

  if (assetNodes.length === 0) {
    return {
      assets: [],
      pathMap: new Map(),
    };
  }

  // 2. Deduplicate by ref - multiple component instances may share the same imageRef/iconRef
  const uniqueAssets = deduplicateAssetNodes(assetNodes);

  console.log(`Extracted ${assetNodes.length} asset nodes, deduplicated to ${uniqueAssets.length} unique assets`);

  // 3. Group nodes by category to optimize API calls
  const iconNodes = uniqueAssets.filter((n) => n.category === 'icon');
  const imageNodes = uniqueAssets.filter((n) => n.category === 'image');

  const downloadedAssets: DownloadedAsset[] = [];
  const pathMap = new Map<string, string>();

  // 4. Download icons (SVG format)
  if (iconNodes.length > 0) {
    const iconDir = join(assetsDir, 'icons');
    await mkdir(iconDir, { recursive: true });

    try {
      const iconIds = iconNodes.map((n) => n.nodeId);
      const exportResults = await client.exportImages(fileKey, iconIds, {
        format: 'svg',
        scale: 1,
      });

      for (let i = 0; i < iconNodes.length; i++) {
        const node = iconNodes[i];
        const exportResult = exportResults[i];

        if (exportResult.error || !exportResult.url) {
          console.error(`Failed to export icon ${node.nodeId}:`, exportResult.error);
          continue;
        }

        try {
          const filename = `${sanitizeFilename(node.name)}.svg`;
          const localPath = join(iconDir, filename);
          const relativePath = `./assets/icons/${filename}`;

          await downloadAsset(exportResult.url, localPath);

          console.log(`✓ Downloaded icon: ${filename}`);

          const asset: DownloadedAsset = {
            nodeId: node.nodeId,
            imageRef: node.ref,
            filename,
            localPath,
            relativePath,
            category: 'icon',
          };

          downloadedAssets.push(asset);
          pathMap.set(node.ref, relativePath);
        } catch (error) {
          console.error(`Failed to download icon ${node.name}:`, error);
        }
      }
    } catch (error) {
      console.error('Failed to export icons from Figma API:', error);
    }
  }

  // 5. Download images (PNG format)
  if (imageNodes.length > 0) {
    const imageDir = join(assetsDir, 'images');
    await mkdir(imageDir, { recursive: true });

    try {
      const imageIds = imageNodes.map((n) => n.nodeId);
      const exportResults = await client.exportImages(fileKey, imageIds, {
        format: 'png',
        scale: 2, // 2x for retina displays
      });

      for (let i = 0; i < imageNodes.length; i++) {
        const node = imageNodes[i];
        const exportResult = exportResults[i];

        if (exportResult.error || !exportResult.url) {
          console.error(`Failed to export image ${node.nodeId}:`, exportResult.error);
          continue;
        }

        try {
          const filename = `${sanitizeFilename(node.name)}.png`;
          const localPath = join(imageDir, filename);
          const relativePath = `./assets/images/${filename}`;

          await downloadAsset(exportResult.url, localPath);

          console.log(`✓ Downloaded image: ${filename}`);

          const asset: DownloadedAsset = {
            nodeId: node.nodeId,
            imageRef: node.ref,
            filename,
            localPath,
            relativePath,
            category: 'image',
          };

          downloadedAssets.push(asset);
          pathMap.set(node.ref, relativePath);
        } catch (error) {
          console.error(`Failed to download image ${node.name}:`, error);
        }
      }
    } catch (error) {
      console.error('Failed to export images from Figma API:', error);
    }
  }

  console.log(`Asset download complete: ${downloadedAssets.length} files downloaded`);

  return {
    assets: downloadedAssets,
    pathMap,
  };
}
