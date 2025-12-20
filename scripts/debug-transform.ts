import fs from 'fs';
import { transformNode } from '../src/api/transformers.js';
import { transformToScreenIR } from '../src/core/pipeline.js';
import { buildStyles } from '../src/core/generation/styles-builder.js';
import { matchTokens } from '../src/core/mapping/token-matcher.js';

async function test() {
  const json = JSON.parse(fs.readFileSync('./debug/raw-figma-node.json', 'utf8'));
  const rawData = json.nodes ? Object.values(json.nodes)[0].document : json;
  
  // 1. Transform Figma Node
  const figmaNode = transformNode(rawData);
  console.log('Figma Node layoutPositioning:', figmaNode.layoutPositioning);

  // 2. Transform to Screen IR
  const screenIR = transformToScreenIR(figmaNode);
  console.log('IR Root semanticType:', screenIR.root.semanticType);

  // 3. Create empty mappings (for debugging)
  const { createEmptyMappings } = await import('../src/core/mapping/token-matcher.js');
  const mappings = createEmptyMappings();

  // 4. Generate Component
  const { generateComponent } = await import('../src/core/generation/component-builder.js');
  const { code } = generateComponent(screenIR, mappings);
  
  // Save output for inspection
  fs.writeFileSync('./debug/transformed-component.tsx', code);
  console.log('Generated component saved to ./debug/transformed-component.tsx');
}

test();
