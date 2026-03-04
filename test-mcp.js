#!/usr/bin/env node
/**
 * Test the figma-rn MCP server via official SDK client.
 *
 * Usage:
 *   FIGMA_TOKEN=... node test-mcp.js
 *
 * Optional:
 *   FIGMA_TEST_URL=<figma-url-with-node-id>
 *   FIGMA_TEST_PROJECT_ROOT=/abs/path/to/project
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const FIGMA_TOKEN = process.env.FIGMA_TOKEN;
if (!FIGMA_TOKEN) {
  console.error('Error: FIGMA_TOKEN is required');
  process.exit(1);
}

const FIGMA_TEST_URL =
  process.env.FIGMA_TEST_URL ||
  'https://www.figma.com/design/wQQDVitfu2TuNuAXWOXRB1/MARAFET--Copy-?node-id=2453-67667&m=dev';
const FIGMA_TEST_PROJECT_ROOT =
  process.env.FIGMA_TEST_PROJECT_ROOT || process.cwd();

async function main() {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/index.js'],
    cwd: process.cwd(),
    env: {
      FIGMA_TOKEN,
    },
    stderr: 'pipe',
  });

  if (transport.stderr) {
    transport.stderr.on('data', (chunk) => {
      process.stderr.write(`[server] ${chunk.toString()}`);
    });
  }

  const client = new Client({ name: 'figma-rn-test-client', version: '1.0.0' });

  try {
    await client.connect(transport);
    const tools = await client.listTools();
    console.log('Available tools:', tools.tools.map((tool) => tool.name).join(', '));

    const result = await client.callTool({
      name: 'get_screen',
      arguments: {
        figmaUrl: FIGMA_TEST_URL,
        componentName: 'TransportHealthcheck',
        category: 'screens',
        projectRoot: FIGMA_TEST_PROJECT_ROOT,
      },
    });

    const contentTypes = (result.content || []).map((item) => item.type);
    console.log('Tool call result:', {
      isError: !!result.isError,
      contentTypes,
    });
  } catch (error) {
    console.error('MCP healthcheck failed:', error);
    process.exitCode = 1;
  } finally {
    try {
      await client.close();
    } catch {
      // no-op
    }
  }
}

main();
