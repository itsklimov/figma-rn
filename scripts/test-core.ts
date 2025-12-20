/**
 * Test script for the core module
 *
 * Usage:
 *   FIGMA_TOKEN=xxx npx tsx scripts/test-core.ts "https://figma.com/design/xxx?node-id=xxx"
 */

import { FigmaClient } from '../src/api/index.js';
import { transformNode } from '../src/api/transformers.js';
import { transformToScreenIR } from '../src/core/index.js';

async function main() {
  const token = process.env.FIGMA_TOKEN;
  const url = process.argv[2];

  if (!token) {
    console.error('Error: FIGMA_TOKEN environment variable required');
    process.exit(1);
  }

  if (!url) {
    console.error('Usage: FIGMA_TOKEN=xxx npx tsx scripts/test-core.ts "<figma-url>"');
    process.exit(1);
  }

  console.log('🔄 Fetching from Figma...');

  const client = new FigmaClient(token);
  const { fileKey, nodeId } = client.parseUrl(url);

  console.log(`   File: ${fileKey}`);
  console.log(`   Node: ${nodeId}`);

  const result = await client.fetchNodes(fileKey, [nodeId!]);
  const rawNode = result.nodes[nodeId!];

  if (!rawNode) {
    console.error('Error: Node not found');
    process.exit(1);
  }

  console.log(`\n✅ Fetched: "${rawNode.name}"`);

  // Transform raw Figma data to FigmaNode
  console.log('\n🔄 Transforming raw data to FigmaNode...');
  const figmaNode = transformNode(rawNode.document);

  // Transform to ScreenIR
  console.log('🔄 Transforming to ScreenIR...');

  const screenIR = transformToScreenIR(figmaNode, {
    ignorePatterns: ['*annotation*', '*measure*', '*redline*'],
  });

  // Print summary
  console.log('\n📊 Results:\n');

  console.log(`Screen: ${screenIR.name}`);
  console.log(`Root type: ${screenIR.root.semanticType}`);

  // Count elements by type
  const counts: Record<string, number> = {};
  function countNodes(node: any) {
    counts[node.semanticType] = (counts[node.semanticType] || 0) + 1;
    if (node.children) {
      node.children.forEach(countNodes);
    }
  }
  countNodes(screenIR.root);

  console.log('\nElement counts:');
  for (const [type, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }

  // Collect all layout data (gaps, padding)
  const gaps = new Set<number>();
  const paddings = new Set<string>();
  const gradients: any[] = [];
  const borders: any[] = [];

  function collectLayoutData(node: any) {
    if (node.layout) {
      if (node.layout.gap > 0) gaps.add(node.layout.gap);
      const p = node.layout.padding;
      if (p && (p.top || p.right || p.bottom || p.left)) {
        paddings.add(`${p.top}/${p.right}/${p.bottom}/${p.left}`);
      }
    }
    if (node.children) node.children.forEach(collectLayoutData);
  }
  collectLayoutData(screenIR.root);

  // Collect gradients and borders from styles
  for (const style of Object.values(screenIR.stylesBundle.styles)) {
    if (style.backgroundGradient) {
      gradients.push(style.backgroundGradient);
    }
    if (style.borderWidth && style.borderColor) {
      borders.push({ width: style.borderWidth, color: style.borderColor });
    }
  }

  // Tokens summary
  const tokens = screenIR.stylesBundle.tokens;
  console.log('\n═══════════════════════════════════════');
  console.log('DESIGN TOKENS');
  console.log('═══════════════════════════════════════');

  console.log(`\n🎨 Colors (${Object.keys(tokens.colors).length}):`);
  for (const [name, value] of Object.entries(tokens.colors)) {
    console.log(`   ${value}`);
  }

  console.log(`\n🔤 Typography (${Object.keys(tokens.typography).length}):`);
  for (const [name, value] of Object.entries(tokens.typography)) {
    console.log(`   ${value.fontFamily} ${value.fontSize}px w${value.fontWeight} lh:${Math.round(value.lineHeight)}px`);
  }

  console.log(`\n📐 Border Radii (${Object.keys(tokens.radii).length}):`);
  console.log(`   ${Object.values(tokens.radii).map(v => Math.round(v as number) + 'px').join(', ')}`);

  console.log(`\n🌗 Shadows (${Object.keys(tokens.shadows).length}):`);
  if (Object.keys(tokens.shadows).length === 0) {
    console.log('   (none)');
  }
  for (const [name, value] of Object.entries(tokens.shadows)) {
    console.log(`   x:${value.offsetX} y:${value.offsetY} blur:${value.blur} spread:${value.spread} ${value.color}`);
  }

  console.log(`\n📏 Gaps (${gaps.size}):`);
  console.log(`   ${Array.from(gaps).sort((a, b) => a - b).map(g => g + 'px').join(', ') || '(none)'}`);

  console.log(`\n📦 Padding patterns (${paddings.size}):`);
  for (const p of Array.from(paddings).slice(0, 10)) {
    console.log(`   ${p} (top/right/bottom/left)`);
  }
  if (paddings.size > 10) console.log(`   ... +${paddings.size - 10} more`);

  console.log(`\n🌈 Gradients (${gradients.length}):`);
  if (gradients.length === 0) {
    console.log('   (none)');
  }
  for (const g of gradients.slice(0, 5)) {
    console.log(`   ${g.type}: ${g.colors.join(' → ')}`);
  }

  console.log(`\n🔲 Borders (${borders.length}):`);
  if (borders.length === 0) {
    console.log('   (none)');
  }
  for (const b of borders.slice(0, 5)) {
    console.log(`   ${b.width}px ${b.color}`);
  }

  // Print tree structure (first 3 levels)
  console.log('\nTree structure (3 levels):');
  function printTree(node: any, indent = 0, maxDepth = 3) {
    if (indent >= maxDepth * 2) return;

    const prefix = '  '.repeat(indent);
    let info = `${node.semanticType}`;
    if (node.text) info += ` "${node.text.slice(0, 30)}${node.text.length > 30 ? '...' : ''}"`;
    if (node.label) info += ` label="${node.label}"`;
    console.log(`${prefix}└─ ${info}`);

    if (node.children && indent < (maxDepth - 1) * 2) {
      node.children.slice(0, 5).forEach((child: any) => printTree(child, indent + 1, maxDepth));
      if (node.children.length > 5) {
        console.log(`${'  '.repeat(indent + 1)}└─ ... +${node.children.length - 5} more`);
      }
    }
  }
  printTree(screenIR.root);

  // Optionally dump full JSON
  if (process.argv.includes('--json')) {
    console.log('\n📄 Full ScreenIR JSON:');
    console.log(JSON.stringify(screenIR, null, 2));
  }

  console.log('\n✅ Done!');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
