/**
 * Extract simplified Figma design context for LLM analysis
 * Based on GLips Figma-Context-MCP approach
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import https from 'https';

const execAsync = promisify(exec);

interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  backgroundColor?: { r: number; g: number; b: number; a: number };
  fills?: any[];
  strokes?: any[];
  strokeWeight?: number;
  effects?: any[];
  cornerRadius?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  itemSpacing?: number;
  layoutMode?: string;
  primaryAxisSizingMode?: string;
  counterAxisSizingMode?: string;
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  characters?: string;
  style?: any;
}

/**
 * Fetch Figma node data from API
 */
async function fetchFigmaNode(
  token: string,
  fileKey: string,
  nodeId: string
): Promise<FigmaNode | null> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.figma.com',
      path: `/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`,
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

          const nodeData = json.nodes?.[nodeId];
          if (!nodeData) {
            resolve(null);
            return;
          }

          resolve(nodeData.document);
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

/**
 * Parse Figma URL to extract file key and node ID
 */
function parseFigmaUrl(url: string): { fileKey: string; nodeId: string } | null {
  const match = url.match(/figma\.com\/(?:file|design)\/([^/]+).*node-id=([^&]+)/);
  if (!match) return null;

  return {
    fileKey: match[1],
    nodeId: match[2].replace(/-/g, ':'),
  };
}

/**
 * Extract design context from Figma node
 */
export async function extractFigmaContext(
  token: string,
  figmaUrl: string,
  format: 'yaml' | 'json' = 'yaml'
): Promise<string> {
  const parsed = parseFigmaUrl(figmaUrl);
  if (!parsed) {
    throw new Error('Invalid Figma URL');
  }

  const node = await fetchFigmaNode(token, parsed.fileKey, parsed.nodeId);
  if (!node) {
    throw new Error('Node not found');
  }

  const context = simplifyNode(node);

  if (format === 'json') {
    return JSON.stringify(context, null, 2);
  }

  return convertToYaml(context);
}

/**
 * Simplify Figma node to essential layout/styling info
 */
function simplifyNode(node: FigmaNode): any {
  const result: any = {
    name: node.name,
    type: node.type,
  };

  // Dimensions
  if (node.absoluteBoundingBox) {
    result.dimensions = {
      width: Math.round(node.absoluteBoundingBox.width),
      height: Math.round(node.absoluteBoundingBox.height),
    };
  }

  // Layout (Auto Layout)
  if (node.layoutMode) {
    result.layout = {
      direction: node.layoutMode === 'HORIZONTAL' ? 'row' : 'column',
      gap: node.itemSpacing,
      padding: {
        top: node.paddingTop,
        right: node.paddingRight,
        bottom: node.paddingBottom,
        left: node.paddingLeft,
      },
      mainAxis: node.primaryAxisSizingMode,
      crossAxis: node.counterAxisSizingMode,
      alignItems: node.counterAxisAlignItems,
      justifyContent: node.primaryAxisAlignItems,
    };
  }

  // Background color
  if (node.backgroundColor) {
    result.backgroundColor = rgbToHex(node.backgroundColor);
  } else if (node.fills && node.fills.length > 0) {
    const fill = node.fills[0];
    if (fill.type === 'SOLID' && fill.color) {
      result.backgroundColor = rgbToHex(fill.color);
    }
  }

  // Border
  if (node.strokes && node.strokes.length > 0) {
    const stroke = node.strokes[0];
    if (stroke.color) {
      result.border = {
        color: rgbToHex(stroke.color),
        width: node.strokeWeight || 1,
      };
    }
  }

  // Border radius
  if (node.cornerRadius) {
    result.borderRadius = node.cornerRadius;
  }

  // Text content
  if (node.type === 'TEXT' && node.characters) {
    result.text = node.characters;
    if (node.style) {
      result.textStyle = {
        fontSize: node.style.fontSize,
        fontWeight: node.style.fontWeight,
        fontFamily: node.style.fontFamily,
        lineHeight: node.style.lineHeightPx,
        letterSpacing: node.style.letterSpacing,
        textAlign: node.style.textAlignHorizontal,
      };
    }
  }

  // Children (simplified)
  if (node.children && node.children.length > 0) {
    result.children = node.children.map((child) => ({
      name: child.name,
      type: child.type,
      dimensions: child.absoluteBoundingBox
        ? {
            width: Math.round(child.absoluteBoundingBox.width),
            height: Math.round(child.absoluteBoundingBox.height),
          }
        : undefined,
    }));
  }

  return result;
}

/**
 * Convert RGB object to hex color
 */
function rgbToHex(color: { r: number; g: number; b: number; a: number }): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);

  if (color.a < 1) {
    return `rgba(${r}, ${g}, ${b}, ${color.a})`;
  }

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
}

/**
 * Convert object to YAML-like string
 */
function convertToYaml(obj: any, indent = 0): string {
  const spaces = '  '.repeat(indent);
  let yaml = '';

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;

    if (typeof value === 'object' && !Array.isArray(value)) {
      yaml += `${spaces}${key}:\n${convertToYaml(value, indent + 1)}`;
    } else if (Array.isArray(value)) {
      yaml += `${spaces}${key}:\n`;
      value.forEach((item) => {
        if (typeof item === 'object') {
          yaml += `${spaces}  -\n${convertToYaml(item, indent + 2)}`;
        } else {
          yaml += `${spaces}  - ${item}\n`;
        }
      });
    } else {
      yaml += `${spaces}${key}: ${value}\n`;
    }
  }

  return yaml;
}
