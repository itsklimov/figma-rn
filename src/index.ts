#!/usr/bin/env node
/**
 * Marafet Figma MCP Server v12.0 - SIMPLIFIED ONE-SHOT EDITION
 *
 * The only MCP server that generates production-ready React Native code
 * from a Figma URL in ONE call. One URL = one folder with all contents.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
// import { join } from 'path';

/*
// Core ONE-SHOT generation modules
import { generateCompleteScreen, saveGeneratedFiles, extractCategorizationSignals, categorizeBySignals, type CategorizationSignals } from './one-shot-generator.js';
import { generateCompleteFlow } from './flow-generator.js';
import { generateProjectConfig, configExists } from './config-generator.js';
import { parseThemeFile } from './theme-parser.js';
// analyzeElement removed - functionality consolidated into generate_screen
import { fetchFigmaNodes, fetchFigmaScreenshot } from './figma-api-client.js';
import {
  getOrCreateManifest,
  registerGeneration,
  formatResultForLLM,
  formatTokensForLLM,
  getManifestCategory,
  getOrCreateFigmaConfig,
  saveFigmaConfig,
  type ManifestCategory,
  type ManifestEntry,
  type GenerationResult,
  type AssetInfo,
  type FigmaConfig,
} from './figma-workspace.js';
import { extractDesignTokens, type DesignTokens } from './design-tokens.js';
import { autoGenerateColorMappings } from './auto-theme-mapper.js';
*/

// New clean architecture pipeline
import { getScreenTool, executeGetScreen, formatGetScreenResponse } from './edge/tools/index.js';

const FIGMA_TOKEN = process.env.FIGMA_TOKEN || '';
let FIGMA_TOKEN_ERROR: string | null = null;

if (!FIGMA_TOKEN) {
  FIGMA_TOKEN_ERROR = 'FIGMA_TOKEN environment variable is required';
} else if (FIGMA_TOKEN.length < 20 || !/^[a-zA-Z0-9_-]+$/.test(FIGMA_TOKEN)) {
  FIGMA_TOKEN_ERROR = 'FIGMA_TOKEN appears to be invalid';
}

if (FIGMA_TOKEN_ERROR) {
  console.error(`Warning: ${FIGMA_TOKEN_ERROR}`);
  console.error('Figma API tools will return errors until token is configured.');
}

// Create MCP server
const server = new Server(
  {
    name: 'react-native-figma-generator',
    version: '12.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ═══════════════════════════════════════════════════════════════════
// ONLY 2 TOOLS - EVERYTHING YOU NEED FOR ONE-SHOT GENERATION
// ═══════════════════════════════════════════════════════════════════

const tools: Tool[] = [
  // ───────────────────────────────────────────────────────────────────
  // TOOL 1: generate_screen - ONE Figma URL → Complete production code
  // ───────────────────────────────────────────────────────────────────
  /*
  // ───────────────────────────────────────────────────────────────────
  // TOOL 1: generate_screen - ONE Figma URL → Complete production code
  // ───────────────────────────────────────────────────────────────────
  {
    name: 'generate_screen',
    description: `🎯 ONE-SHOT: Generate complete React Native screen from Figma URL.

AUTO-DETECTS and generate appropriate code for:
• Lists → FlatList with renderItem, keyExtractor, pagination
• Forms → react-hook-form + Zod validation + typed fields
• Bottom Sheets → @gorhom/bottom-sheet with snap points
• Modals → react-native-modal with animations
• Action Sheets → Pressable action lists
• Regular screens → Standard React Native components

WRITES files to .figma/ folder:
• .figma/screens/{ScreenName}/index.tsx
• .figma/modals/{ScreenName}/index.tsx
• .figma/sheets/{ScreenName}/index.tsx
• .figma/components/{ScreenName}/index.tsx

RETURNS:
• Generated code location
• Screenshot for validation
• Design tokens (colors, typography)
• Downloaded assets (icons, images)

NAMING:
• Derive screenName from user's request context (e.g., "implement confirmation modal" → "ConfirmationModal")
• If no context, use descriptive default like "Screen" - tool ensures uniqueness
• Same URL = replaces existing (designers may have updated)`,
    inputSchema: {
      type: 'object',
      properties: {
        figmaUrl: {
          type: 'string',
          description: 'Figma URL (e.g., https://www.figma.com/design/FILE_ID?node-id=123-456)',
        },
        screenName: {
          type: 'string',
          description: 'Screen name derived from user context (e.g., "ConfirmationModal", "PaymentScreen"). If not provided, defaults to "Screen" with unique suffix.',
        },
        projectRoot: {
          type: 'string',
          description: 'Project root directory (default: current working directory)',
        },
        options: {
          type: 'object',
          description: 'Optional generation settings',
          properties: {
            generateTypes: {
              type: 'boolean',
              description: 'Generate TypeScript type definitions (default: true)',
              default: true,
            },
            generateHooks: {
              type: 'boolean',
              description: 'Generate React Query data hooks (default: true)',
              default: true,
            },
            detectAnimations: {
              type: 'boolean',
              description: 'Extract animations from Figma prototype (default: false, slower)',
              default: false,
            },
          },
        },
      },
      required: ['figmaUrl'],
    },
  },
  */

  // ───────────────────────────────────────────────────────────────────
  // TOOL 2: generate_flow - Multiple URLs → Complete app with navigation
  // ───────────────────────────────────────────────────────────────────
  /*
  // ───────────────────────────────────────────────────────────────────
  // TOOL 2: generate_flow - Multiple URLs → Complete app with navigation
  // ───────────────────────────────────────────────────────────────────
  {
    name: 'generate_flow',
    description: `🚀 BATCH ONE-SHOT: Generate complete app flow from multiple Figma URLs.

Generates in ONE call:
• All screens (parallel processing)
• React Navigation types and navigator
• Shared TypeScript types
• Barrel exports (index.ts)

Perfect for:
• Auth flow (Login + Register + ForgotPassword)
• Onboarding (Step1 + Step2 + Step3)
• Main app (Home + Profile + Settings)
• Complete feature module

Just provide array of {figmaUrl, screenName} and get complete app structure.`,
    inputSchema: {
      type: 'object',
      properties: {
        screens: {
          type: 'array',
          description: 'Array of screens to generate',
          items: {
            type: 'object',
            properties: {
              figmaUrl: {
                type: 'string',
                description: 'Figma URL for this screen',
              },
              screenName: {
                type: 'string',
                description: 'Screen name (e.g., HomeScreen)',
              },
            },
            required: ['figmaUrl', 'screenName'],
          },
        },
        options: {
          type: 'object',
          description: 'Optional generation settings',
          properties: {
            generateNavigation: {
              type: 'boolean',
              description: 'Generate React Navigation types and navigator (default: true)',
              default: true,
            },
            generateSharedTypes: {
              type: 'boolean',
              description: 'Generate shared TypeScript types across screens (default: true)',
              default: true,
            },
            generateIndex: {
              type: 'boolean',
              description: 'Generate index.ts barrel export (default: true)',
              default: true,
            },
          },
        },
      },
      required: ['screens'],
    },
  },
  */

  // setup_project removed - config is now auto-detected on first use of any tool

  // ───────────────────────────────────────────────────────────────────
  // TOOL 3: get_screen - Clean architecture pipeline (Step 4)
  // ───────────────────────────────────────────────────────────────────
  getScreenTool,
];

// Handle list_tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle call_tool request
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // ═══════════════════════════════════════════════════════════════
      // TOOL 1: generate_screen
      // ═══════════════════════════════════════════════════════════════
      /*
      // ═══════════════════════════════════════════════════════════════
      // TOOL 1: generate_screen
      // ═══════════════════════════════════════════════════════════════
      case 'generate_screen': {
        const { figmaUrl, screenName: providedName, projectRoot, options = {} } = args as {
          figmaUrl: string;
          screenName?: string;
          projectRoot?: string;
          options?: {
            generateTypes?: boolean;
            generateHooks?: boolean;
            detectAnimations?: boolean;
          };
        };

        // Determine project root
        const root = projectRoot || process.cwd();

        // ═══════════════════════════════════════════════════════════════
        // Generate unique name with nodeId-based deduplication
        // ═══════════════════════════════════════════════════════════════
        const manifest = await getOrCreateManifest(root);

        // Extract nodeId from URL (convert to canonical colon format)
        const nodeIdMatch = figmaUrl.match(/node-id=([^&]+)/);
        const nodeId = nodeIdMatch ? decodeURIComponent(nodeIdMatch[1]).replace(/-/g, ':') : 'unknown';

        // Check if element with this nodeId already exists
        const categories: ManifestCategory[] = ['screens', 'modals', 'sheets', 'components', 'icons'];
        let existingEntry: ManifestEntry | null = null;

        for (const category of categories) {
          if (manifest[category][nodeId]) {
            existingEntry = manifest[category][nodeId];
            break;
          }
        }

        // Collect all names from all categories (except current nodeId)
        const existingNames = new Set<string>();
        for (const category of categories) {
          for (const [key, entry] of Object.entries(manifest[category])) {
            if (key !== nodeId) {  // Exclude current nodeId
              existingNames.add(entry.name);
            }
          }
        }

        // Determine name
        let screenName: string;
        if (existingEntry && !providedName) {
          // If nodeId exists and user didn't provide new name - reuse existing
          screenName = existingEntry.name;
          console.error(`\n🎯 [ONE-SHOT] Updating ${screenName} (same nodeId)...`);
        } else {
          // Base name: from user or default
          const baseName = providedName || 'Screen';

          // Ensure uniqueness
          screenName = baseName;
          let counter = 2;
          while (existingNames.has(screenName)) {
            screenName = `${baseName}${counter}`;
            counter++;
          }

          if (existingEntry) {
            console.error(`\n🎯 [ONE-SHOT] Updating ${existingEntry.name} → ${screenName} (new name provided)...`);
          } else {
            console.error(`\n🎯 [ONE-SHOT] Generating ${screenName}...`);
          }
        }

        console.error(`   URL: ${figmaUrl}`);
        console.error(`   Project: ${root}`);
        if (providedName && providedName !== screenName) {
          console.error(`   📝 Name ensured unique: ${providedName} → ${screenName}`);
        }

        // ═══════════════════════════════════════════════════════════════
        // Load configuration
        // ═══════════════════════════════════════════════════════════════
        const figmaConfig = await getOrCreateFigmaConfig(root);
        console.error(`📁 Config loaded from: ${root}/.figma/config.json`);

        // ═══════════════════════════════════════════════════════════════
        // Categorization before generation
        // ═══════════════════════════════════════════════════════════════
        let category: ManifestCategory = 'screens';
        const categorizationUrlMatch = figmaUrl.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+).*node-id=([^&]+)/);
        if (categorizationUrlMatch) {
          const [, fileKey, rawNodeId] = categorizationUrlMatch;
          const nodeId = decodeURIComponent(rawNodeId).replace('-', ':');
          try {
            const response = await fetchFigmaNodes(FIGMA_TOKEN, fileKey, [nodeId]);
            const node = response.nodes[nodeId]?.document;
            if (node) {
              const signals = extractCategorizationSignals(node);
              category = categorizeBySignals(signals);
              console.error(`   📊 Categorization: ${category}`);
            }
          } catch (error) {
            console.error('   ⚠️ Could not determine category, using default: screens');
          }
        }

        // Calculate outputFolder for direct file saving
        const outputFolder = join(root, '.figma', category, screenName);
        console.error(`📁 Output folder: ${outputFolder}`);

        // Generate code
        const result = await generateCompleteScreen(
          FIGMA_TOKEN,
          figmaUrl,
          screenName,
          {
            generateTypes: options.generateTypes ?? true,
            generateHooks: options.generateHooks ?? true,
            detectAnimations: options.detectAnimations ?? false,
            outputFolder,  // Direct save to local folder
            config: figmaConfig.tokenFiles.length > 0 ? {
              framework: figmaConfig.framework,
              projectRoot: root,
              codeStyle: {
                stylePattern: figmaConfig.stylePattern,
                scaleFunction: figmaConfig.utils?.scale || 'scale',
                importPrefix: figmaConfig.importPrefix,
              },
              theme: {
                // Use first token file as theme location
                location: `${root}/${figmaConfig.tokenFiles[0]}`,
                type: 'object-export',
                // Use first token file for main theme as well
                mainThemeLocation: `${root}/${figmaConfig.tokenFiles[0]}`,
              },
              // Mappings will be generated on-the-fly in code-generator-v2.ts
              mappings: {},
            } : {
              framework: figmaConfig.framework,
              codeStyle: {
                stylePattern: figmaConfig.stylePattern,
                scaleFunction: figmaConfig.utils?.scale || 'scale',
                importPrefix: figmaConfig.importPrefix,
              },
              // Mappings will be generated on-the-fly in code-generator-v2.ts
              mappings: {},
            },
          }
        );

        // Combine all code into one file
        const mainFile = result.files.find(f => f.type === 'screen') || result.files[0];
        const typesFile = result.files.find(f => f.type === 'types');
        const hooksFile = result.files.find(f => f.type === 'hooks');

        // Combine code
        let combinedCode = '';
        if (typesFile) {
          combinedCode += `// ============================================================================\n`;
          combinedCode += `// Types\n`;
          combinedCode += `// ============================================================================\n\n`;
          combinedCode += typesFile.content + '\n\n';
        }
        if (hooksFile) {
          combinedCode += `// ============================================================================\n`;
          combinedCode += `// Hooks\n`;
          combinedCode += `// ============================================================================\n\n`;
          combinedCode += hooksFile.content + '\n\n';
        }
        combinedCode += `// ============================================================================\n`;
        combinedCode += `// Component\n`;
        combinedCode += `// ============================================================================\n\n`;
        combinedCode += mainFile?.content || '';

        // Determine exports and dependencies
        const exports = [screenName, `${screenName}Props`];
        if (typesFile) {
          // Extract type names from types file
          const typeMatches = typesFile.content.match(/export\s+(?:interface|type)\s+(\w+)/g);
          if (typeMatches) {
            typeMatches.forEach(m => {
              const name = m.replace(/export\s+(?:interface|type)\s+/, '');
              if (!exports.includes(name)) exports.push(name);
            });
          }
        }

        const dependencies = result.summary.componentMatches || [];

        // Extract design tokens
        const urlMatch = figmaUrl.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+).*node-id=([^&]+)/);
        let designTokens: DesignTokens | undefined;
        if (urlMatch) {
          const [, fileKey, rawNodeId] = urlMatch;
          const nodeId = decodeURIComponent(rawNodeId).replace('-', ':');
          try {
            const response = await fetchFigmaNodes(FIGMA_TOKEN, fileKey, [nodeId]);
            const node = response.nodes[nodeId]?.document;
            if (node) {
              const manifest = await getOrCreateManifest(root);
              const scaleFunc = manifest.config.scaleFunction || 'scale';
              designTokens = extractDesignTokens(node, figmaUrl, scaleFunc);
              console.error(`   🎨 Extracted ${designTokens.colors.length} colors, ${designTokens.typography.length} typography styles`);
            }
          } catch (error) {
            console.error('   ⚠️ Could not extract design tokens:', error);
          }
        }

        // ═══════════════════════════════════════════════════════════════
        // Color mappings are generated on-the-fly in code-generator-v2.ts
        // DON'T save them to config.json - they are regenerated every time
        // ═══════════════════════════════════════════════════════════════

        // Convert images to AssetInfo
        const assets: AssetInfo[] = (result.images || []).map(img => ({
          filename: img.suggestedFilename,
          type: img.category,
          nodeId: img.nodeId,
          componentId: img.componentId,
          figmaName: img.nodeName,
          format: img.format,
          dimensions: img.dimensions,
        }));

        // Write file to .figma/
        const genResult = await registerGeneration(
          root,
          figmaUrl,
          category,
          screenName,
          combinedCode,
          {
            exports,
            dependencies,
            patterns: {
              hasList: result.detections.list !== null,
              hasForm: result.detections.form?.fields?.length > 0,
              hasFloatingFooter: false, // TODO: detect from analysis
            },
            assets,
            screenshotPath: result.screenshotPath,
            tokens: designTokens,
            // New metadata fields
            figmaName: result.screenName, // Name from Figma
            hierarchy: result.hierarchy,
            hiddenNodes: result.hiddenNodes,
            totalNodes: result.totalNodes,
            instanceCount: result.instanceCount,
            interactions: result.interactions,
            componentGroups: result.componentGroups,
          }
        );

        // Assets already saved directly to local folder
        console.error(`   📦 Assets saved directly to: ${outputFolder}/assets/`);

        // Format response (metadata, not code)
        let response = `# 🎯 Generated: ${screenName}\n\n`;

        // Main info
        response += formatResultForLLM(genResult, root);

        // Generation details
        response += `\n## Generation Details\n\n`;
        response += `| Property | Value |\n`;
        response += `|----------|-------|\n`;
        response += `| **Screen Type** | ${result.summary.screenType} |\n`;
        response += `| **Has Data Models** | ${result.summary.hasDataModels ? '✅' : '❌'} |\n`;
        response += `| **Has Animations** | ${result.summary.hasAnimations ? '✅' : '❌'} |\n`;
        response += `\n`;

        // Detected patterns
        response += `## Detected Patterns\n\n`;
        const d = result.detections;
        if (d.list) response += `- **List**: ${d.list.type} (${d.list.itemCount} items)\n`;
        if (d.form && d.form.fields.length > 0) response += `- **Form**: ${d.form.fields.length} fields\n`;
        if (d.sheet && d.sheet.type !== 'none') response += `- **Sheet/Modal**: ${d.sheet.type}\n`;
        if (d.dataModels.length > 0) response += `- **Data Models**: ${d.dataModels.map(m => m.name).join(', ')}\n`;
        response += `\n`;

        // Design tokens
        if (designTokens) {
          response += formatTokensForLLM(designTokens);
        }

        // Images
        if (result.images && result.images.length > 0) {
          response += `## 🖼️ Images (${result.images.length})\n\n`;
          for (const img of result.images) {
            const downloaded = img.downloadedPath ? `✅` : '❌';
            response += `- ${downloaded} \`${img.nodeName}\` → \`${img.suggestedPath}\`\n`;
          }
          response += `\n`;
        }

        // Screenshot
        if (genResult.screenshotPath) {
          response += `## 📸 Screenshot\n\n`;
          response += `\`{PROJECT_ROOT}/${genResult.screenshotPath}\`\n\n`;
        }

        // ═══════════════════════════════════════════════════════════════
        // Review Checklist for code validation
        // ═══════════════════════════════════════════════════════════════
        response += `## 📋 Review Checklist\n\n`;
        response += `Compare screenshot with generated code:\n\n`;
        response += `| Visual Element | Type | Status |\n`;
        response += `|----------------|------|--------|\n`;

        // Images and icons
        if (result.images && result.images.length > 0) {
          for (const img of result.images) {
            const status = img.downloadedPath ? '✅ Extracted' : '❌ Missing';
            const type = img.category === 'icon' ? 'icon' : 'image';
            response += `| ${img.nodeName} | ${type} | ${status} |\n`;
          }
        }

        // Form fields
        if (d.form && d.form.fields.length > 0) {
          for (const field of d.form.fields) {
            response += `| ${field.label || field.name} | form-field (${field.type}) | ✅ Detected |\n`;
          }
        }

        // List items
        if (d.list && d.list.itemCount > 0) {
          response += `| List items | list-pattern (${d.list.type}) | ✅ Detected (${d.list.itemCount} items) |\n`;
        }

        // Data models
        if (d.dataModels && d.dataModels.length > 0) {
          for (const model of d.dataModels) {
            response += `| ${model.name} data model | data-structure | ✅ Generated |\n`;
          }
        }

        response += `\n`;
        response += `### Files to Compare\n`;
        response += `- **Screenshot:** \`{PROJECT_ROOT}/${genResult.screenshotPath || 'N/A'}\`\n`;
        response += `- **Code:** \`{PROJECT_ROOT}/${genResult.indexPath}\`\n\n`;
        response += `Use Read tool on screenshot to visually verify the generated code matches the design.\n\n`;

        response += `---\n\n`;
        response += `**Code written to**: \`{PROJECT_ROOT}/${genResult.indexPath}\`\n\n`;
        response += `**Folder**: \`{PROJECT_ROOT}/${genResult.folder}\`\n\n`;
        response += `**To use**: \`${genResult.copyCommand}\`\n`;

        return {
          content: [{ type: 'text', text: response }],
        };
      }
      */

      // ═══════════════════════════════════════════════════════════════
      // TOOL 3: generate_flow
      // ═══════════════════════════════════════════════════════════════
      /*
      // ═══════════════════════════════════════════════════════════════
      // TOOL 2: generate_flow
      // ═══════════════════════════════════════════════════════════════
      case 'generate_flow': {
        const { screens, options = {} } = args as {
          screens: Array<{ figmaUrl: string; screenName: string }>;
          options?: {
            generateNavigation?: boolean;
            generateSharedTypes?: boolean;
            generateIndex?: boolean;
          };
        };

        console.error(`\n🚀 [FLOW] Generating ${screens.length} screens...`);
        screens.forEach((s) => console.error(`   - ${s.screenName}`));

        const result = await generateCompleteFlow(
          FIGMA_TOKEN,
          screens,
          {
            generateNavigation: options.generateNavigation ?? true,
            generateSharedTypes: options.generateSharedTypes ?? true,
            generateIndex: options.generateIndex ?? true,
          }
        );

        // Format response
        let response = `# 🚀 FLOW Generation Complete\n\n`;

        response += `## Summary\n\n`;
        response += `| Metric | Value |\n`;
        response += `|--------|-------|\n`;
        response += `| **Total Screens** | ${result.summary.total} |\n`;
        response += `| **Successful** | ✅ ${result.summary.successful} |\n`;
        response += `| **Failed** | ${result.summary.failed > 0 ? '❌ ' : ''}${result.summary.failed} |\n`;
        response += `| **Duration** | ${result.summary.duration}ms |\n`;
        response += `\n`;

        // Show screen types
        if (Object.keys(result.summary.screenTypes).length > 0) {
          response += `### Screen Types\n\n`;
          for (const [type, count] of Object.entries(result.summary.screenTypes)) {
            response += `- **${type}**: ${count}\n`;
          }
          response += `\n`;
        }

        // Show each screen
        response += `## Generated Screens\n\n`;
        for (const screen of result.screens) {
          response += `### ${screen.status === 'success' ? '✅' : '❌'} ${screen.screenName}\n\n`;

          if (screen.status === 'error') {
            response += `**Error**: ${screen.error}\n\n`;
            continue;
          }

          response += `**Files** (${screen.files.length}):\n`;
          for (const file of screen.files) {
            response += `- \`{PROJECT_ROOT}/${file.path}\` (${file.type})\n`;
          }
          response += `\n`;

          // Show first file code (main component)
          if (screen.files.length > 0) {
            const mainFile = screen.files[0];
            response += `**{PROJECT_ROOT}/${mainFile.path}**:\n\n`;
            response += `\`\`\`typescript\n${mainFile.content.slice(0, 2000)}${mainFile.content.length > 2000 ? '\n// ... (truncated)' : ''}\n\`\`\`\n\n`;
          }
        }

        // Show navigation types
        if (result.navigation.types) {
          response += `## Navigation Types\n\n`;
          response += `\`\`\`typescript\n${result.navigation.types}\n\`\`\`\n\n`;
        }

        // Show navigator
        if (result.navigation.navigator) {
          response += `## Navigator Component\n\n`;
          response += `\`\`\`typescript\n${result.navigation.navigator}\n\`\`\`\n\n`;
        }

        // Show shared types
        if (result.sharedTypes) {
          response += `## Shared Types\n\n`;
          response += `\`\`\`typescript\n${result.sharedTypes}\n\`\`\`\n\n`;
        }

        // Show index file
        if (result.indexFile) {
          response += `## Index File (Barrel Export)\n\n`;
          response += `\`\`\`typescript\n${result.indexFile}\n\`\`\`\n\n`;
        }

        response += `---\n\n`;
        response += `✅ **Complete app flow ready!** Copy files to your project.\n`;

        return {
          content: [{ type: 'text', text: response }],
        };
      }
      */

      // setup_project removed - config is now auto-detected on first use

      // ═══════════════════════════════════════════════════════════════
      // TOOL 3: get_screen (clean architecture pipeline)
      // ═══════════════════════════════════════════════════════════════
      case 'get_screen': {
        const {
          figmaUrl,
          componentName,
          themeFilePath,
          outputDir,
          projectRoot,
          category,
          suppressTodos,
          scaleFunction,
        } = args as {
          figmaUrl: string;
          componentName?: string;
          themeFilePath?: string;
          outputDir?: string;
          projectRoot?: string;
          category?: string;
          suppressTodos?: boolean;
          scaleFunction?: string;
        };

        if (FIGMA_TOKEN_ERROR) {
          return {
            content: [{
              type: 'text',
              text:
                `Error: ${FIGMA_TOKEN_ERROR}\n` +
                'Set FIGMA_TOKEN in MCP server activation settings and retry.',
            }],
            isError: true,
          };
        }

        console.error(`\n🎯 [GET_SCREEN] Processing ${figmaUrl}...`);

        const result = await executeGetScreen(
          {
            figmaUrl,
            componentName,
            themeFilePath,
            outputDir,
            projectRoot,
            category,
            suppressTodos,
            scaleFunction,
          },
          FIGMA_TOKEN
        );

        const content = formatGetScreenResponse(result);

        return {
          content,
          isError: !result.success,
        };
      }

      default:
        return {
          content: [{
            type: 'text',
            text: `Unknown tool: ${name}\n\nAvailable tools:\n- generate_screen\n- generate_flow\n- get_screen`,
          }],
          isError: true,
        };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Tool error:', errorMessage);

    return {
      content: [{
        type: 'text',
        text: `Error: ${errorMessage}`,
      }],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('');
  console.error('═══════════════════════════════════════════════════════════════════');
  console.error('🎯 Marafet Figma MCP Server v11.0 - ONE URL = ONE FOLDER');
  console.error('═══════════════════════════════════════════════════════════════════');
  console.error('');
  console.error('  Just 3 tools. Zero setup required.');
  console.error('');
  console.error('  🔍 analyze_element   Smart detection of any Figma element');
  console.error('                       Returns: type, confidence, next step');
  console.error('');
  console.error('  📱 generate_screen   Figma URL → .figma/{type}/{name}/');
  console.error('                       One folder: index.tsx + assets/ + screenshot');
  console.error('                       Extracts: colors, typography, gradients');
  console.error('');
  console.error('  🚀 generate_flow     Multiple URLs → Complete app flow');
  console.error('                       Parallel generation + navigation');
  console.error('');
  console.error('  📁 Structure: .figma/{type}/{name}/');
  console.error('     ├── index.tsx      Component code');
  console.error('     ├── meta.json      Metadata + exports');
  console.error('     ├── screenshot.png Visual reference');
  console.error('     └── assets/        Icons + images');
  console.error('');
  console.error('  🎨 Design tokens saved to .figma/theme.json');
  console.error('  🔄 Same URL = replaces existing (designers may update)');
  console.error('');
  console.error('═══════════════════════════════════════════════════════════════════');
  console.error('');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
