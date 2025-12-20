import { FigmaClient } from '../src/api/client.js';
import { transformNode } from '../src/api/transformers.js';
import { transformToScreenIR } from '../src/core/pipeline.js';
import { generateComponent } from '../src/core/generation/index.js';
import type { TokenMappings } from '../src/core/mapping/token-matcher.js';

const FIGMA_URL = 'https://www.figma.com/design/UP4RaLYLk41imjPis2j6an/MARAFET-dev?node-id=2726-74525&m=dev';

async function main() {
  const token = process.env.FIGMA_TOKEN;
  if (!token) {
    console.error('Error: FIGMA_TOKEN required');
    process.exit(1);
  }

  console.log('Fetching Figma node...');
  const client = new FigmaClient(token);
  const result = await client.fetchNodeByUrl(FIGMA_URL);
  const nodeId = Object.keys(result.nodes)[0];
  const rawNode = result.nodes[nodeId];

  if (!rawNode?.document) {
    console.error('Error: Could not fetch node');
    process.exit(1);
  }

  console.log('Fetched:', rawNode.name, '(' + rawNode.type + ')');

  const figmaNode = transformNode(rawNode.document);
  console.log('Running pipeline...');
  const screenIR = transformToScreenIR(figmaNode);
  console.log('ScreenIR - Root:', screenIR.root.semanticType);
  console.log('ScreenIR - Styles:', Object.keys(screenIR.stylesBundle.styles).length);

  const emptyMappings: TokenMappings = { colors: {}, spacing: {}, radii: {}, typography: {}, shadows: {} };
  const generated = generateComponent(screenIR, emptyMappings);

  console.log('\n=== GENERATED CODE ===\n');
  console.log(generated.code);
  console.log('\n=== UNMAPPED ===');
  console.log('Colors:', generated.unmappedTokens.colors.length);
  console.log('Radii:', generated.unmappedTokens.radii.length);
}

main().catch(console.error);
