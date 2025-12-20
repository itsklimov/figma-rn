/**
 * Full integration test: Figma URL → Pipeline → Mapping Layer
 */
import { FigmaClient } from '../src/api/client.js';
import { transformNode } from '../src/api/transformers.js';
import { transformToScreenIR } from '../src/core/pipeline.js';
import { extractProjectTokens } from '../src/core/mapping/theme-extractor.js';
import { matchTokens } from '../src/core/mapping/token-matcher.js';

// Get token from environment variable
const FIGMA_TOKEN = process.env.FIGMA_TOKEN as string;
if (!FIGMA_TOKEN) {
  console.error('Error: FIGMA_TOKEN environment variable is required');
  console.error('Usage: FIGMA_TOKEN=your_token npx tsx scripts/test-full-pipeline.ts [figma-url] [theme-path]');
  process.exit(1);
}

// Test URL from args or default to example
const TEST_URL = process.argv[2] || 'https://www.figma.com/design/YOUR_FILE_KEY?node-id=0-1';

// Theme path from args or default to test fixture
const THEME_PATH = process.argv[3] || './tests/core/mapping/fixtures/test-theme.json';

async function main() {
  console.log('=== Full Pipeline Integration Test ===\n');
  console.log('URL:', TEST_URL);

  // Step 1: Fetch from Figma
  console.log('\n--- Step 1: Fetching from Figma API ---');
  const client = new FigmaClient(FIGMA_TOKEN);

  let fetchResult;
  try {
    fetchResult = await client.fetchNodeByUrl(TEST_URL);
    const nodeIds = Object.keys(fetchResult.nodes);
    console.log(`✓ Fetched ${nodeIds.length} node(s)`);
  } catch (err: any) {
    console.error('✗ Fetch failed:', err.message);
    process.exit(1);
  }

  // Step 2: Transform to FigmaNode format
  console.log('\n--- Step 2: Transform to FigmaNode ---');
  const nodeId = Object.keys(fetchResult.nodes)[0];
  const rawNode = fetchResult.nodes[nodeId].document;

  const figmaNode = transformNode(rawNode);
  console.log(`✓ Transformed node: ${figmaNode.name} (${figmaNode.type})`);
  console.log(`  Children: ${figmaNode.children?.length || 0}`);

  // Step 3: Run through pipeline
  console.log('\n--- Step 3: Pipeline → ScreenIR ---');
  const screenIR = transformToScreenIR(figmaNode);

  console.log(`✓ ScreenIR created: ${screenIR.name}`);
  console.log(`  Root type: ${screenIR.root.semanticType}`);

  // Count children recursively
  function countNodes(node: any): number {
    let count = 1;
    if ('children' in node && node.children) {
      for (const child of node.children) {
        count += countNodes(child);
      }
    }
    return count;
  }
  console.log(`  Total IR nodes: ${countNodes(screenIR.root)}`);

  // Step 4: Show extracted tokens
  console.log('\n--- Step 4: Extracted Design Tokens ---');
  const tokens = screenIR.stylesBundle.tokens;

  console.log(`\nColors (${Object.keys(tokens.colors).length}):`);
  for (const [key, value] of Object.entries(tokens.colors).slice(0, 5)) {
    console.log(`  ${key}: ${value}`);
  }
  if (Object.keys(tokens.colors).length > 5) {
    console.log(`  ... and ${Object.keys(tokens.colors).length - 5} more`);
  }

  console.log(`\nSpacing (${Object.keys(tokens.spacing).length}):`);
  for (const [key, value] of Object.entries(tokens.spacing).slice(0, 5)) {
    console.log(`  ${key}: ${value}`);
  }
  if (Object.keys(tokens.spacing).length > 5) {
    console.log(`  ... and ${Object.keys(tokens.spacing).length - 5} more`);
  }

  console.log(`\nRadii (${Object.keys(tokens.radii).length}):`);
  for (const [key, value] of Object.entries(tokens.radii)) {
    console.log(`  ${key}: ${value}`);
  }

  // Step 5: Load project theme and match tokens
  console.log('\n--- Step 5: Match Tokens with Project Theme ---');

  const themePath = THEME_PATH;
  let projectTokens;
  try {
    projectTokens = await extractProjectTokens(themePath);
    console.log(`✓ Loaded project theme from: ${themePath}`);
    console.log(`  Colors: ${projectTokens.colors?.size || 0}`);
    console.log(`  Spacing: ${projectTokens.spacing?.size || 0}`);
    console.log(`  Radii: ${projectTokens.radii?.size || 0}`);
  } catch (err) {
    console.log('✗ Could not load project theme, skipping matching');
    return;
  }

  // Match tokens
  const mappings = matchTokens(tokens, projectTokens);

  console.log('\n--- Token Mappings ---');

  console.log('\nColors:');
  let colorMatched = 0;
  for (const [key, value] of Object.entries(mappings.colors)) {
    const original = tokens.colors[key];
    const isMatched = value.startsWith('theme.');
    if (isMatched) colorMatched++;
    console.log(`  ${key}: ${original} → ${value} ${isMatched ? '✓' : ''}`);
  }
  console.log(`  Matched: ${colorMatched}/${Object.keys(mappings.colors).length}`);

  console.log('\nSpacing:');
  let spacingMatched = 0;
  for (const [key, value] of Object.entries(mappings.spacing)) {
    const original = tokens.spacing[key];
    const isMatched = value.startsWith('theme.');
    if (isMatched) spacingMatched++;
    console.log(`  ${key}: ${original} → ${value} ${isMatched ? '✓' : ''}`);
  }
  console.log(`  Matched: ${spacingMatched}/${Object.keys(mappings.spacing).length}`);

  console.log('\nRadii:');
  let radiiMatched = 0;
  for (const [key, value] of Object.entries(mappings.radii)) {
    const original = tokens.radii[key];
    const isMatched = value.startsWith('theme.');
    if (isMatched) radiiMatched++;
    console.log(`  ${key}: ${original} → ${value} ${isMatched ? '✓' : ''}`);
  }
  console.log(`  Matched: ${radiiMatched}/${Object.keys(mappings.radii).length}`);

  console.log('\n=== Integration Test Complete ===');
}

main().catch(console.error);
