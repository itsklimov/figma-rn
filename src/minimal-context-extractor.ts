/**
 * Extract minimal context from Figma to reduce token usage
 * Returns ~5KB instead of 50-100KB
 */

import https from 'https';
import { rgbaToHex } from './color-utils.js';

interface MinimalNode {
  name: string;
  type: string;
  size?: string;
  layout?: {
    direction?: string;
    gap?: number;
    padding?: string;
    justify?: string;
    align?: string;
  };
  style?: {
    font?: string;
    size?: number;
    weight?: number;
    color?: string;
  };
  fill?: string;
  children?: MinimalNode[];
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

interface FigmaApiNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaApiNode[];
  absoluteBoundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  layoutMode?: 'HORIZONTAL' | 'VERTICAL' | 'NONE';
  itemSpacing?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  style?: {
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
  };
  fills?: Array<{
    type: string;
    color?: { r: number; g: number; b: number; a: number };
  }>;
}

/**
 * Fetch node data from Figma API
 */
async function fetchFigmaNode(token: string, fileKey: string, nodeId: string): Promise<FigmaApiNode> {
  return new Promise((resolve, reject) => {
    const path = `/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`;

    const options = {
      hostname: 'api.figma.com',
      path,
      headers: { 'X-Figma-Token': token },
    };

    https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.err) reject(new Error(json.err));
          resolve(json.nodes?.[nodeId]?.document);
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

/**
 * Simplify padding to minimal format
 */
function simplifyPadding(top?: number, right?: number, bottom?: number, left?: number): string | undefined {
  if (top === undefined && right === undefined && bottom === undefined && left === undefined) {
    return undefined;
  }

  const t = top || 0;
  const r = right || 0;
  const b = bottom || 0;
  const l = left || 0;

  if (t === r && r === b && b === l) {
    return t === 0 ? undefined : `${t}`;
  }
  if (t === b && l === r) {
    return `${t}/${l}`;
  }
  return `${t}/${r}/${b}/${l}`;
}

/**
 * Extract minimal data from node
 */
function extractMinimalNode(node: FigmaApiNode, visited: Set<string> = new Set()): MinimalNode | null {
  if (!node || visited.has(node.id)) return null;
  visited.add(node.id);

  const minimal: MinimalNode = {
    name: node.name,
    type: node.type,
  };

  // Dimensions only for root node
  if (node.absoluteBoundingBox && visited.size === 1) {
    minimal.size = `${Math.round(node.absoluteBoundingBox.width)}x${Math.round(node.absoluteBoundingBox.height)}`;
  }

  // Layout properties
  if (node.layoutMode && node.layoutMode !== 'NONE') {
    minimal.layout = {
      direction: node.layoutMode === 'HORIZONTAL' ? 'row' : 'column',
    };

    if (node.itemSpacing) {
      minimal.layout.gap = node.itemSpacing;
    }

    const padding = simplifyPadding(node.paddingTop, node.paddingRight, node.paddingBottom, node.paddingLeft);
    if (padding) {
      minimal.layout.padding = padding;
    }

    if (node.primaryAxisAlignItems && node.primaryAxisAlignItems !== 'MIN') {
      minimal.layout.justify = node.primaryAxisAlignItems.toLowerCase();
    }

    if (node.counterAxisAlignItems && node.counterAxisAlignItems !== 'MIN') {
      minimal.layout.align = node.counterAxisAlignItems.toLowerCase();
    }
  }

  // Typography for text nodes
  if (node.type === 'TEXT' && node.style) {
    minimal.style = {
      font: node.style.fontFamily,
      size: node.style.fontSize,
      weight: node.style.fontWeight,
    };

    // Text color from fills
    if (node.fills?.[0]?.color) {
      minimal.style.color = rgbaToHex(node.fills[0].color);
    }
  }

  // Fill color for non-text nodes
  if (node.type !== 'TEXT' && node.fills?.[0]?.type === 'SOLID' && node.fills[0].color) {
    minimal.fill = rgbaToHex(node.fills[0].color);
  }

  // Recursive processing of children
  if (node.children && node.children.length > 0) {
    const children = node.children
      .map((child) => extractMinimalNode(child, visited))
      .filter((c: MinimalNode | null): c is MinimalNode => c !== null);

    if (children.length > 0) {
      minimal.children = children;
    }
  }

  return minimal;
}

/**
 * Format as YAML
 */
function formatAsYAML(node: MinimalNode, indent: number = 0): string {
  const pad = '  '.repeat(indent);
  let yaml = '';

  yaml += `${pad}- name: ${node.name}\n`;
  yaml += `${pad}  type: ${node.type}\n`;

  if (node.size) {
    yaml += `${pad}  size: ${node.size}\n`;
  }

  if (node.layout) {
    yaml += `${pad}  layout:\n`;
    if (node.layout.direction) yaml += `${pad}    direction: ${node.layout.direction}\n`;
    if (node.layout.gap) yaml += `${pad}    gap: ${node.layout.gap}\n`;
    if (node.layout.padding) yaml += `${pad}    padding: ${node.layout.padding}\n`;
    if (node.layout.justify) yaml += `${pad}    justify: ${node.layout.justify}\n`;
    if (node.layout.align) yaml += `${pad}    align: ${node.layout.align}\n`;
  }

  if (node.style) {
    yaml += `${pad}  style:\n`;
    if (node.style.font) yaml += `${pad}    font: ${node.style.font}\n`;
    if (node.style.size) yaml += `${pad}    size: ${node.style.size}\n`;
    if (node.style.weight) yaml += `${pad}    weight: ${node.style.weight}\n`;
    if (node.style.color) yaml += `${pad}    color: "${node.style.color}"\n`;
  }

  if (node.fill) {
    yaml += `${pad}  fill: "${node.fill}"\n`;
  }

  if (node.children && node.children.length > 0) {
    yaml += `${pad}  children:\n`;
    for (const child of node.children) {
      yaml += formatAsYAML(child, indent + 2);
    }
  }

  return yaml;
}

/**
 * Main function: extract minimal context
 */
export async function extractMinimalContext(token: string, figmaUrl: string): Promise<string> {
  const parsed = parseFigmaUrl(figmaUrl);
  if (!parsed) {
    throw new Error('Invalid Figma URL');
  }

  if (!parsed.nodeId) {
    throw new Error('node-id not found in URL');
  }

  console.error(`[MINIMAL] Fetching node ${parsed.nodeId} from file ${parsed.fileKey}...`);

  const nodeData = await fetchFigmaNode(token, parsed.fileKey, parsed.nodeId);
  if (!nodeData) {
    throw new Error('Failed to fetch Figma node data');
  }

  const minimal = extractMinimalNode(nodeData);
  if (!minimal) {
    throw new Error('Failed to extract minimal context');
  }

  return formatAsYAML(minimal);
}
