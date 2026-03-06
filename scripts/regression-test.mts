import { FigmaClient } from '../src/api/client.js';
import { transformNode } from '../src/api/transformers.js';
import { transformToScreenIR } from '../src/core/pipeline.js';
import { generateComponent } from '../src/core/generation/index.js';
import { runDetectors } from '../src/core/detection/index.js';
import { createEmptyMappings, matchTokens } from '../src/core/mapping/token-matcher.js';
import { loadAllProjectTokens, refreshFigmaConfig, getOrCreateFigmaConfig } from '../src/workspace/index.js';
import { analyzeGeneratedCode, analyzeInputOutputFidelity, resolveThemeImportTarget } from '../src/edge/tools/get-screen.js';
import { writeFile, readFile, mkdir, access, mkdtemp } from 'fs/promises';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const REGRESSION_DIR = join(ROOT, '.figma/regression');
const BASELINE_DIR = join(REGRESSION_DIR, 'baselines');
const CURRENT_DIR = join(REGRESSION_DIR, 'current');

async function ensureDirs() {
  await mkdir(BASELINE_DIR, { recursive: true });
  await mkdir(CURRENT_DIR, { recursive: true });
}

async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const figmaUrl = process.argv[2];
  const mode = process.argv[3] || 'check'; // 'baseline' or 'check'
  const projectRootArg = process.argv[4];

  if (!figmaUrl) {
    console.error('Usage: FIGMA_TOKEN=... bunx tsx scripts/regression-test.mts [url] [baseline|check] [projectRoot?]');
    process.exit(1);
  }

  const token = process.env.FIGMA_TOKEN;
  if (!token) {
     console.error('Error: FIGMA_TOKEN environment variables is required');
     process.exit(1);
  }

  await ensureDirs();

  console.log(`🚀 Mode: ${mode.toUpperCase()}`);
  console.log(`🔗 URL: ${figmaUrl}`);
  const validationProjectRoot = projectRootArg || await mkdtemp(join(tmpdir(), 'figma-rn-regression-'));
  console.log(`🧪 Validation root: ${validationProjectRoot}${projectRootArg ? '' : ' (temporary project-agnostic root)'}`);

  // Re-scan the selected project root, but default to a temporary root to keep validation project-agnostic.
  console.log(`🔄 Refreshing config from: ${validationProjectRoot}`);
  await refreshFigmaConfig(validationProjectRoot);
  
  console.log(`🎨 Loading project tokens...`);
  const projectTokens = await loadAllProjectTokens(validationProjectRoot);
  if (projectTokens?.colors) {
    console.log(`Debug: Loaded ${projectTokens.colors.size} colors`);
    console.log('Debug: Sample colors:', [...projectTokens.colors.entries()].slice(0, 5));
  } else {
    console.log('Debug: No colors loaded');
  }

  const client = new FigmaClient(token);
  const result = await client.fetchNodeByUrl(figmaUrl);
  const nodeId = Object.keys(result.nodes)[0];
  const nodeData = result.nodes[nodeId];

  if (!nodeData?.document) {
    console.error('Failed to fetch node');
    process.exit(1);
  }

  const doc = nodeData.document as any;
  console.log(`📦 Processing: ${doc.name} (${nodeId})`);

  const figmaNode = transformNode(doc);
  const screenIR = transformToScreenIR(figmaNode);
  const detectionResult = runDetectors(screenIR.root, screenIR.stylesBundle);
  
  // Match tokens only when the validation root actually exposes them.
  const tokenMappings = projectTokens
    ? matchTokens(screenIR.stylesBundle.tokens, projectTokens)
    : createEmptyMappings();
  
  // Debug mappings
  console.log('Debug: Mapped colors:', Object.entries(tokenMappings.colors).slice(0, 5));
  console.log('Debug: Project Spacing tokens:', projectTokens?.spacing?.size || 0);
  console.log('Debug: Extracted Spacing:', Object.entries(screenIR.stylesBundle.tokens.spacing || {}).slice(0, 10));
  console.log('Debug: Spacing mappings:', Object.entries(tokenMappings.spacing || {}).slice(0, 10));
  
  // Load config for import generation
  const config = await getOrCreateFigmaConfig(validationProjectRoot);
  const themeTarget = await resolveThemeImportTarget(validationProjectRoot, config);
  
  const generated = generateComponent(screenIR, tokenMappings, { 
    detectionResult,
    suppressTodos: true,
    hasProjectTheme: config.tokenFiles.length > 0,
    stylePattern: config.stylePattern,
    useThemeHookPath: config.hooks?.useTheme,
    importPrefix: config.importPrefix,
  });

  const fidelity = analyzeInputOutputFidelity(screenIR, detectionResult, generated.code);
  const validation = analyzeGeneratedCode(generated.code, [], themeTarget);
  console.log('📊 Input → output fidelity:', JSON.stringify(fidelity, null, 2));
  console.log('🩺 Generated code validation:', JSON.stringify(validation, null, 2));

  const safeNodeId = nodeId.replace(/:/g, '-');
  const fileName = `baseline_${safeNodeId}.tsx`;
  
  if (mode === 'baseline') {
    const baselinePath = join(BASELINE_DIR, fileName);
    await writeFile(baselinePath, generated.code);
    console.log(`\n✅ Baseline saved to: ${baselinePath}`);
  } else {
    const currentPath = join(CURRENT_DIR, fileName);
    const baselinePath = join(BASELINE_DIR, fileName);
    
    await writeFile(currentPath, generated.code);
    console.log(`\n📝 Result saved to: ${currentPath}`);

    if (await exists(baselinePath)) {
      const baselineCode = await readFile(baselinePath, 'utf8');
      if (baselineCode === generated.code) {
        console.log('\n✨ NO CHANGES detected. Output is identical to baseline.');
      } else {
        console.log('\n⚠️ CHANGES detected between baseline and current output.');
        console.log('Compare using:');
        console.log(`diff ${baselinePath} ${currentPath}`);
      }
    } else {
      console.log('\nℹ️ No baseline found for this node. Run with "baseline" mode to create one:');
      console.log(`FIGMA_TOKEN=... bunx tsx scripts/regression-test.mts "${figmaUrl}" baseline`);
    }
  }
}

main().catch(console.error);
