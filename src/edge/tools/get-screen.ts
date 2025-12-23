/**
 * get_screen MCP Tool
 *
 * Exposes the full pipeline: Figma URL → IR transformation → detection → code generation
 * Uses the new clean architecture instead of the legacy one-shot-generator.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { FigmaClient } from '../../api/client.js';
import { retryOnError } from '../../api/errors.js';
import { transformNode } from '../../api/transformers.js';
import { transformToScreenIR } from '../../core/pipeline.js';
import { runDetectors } from '../../core/detection/index.js';
import { matchTokens, createEmptyMappings, type TokenMappings } from '../../core/mapping/token-matcher.js';
import { extractProjectTokens } from '../../core/mapping/theme-extractor.js';
import { 
  generateComponent, 
  type MultiFileResult 
} from '../../core/generation/index.js';
import type { ScreenIR } from '../../core/types.js';
import { downloadAssets } from '../asset-downloader.js';
import { resolveComponentName } from '../name-resolver.js';
import { writeGeneratedFiles, type WriteResult } from '../file-writer.js';
import {
  getOrCreateManifest,
  loadAllProjectTokens,
  refreshFigmaConfig,
  getOrCreateFigmaConfig,
  type ManifestCategory,
} from '../../figma-workspace.js';
import { join } from 'path';
import { mkdir } from 'fs/promises';

/**
 * Parse Figma URL to extract fileKey and nodeId
 */
function parseFigmaUrl(figmaUrl: string): { fileKey: string; nodeId: string } | null {
  // Supported formats:
  // - https://www.figma.com/file/{fileKey}/...?node-id={nodeId}
  // - https://www.figma.com/design/{fileKey}/...?node-id={nodeId}

  const fileKeyMatch = figmaUrl.match(/figma\.com\/(file|design)\/([a-zA-Z0-9]+)/);
  const nodeIdMatch = figmaUrl.match(/node-id=([^&]+)/);

  if (!fileKeyMatch || !nodeIdMatch) {
    return null;
  }

  const fileKey = fileKeyMatch[2];
  const nodeId = decodeURIComponent(nodeIdMatch[1]).replace(/-/g, ':');

  return { fileKey, nodeId };
}

/**
 * Tool definition for MCP server
 */
export const getScreenTool: Tool = {
  name: 'get_screen',
  description: `Generate React Native code from a Figma URL using the clean architecture pipeline.

This tool uses the new transformation pipeline:
1. Fetch Figma node data
2. Normalize and filter nodes
3. Detect layout (row/column/stack)
4. Recognize semantics (Container, Text, Button, etc.)
5. Extract styles and tokens
6. Detect patterns (lists, repeated components)
7. Generate production-ready TSX with accessibility props

Features:
• Automatic list detection → FlatList generation
• Component extraction for repeated blocks
• Accessibility props (accessibilityRole, accessibilityLabel, hitSlop)
• Token extraction and mapping to project theme
• Multi-file output support

Returns:
• Generated component code
• Extracted components (if patterns detected)
• Design tokens (if no project theme)
• Unmapped tokens report`,
  inputSchema: {
    type: 'object',
    properties: {
      figmaUrl: {
        type: 'string',
        description: 'Figma URL with node-id (e.g., https://www.figma.com/design/FILE_ID?node-id=123-456)',
      },
      componentName: {
        type: 'string',
        description: 'Name for the generated component (default: derived from Figma node name)',
      },
      themeFilePath: {
        type: 'string',
        description: 'Path to project theme file for token matching (optional)',
      },
      outputDir: {
        type: 'string',
        description: 'Output directory for generated files (default: "components")',
      },
      category: {
        type: 'string',
        description: 'Category for the component (screens, modals, sheets, components, icons) (default: "screens")',
        enum: ['screens', 'modals', 'sheets', 'components', 'icons'],
      },
      suppressTodos: {
        type: 'boolean',
        description: 'Whether to suppress TODO comments in generated code (default: false)',
      },
      scaleFunction: {
        type: 'string',
        description: 'Responsive scaling function name (e.g., "scale") (default: from figma.config.json)',
      },
    },
    required: ['figmaUrl'],
  },
};

/**
 * Input arguments for get_screen tool
 */
export interface GetScreenArgs {
  figmaUrl: string;
  componentName?: string;
  themeFilePath?: string;
  outputDir?: string;
  category?: string;
  suppressTodos?: boolean;
  scaleFunction?: string;
}

/**
 * Result from get_screen tool
 */
export interface GetScreenResult {
  success: boolean;
  screenIR?: ScreenIR;
  multiFileResult?: MultiFileResult;
  writeResult?: WriteResult;
  screenshot?: Buffer;
  previousName?: string;
  error?: string;
}

/**
 * Capture screenshot as buffer (helper function)
 */
async function captureScreenshotAsBuffer(
  client: FigmaClient,
  fileKey: string,
  nodeId: string
): Promise<Buffer | undefined> {
  try {
    const exportResults = await client.exportImages(fileKey, [nodeId], {
      format: 'png',
      scale: 2,
    });

    if (!exportResults[0]?.url) return undefined;

    const response = await fetch(exportResults[0].url);
    if (!response.ok) return undefined;

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error('Failed to capture screenshot:', error);
    return undefined;
  }
}

/**
 * Execute the get_screen tool
 *
 * @param args - Tool arguments
 * @param figmaToken - Figma API token
 * @returns Generation result
 */
export async function executeGetScreen(
  args: GetScreenArgs,
  figmaToken: string
): Promise<GetScreenResult> {
  const { figmaUrl, componentName, themeFilePath, outputDir } = args;
  const projectRoot = process.cwd();

  // STEP 0: Always refresh config first - this is the foundation for everything else
  // The config contains theme file paths needed for token matching
  try {
    await refreshFigmaConfig(projectRoot);
  } catch (error) {
    console.error('Config refresh failed:', error);
  }

  try {
    // 1. Parse Figma URL to get fileKey and nodeId
    const parsed = parseFigmaUrl(figmaUrl);
    if (!parsed) {
      return {
        success: false,
        error: 'Invalid Figma URL format',
      };
    }

    // 2. Create Figma client and fetch node with retry for rate limits
    const client = new FigmaClient(figmaToken);
    const result = await retryOnError(
      () => client.fetchNodeByUrl(figmaUrl),
      { maxRetries: 3, retryDelay: 2000 }
    );

    // Get the first node from the result
    const nodeIds = Object.keys(result.nodes);
    if (nodeIds.length === 0) {
      return {
        success: false,
        error: 'No nodes found at the specified URL',
      };
    }

    const nodeId = nodeIds[0];
    const nodeData = result.nodes[nodeId];

    if (!nodeData?.document) {
      return {
        success: false,
        error: 'Failed to fetch Figma node document',
      };
    }

    // Transform raw API response to FigmaNode
    const figmaNode = transformNode(nodeData.document);

    // 3. Transform to ScreenIR
    const screenIR = transformToScreenIR(figmaNode);

    // 4. Run detection layer
    const detectionResult = runDetectors(screenIR.root);

    // 5. Load project tokens
    let tokenMappings: TokenMappings = createEmptyMappings();
    let hasProjectTheme = false;
    let projectTokens: any = null;

    if (themeFilePath) {
      try {
        projectTokens = await extractProjectTokens(themeFilePath);
      } catch (error) {
        console.error('Could not load explicit theme file:', error);
      }
    } else {
      // Auto-discovery from refreshed config
      try {
        projectTokens = await loadAllProjectTokens(projectRoot);
      } catch (error) {
        console.error('Auto-discovery of tokens failed:', error);
      }
    }

    if (projectTokens) {
      tokenMappings = matchTokens(screenIR.stylesBundle.tokens, projectTokens);
      hasProjectTheme = true;
    }

    // 6. Get manifest and resolve component name
    const manifest = await getOrCreateManifest(projectRoot);
    
    // Validate category input
    const validCategories: ManifestCategory[] = ['screens', 'modals', 'sheets', 'components', 'icons'];
    const categoryInput = args.category || 'screens';
    const category: ManifestCategory = validCategories.includes(categoryInput as ManifestCategory) 
      ? (categoryInput as ManifestCategory) 
      : 'screens';

    const resolved = resolveComponentName(
      manifest,
      category,
      nodeId,
      screenIR.name,
      componentName
    );

    console.error(`[DEBUG] get_screen result: "${resolved.name}", isUpdate=${resolved.isUpdate}`);

    // 8. Create element folder path for assets and screenshot
    const elementFolder = join(projectRoot, '.figma', category, resolved.name);
    const assetsDir = join(elementFolder, 'assets');

    // 9. Create element folder and assets directory before downloading
    await mkdir(elementFolder, { recursive: true });
    await mkdir(assetsDir, { recursive: true });

    // 10. Download assets and build image path map
    const assetResult = await downloadAssets(client, parsed.fileKey, screenIR.root, assetsDir);

    // 11. Capture screenshot as buffer
    let screenshotBuffer: Buffer | undefined;
    try {
      screenshotBuffer = await captureScreenshotAsBuffer(client, parsed.fileKey, nodeId);
    } catch (error) {
      console.error('Failed to capture screenshot:', error);
      // Continue without screenshot
    }

    // 11.5 Load config to get theme import path and assets prefix
    const config = await getOrCreateFigmaConfig(projectRoot);
    
    // Derive theme import path from config (leverages existing project scanning)
    // Uses the importPrefix from config + first token file path
    let themeImportPath = `${config.importPrefix}/styles`;
    
    if (config.tokenFiles.length > 0) {
      const mainFile = config.tokenFiles[0];
      // Convert 'src/styles/generated/tokens.ts' → 'styles/generated' (strip src/ and extension)
      const relativePath = mainFile
        .replace(/^(src|app)\//, '')
        .replace(/\/[^/]+\.(ts|tsx|js|jsx)$/, '');
      themeImportPath = `${config.importPrefix}/${relativePath}`;
    }
    
    // Get assets import prefix from config
    const assetsPrefix = config.importPrefix || '@assets';
    
    // Transform asset paths to use config prefix instead of relative ./assets/
    const transformedPathMap = new Map<string, string>();
    for (const [key, value] of assetResult.pathMap) {
      // Replace './assets/' with '@assets/' (or config prefix)
      const transformedPath = value.replace(/^\.\/assets\//, `${assetsPrefix}/`);
      transformedPathMap.set(key, transformedPath);
    }

    // 12. Generate monolithic output with imagePathMap
    const generationResult = generateComponent(screenIR, tokenMappings, {
      componentName: resolved.name,
      detectionResult,
      hasProjectTheme,
      imagePathMap: transformedPathMap,
      themeImportPath,
      assetsPrefix,
      suppressTodos: args.suppressTodos,
      scaleFunction: args.scaleFunction || config.utils?.scaleFunctionName,
      scaleFunctionPath: config.utils?.scale,
      // New: Pass config for import generation
      stylePattern: config.stylePattern,
      useThemeHookPath: config.hooks?.useTheme,
      importPrefix: config.importPrefix,
    });

    const multiFileResult: MultiFileResult = {
      mainComponent: {
        path: `${outputDir || 'components'}/${resolved.name}.tsx`,
        content: generationResult.code,
      },
      extractedComponents: [],
      tokens: null,
      unmappedTokens: generationResult.unmappedTokens,
    };

    // 13. Write files
    let writeResult: WriteResult | undefined;
    try {
      writeResult = await writeGeneratedFiles({
        projectRoot,
        figmaUrl,
        category,
        componentName: resolved.name,
        multiFileResult,
        assets: assetResult.assets,
        screenshot: screenshotBuffer,
        figmaName: screenIR.name,
        previousName: resolved.previousName,
      });
    } catch (error) {
      console.error('Failed to write files:', error);
      // Continue without writing files
    }

    // 14. Prepare response
    return {
      success: true,
      screenIR,
      multiFileResult,
      writeResult,
      screenshot: screenshotBuffer,
      previousName: resolved.previousName,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Format the result for MCP response
 */
export function formatGetScreenResponse(result: GetScreenResult): any[] {
  if (!result.success) {
    return [{ type: 'text', text: `# ❌ Error\n\n${result.error}` }];
  }

  const { screenIR, multiFileResult, writeResult, screenshot, previousName } = result;
  if (!screenIR || !multiFileResult) {
    return [{ type: 'text', text: '# ❌ Error\n\nNo result generated' }];
  }

  const content: any[] = [];
  let textResponse = `# ✅ Generated: ${screenIR.name}\n\n`;

  if (previousName && previousName !== screenIR.name) {
    textResponse = `# 🔄 Replaced ${previousName} with ${screenIR.name}\n\n`;
  }

  // 1. What's Generated (Inventory)
  textResponse += `## 📦 What's Generated\n\n`;
  if (writeResult?.success) {
    textResponse += `| File | Temporary Path (in \`.figma/\`) |\n`;
    textResponse += `|------|-------------------------------|\n`;
    textResponse += `| **Main Component** | \`${writeResult.indexPath}\` |\n`;
    
    for (const path of writeResult.extractedPaths) {
      textResponse += `| Extracted Part | \`${path}\` |\n`;
    }
    
    if (writeResult.tokensPath) {
      textResponse += `| Tokens | \`${writeResult.tokensPath}\` |\n`;
    }
    
    if (writeResult.assetsCount > 0) {
      textResponse += `| Assets | ${writeResult.assetsCount} files in \`.figma/${writeResult.folder}/assets/\` |\n`;
    }
    textResponse += `\n`;
  }

  // 2. Smart Integration Instructions
  textResponse += `## 🚀 Smart Integration Instructions\n\n`;
  textResponse += `I have generated the base architectural parts for you. **Your goal is to perform a perfect one-shot integration** into the project:\n\n`;
  textResponse += `1. **Analyze Content Type**: Evaluate if \`${screenIR.name}\` is a top-level screen, a reusable component, or a specific element like a Modal or BottomSheet.\n`;
  textResponse += `2. **Relocate**: Check the project's existing directory structure (e.g., \`src/screens\`, \`src/components\`) and move the generated files from \`.figma/\` to their proper permanent locations.\n`;
  textResponse += `3. **Rename**: Rename directories and files if necessary to match the project's naming conventions and React Native best practices.\n`;
  textResponse += `4. **Process Assets**: Relocate the icons and images from the temporary \`assets/\` folder to your project's shared asset directory (e.g., \`src/assets\`) and update the import paths in the code.\n\n`;

  // 3. Understanding & Gaps
  textResponse += `## 🔍 Understanding & Gaps\n\n`;
  
  // Dynamic gap reporting based on detections
  const d = multiFileResult.unmappedTokens;
  const hasUnmapped = d.colors.length > 0 || d.spacing.length > 0 || d.radii.length > 0;
  
  textResponse += `### What I understood:\n`;
  textResponse += `- **Structure**: Successfully parsed the ${screenIR.name} hierarchy.\n`;
  
  // Pattern-specific understanding
  const detection = multiFileResult.mainComponent.content.includes('FlatList') ? 'List' : 
                   multiFileResult.mainComponent.content.includes('useForm') ? 'Form' : 'Regular';
  textResponse += `- **Pattern**: Detected and implemented as a **${detection}** component.\n`;
  
  if (multiFileResult.extractedComponents.length > 0) {
    textResponse += `- **Composition**: Identified ${multiFileResult.extractedComponents.length} repeating patterns and extracted them into sub-components.\n`;
  }

  textResponse += `\n### Gaps & Assumptions:\n`;
  if (hasUnmapped) {
    textResponse += `- **Tokens**: Some styles did not match project tokens and were exported as hardcoded values (see unmapped tokens below).\n`;
  } else {
    textResponse += `- **Tokens**: Successfully mapped all styles to project theme tokens! ✅\n`;
  }
  
  if (detection === 'List') {
    textResponse += `- **Data**: Used **mock items** for the FlatList. You should replace these with a real data source or API hook.\n`;
  }
  if (detection === 'Form') {
    textResponse += `- **Validation**: Generated basic Zod validation. Review the schema to ensure it matches your business requirements.\n`;
  }
  
  textResponse += `\n`;

  // 4. Unmapped Tokens (if any)
  if (hasUnmapped) {
    textResponse += `### Unmapped Tokens\n\n`;
    if (d.colors.length > 0) textResponse += `**Colors:** ${d.colors.slice(0, 10).join(', ')}${d.colors.length > 10 ? '...' : ''}\n`;
    if (d.spacing.length > 0) textResponse += `**Spacing:** ${d.spacing.join(', ')}\n`;
    if (d.radii.length > 0) textResponse += `**Radii:** ${d.radii.join(', ')}\n`;
    textResponse += `\n`;
  }

  // 5. Integration Summary
  textResponse += `## 📄 Integration Summary\n\n`;
  textResponse += `Main component: \`${multiFileResult.mainComponent.path}\`\n`;
  if (multiFileResult.extractedComponents.length > 0) {
    textResponse += `Extracted parts: ${multiFileResult.extractedComponents.length} files\n`;
  }
  textResponse += `\n**Integration Step**: Move these files from \`.figma/\` to your codebase and update the imports. I have used your theme tokens where possible.\n\n`;
  
  content.push({ type: 'text', text: textResponse });

  // 6. Visual Reference (Screenshot)
  if (screenshot) {
    content.push({
      type: 'image',
      data: screenshot.toString('base64'),
      mimeType: 'image/png',
    });
  }

  return content;
}
