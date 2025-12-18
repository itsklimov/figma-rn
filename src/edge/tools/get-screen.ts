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
}

/**
 * Result from get_screen tool
 */
export interface GetScreenResult {
  success: boolean;
  screenIR?: ScreenIR;
  multiFileResult?: MultiFileResult;
  error?: string;
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
    // 1. Create Figma client and fetch node
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

    // 2. Transform to ScreenIR
    const screenIR = transformToScreenIR(figmaNode);

    // 3. Run detection layer
    const detectionResult = runDetectors(screenIR.root);

    // 4. Load project tokens if theme file provided
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

    // 5. Generate multi-file output
    const multiFileResult = generateComponentMultiFile(screenIR, tokenMappings, {
      componentName: componentName || undefined,
      detectionResult,
      hasProjectTheme,
      outputDir: outputDir || 'components',
    });

    return {
      success: true,
      screenIR,
      multiFileResult,
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
