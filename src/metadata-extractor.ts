/**
 * Extract complete Figma file/node metadata for discovery
 * Enables LLM to find images, components, and structure before generation
 */

import https from 'https';

interface FigmaNodeMetadata {
  id: string;
  name: string;
  type: string;
  width?: number;
  height?: number;
  isImage: boolean;
  isComponent: boolean;

  // Layout properties
  layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL' | 'GRID';
  flexDirection?: 'row' | 'column'; // Mapped from layoutMode
  itemSpacing?: number; // → gap
  counterAxisSpacing?: number; // → wrap gap
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  primaryAxisAlignItems?: string; // → justifyContent
  counterAxisAlignItems?: string; // → alignItems
  layoutWrap?: 'NO_WRAP' | 'WRAP';
  flexWrap?: 'nowrap' | 'wrap'; // Mapped from layoutWrap

  // Positioning properties
  layoutPositioning?: 'AUTO' | 'ABSOLUTE';
  constraints?: {
    vertical: string;
    horizontal: string;
  };
  relativeTransform?: number[][];

  // Sizing properties
  layoutSizingHorizontal?: 'FIXED' | 'HUG' | 'FILL';
  layoutSizingVertical?: 'FIXED' | 'HUG' | 'FILL';
  layoutGrow?: number;

  children?: FigmaNodeMetadata[];
}

/**
 * Fetch Figma file metadata from API
 */
async function fetchFigmaFile(
  token: string,
  fileKey: string,
  nodeId?: string
): Promise<any> {
  return new Promise((resolve, reject) => {
    const path = nodeId
      ? `/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`
      : `/v1/files/${fileKey}`;

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

          if (nodeId) {
            resolve(json.nodes?.[nodeId]?.document || null);
          } else {
            resolve(json.document);
          }
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

/**
 * Parse Figma URL
 */
function parseFigmaUrl(url: string): { fileKey: string; nodeId?: string } | null {
  const match = url.match(/figma\.com\/(?:file|design)\/([^/?]+)/);
  if (!match) return null;

  const fileKey = match[1];
  const nodeMatch = url.match(/node-id=([^&]+)/);
  const nodeId = nodeMatch ? nodeMatch[1].replace(/-/g, ':') : undefined;

  return { fileKey, nodeId };
}

/**
 * Simplify node metadata for LLM consumption with unlimited depth
 * Uses circular reference protection instead of depth limiting
 */
function simplifyNodeMetadata(
  node: any,
  visitedNodes: Set<string> = new Set()
): FigmaNodeMetadata {
  // Circular reference protection
  if (visitedNodes.has(node.id)) {
    return {
      id: node.id,
      name: `[Circular: ${node.name}]`,
      type: 'CIRCULAR_REFERENCE',
      isImage: false,
      isComponent: false,
    };
  }

  visitedNodes.add(node.id);

  const isImage = node.type === 'RECTANGLE' && node.fills?.some((f: any) => f.type === 'IMAGE');
  const isVector = node.type === 'VECTOR';
  const isComponent = node.type === 'COMPONENT' || node.type === 'INSTANCE';

  const metadata: FigmaNodeMetadata = {
    id: node.id,
    name: node.name,
    type: node.type,
    isImage: isImage || isVector || node.type === 'IMAGE',
    isComponent,
  };

  // Add dimensions
  if (node.absoluteBoundingBox) {
    metadata.width = Math.round(node.absoluteBoundingBox.width);
    metadata.height = Math.round(node.absoluteBoundingBox.height);
  }

  // Extract layout properties
  if (node.layoutMode) {
    metadata.layoutMode = node.layoutMode;
    // Map to React Native flexDirection
    if (node.layoutMode === 'HORIZONTAL') {
      metadata.flexDirection = 'row';
    } else if (node.layoutMode === 'VERTICAL') {
      metadata.flexDirection = 'column';
    }
  }

  if (node.itemSpacing !== undefined) {
    metadata.itemSpacing = node.itemSpacing;
  }

  if (node.counterAxisSpacing !== undefined) {
    metadata.counterAxisSpacing = node.counterAxisSpacing;
  }

  // Extract padding
  if (node.paddingTop !== undefined) metadata.paddingTop = node.paddingTop;
  if (node.paddingRight !== undefined) metadata.paddingRight = node.paddingRight;
  if (node.paddingBottom !== undefined) metadata.paddingBottom = node.paddingBottom;
  if (node.paddingLeft !== undefined) metadata.paddingLeft = node.paddingLeft;

  // Extract alignment
  if (node.primaryAxisAlignItems !== undefined) {
    metadata.primaryAxisAlignItems = node.primaryAxisAlignItems;
  }

  if (node.counterAxisAlignItems !== undefined) {
    metadata.counterAxisAlignItems = node.counterAxisAlignItems;
  }

  // Extract layout wrap
  if (node.layoutWrap) {
    metadata.layoutWrap = node.layoutWrap;
    metadata.flexWrap = node.layoutWrap === 'WRAP' ? 'wrap' : 'nowrap';
  }

  // Extract positioning properties
  if (node.layoutPositioning) {
    metadata.layoutPositioning = node.layoutPositioning;
  }

  if (node.constraints) {
    metadata.constraints = {
      vertical: node.constraints.vertical,
      horizontal: node.constraints.horizontal,
    };
  }

  if (node.relativeTransform) {
    metadata.relativeTransform = node.relativeTransform;
  }

  // Extract sizing properties
  if (node.layoutSizingHorizontal) {
    metadata.layoutSizingHorizontal = node.layoutSizingHorizontal;
  }

  if (node.layoutSizingVertical) {
    metadata.layoutSizingVertical = node.layoutSizingVertical;
  }

  if (node.layoutGrow !== undefined) {
    metadata.layoutGrow = node.layoutGrow;
  }

  // Recursively process children (unlimited depth with circular protection)
  if (node.children && node.children.length > 0) {
    metadata.children = node.children.map((child: any) =>
      simplifyNodeMetadata(child, visitedNodes)
    );
  }

  return metadata;
}

/**
 * Find all image nodes recursively
 */
function findImageNodes(node: FigmaNodeMetadata): Array<{ id: string; name: string }> {
  const images: Array<{ id: string; name: string }> = [];

  if (node.isImage && node.id !== 'truncated') {
    images.push({ id: node.id, name: node.name });
  }

  if (node.children) {
    for (const child of node.children) {
      images.push(...findImageNodes(child));
    }
  }

  return images;
}

/**
 * Find all component instances
 */
function findComponentInstances(node: FigmaNodeMetadata): Array<{ id: string; name: string }> {
  const components: Array<{ id: string; name: string }> = [];

  if (node.isComponent && node.id !== 'truncated') {
    components.push({ id: node.id, name: node.name });
  }

  if (node.children) {
    for (const child of node.children) {
      components.push(...findComponentInstances(child));
    }
  }

  return components;
}

/**
 * Format metadata as readable text for LLM
 */
function formatMetadataForLLM(metadata: FigmaNodeMetadata): string {
  const images = findImageNodes(metadata);
  const components = findComponentInstances(metadata);

  let output = `# Figma Structure Analysis\n\n`;
  output += `## Root Node: ${metadata.name}\n`;
  output += `- **Type**: ${metadata.type}\n`;
  if (metadata.width) {
    output += `- **Size**: ${metadata.width}x${metadata.height}px\n`;
  }

  // Add root layout properties if present
  if (metadata.flexDirection || metadata.itemSpacing !== undefined || metadata.paddingTop !== undefined) {
    output += `- **Layout**:\n`;
    if (metadata.flexDirection) {
      output += `  - Direction: ${metadata.flexDirection} (${metadata.layoutMode})\n`;
    }
    if (metadata.itemSpacing !== undefined) {
      output += `  - Gap: ${metadata.itemSpacing}px\n`;
    }
    if (metadata.paddingTop !== undefined || metadata.paddingLeft !== undefined) {
      const pt = metadata.paddingTop ?? 0;
      const pr = metadata.paddingRight ?? 0;
      const pb = metadata.paddingBottom ?? 0;
      const pl = metadata.paddingLeft ?? 0;
      output += `  - Padding: ${pt}/${pr}/${pb}/${pl}\n`;
    }
    if (metadata.primaryAxisAlignItems) {
      output += `  - Justify: ${metadata.primaryAxisAlignItems}\n`;
    }
    if (metadata.counterAxisAlignItems) {
      output += `  - Align: ${metadata.counterAxisAlignItems}\n`;
    }
    if (metadata.layoutSizingHorizontal || metadata.layoutSizingVertical) {
      output += `  - Sizing: ${metadata.layoutSizingHorizontal || 'AUTO'} / ${metadata.layoutSizingVertical || 'AUTO'}\n`;
    }
  }

  output += `\n`;

  // Images discovered
  if (images.length > 0) {
    output += `## 🖼️ Images Found (${images.length})\n\n`;
    images.forEach((img, i) => {
      output += `${i + 1}. **${img.name}** (ID: \`${img.id}\`)\n`;
    });
    output += `\n**→ Use download_figma_images with these IDs to fetch assets**\n\n`;
  }

  // Components discovered
  if (components.length > 0) {
    output += `## 🧩 Component Instances (${components.length})\n\n`;
    const componentCounts = new Map<string, number>();
    components.forEach((comp) => {
      const baseName = comp.name.split('/')[0]; // Remove variant suffix
      componentCounts.set(baseName, (componentCounts.get(baseName) || 0) + 1);
    });

    componentCounts.forEach((count, name) => {
      output += `- **${name}**: ${count} instance${count > 1 ? 's' : ''}\n`;
    });

    output += `\n**→ Consider generating reusable component if instances > 1**\n\n`;
  }

  // Layout properties guide
  output += `## 📐 Layout Properties Guide\n\n`;
  output += `In the hierarchy below, layout properties are shown as:\n`;
  output += `- **flex**: flexDirection (row/column)\n`;
  output += `- **gap**: itemSpacing between children\n`;
  output += `- **p**: padding (top/right/bottom/left)\n`;
  output += `- **justify**: primaryAxisAlignItems (main axis)\n`;
  output += `- **align**: counterAxisAlignItems (cross axis)\n`;
  output += `- **sizing**: layoutSizingHorizontal/Vertical (FIXED/HUG/FILL)\n`;
  output += `- **position**: layoutPositioning (absolute/auto)\n`;
  output += `- **grow**: layoutGrow (flex grow factor)\n\n`;

  // Node hierarchy
  output += `## 📋 Node Hierarchy\n\n`;
  output += formatNodeTree(metadata, 0);

  return output;
}

/**
 * Format node tree recursively with layout properties
 */
function formatNodeTree(node: FigmaNodeMetadata, depth: number): string {
  const indent = '  '.repeat(depth);
  let output = '';

  const icon = node.isImage ? '🖼️' : node.isComponent ? '🧩' : '📦';
  const sizeInfo = node.width ? ` (${node.width}x${node.height})` : '';

  // Build layout info string
  const layoutParts: string[] = [];

  if (node.flexDirection) {
    layoutParts.push(`flex: ${node.flexDirection}`);
  }

  if (node.itemSpacing !== undefined) {
    layoutParts.push(`gap: ${node.itemSpacing}`);
  }

  if (node.paddingTop !== undefined || node.paddingLeft !== undefined) {
    const pt = node.paddingTop ?? 0;
    const pr = node.paddingRight ?? 0;
    const pb = node.paddingBottom ?? 0;
    const pl = node.paddingLeft ?? 0;

    if (pt === pr && pr === pb && pb === pl) {
      layoutParts.push(`p: ${pt}`);
    } else if (pt === pb && pl === pr) {
      layoutParts.push(`p: ${pt}/${pl}`);
    } else {
      layoutParts.push(`p: ${pt}/${pr}/${pb}/${pl}`);
    }
  }

  if (node.primaryAxisAlignItems) {
    layoutParts.push(`justify: ${node.primaryAxisAlignItems}`);
  }

  if (node.counterAxisAlignItems) {
    layoutParts.push(`align: ${node.counterAxisAlignItems}`);
  }

  if (node.flexWrap) {
    layoutParts.push(`wrap: ${node.flexWrap}`);
  }

  if (node.layoutSizingHorizontal || node.layoutSizingVertical) {
    const h = node.layoutSizingHorizontal || 'AUTO';
    const v = node.layoutSizingVertical || 'AUTO';
    layoutParts.push(`sizing: ${h}/${v}`);
  }

  if (node.layoutPositioning === 'ABSOLUTE') {
    layoutParts.push('position: absolute');
  }

  if (node.layoutGrow !== undefined && node.layoutGrow > 0) {
    layoutParts.push(`grow: ${node.layoutGrow}`);
  }

  const layoutInfo = layoutParts.length > 0 ? ` {${layoutParts.join(', ')}}` : '';

  output += `${indent}${icon} ${node.name}${sizeInfo}${layoutInfo} [${node.type}]\n`;

  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      output += formatNodeTree(child, depth + 1);
    }
  }

  return output;
}

/**
 * Main function: Extract Figma metadata
 */
export async function extractFigmaMetadata(
  token: string,
  figmaUrl: string
): Promise<string> {
  const parsed = parseFigmaUrl(figmaUrl);
  if (!parsed) {
    throw new Error('Invalid Figma URL');
  }

  console.error(`Fetching metadata from Figma file ${parsed.fileKey}...`);

  const nodeData = await fetchFigmaFile(token, parsed.fileKey, parsed.nodeId);
  if (!nodeData) {
    throw new Error('Failed to fetch Figma data');
  }

  const metadata = simplifyNodeMetadata(nodeData);
  return formatMetadataForLLM(metadata);
}

/**
 * Get just image node IDs (helper for LLM)
 */
export async function getImageNodeIds(
  token: string,
  figmaUrl: string
): Promise<Array<{ id: string; name: string }>> {
  const parsed = parseFigmaUrl(figmaUrl);
  if (!parsed) {
    throw new Error('Invalid Figma URL');
  }

  const nodeData = await fetchFigmaFile(token, parsed.fileKey, parsed.nodeId);
  if (!nodeData) {
    return [];
  }

  const metadata = simplifyNodeMetadata(nodeData);
  return findImageNodes(metadata);
}
