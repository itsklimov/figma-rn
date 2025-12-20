
import { FigmaClient } from './src/api/client.js';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load env directly
const envPath = join(process.cwd(), '.env');
const envContent = readFileSync(envPath, 'utf8');
const tokenMatch = envContent.match(/FIGMA_TOKEN\s*=\s*["']?([^"'\n]+)["']?/);
const token = tokenMatch ? tokenMatch[1] : process.env.FIGMA_TOKEN;

if (!token) {
  console.error('No token found in .env');
  process.exit(1);
}

const FILE_KEY = 'UP4RaLYLk41imjPis2j6an';
const NODE_IDS = ['2256:25238'];

async function main() {
  console.log(`Connecting to Figma with token length: ${token.length}`);
  
  const client = new FigmaClient(token);
  
  for (const nodeId of NODE_IDS) {
    console.log(`\n--- Fetching File: ${FILE_KEY}, Node: ${nodeId} ---`);
    try {
      const result = await client.fetchNodes(FILE_KEY, [nodeId]);
      const node = result.nodes[nodeId];
      
      if (!node) {
          console.error('Node not found!');
          continue;
      }
      
      console.log('\n=== RAW DATA ===');
      console.log(`Root Name: "${node.name}" (${node.type})`);
      
      function printChildren(n: any, depth = 0) {
          if (!n.children) return;
          
          for (const child of n.children) {
              const indent = '  '.repeat(depth);
              // Focus on INSTANCE and COMPONENT
              if (child.type === 'INSTANCE' || child.type === 'COMPONENT') {
                   console.log(`${indent}🧩 [${child.type}] Name: "${child.name}"`);
                   console.log(`${indent}   ID: ${child.id}`);
                   if (child.layoutMode) console.log(`${indent}   LayoutMode: ${child.layoutMode}`);
                   if (child.primaryAxisSizingMode) console.log(`${indent}   PrimaryAxisSizing: ${child.primaryAxisSizingMode}`);
                   if (child.counterAxisSizingMode) console.log(`${indent}   CounterAxisSizing: ${child.counterAxisSizingMode}`);
                   if (child.layoutGrow) console.log(`${indent}   LayoutGrow: ${child.layoutGrow}`);
                   if (child.layoutAlign) console.log(`${indent}   LayoutAlign: ${child.layoutAlign}`);
                   if (child.itemSpacing) console.log(`${indent}   Gap: ${child.itemSpacing}`);
                   if (child.paddingTop || child.paddingLeft) console.log(`${indent}   Padding: ${child.paddingTop ?? 0}t ${child.paddingRight ?? 0}r ${child.paddingBottom ?? 0}b ${child.paddingLeft ?? 0}l`);
                   
                   console.log(`${indent}   ComponentId: ${child.componentId}`); // Key property to check
                   console.log(`${indent}   MainComponentId: ${child.mainComponentId}`); // Check variations
              } else if (depth < 2) {
                   // Print high level structure to find where components are
                   console.log(`${indent}- [${child.type}] ${child.name}`);
              }
              
              printChildren(child, depth + 1);
          }
      }
      
      if (node.document) {
          printChildren(node.document);
      }

    } catch (e: any) {
      console.error(`Error fetching node ${nodeId}:`, e.response?.status || e.message);
    }
  }
}

main();
