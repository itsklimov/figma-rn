/**
 * get_screen MCP Tool
 *
 * Exposes the full pipeline: Figma URL → IR transformation → detection → code generation
 * Uses the new clean architecture instead of the legacy one-shot-generator.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { FigmaClient } from '../../api/client.js';
import { transformNode } from '../../api/transformers.js';
import { transformToScreenIR } from '../../core/pipeline.js';
import { runDetectors } from '../../core/detection/index.js';
import { matchTokens, createEmptyMappings, type TokenMappings } from '../../core/mapping/token-matcher.js';
import { extractProjectTokens } from '../../core/mapping/theme-extractor.js';
import { generateComponentMultiFile, type MultiFileResult } from '../../core/generation/index.js';
import type { ScreenIR } from '../../core/types.js';
import { downloadAssets } from '../asset-downloader.js';
import { resolveComponentName } from '../name-resolver.js';
import { writeGeneratedFiles, type WriteResult } from '../file-writer.js';
import { getOrCreateManifest, type ManifestCategory } from '../../figma-workspace.js';
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
      projectRoot: {
        type: 'string',
        description: 'Project root directory for file writing (default: current working directory)',
      },
      writeFiles: {
        type: 'boolean',
        description: 'Whether to write files to disk (default: true)',
      },
      category: {
        type: 'string',
        description: 'Category for the component (screens, modals, sheets, components, icons) (default: "screens")',
        enum: ['screens', 'modals', 'sheets', 'components', 'icons'],
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
  projectRoot?: string;
  writeFiles?: boolean;
  category?: string;
}

/**
 * Result from get_screen tool
 */
export interface GetScreenResult {
  success: boolean;
  screenIR?: ScreenIR;
  multiFileResult?: MultiFileResult;
  writeResult?: WriteResult;
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

  try {
    // 1. Parse Figma URL to get fileKey and nodeId
    const parsed = parseFigmaUrl(figmaUrl);
    if (!parsed) {
      return {
        success: false,
        error: 'Invalid Figma URL format',
      };
    }

    // 2. Create Figma client and fetch node
    const client = new FigmaClient(figmaToken);
    const result = await client.fetchNodeByUrl(figmaUrl);

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

    // 5. Load project tokens if theme file provided
    let tokenMappings: TokenMappings = createEmptyMappings();
    let hasProjectTheme = false;

    if (themeFilePath) {
      try {
        const projectTokens = await extractProjectTokens(themeFilePath);
        if (projectTokens) {
          tokenMappings = matchTokens(screenIR.stylesBundle.tokens, projectTokens);
          hasProjectTheme = true;
        }
      } catch (error) {
        // Theme file not found or invalid - continue without mappings
        console.error('Could not load theme file:', error);
      }
    }

    // 6. Get project root (default to cwd)
    const projectRoot = args.projectRoot || process.cwd();

    // 7. Get manifest and resolve component name
    const manifest = await getOrCreateManifest(projectRoot);
    const category = (args.category as ManifestCategory) || 'screens';
    const resolved = resolveComponentName(
      manifest,
      category,
      nodeId,
      componentName || screenIR.name
    );

    // 8. Create element folder path for assets and screenshot
    const elementFolder = join(projectRoot, '.figma', category, resolved.name);
    const assetsDir = join(elementFolder, 'assets');

    // 9. Create element folder and assets directory before downloading
    await mkdir(elementFolder, { recursive: true });
    await mkdir(assetsDir, { recursive: true });

    // 10. Download assets and build image path map
    let assetResult = await downloadAssets(client, parsed.fileKey, screenIR.root, assetsDir);

    // 11. Capture screenshot as buffer
    let screenshotBuffer: Buffer | undefined;
    try {
      screenshotBuffer = await captureScreenshotAsBuffer(client, parsed.fileKey, nodeId);
    } catch (error) {
      console.error('Failed to capture screenshot:', error);
      // Continue without screenshot
    }

    // 12. Generate multi-file output with imagePathMap
    const multiFileResult = generateComponentMultiFile(screenIR, tokenMappings, {
      componentName: resolved.name,
      detectionResult,
      hasProjectTheme,
      outputDir: outputDir || 'components',
      imagePathMap: assetResult.pathMap,
    });

    // 13. Write files if enabled (default: true)
    let writeResult: WriteResult | undefined;
    if (args.writeFiles !== false) {
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
        });
      } catch (error) {
        console.error('Failed to write files:', error);
        // Continue without writing files
      }
    }

    return {
      success: true,
      screenIR,
      multiFileResult,
      writeResult,
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
export function formatGetScreenResponse(result: GetScreenResult): string {
  if (!result.success) {
    return `# ❌ Error\n\n${result.error}`;
  }

  const { screenIR, multiFileResult } = result;
  if (!screenIR || !multiFileResult) {
    return '# ❌ Error\n\nNo result generated';
  }

  let response = `# ✅ Generated: ${screenIR.name}\n\n`;

  // Main component
  response += `## Main Component\n\n`;
  response += `**Path:** \`${multiFileResult.mainComponent.path}\`\n\n`;
  response += `\`\`\`tsx\n${multiFileResult.mainComponent.content}\n\`\`\`\n\n`;

  // Extracted components
  if (multiFileResult.extractedComponents.length > 0) {
    response += `## Extracted Components (${multiFileResult.extractedComponents.length})\n\n`;
    for (const comp of multiFileResult.extractedComponents) {
      response += `### ${comp.path}\n\n`;
      response += `\`\`\`tsx\n${comp.content}\n\`\`\`\n\n`;
    }
  }

  // Tokens file
  if (multiFileResult.tokens) {
    response += `## Generated Tokens\n\n`;
    response += `**Path:** \`${multiFileResult.tokens.path}\`\n\n`;
    response += `\`\`\`typescript\n${multiFileResult.tokens.content}\n\`\`\`\n\n`;
  }

  // Unmapped tokens
  const { unmappedTokens } = multiFileResult;
  const hasUnmapped =
    unmappedTokens.colors.length > 0 ||
    unmappedTokens.spacing.length > 0 ||
    unmappedTokens.radii.length > 0;

  if (hasUnmapped) {
    response += `## Unmapped Tokens\n\n`;
    if (unmappedTokens.colors.length > 0) {
      response += `**Colors:** ${unmappedTokens.colors.join(', ')}\n`;
    }
    if (unmappedTokens.spacing.length > 0) {
      response += `**Spacing:** ${unmappedTokens.spacing.join(', ')}\n`;
    }
    if (unmappedTokens.radii.length > 0) {
      response += `**Radii:** ${unmappedTokens.radii.join(', ')}\n`;
    }
    response += '\n';
  }

  // File writing summary
  if (result.writeResult?.success) {
    response += `## Files Written\n\n`;
    response += `| File | Path |\n`;
    response += `|------|------|\n`;
    response += `| Main Component | \`${result.writeResult.indexPath}\` |\n`;
    for (const path of result.writeResult.extractedPaths) {
      response += `| Extracted Component | \`${path}\` |\n`;
    }
    if (result.writeResult.tokensPath) {
      response += `| Tokens | \`${result.writeResult.tokensPath}\` |\n`;
    }
    if (result.writeResult.screenshotPath) {
      response += `| Screenshot | \`${result.writeResult.screenshotPath}\` |\n`;
    }
    if (result.writeResult.assetsCount > 0) {
      response += `| Assets | ${result.writeResult.assetsCount} files in \`.figma/${result.writeResult.folder}/assets/\` |\n`;
    }
    response += `\n`;
  }

  // Summary
  response += `---\n\n`;
  response += `**Files Generated:**\n`;
  response += `- Main component: \`${multiFileResult.mainComponent.path}\`\n`;
  for (const comp of multiFileResult.extractedComponents) {
    response += `- Extracted: \`${comp.path}\`\n`;
  }
  if (multiFileResult.tokens) {
    response += `- Tokens: \`${multiFileResult.tokens.path}\`\n`;
  }

  return response;
}
