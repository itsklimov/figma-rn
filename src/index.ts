#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import {
  getScreenTool,
  executeGetScreen,
  formatGetScreenResponse,
} from './edge/tools/index.js';

const SERVER_NAME = 'react-native-figma-generator';
const SERVER_VERSION = '12.0.0';
const FIGMA_TOKEN = process.env.FIGMA_TOKEN || '';

function validateFigmaToken(token: string): void {
  if (!token) {
    console.error('Error: FIGMA_TOKEN environment variable is required');
    console.error('Get your token from: https://www.figma.com/developers/api#access-tokens');
    process.exit(1);
  }

  if (token.length < 20 || !/^[a-zA-Z0-9_-]+$/.test(token)) {
    console.error('Error: FIGMA_TOKEN appears to be invalid');
    console.error('Expected format: 40+ alphanumeric characters (e.g., figd_xxxx...)');
    console.error('Get your token from: https://www.figma.com/developers/api#access-tokens');
    process.exit(1);
  }
}

validateFigmaToken(FIGMA_TOKEN);

const server = new Server(
  {
    name: SERVER_NAME,
    version: SERVER_VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const tools: Tool[] = [getScreenTool];

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name !== 'get_screen') {
      return {
        content: [
          {
            type: 'text',
            text: `Unknown tool: ${name}\n\nAvailable tools:\n- get_screen`,
          },
        ],
        isError: true,
      };
    }

    const {
      figmaUrl,
      componentName,
      themeFilePath,
      outputDir,
      projectRoot,
      category,
      suppressTodos,
      scaleFunction,
    } = (args ?? {}) as {
      figmaUrl: string;
      componentName?: string;
      themeFilePath?: string;
      outputDir?: string;
      projectRoot?: string;
      category?: string;
      suppressTodos?: boolean;
      scaleFunction?: string;
    };

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

    return {
      content: formatGetScreenResponse(result),
      isError: !result.success,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Tool error:', errorMessage);

    return {
      content: [{ type: 'text', text: `Error: ${errorMessage}` }],
      isError: true,
    };
  }
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('');
  console.error('═══════════════════════════════════════════════════════════════════');
  console.error(`🎯 ${SERVER_NAME} v${SERVER_VERSION}`);
  console.error('═══════════════════════════════════════════════════════════════════');
  console.error('');
  console.error('  Available tools:');
  console.error('  • get_screen  Figma URL -> .figma/{category}/{name}/');
  console.error('');
  console.error('  Output folder structure:');
  console.error('  .figma/{category}/{name}/');
  console.error('    ├── index.tsx');
  console.error('    ├── meta.json');
  console.error('    ├── screenshot.png');
  console.error('    └── assets/');
  console.error('');
  console.error('═══════════════════════════════════════════════════════════════════');
  console.error('');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
