/**
 * Test Generation Script
 *
 * Fetches a Figma node and generates React Native code.
 * Automatically loads FIGMA_TOKEN from .env file.
 *
 * Usage:
 *   npx tsx scripts/test-generation.mts [figma-url]
 */

import fs from 'fs';
import path from 'path';
import { FigmaClient } from '../src/api/client.js';
import { transformNode } from '../src/api/transformers.js';
import { transformToScreenIR } from '../src/core/pipeline.js';
import { generateComponent } from '../src/core/generation/index.js';
import type { TokenMappings } from '../src/core/mapping/token-matcher.js';

// Load .env file if it exists
function loadEnv(): void {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^([^=]+)=\s*["']?([^"']*)["']?$/);
      if (match && !process.env[match[1].trim()]) {
        process.env[match[1].trim()] = match[2].trim();
      }
    }
  }
}

loadEnv();

const DEFAULT_URL = 'https://www.figma.com/design/UP4RaLYLk41imjPis2j6an/MARAFET-dev?node-id=2726-74525&m=dev';

async function main() {
  const figmaUrl = process.argv[2] || DEFAULT_URL;
  const token = process.env.FIGMA_TOKEN;

  if (!token) {
    console.error('Error: FIGMA_TOKEN required (set in .env or environment)');
    process.exit(1);
  }

  console.log('Fetching Figma node from:', figmaUrl);
  const client = new FigmaClient(token);
  const result = await client.fetchNodeByUrl(figmaUrl);
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
