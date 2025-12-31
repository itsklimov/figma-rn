/**
 * Layer Processing Audit Script
 * Traces how Figma layers are processed through each pipeline stage
 */

import { FigmaClient } from '../src/api/client.js';
import { transformNode } from '../src/api/transformers.js';
import { normalizeTree, shouldFilter } from '../src/core/normalize/index.js';
import { addLayoutInfo } from '../src/core/layout/index.js';
import { recognizeSemantics } from '../src/core/recognize/classifier.js';
import type { FigmaNode } from '../src/api/types.js';
import type { NormalizedNode, LayoutNode, IRNode } from '../src/core/types.js';

interface LayerInfo {
  level: number;
  id: string;
  name: string;
  type: string;
  childCount: number;
  filtered?: string;
  semanticType?: string;
  layoutType?: string;
}

function collectLayers(node: any, level = 0, results: LayerInfo[] = []): LayerInfo[] {
  results.push({
    level,
    id: node.id,
    name: node.name,
    type: node.type,
    childCount: node.children?.length || 0,
    semanticType: node.semanticType,
    layoutType: node.layout?.type || node.figmaLayout?.mode,
  });

  if (node.children) {
    for (const child of node.children) {
      collectLayers(child, level + 1, results);
    }
  }

  return results;
}

function countNodesByLevel(layers: LayerInfo[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const layer of layers) {
    counts.set(layer.level, (counts.get(layer.level) || 0) + 1);
  }
  return counts;
}

function countNodesByType(layers: LayerInfo[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const layer of layers) {
    counts.set(layer.type, (counts.get(layer.type) || 0) + 1);
  }
  return counts;
}

function collectFilterReasons(node: FigmaNode, level = 0, results: LayerInfo[] = []): LayerInfo[] {
  const filterReason = shouldFilter(node);

  results.push({
    level,
    id: node.id,
    name: node.name,
    type: node.type,
    childCount: node.children?.length || 0,
    filtered: filterReason || undefined,
  });

  if (node.children) {
    for (const child of node.children) {
      collectFilterReasons(child, level + 1, results);
    }
  }

  return results;
}

async function main() {
  const figmaUrl = process.argv[2];

  if (!figmaUrl) {
    console.error('Usage: FIGMA_TOKEN=... npx tsx scripts/audit-layers.mts [url]');
    process.exit(1);
  }

  const token = process.env.FIGMA_TOKEN;
  if (!token) {
    console.error('Error: FIGMA_TOKEN environment variable is required');
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  LAYER PROCESSING AUDIT');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Stage 0: Fetch raw data
  console.log('▶ STAGE 0: RAW FIGMA DATA');
  console.log('─────────────────────────────────────────────────────────────────');

  const client = new FigmaClient(token);
  const result = await client.fetchNodeByUrl(figmaUrl);
  const nodeId = Object.keys(result.nodes)[0];
  const nodeData = result.nodes[nodeId];

  if (!nodeData?.document) {
    console.error('Failed to fetch node');
    process.exit(1);
  }

  const rawDoc = nodeData.document as any;
  console.log(`Root: ${rawDoc.name} (${rawDoc.type})`);

  // Check what would be filtered
  const filterReasons = collectFilterReasons(rawDoc);
  const filteredNodes = filterReasons.filter(l => l.filtered);

  console.log(`\nTotal raw nodes: ${filterReasons.length}`);
  console.log(`Nodes to be filtered: ${filteredNodes.length}`);

  if (filteredNodes.length > 0) {
    console.log('\nFiltered nodes (OS components & annotations):');
    for (const node of filteredNodes) {
      const indent = '  '.repeat(node.level);
      console.log(`  ${indent}[${node.level}] ${node.name} (${node.type}) → ${node.filtered}`);
    }
  }

  // Stage 1: Transform
  console.log('\n▶ STAGE 1: TRANSFORM (Raw → FigmaNode)');
  console.log('─────────────────────────────────────────────────────────────────');

  const figmaNode = transformNode(rawDoc);
  const transformedLayers = collectLayers(figmaNode);
  const transformedByLevel = countNodesByLevel(transformedLayers);
  const transformedByType = countNodesByType(transformedLayers);

  console.log(`Total nodes: ${transformedLayers.length}`);
  console.log('\nBy level:');
  for (const [level, count] of [...transformedByLevel.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  Level ${level}: ${count} nodes`);
  }
  console.log('\nBy type:');
  for (const [type, count] of [...transformedByType.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }

  // Stage 2: Normalize (filter + unwrap)
  console.log('\n▶ STAGE 2: NORMALIZE (Filter OS components, unwrap groups)');
  console.log('─────────────────────────────────────────────────────────────────');

  const normalizedNode = normalizeTree(figmaNode);
  if (!normalizedNode) {
    console.error('Root node was filtered!');
    process.exit(1);
  }

  const normalizedLayers = collectLayers(normalizedNode);
  const normalizedByLevel = countNodesByLevel(normalizedLayers);
  const normalizedByType = countNodesByType(normalizedLayers);

  console.log(`Total nodes: ${normalizedLayers.length} (was ${transformedLayers.length}, removed ${transformedLayers.length - normalizedLayers.length})`);
  console.log('\nBy level:');
  for (const [level, count] of [...normalizedByLevel.entries()].sort((a, b) => a[0] - b[0])) {
    const prev = transformedByLevel.get(level) || 0;
    const diff = prev - count;
    const diffStr = diff > 0 ? ` (-${diff})` : '';
    console.log(`  Level ${level}: ${count} nodes${diffStr}`);
  }
  console.log('\nBy type:');
  for (const [type, count] of [...normalizedByType.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }

  // Stage 3: Add Layout
  console.log('\n▶ STAGE 3: LAYOUT (Detect rows, columns, stacks)');
  console.log('─────────────────────────────────────────────────────────────────');

  const layoutNode = addLayoutInfo(normalizedNode);
  const layoutLayers = collectLayers(layoutNode);

  const layoutTypes = new Map<string, number>();
  for (const layer of layoutLayers) {
    const lt = layer.layoutType || 'none';
    layoutTypes.set(lt, (layoutTypes.get(lt) || 0) + 1);
  }

  console.log('Layout types detected:');
  for (const [type, count] of [...layoutTypes.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }

  // Stage 4: Recognize semantics
  console.log('\n▶ STAGE 4: RECOGNIZE (Semantic classification)');
  console.log('─────────────────────────────────────────────────────────────────');

  const irNode = recognizeSemantics(layoutNode);
  const irLayers = collectLayers(irNode);

  const semanticTypes = new Map<string, number>();
  for (const layer of irLayers) {
    const st = layer.semanticType || 'Unknown';
    semanticTypes.set(st, (semanticTypes.get(st) || 0) + 1);
  }

  console.log(`Total nodes: ${irLayers.length}`);
  console.log('\nSemantic types:');
  for (const [type, count] of [...semanticTypes.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }

  // Final layer tree (first 3 levels)
  console.log('\n▶ FINAL LAYER TREE (First 3 levels)');
  console.log('─────────────────────────────────────────────────────────────────');

  for (const layer of irLayers) {
    if (layer.level <= 3) {
      const indent = '  '.repeat(layer.level);
      const semantic = layer.semanticType ? `[${layer.semanticType}]` : '';
      console.log(`${indent}L${layer.level}: ${layer.name} ${semantic}`);
    }
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  AUDIT SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Raw nodes:        ${filterReasons.length}`);
  console.log(`  Filtered (OS):    ${filteredNodes.length}`);
  console.log(`  After normalize:  ${normalizedLayers.length}`);
  console.log(`  After recognize:  ${irLayers.length}`);
  console.log(`  Max depth:        ${Math.max(...irLayers.map(l => l.level))}`);
  console.log('═══════════════════════════════════════════════════════════════\n');
}

main().catch(console.error);
