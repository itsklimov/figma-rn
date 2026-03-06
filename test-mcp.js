#!/usr/bin/env node
/**
 * Test the figma-rn MCP server contract.
 */

import { spawn } from 'child_process';

const server = spawn('node', ['dist/index.js'], {
  env: {
    ...process.env,
    FIGMA_TOKEN: process.env.FIGMA_TOKEN,
  },
  stdio: ['pipe', 'pipe', 'inherit'],
});

console.log('Test 1: Listing tools...\n');
const listToolsRequest = {
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/list',
};

server.stdin.write(JSON.stringify(listToolsRequest) + '\n');

setTimeout(() => {
  console.log('\nTest 2: Calling get_screen...\n');
  const getScreenRequest = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'get_screen',
      arguments: {
        figmaUrl: 'https://www.figma.com/design/YOUR_FILE_ID?node-id=123-456',
        componentName: 'TestMCP',
        outputDir: 'test-mcp-output',
      },
    },
  };

  server.stdin.write(JSON.stringify(getScreenRequest) + '\n');
}, 1000);

let buffer = '';
server.stdout.on('data', (data) => {
  buffer += data.toString();

  const lines = buffer.split('\n');
  buffer = lines.pop() || '';

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    try {
      const response = JSON.parse(line);
      console.log('\nReceived response:', JSON.stringify(response, null, 2));
    } catch {
      console.log('Raw output:', line);
    }
  }
});

setTimeout(() => {
  console.log('\nTest complete!');
  server.kill();
  process.exit(0);
}, 30000);

server.on('error', (error) => {
  console.error('Server error:', error);
  process.exit(1);
});

server.on('exit', (code) => {
  console.log(`Server exited with code ${code}`);
  process.exit(code || 0);
});
