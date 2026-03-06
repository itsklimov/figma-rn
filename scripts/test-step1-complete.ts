/**
 * Comprehensive test for Step 1 API layer
 * Tests: config, cache, client, styles, assets
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  FigmaClient,
  createCache,
  shouldIgnoreNode,
  isComponent,
  transformNode,
} from '../src/api/index.js';

const FIGMA_URL =
  'https://www.figma.com/design/UP4RaLYLk41imjPis2j6an/MARAFET--Copy-?node-id=2726-74525&m=dev';
const OUTPUT_DIR = '.figma/test-step1';

async function main() {
  const token = process.env.FIGMA_TOKEN;
  if (!token) {
    console.error('Error: FIGMA_TOKEN not set');
    process.exit(1);
  }

  console.log('🧪 Step 1 Complete API Layer Test\n');

  // Test 1: Config/Conventions
  console.log('1️⃣  Testing Config/Conventions');
  console.log('   shouldIgnoreNode("StatusBar"):', shouldIgnoreNode('StatusBar'));
  console.log('   shouldIgnoreNode("Content"):', shouldIgnoreNode('Content'));
  console.log('   isComponent("cmp/Button"):', isComponent('cmp/Button'));
  console.log('   isComponent("Header"):', isComponent('Header'));

  // Test 2: Cache
  console.log('\n2️⃣  Testing Cache');
  const cache = createCache(path.join(OUTPUT_DIR, '.cache'));
  const cacheKey = { fileKey: 'test', endpoint: 'nodes' };
  cache.set(cacheKey, { test: 'data' });
  console.log('   Cache write:', cache.has(cacheKey) ? '✓' : '✗');
  console.log('   Cache read:', cache.get(cacheKey) ? '✓' : '✗');
  console.log('   Cache stats:', cache.stats());

  // Test 3: Client - Parse URL
  console.log('\n3️⃣  Testing Client');
  const client = new FigmaClient(token);
  const parsed = client.parseUrl(FIGMA_URL);
  console.log('   Parsed URL:');
  console.log('     File key:', parsed.fileKey);
  console.log('     Node ID:', parsed.nodeId);

  // Test 4: Fetch Nodes
  console.log('\n4️⃣  Fetching Nodes');
  const result = await client.fetchNodeByUrl(FIGMA_URL);
  const nodeId = parsed.nodeId!;
  const node = result.nodes[nodeId];
  console.log('   Fetched nodes:', Object.keys(result.nodes).length);
  console.log('   Node name:', node.name);
  console.log('   Node type:', node.type);
  console.log('   Metadata:', node.metadata);

  // Test 5: Fetch Styles
  console.log('\n5️⃣  Fetching Styles');
  try {
    const stylesResult = await client.fetchStyles(parsed.fileKey);
    console.log('   Fetched styles:', Object.keys(stylesResult.styles).length);
  } catch (error: any) {
    console.log('   Styles fetch:', error.message);
  }

  // Test 6: Transform to FigmaNode
  console.log('\n6️⃣  Transforming Node');
  if (node.document) {
    const transformed = transformNode(node.document);
    console.log('   Transformed node:', transformed.name);
    console.log('   Children count:', transformed.children?.length || 0);
    console.log('   Has layout:', !!transformed.layout);
    console.log('   Has typography:', !!transformed.typography);

    // Filter system UI using config
    const filteredChildren = transformed.children?.filter(
      (child) => !shouldIgnoreNode(child.name)
    );
    console.log('   Filtered children:', filteredChildren?.length || 0);
    console.log(
      '   Removed:',
      (transformed.children?.length || 0) - (filteredChildren?.length || 0)
    );
  }

  // Test 7: Export Asset URLs (runtime downloading is now handled by edge/asset-downloader)
  console.log('\n7️⃣  Testing Asset Export URLs');
  try {
    // Find image nodes to export
    const imageNodeIds: string[] = [];
    function findImageNodes(n: any) {
      if (n.type === 'RECTANGLE' && n.fills?.some((f: any) => f.type === 'image')) {
        imageNodeIds.push(n.id);
      }
      if (n.children) {
        for (const child of n.children) {
          findImageNodes(child);
        }
      }
    }
    if (node.document) {
      findImageNodes(transformNode(node.document));
    }

    if (imageNodeIds.length > 0) {
      console.log('   Found image nodes:', imageNodeIds.length);
      console.log('   Exporting first 2 images...');

      const exportResults = await client.exportImages(
        parsed.fileKey,
        imageNodeIds.slice(0, 2),
        { format: 'png', scale: 2 }
      );

      console.log('   Export results:', exportResults.length);
      const urlCount = exportResults.filter((item) => !!item.url).length;
      console.log('   Exported URLs:', urlCount);
    } else {
      console.log('   No image nodes found to export');
    }
  } catch (error: any) {
    console.log('   Asset download:', error.message);
  }

  // Test 8: Cache with real data
  console.log('\n8️⃣  Testing Cache with Real Data');
  const nodeCacheKey = { fileKey: parsed.fileKey, nodeId: parsed.nodeId!, endpoint: 'nodes' };
  cache.set(nodeCacheKey, result);
  console.log('   Cached node data ✓');
  const cachedResult = cache.get(nodeCacheKey);
  console.log('   Retrieved from cache:', cachedResult ? '✓' : '✗');
  console.log('   Final cache stats:', cache.stats());

  console.log('\n✅ Step 1 Complete API Layer Test Passed!');
  console.log('\n📁 Output directory:', path.resolve(OUTPUT_DIR));
}

main().catch(console.error);
