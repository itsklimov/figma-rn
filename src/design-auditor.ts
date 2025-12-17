/**
 * Comprehensive design audit tool
 * Combines screenshot, metadata, spacing, typography, colors into one detailed report
 */

import {
  fetchFigmaNodes,
  fetchFigmaScreenshot,
  createDesignSpec,
  formatColor,
} from './figma-api-client.js';

// Marafet theme colors for comparison
const MARAFET_THEME_COLORS: Record<string, string> = {
  '#7A54FF': 'palette.primary',
  '#AB5CE9': 'palette.secondary',
  '#F7F7F7': 'palette.gray.gray10',
  '#DDDDDD': 'palette.gray.gray20',
  '#B4B4B4': 'palette.gray.gray50',
  '#5A5A5B': 'palette.gray.gray70',
  '#FFFFFF': 'palette.white',
  '#17171A': 'palette.text',
};

/**
 * Parse Figma URL
 */
function parseFigmaUrl(url: string): { fileKey: string; nodeId: string } | null {
  const match = url.match(/figma\.com\/(?:file|design)\/([^/?]+)/);
  if (!match) return null;

  const fileKey = match[1];
  const nodeMatch = url.match(/node-id=([^&]+)/);
  const nodeId = nodeMatch ? nodeMatch[1].replace(/-/g, ':') : null;

  if (!nodeId) return null;

  return { fileKey, nodeId };
}

/**
 * Find matching Marafet theme color
 */
function findThemeColor(hex: string): string | null {
  return MARAFET_THEME_COLORS[hex.toUpperCase()] || null;
}

/**
 * Extract all unique colors from node tree
 */
function extractAllColors(node: any, colors: Set<string> = new Set()): Set<string> {
  if (node.backgroundColor) {
    const formatted = formatColor(node.backgroundColor);
    colors.add(formatted.hex);
  }

  if (node.fills) {
    node.fills.forEach((fill: any) => {
      if (fill.type === 'SOLID' && fill.color) {
        const formatted = formatColor(fill.color);
        colors.add(formatted.hex);
      }
    });
  }

  if (node.strokes) {
    node.strokes.forEach((stroke: any) => {
      if (stroke.type === 'SOLID' && stroke.color) {
        const formatted = formatColor(stroke.color);
        colors.add(formatted.hex);
      }
    });
  }

  if (node.children) {
    node.children.forEach((child: any) => extractAllColors(child, colors));
  }

  return colors;
}

/**
 * Comprehensive design audit
 */
export async function auditDesign(
  token: string,
  figmaUrl: string
): Promise<string> {
  const parsed = parseFigmaUrl(figmaUrl);
  if (!parsed) {
    throw new Error('Invalid Figma URL');
  }

  console.error('Fetching complete design data from Figma API...');

  // Fetch node data
  const response = await fetchFigmaNodes(token, parsed.fileKey, [parsed.nodeId]);
  const node = response.nodes[parsed.nodeId]?.document;

  if (!node) {
    throw new Error('Node not found');
  }

  // Fetch screenshot
  console.error('Generating screenshot...');
  const screenshotUrl = await fetchFigmaScreenshot(token, parsed.fileKey, parsed.nodeId, 2);

  // Build comprehensive report
  let report = `# Design Audit: ${node.name}\n\n`;

  // Screenshot
  if (screenshotUrl) {
    report += `## 📸 Screenshot\n\n`;
    report += `![Design Screenshot](${screenshotUrl})\n\n`;
    report += `**Note**: Screenshot URL valid for ~30 days. Download if needed for long-term reference.\n\n`;
  }

  // Design specification
  report += createDesignSpec(node);

  // Color audit
  console.error('Analyzing colors...');
  const allColors = extractAllColors(node);

  if (allColors.size > 0) {
    report += `## 🎨 Color Audit (${allColors.size} colors)\n\n`;
    report += `| Figma Color | Marafet Theme | Status |\n`;
    report += `|-------------|---------------|--------|\n`;

    allColors.forEach((hex) => {
      const themeColor = findThemeColor(hex);
      if (themeColor) {
        report += `| ${hex} | \`${themeColor}\` | ✅ Mapped |\n`;
      } else {
        report += `| ${hex} | _(not mapped)_ | ⚠️ **Add to theme** |\n`;
      }
    });

    report += `\n`;
  }

  // Spacing summary
  const spacingValues = new Set<number>();

  function collectSpacing(n: any) {
    if (n.itemSpacing !== undefined) spacingValues.add(n.itemSpacing);
    if (n.paddingTop !== undefined) spacingValues.add(n.paddingTop);
    if (n.paddingRight !== undefined) spacingValues.add(n.paddingRight);
    if (n.paddingBottom !== undefined) spacingValues.add(n.paddingBottom);
    if (n.paddingLeft !== undefined) spacingValues.add(n.paddingLeft);
    if (n.cornerRadius !== undefined) spacingValues.add(n.cornerRadius);

    if (n.children) {
      n.children.forEach((child: any) => collectSpacing(child));
    }
  }

  collectSpacing(node);

  if (spacingValues.size > 0) {
    const sorted = Array.from(spacingValues).sort((a, b) => a - b);
    report += `## 📐 Spacing Values Used\n\n`;
    report += sorted.map((v) => `- ${v}px → \`scale(${v})\``).join('\n');
    report += `\n\n`;
  }

  // Implementation recommendations
  report += `## 🎯 Implementation Checklist\n\n`;
  report += `- [ ] Use screenshot as visual reference\n`;
  report += `- [ ] Apply all spacing values with scale()\n`;
  report += `- [ ] Map colors to Marafet theme (check color audit)\n`;
  report += `- [ ] Match typography exactly (font size, weight, tracking, line height)\n`;
  report += `- [ ] Verify layout direction and alignment\n`;
  report += `- [ ] Test on both small (iPhone SE) and large (Pro Max) screens\n`;

  return report;
}
