import { loadAllProjectTokens } from '../src/figma-workspace.js';

const projectRoot = process.argv[2] || process.env.DEBUG_PROJECT_ROOT;
if (!projectRoot) {
  console.error(
    'Usage: npx tsx scripts/debug-typo.mts <project-root>\n' +
      'Or set DEBUG_PROJECT_ROOT=/path/to/project'
  );
  process.exit(1);
}

async function verifyTypography() {
  console.log('Loading tokens from:', projectRoot);
  const projectTokens = await loadAllProjectTokens(projectRoot);

  if (!projectTokens || !projectTokens.typography) {
    console.error('No typography tokens found!');
    return;
  }

  console.log('--- Project Typography Keys (Sample) ---');
  // Log keys to see format
  const keys = Array.from(projectTokens.typography.keys());
  keys.slice(0, 50).forEach(k => console.log(k));

  console.log('\n--- Simulation ---');
  
  // Figma Input: font: SF Pro, size: 13, weight: 590, lineHeight: 18
  // Note: Figma "SF Pro" usually comes as "SF Pro Text" or "SF Pro Display"
  const figmaInput = {
    fontFamily: 'SF Pro Text', 
    fontSize: 13,
    fontWeight: 590,
    lineHeight: 18
  };
  
  // Simulate what matchTokens does internally
  // 1. Normalize Figma values
  const rawWeight = figmaInput.fontWeight || 400;
  const figmaWeight = Math.round(rawWeight / 100) * 100; // 590 -> 600
  const figmaSize = figmaInput.fontSize || 0;
  const figmaLH = Math.round(figmaInput.lineHeight || 0);
  
  console.log(`Input: ${JSON.stringify(figmaInput)}`);
  console.log(`Normalized: Size=${figmaSize}, Weight=${figmaWeight}, LH=${figmaLH}`);
  
  // 2. Generate Search Keys
  const wildcardKey = `*-${figmaSize}-${figmaWeight}-${figmaLH}`;
  console.log(`Searching for key: "${wildcardKey}"`);
  
  const match = projectTokens.typography.get(wildcardKey);
  if (match) {
    console.log(`✅ FOUND MATCH: ${match}`);
  } else {
    console.log(`❌ EXACT MATCH FAILED`);
    
    // Check neighbors
    console.log('Checking tolerant matches...');
    
    // Check LH tolerance
    for (const lhOffset of [1, -1, 2, -2]) {
        const key = `*-${figmaSize}-${figmaWeight}-${figmaLH + lhOffset}`;
        const m = projectTokens.typography.get(key);
        if (m) console.log(`  [LH Tolerance] Found: "${key}" -> ${m}`);
    }
    
    // Check Size tolerance
     for (const sizeOffset of [1, -1]) {
        const key = `*-${figmaSize + sizeOffset}-${figmaWeight}-${figmaLH}`;
        const m = projectTokens.typography.get(key);
        if (m) console.log(`  [Size Tolerance] Found: "${key}" -> ${m}`);
    }
    
    // Check Weight buckets nearby? (Not part of standard logic but good for debug)
    console.log('Checking close weights...');
    for (const w of [400, 500, 700]) {
       const key = `*-${figmaSize}-${w}-${figmaLH}`;
       const m = projectTokens.typography.get(key);
       if (m) console.log(`  [Weight Offset] Found: "${key}" -> ${m}`);
    }
  }
}

verifyTypography();
