/**
 * Figma Raw Data Fetcher
 *
 * Fetches raw Figma node data and runs it through pipeline stages for debugging.
 * Automatically loads FIGMA_TOKEN from .env file if present.
 *
 * Usage:
 *   npx tsx scripts/fetch-raw-figma.ts [figma-url]
 *
 * Output:
 *   debug/1-raw-figma-api.json    - Raw API response
 *   debug/2-transformed-node.json - After transformNode()
 *   debug/3-normalized.json       - After normalize stage
 *   debug/4-with-layout.json      - After addLayout stage
 *   debug/5-screen-ir.json        - Final ScreenIR
 */

import fs from 'fs';
import path from 'path';
import { FigmaClient } from '../src/api/index.js';
import { transformNode } from '../src/api/transformers.js';
import { transformToScreenIR, stages } from '../src/core/pipeline.js';

// Load .env file if it exists (no external dependency needed)
function loadEnv(): void {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const match = trimmed.match(/^([^=]+)=\s*["']?([^"']*)["']?$/);
      if (match) {
        const [, key, value] = match;
        if (!process.env[key.trim()]) {
          process.env[key.trim()] = value.trim();
        }
      }
    }
  }
}

// Load env before anything else
loadEnv();

const FIGMA_TOKEN = process.env.FIGMA_TOKEN || '';

async function main() {
  const figmaUrl = process.argv[2];

  console.log(`\n🚀 Figma Raw Data Fetcher`);
  console.log(`─────────────────────────`);

  if (!figmaUrl) {
    console.error('❌ Usage: npx tsx scripts/fetch-raw-figma.ts <figma-url>');
    console.error('   Example: npx tsx scripts/fetch-raw-figma.ts "https://www.figma.com/design/FILE_ID?node-id=123-456"');
    process.exit(1);
  }

  console.log(`URL: ${figmaUrl}`);

  if (!FIGMA_TOKEN) {
    console.error('❌ Error: FIGMA_TOKEN not found');
    console.error('   Set it in .env file or environment variable');
    process.exit(1);
  }

  const client = new FigmaClient(FIGMA_TOKEN);

  try {
    const parsed = client.parseUrl(figmaUrl);
    if (!parsed.nodeId) {
      throw new Error('URL must contain a node-id parameter');
    }

    console.log(`📥 Fetching node ${parsed.nodeId} from file ${parsed.fileKey}...`);
    const result = await client.fetchNodes(parsed.fileKey, [parsed.nodeId]);

    const rawNodeData = result.nodes[parsed.nodeId];
    if (!rawNodeData || !rawNodeData.document) {
      throw new Error(`Node ${parsed.nodeId} not found in response`);
    }

    // Ensure debug directory exists
    const debugDir = path.join(process.cwd(), 'debug');
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
    }

    // 1. Save Raw API Response
    const rawPath = path.join(debugDir, '1-raw-figma-api.json');
    fs.writeFileSync(rawPath, JSON.stringify(rawNodeData.document, null, 2));
    console.log(`✅ Saved RAW API response to ${rawPath}`);

    // 2. Transform to internal FigmaNode format
    const transformed = transformNode(rawNodeData.document);
    const transformedPath = path.join(debugDir, '2-transformed-node.json');
    fs.writeFileSync(transformedPath, JSON.stringify(transformed, null, 2));
    console.log(`✅ Saved TRANSFORMED node to ${transformedPath}`);

    // 3. Run through pipeline stages
    console.log(`\n📊 Pipeline Stages:`);

    // Stage 1: Normalize
    const normalized = stages.normalize(transformed);
    if (normalized) {
      const normalizedPath = path.join(debugDir, '3-normalized.json');
      fs.writeFileSync(normalizedPath, JSON.stringify(normalized, null, 2));
      console.log(`   ✅ Stage 1 (normalize): ${normalizedPath}`);

      // Stage 2: Add Layout
      const withLayout = stages.addLayout(normalized);
      const layoutPath = path.join(debugDir, '4-with-layout.json');
      fs.writeFileSync(layoutPath, JSON.stringify(withLayout, null, 2));
      console.log(`   ✅ Stage 2 (addLayout): ${layoutPath}`);

      // Stage 3: Full ScreenIR
      const screenIR = transformToScreenIR(transformed);
      const irPath = path.join(debugDir, '5-screen-ir.json');
      fs.writeFileSync(irPath, JSON.stringify(screenIR, null, 2));
      console.log(`   ✅ Stage 3 (screenIR): ${irPath}`);

      // Print summary
      const nodeCount = (n: any): number => {
        let count = 1;
        if (n.children) n.children.forEach((c: any) => count += nodeCount(c));
        return count;
      };

      console.log(`\n📈 Summary:`);
      console.log(`   Raw nodes: ${nodeCount(rawNodeData.document)}`);
      console.log(`   After transform: ${nodeCount(transformed)}`);
      console.log(`   After normalize: ${nodeCount(normalized)}`);
      console.log(`   IR nodes: ${nodeCount(screenIR.root)}`);
      console.log(`   Styles extracted: ${Object.keys(screenIR.stylesBundle.styles).length}`);
    } else {
      console.log(`   ⚠️ Root node was filtered out during normalization`);
    }

    console.log(`\n✅ Done! Check the debug/ folder for output files.`);

  } catch (error) {
    console.error(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main().catch(console.error);
