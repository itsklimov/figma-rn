import { FigmaClient } from '../src/api/index.js';

async function main() {
  const token = process.env.FIGMA_TOKEN;
  const figmaUrl = process.argv[2] || process.env.FIGMA_TEST_URL;
  if (!token || !figmaUrl) {
    console.error(
      'Usage: FIGMA_TOKEN=... npx tsx scripts/debug-api.ts "<figma-url-with-node-id>"\n' +
        'Or set FIGMA_TEST_URL in environment'
    );
    process.exit(1);
  }

  const client = new FigmaClient(token);
  const result = await client.fetchNodeByUrl(figmaUrl);
  const nodeId = Object.keys(result.nodes)[0];
  const node = result.nodes[nodeId];
  if (!node?.document) {
    console.error('Could not resolve document for URL:', figmaUrl);
    process.exit(1);
  }

  console.log('Keys:', Object.keys(node));
  console.log('Document type:', typeof node.document);

  const doc = node.document as any;
  console.log('\nDocument sample:');
  console.log('  type:', doc.type);
  console.log('  name:', doc.name);
  console.log('  fills:', doc.fills?.length);
  console.log('  children:', doc.children?.length);

  // Find a text node
  function findText(n: any, depth = 0): any {
    if (n.type === 'TEXT') return n;
    if (depth > 5) return null;
    for (const c of n.children || []) {
      const found = findText(c, depth + 1);
      if (found) return found;
    }
    return null;
  }

  const textNode = findText(doc);
  if (textNode) {
    console.log('\nFound TEXT node:');
    console.log('  name:', textNode.name);
    console.log('  characters:', textNode.characters?.slice(0, 50));
    console.log('  style:', JSON.stringify(textNode.style, null, 2)?.slice(0, 200));
    console.log('  fills:', JSON.stringify(textNode.fills, null, 2)?.slice(0, 200));
  } else {
    console.log('\nNo TEXT node found in first 5 levels');
  }
}

main().catch(console.error);
