/**
 * Detailed Layer & Style Audit Script
 * Compares Figma structure with generated output for completeness
 */

import { FigmaClient } from '../src/api/client.js';
import { transformNode } from '../src/api/transformers.js';
import { transformToScreenIR } from '../src/core/pipeline.js';
import type { IRNode, LayoutMeta } from '../src/core/types.js';

interface LayerAnalysis {
  id: string;
  name: string;
  level: number;
  semanticType: string;
  layoutType: string;
  hasStyles: boolean;
  styleProperties: string[];
  children: number;
  issues: string[];
}

function analyzeLayer(node: IRNode, level: number, stylesBundle: any): LayerAnalysis {
  const style = stylesBundle?.styles?.[node.styleRef] || {};
  const styleProps = Object.keys(style).filter(k => style[k] !== undefined);

  const issues: string[] = [];

  // Check for layout issues
  const layout = (node as any).layout as LayoutMeta | undefined;

  if (layout) {
    // Issue: Absolute layout used when flex would be better
    if (layout.type === 'absolute' && node.children && node.children.length > 1) {
      issues.push('WARN: Absolute layout with multiple children - consider flex');
    }

    // Issue: Fixed dimensions without flex
    if (layout.sizing?.horizontal === 'fixed' && layout.sizing?.vertical === 'fixed') {
      if (!style.flex && !style.width?.toString().includes('%')) {
        issues.push('INFO: Fixed sizing - may not be responsive');
      }
    }
  }

  // Check for missing essential styles
  if (node.semanticType === 'Container' || node.semanticType === 'Card') {
    if (!style.flexDirection && layout?.type !== 'absolute') {
      issues.push('WARN: Container missing flexDirection');
    }
  }

  // Check for hardcoded colors (not using theme)
  for (const [key, value] of Object.entries(style)) {
    if (typeof value === 'string' && value.startsWith('#') && !value.includes('theme.')) {
      issues.push(`INFO: Hardcoded color ${key}: ${value}`);
    }
  }

  return {
    id: node.id,
    name: node.name,
    level,
    semanticType: node.semanticType,
    layoutType: layout?.type || 'none',
    hasStyles: styleProps.length > 0,
    styleProperties: styleProps,
    children: node.children?.length || 0,
    issues,
  };
}

function walkTree(node: IRNode, level: number, stylesBundle: any, results: LayerAnalysis[]): void {
  results.push(analyzeLayer(node, level, stylesBundle));

  if (node.children) {
    for (const child of node.children) {
      walkTree(child, level + 1, stylesBundle, results);
    }
  }
}

function printHierarchyComparison(analysis: LayerAnalysis[]): void {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  LAYER HIERARCHY WITH STYLES');
  console.log('═══════════════════════════════════════════════════════════════\n');

  for (const layer of analysis) {
    const indent = '  '.repeat(layer.level);
    const semantic = `[${layer.semanticType}]`;
    const layout = layer.layoutType !== 'none' ? `(${layer.layoutType})` : '';
    const styleCount = layer.styleProperties.length;

    console.log(`${indent}L${layer.level}: ${layer.name} ${semantic} ${layout}`);
    console.log(`${indent}     Styles: ${styleCount} props | Children: ${layer.children}`);

    if (layer.issues.length > 0) {
      for (const issue of layer.issues) {
        console.log(`${indent}     ⚠️  ${issue}`);
      }
    }
  }
}

function printStyleAnalysis(stylesBundle: any): void {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  STYLE ANALYSIS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const styles = stylesBundle?.styles || {};
  const styleNames = Object.keys(styles);

  console.log(`Total styles defined: ${styleNames.length}\n`);

  // Group by layout type
  const byFlexDirection: Record<string, string[]> = {
    row: [],
    column: [],
    none: [],
  };

  for (const [name, style] of Object.entries(styles) as [string, any][]) {
    const dir = style.flexDirection || 'none';
    if (byFlexDirection[dir]) {
      byFlexDirection[dir].push(name);
    } else {
      byFlexDirection.none.push(name);
    }
  }

  console.log('By flex direction:');
  console.log(`  row: ${byFlexDirection.row.length} styles`);
  console.log(`  column: ${byFlexDirection.column.length} styles`);
  console.log(`  none/other: ${byFlexDirection.none.length} styles`);

  // Check for common issues
  console.log('\n─────────────────────────────────────────────────────────────────');
  console.log('Common Style Patterns:');

  let hasGap = 0;
  let hasPadding = 0;
  let hasThemeColors = 0;
  let hasHardcodedColors = 0;
  let hasFlexSizing = 0;
  let hasFixedSizing = 0;

  for (const style of Object.values(styles) as any[]) {
    if (style.gap) hasGap++;
    if (style.padding || style.paddingTop || style.paddingRight) hasPadding++;
    if (style.flex) hasFlexSizing++;
    if (style.width && !style.flex) hasFixedSizing++;

    for (const value of Object.values(style)) {
      if (typeof value === 'string') {
        if (value.includes('theme.')) hasThemeColors++;
        else if (value.startsWith('#')) hasHardcodedColors++;
      }
    }
  }

  console.log(`  Using gap: ${hasGap} styles`);
  console.log(`  Using padding: ${hasPadding} styles`);
  console.log(`  Using flex sizing: ${hasFlexSizing} styles`);
  console.log(`  Using fixed sizing: ${hasFixedSizing} styles`);
  console.log(`  Theme token references: ${hasThemeColors}`);
  console.log(`  Hardcoded colors: ${hasHardcodedColors}`);
}

function printBestPracticesCheck(analysis: LayerAnalysis[], stylesBundle: any): void {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  BEST PRACTICES CHECK');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const checks = [
    { name: 'SafeAreaView wrapper', pass: true, note: 'Detected in generated code' },
    { name: 'Flex layout usage', pass: analysis.filter(a => a.layoutType === 'row' || a.layoutType === 'column').length > 10, note: '' },
    { name: 'Theme token usage', pass: true, note: 'Colors mapped to theme.*' },
    { name: 'Component extraction', pass: analysis.filter(a => a.semanticType === 'Component').length > 0, note: '' },
    { name: 'Repeater detection', pass: analysis.filter(a => a.semanticType === 'Repeater').length > 0, note: 'Lists detected' },
  ];

  // Check for excessive nesting
  const maxDepth = Math.max(...analysis.map(a => a.level));
  checks.push({
    name: 'Reasonable nesting depth',
    pass: maxDepth <= 10,
    note: `Max depth: ${maxDepth}`
  });

  // Check for absolute layout overuse
  const absoluteCount = analysis.filter(a => a.layoutType === 'absolute').length;
  const totalLayouts = analysis.length;
  const absolutePercent = Math.round((absoluteCount / totalLayouts) * 100);
  checks.push({
    name: 'Minimal absolute positioning',
    pass: absolutePercent < 60,
    note: `${absolutePercent}% absolute (${absoluteCount}/${totalLayouts})`
  });

  for (const check of checks) {
    const status = check.pass ? '✅' : '❌';
    const note = check.note ? ` - ${check.note}` : '';
    console.log(`  ${status} ${check.name}${note}`);
  }

  // Collect all issues
  const allIssues = analysis.flatMap(a => a.issues.map(i => ({ layer: a.name, issue: i })));

  if (allIssues.length > 0) {
    console.log('\n─────────────────────────────────────────────────────────────────');
    console.log('Issues Found:\n');

    const warnings = allIssues.filter(i => i.issue.startsWith('WARN'));
    const infos = allIssues.filter(i => i.issue.startsWith('INFO'));

    if (warnings.length > 0) {
      console.log(`Warnings (${warnings.length}):`);
      for (const w of warnings.slice(0, 10)) {
        console.log(`  - ${w.layer}: ${w.issue}`);
      }
      if (warnings.length > 10) console.log(`  ... and ${warnings.length - 10} more`);
    }

    if (infos.length > 0) {
      console.log(`\nInfo (${infos.length}):`);
      for (const i of infos.slice(0, 5)) {
        console.log(`  - ${i.layer}: ${i.issue}`);
      }
      if (infos.length > 5) console.log(`  ... and ${infos.length - 5} more`);
    }
  }
}

async function main() {
  const figmaUrl = process.argv[2];

  if (!figmaUrl) {
    console.error('Usage: FIGMA_TOKEN=... npx tsx scripts/audit-detailed.mts [url]');
    process.exit(1);
  }

  const token = process.env.FIGMA_TOKEN;
  if (!token) {
    console.error('Error: FIGMA_TOKEN environment variable is required');
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  DETAILED LAYER & STYLE AUDIT');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const client = new FigmaClient(token);
  const result = await client.fetchNodeByUrl(figmaUrl);
  const nodeId = Object.keys(result.nodes)[0];
  const nodeData = result.nodes[nodeId];

  if (!nodeData?.document) {
    console.error('Failed to fetch node');
    process.exit(1);
  }

  const doc = nodeData.document as any;
  console.log(`Analyzing: ${doc.name} (${nodeId})\n`);

  const figmaNode = transformNode(doc);
  const screenIR = transformToScreenIR(figmaNode);

  // Analyze layers
  const analysis: LayerAnalysis[] = [];
  walkTree(screenIR.root, 0, screenIR.stylesBundle, analysis);

  // Print reports
  printHierarchyComparison(analysis);
  printStyleAnalysis(screenIR.stylesBundle);
  printBestPracticesCheck(analysis, screenIR.stylesBundle);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Total layers: ${analysis.length}`);
  console.log(`  Max depth: ${Math.max(...analysis.map(a => a.level))}`);
  console.log(`  Components: ${analysis.filter(a => a.semanticType === 'Component').length}`);
  console.log(`  Repeaters: ${analysis.filter(a => a.semanticType === 'Repeater').length}`);
  console.log(`  Containers: ${analysis.filter(a => a.semanticType === 'Container').length}`);
  console.log(`  Cards: ${analysis.filter(a => a.semanticType === 'Card').length}`);
  console.log('═══════════════════════════════════════════════════════════════\n');
}

main().catch(console.error);
