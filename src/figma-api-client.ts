/**
 * Direct Figma REST API client for complete design data extraction
 * Gets typography, spacing, colors, and layout details that figma-to-rn-toolkit misses
 */

import https from 'https';
import { mapEffectsToRNStyles, formatShadowStylesForLLM } from './effects-mapper.js';
import { rgbaToHex } from './color-utils.js';

export interface FigmaStyleDefinition {
  key: string;
  name: string;
  styleType: 'FILL' | 'TEXT' | 'EFFECT' | 'GRID';
  description?: string;
  remote?: boolean;
}

export interface FigmaNodesResponse {
  nodes: Record<string, { document: FigmaNodeFull }>;
  styles?: Record<string, FigmaStyleDefinition>;
}

interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface TypeStyle {
  fontFamily: string;
  fontPostScriptName?: string;
  fontSize: number;
  fontWeight: number;
  letterSpacing: number;
  lineHeightPx: number;
  lineHeightPercent?: number;
  textAlignHorizontal: string;
  textAlignVertical: string;
}

export interface FigmaNodeFull {
  id: string;
  name: string;
  type: string;
  children?: FigmaNodeFull[];

  // Dimensions
  absoluteBoundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  // Layout (Auto Layout)
  layoutMode?: 'HORIZONTAL' | 'VERTICAL' | 'NONE';
  itemSpacing?: number;
  counterAxisSpacing?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  primaryAxisSizingMode?: 'FIXED' | 'AUTO';
  counterAxisSizingMode?: 'FIXED' | 'AUTO';
  primaryAxisAlignItems?: 'MIN' | 'MAX' | 'CENTER' | 'SPACE_BETWEEN';
  counterAxisAlignItems?: 'MIN' | 'MAX' | 'CENTER' | 'BASELINE';
  layoutWrap?: 'NO_WRAP' | 'WRAP';

  // Styling
  backgroundColor?: FigmaColor;
  fills?: Array<{
    type: string;
    color?: FigmaColor;
    opacity?: number;
    imageRef?: string;
    // Для градиентов / For gradients
    gradientHandlePositions?: Array<{ x: number; y: number }>;
    gradientStops?: Array<{
      position: number;
      color: FigmaColor;
    }>;
  }>;
  strokes?: Array<{
    type: string;
    color?: FigmaColor;
  }>;
  strokeWeight?: number;
  cornerRadius?: number;
  rectangleCornerRadii?: [number, number, number, number];

  // Text
  characters?: string;
  style?: TypeStyle;

  // Effects
  effects?: Array<{
    type: string;
    visible?: boolean;
    color?: FigmaColor;
    offset?: { x: number; y: number };
    radius?: number;
    spread?: number;
  }>;

  // Свойства компонентов (для COMPONENT и INSTANCE узлов)
  componentPropertyDefinitions?: {
    [propertyName: string]: {
      type: 'VARIANT' | 'TEXT' | 'BOOLEAN' | 'INSTANCE_SWAP';
      defaultValue: any;
      variantOptions?: string[];
    };
  };

  // Выбранные значения для экземпляров компонентов
  componentPropertyReferences?: {
    [propertyName: string]: string;
  };

  // ID компонента (для INSTANCE узлов)
  componentId?: string;

  // Dev Mode аннотации
  annotations?: Array<{
    label: string;
    properties?: Array<{
      type: string;
      value: string;
    }>;
  }>;

  // Статус разработки из Dev Mode
  devStatus?: {
    type: string;
    description?: string;
  };
}

/**
 * Fetch complete node data from Figma API
 */
export async function fetchFigmaNodes(
  token: string,
  fileKey: string,
  nodeIds: string[]
): Promise<FigmaNodesResponse> {
  return new Promise((resolve, reject) => {
    const idsParam = nodeIds.join(',');
    const path = `/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(idsParam)}&plugin_data=shared`;

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

          resolve({
            nodes: json.nodes || {},
            styles: json.styles || {}
          });
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

/**
 * Fetch style definitions from Figma API
 * Styles are only available in the full file endpoint, not in nodes endpoint
 */
export async function fetchFigmaStyles(
  token: string,
  fileKey: string
): Promise<Record<string, FigmaStyleDefinition>> {
  return new Promise((resolve, reject) => {
    const path = `/v1/files/${fileKey}`;

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

          resolve(json.styles || {});
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

/**
 * Fetch screenshot URL from Figma Images API
 */
export async function fetchFigmaScreenshot(
  token: string,
  fileKey: string,
  nodeId: string,
  scale: number = 2
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const path = `/v1/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&scale=${scale}&format=png`;

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

          const imageUrl = json.images?.[nodeId];
          resolve(imageUrl || null);
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

/**
 * Extract complete typography details from node
 */
export function extractTypography(node: FigmaNodeFull): string {
  if (!node.style) {
    return 'No typography data available';
  }

  const style = node.style;

  let output = '## Typography\n\n';
  output += `- **Font Family**: ${style.fontFamily}\n`;
  output += `- **Font Size**: ${style.fontSize}px → \`scale(${style.fontSize})\`\n`;
  output += `- **Font Weight**: ${style.fontWeight}\n`;
  output += `- **Letter Spacing**: ${style.letterSpacing}px\n`;
  output += `- **Line Height**: ${style.lineHeightPx}px → \`scale(${style.lineHeightPx})\`\n`;

  if (style.lineHeightPercent) {
    output += `- **Line Height %**: ${style.lineHeightPercent}%\n`;
  }

  output += `- **Text Align**: ${style.textAlignHorizontal}\n`;

  if (node.characters) {
    output += `- **Content**: "${node.characters}"\n`;
  }

  return output;
}

/**
 * Extract complete layout details from node
 */
export function extractLayout(node: FigmaNodeFull): string {
  if (!node.layoutMode || node.layoutMode === 'NONE') {
    return 'No auto-layout data';
  }

  let output = '## Layout (Auto Layout)\n\n';
  output += `- **Direction**: ${node.layoutMode === 'HORIZONTAL' ? 'row' : 'column'}\n`;

  if (node.itemSpacing !== undefined) {
    output += `- **Gap**: ${node.itemSpacing}px → \`scale(${node.itemSpacing})\`\n`;
  }

  output += `\n### Padding\n`;
  output += `- **Top**: ${node.paddingTop || 0}px → \`scale(${node.paddingTop || 0})\`\n`;
  output += `- **Right**: ${node.paddingRight || 0}px → \`scale(${node.paddingRight || 0})\`\n`;
  output += `- **Bottom**: ${node.paddingBottom || 0}px → \`scale(${node.paddingBottom || 0})\`\n`;
  output += `- **Left**: ${node.paddingLeft || 0}px → \`scale(${node.paddingLeft || 0})\`\n`;

  output += `\n### Sizing\n`;
  output += `- **Main Axis**: ${node.primaryAxisSizingMode || 'AUTO'}\n`;
  output += `- **Cross Axis**: ${node.counterAxisSizingMode || 'AUTO'}\n`;

  output += `\n### Alignment\n`;
  output += `- **Main Axis**: ${node.primaryAxisAlignItems || 'MIN'}\n`;
  output += `- **Cross Axis**: ${node.counterAxisAlignItems || 'MIN'}\n`;

  if (node.layoutWrap) {
    output += `- **Wrap**: ${node.layoutWrap}\n`;
    if (node.counterAxisSpacing) {
      output += `- **Wrap Gap**: ${node.counterAxisSpacing}px → \`scale(${node.counterAxisSpacing})\`\n`;
    }
  }

  return output;
}

/**
 * Convert Figma color to various formats
 */
export function formatColor(color: FigmaColor): {
  hex: string;
  rgb: string;
  rgba: string;
} {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  const a = color.a;

  const hex = rgbaToHex(color);
  const rgb = `rgb(${r}, ${g}, ${b})`;
  const rgba = a < 1 ? `rgba(${r}, ${g}, ${b}, ${a})` : rgb;

  return { hex, rgb, rgba };
}

/**
 * Extract all colors from node
 */
export function extractColors(node: FigmaNodeFull): string {
  let output = '## Colors\n\n';
  let hasColors = false;

  // Background color
  if (node.backgroundColor) {
    const color = formatColor(node.backgroundColor);
    output += `- **Background**: ${color.hex} (\`${color.rgb}\`)\n`;
    hasColors = true;
  }

  // Fills
  if (node.fills && node.fills.length > 0) {
    node.fills.forEach((fill, i) => {
      if (fill.type === 'SOLID' && fill.color) {
        const color = formatColor(fill.color);
        output += `- **Fill ${i + 1}**: ${color.hex} (\`${color.rgb}\`)\n`;
        hasColors = true;
      }
    });
  }

  // Strokes/borders
  if (node.strokes && node.strokes.length > 0) {
    node.strokes.forEach((stroke, i) => {
      if (stroke.type === 'SOLID' && stroke.color) {
        const color = formatColor(stroke.color);
        output += `- **Border**: ${color.hex} (\`${color.rgb}\`)\n`;
        hasColors = true;
      }
    });
  }

  if (!hasColors) {
    return '';
  }

  return output;
}

/**
 * Extract border/corner details
 */
export function extractBorders(node: FigmaNodeFull): string {
  let output = '';

  if (node.cornerRadius !== undefined || node.strokeWeight !== undefined) {
    output += '## Borders\n\n';

    if (node.cornerRadius !== undefined) {
      output += `- **Border Radius**: ${node.cornerRadius}px → \`scale(${node.cornerRadius})\`\n`;
    }

    if (node.rectangleCornerRadii) {
      const [tl, tr, br, bl] = node.rectangleCornerRadii;
      output += `- **Corner Radii**: TL:${tl} TR:${tr} BR:${br} BL:${bl}\n`;
    }

    if (node.strokeWeight !== undefined) {
      output += `- **Border Width**: ${node.strokeWeight}px → \`scale(${node.strokeWeight})\`\n`;
    }

    output += '\n';
  }

  return output;
}

/**
 * Извлечение аннотаций из узла для LLM
 */
export function extractAnnotations(node: FigmaNodeFull): string {
  let output = '';

  // Статус разработки
  if (node.devStatus) {
    output += `## Dev Status\n\n`;
    output += `- **Status**: ${node.devStatus.type}\n`;
    if (node.devStatus.description) {
      output += `- **Notes**: ${node.devStatus.description}\n`;
    }
    output += '\n';
  }

  // Аннотации дизайнера
  if (node.annotations && node.annotations.length > 0) {
    output += `## Designer Annotations\n\n`;
    node.annotations.forEach((annotation, i) => {
      output += `### ${i + 1}. ${annotation.label}\n`;
      if (annotation.properties) {
        annotation.properties.forEach((prop) => {
          output += `- **${prop.type}**: ${prop.value}\n`;
        });
      }
      output += '\n';
    });
  }

  return output;
}

/**
 * Create complete design specification from Figma node
 */
export function createDesignSpec(node: FigmaNodeFull): string {
  let spec = `# Design Specification: ${node.name}\n\n`;
  spec += `**Type**: ${node.type}\n`;

  if (node.absoluteBoundingBox) {
    spec += `**Size**: ${Math.round(node.absoluteBoundingBox.width)}x${Math.round(node.absoluteBoundingBox.height)}px\n`;
  }

  spec += `\n`;

  // Layout
  const layout = extractLayout(node);
  if (layout !== 'No auto-layout data') {
    spec += layout + '\n';
  }

  // Colors
  const colors = extractColors(node);
  if (colors) {
    spec += colors + '\n';
  }

  // Borders
  const borders = extractBorders(node);
  if (borders) {
    spec += borders;
  }

  // Typography
  const typography = extractTypography(node);
  if (typography !== 'No typography data available') {
    spec += typography + '\n';
  }

  // Эффекты/Тени
  if (node.effects && node.effects.length > 0) {
    const shadowStyles = mapEffectsToRNStyles(node.effects);
    const shadowOutput = formatShadowStylesForLLM(shadowStyles);
    if (shadowOutput) {
      spec += shadowOutput;
    }
  }

  // Аннотации Dev Mode
  const annotations = extractAnnotations(node);
  if (annotations) {
    spec += annotations;
  }

  return spec;
}
