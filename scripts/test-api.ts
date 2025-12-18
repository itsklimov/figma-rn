/**
 * Test script for the new API layer
 * Fetches data from Figma URL and generates output files
 */

import * as fs from 'fs';
import * as path from 'path';
import { FigmaClient, transformNode, transformFile } from '../src/api/index.js';

const FIGMA_URL = 'https://www.figma.com/design/UP4RaLYLk41imjPis2j6an/MARAFET--Copy-?node-id=2726-74525&m=dev';
const OUTPUT_DIR = '.figma/extracted';

async function main() {
  const token = process.env.FIGMA_TOKEN;
  if (!token) {
    console.error('Error: FIGMA_TOKEN environment variable not set');
    process.exit(1);
  }

  console.log('Creating Figma client...');
  const client = new FigmaClient(token);

  // Parse URL
  console.log('\n1. Parsing URL...');
  const parsed = client.parseUrl(FIGMA_URL);
  console.log('   File key:', parsed.fileKey);
  console.log('   Node ID:', parsed.nodeId);

  // Fetch nodes
  console.log('\n2. Fetching nodes from Figma...');
  const result = await client.fetchNodeByUrl(FIGMA_URL);
  console.log('   Fetched', Object.keys(result.nodes).length, 'node(s)');

  // Ensure output directory exists
  const outputPath = path.resolve(process.cwd(), OUTPUT_DIR);
  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath, { recursive: true });
  }

  // Write raw response
  console.log('\n3. Writing output files...');

  const rawResponsePath = path.join(outputPath, 'raw-response.json');
  fs.writeFileSync(rawResponsePath, JSON.stringify(result.rawResponse, null, 2));
  console.log('   ✓ raw-response.json');

  // Transform and write node tree
  const nodeId = parsed.nodeId!;
  const rawNode = result.nodes[nodeId];

  if (rawNode && rawNode.document) {
    const transformedNode = transformNode(rawNode.document);
    const nodeTreePath = path.join(outputPath, 'node-tree.json');
    fs.writeFileSync(nodeTreePath, JSON.stringify(transformedNode, null, 2));
    console.log('   ✓ node-tree.json');

    // Extract design tokens
    const tokens = extractDesignTokens(transformedNode);
    const tokensPath = path.join(outputPath, 'design-tokens.json');
    fs.writeFileSync(tokensPath, JSON.stringify(tokens, null, 2));
    console.log('   ✓ design-tokens.json');

    // Generate hierarchy
    const hierarchy = generateHierarchy(transformedNode);
    const hierarchyPath = path.join(outputPath, 'hierarchy.json');
    fs.writeFileSync(hierarchyPath, JSON.stringify(hierarchy, null, 2));
    console.log('   ✓ hierarchy.json');

    // Generate summary
    const summary = {
      fileKey: parsed.fileKey,
      nodeId: parsed.nodeId,
      nodeName: transformedNode.name,
      nodeType: transformedNode.type,
      dimensions: transformedNode.boundingBox,
      totalNodes: countNodes(transformedNode),
      tokenSummary: {
        colors: tokens.colors.length,
        typography: tokens.typography.length,
        spacing: tokens.spacing.length,
        radii: tokens.radii.length,
        shadows: tokens.shadows.length,
      },
      extractedAt: new Date().toISOString(),
    };
    const summaryPath = path.join(outputPath, 'summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.log('   ✓ summary.json');

    console.log('\n✅ All output files generated successfully!');
    console.log('   Output directory:', outputPath);
    console.log('\n📊 Summary:');
    console.log('   Node:', transformedNode.name, `(${transformedNode.type})`);
    console.log('   Total nodes:', summary.totalNodes);
    console.log('   Colors:', summary.tokenSummary.colors);
    console.log('   Typography:', summary.tokenSummary.typography);
    console.log('   Spacing values:', summary.tokenSummary.spacing);
    console.log('   Radii:', summary.tokenSummary.radii);
    console.log('   Shadows:', summary.tokenSummary.shadows);
  } else {
    console.error('Error: Could not find node document');
    process.exit(1);
  }
}

/**
 * Extract design tokens from node tree
 */
function extractDesignTokens(node: any): {
  colors: { hex: string; usage: number }[];
  typography: { fontFamily: string; fontSize: number; fontWeight: number }[];
  spacing: number[];
  radii: number[];
  shadows: any[];
} {
  const colors = new Map<string, number>();
  const typography = new Map<string, { fontFamily: string; fontSize: number; fontWeight: number }>();
  const spacing = new Set<number>();
  const radii = new Set<number>();
  const shadows: any[] = [];

  function traverse(n: any) {
    // Colors from fills
    if (n.fills) {
      for (const fill of n.fills) {
        if (fill.type === 'solid' && fill.color?.hex) {
          const count = colors.get(fill.color.hex) || 0;
          colors.set(fill.color.hex, count + 1);
        }
      }
    }

    // Typography
    if (n.typography) {
      const key = `${n.typography.fontFamily}-${n.typography.fontSize}-${n.typography.fontWeight}`;
      typography.set(key, {
        fontFamily: n.typography.fontFamily,
        fontSize: n.typography.fontSize,
        fontWeight: n.typography.fontWeight,
      });
    }

    // Spacing from layout
    if (n.layout) {
      if (n.layout.gap) spacing.add(n.layout.gap);
      if (n.layout.padding) {
        spacing.add(n.layout.padding.top);
        spacing.add(n.layout.padding.right);
        spacing.add(n.layout.padding.bottom);
        spacing.add(n.layout.padding.left);
      }
    }

    // Corner radii
    if (n.cornerRadius !== undefined) {
      if (typeof n.cornerRadius === 'number') {
        radii.add(n.cornerRadius);
      } else if (typeof n.cornerRadius === 'object') {
        radii.add(n.cornerRadius.topLeft);
        radii.add(n.cornerRadius.topRight);
        radii.add(n.cornerRadius.bottomRight);
        radii.add(n.cornerRadius.bottomLeft);
      }
    }

    // Effects (shadows)
    if (n.effects) {
      for (const effect of n.effects) {
        if (effect.type === 'drop-shadow' || effect.type === 'inner-shadow') {
          shadows.push(effect);
        }
      }
    }

    // Recurse children
    if (n.children) {
      for (const child of n.children) {
        traverse(child);
      }
    }
  }

  traverse(node);

  return {
    colors: Array.from(colors.entries())
      .map(([hex, usage]) => ({ hex, usage }))
      .sort((a, b) => b.usage - a.usage),
    typography: Array.from(typography.values()),
    spacing: Array.from(spacing).filter(v => v > 0).sort((a, b) => a - b),
    radii: Array.from(radii).filter(v => v > 0).sort((a, b) => a - b),
    shadows: shadows.slice(0, 10), // Limit to first 10 unique shadows
  };
}

/**
 * Generate simplified hierarchy
 */
function generateHierarchy(node: any, depth = 0): any {
  const item: any = {
    id: node.id,
    name: node.name,
    type: node.type,
    depth,
  };

  if (node.children && node.children.length > 0) {
    item.children = node.children.map((child: any) => generateHierarchy(child, depth + 1));
  }

  return item;
}

/**
 * Count total nodes
 */
function countNodes(node: any): number {
  let count = 1;
  if (node.children) {
    for (const child of node.children) {
      count += countNodes(child);
    }
  }
  return count;
}

main().catch(console.error);
