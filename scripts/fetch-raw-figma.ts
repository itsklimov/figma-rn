import fs from 'fs';
import path from 'path';
import { FigmaClient } from '../src/api/index.js';
import { transformNode } from '../src/api/transformers.js';
import { createDesignSpec } from '../src/figma-api-client.js';

// Load from env or fallback
const FIGMA_TOKEN = process.env.FIGMA_TOKEN || '';
const DEFAULT_URL = 'https://www.figma.com/design/UP4RaLYLk41imjPis2j6an/MARAFET-dev?node-id=2726-74525&m=dev';

async function main() {
  const figmaUrl = process.argv[2] || DEFAULT_URL;

  console.log(`\n🚀 Figma Raw Data Fetcher`);
  console.log(`─────────────────────────`);
  console.log(`URL: ${figmaUrl}`);

  if (!FIGMA_TOKEN) {
    console.error('❌ Error: FIGMA_TOKEN not found in environment');
    process.exit(1);
  }

  const client = new FigmaClient(FIGMA_TOKEN);
  
  try {
    const parsed = client.parseUrl(figmaUrl);
    if (!parsed.nodeId) {
      throw new Error('URL must contain a node-id');
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

    // 1. Save Raw Response
    const rawPath = path.join(debugDir, 'raw-figma-node.json');
    fs.writeFileSync(rawPath, JSON.stringify(result.rawResponse, null, 2));
    console.log(`✅ Saved RAW response to ${rawPath}`);

    // 2. Transformed internal node
    const transformedPath = path.join(debugDir, 'transformed-node.json');
    const transformed = transformNode(rawNodeData.document);
    fs.writeFileSync(transformedPath, JSON.stringify(transformed, null, 2));
    console.log(`✅ Saved TRANSFORMED node to ${transformedPath}`);

    // 3. Design Specification (Markdown)
    const specPath = path.join(debugDir, 'design-spec.md');
    const spec = createDesignSpec(rawNodeData.document as any);
    fs.writeFileSync(specPath, spec);
    console.log(`✅ Saved DESIGN SPEC to ${specPath}`);

    // 4. Count nodes for context
    const nodeCount = (n: any): number => {
      let count = 1;
      if (n.children) n.children.forEach((c: any) => count += nodeCount(c));
      return count;
    };
    console.log(`📊 Stats: ${nodeCount(transformed)} nodes processed`);

  } catch (error) {
    console.error(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main().catch(console.error);
