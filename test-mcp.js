#!/usr/bin/env node
/**
 * Test the figma-rn MCP server
 */

import { spawn } from 'child_process';

// Start the MCP server
const server = spawn('node', ['dist/index.js'], {
  env: {
    ...process.env,
    FIGMA_TOKEN: process.env.FIGMA_TOKEN,
  },
  stdio: ['pipe', 'pipe', 'inherit'],
});

// Test 1: List tools
console.log('Test 1: Listing tools...\n');
const listToolsRequest = {
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/list',
};

server.stdin.write(JSON.stringify(listToolsRequest) + '\n');

// Test 2: Generate component
setTimeout(() => {
  console.log('\nTest 2: Generating component...\n');
  const generateRequest = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'generate_component',
      arguments: {
        figmaUrl: 'https://www.figma.com/design/YOUR_FILE_ID?node-id=123-456',
        componentName: 'TestMCP',
        outputPath: 'test-mcp-output',
      },
    },
  };

  server.stdin.write(JSON.stringify(generateRequest) + '\n');
}, 1000);

// Handle responses
let buffer = '';
server.stdout.on('data', (data) => {
  buffer += data.toString();

  // Try to parse JSON-RPC responses
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';

  for (const line of lines) {
    if (line.trim()) {
      try {
        const response = JSON.parse(line);
        console.log('\nReceived response:', JSON.stringify(response, null, 2));
      } catch (e) {
        console.log('Raw output:', line);
      }
    }
  }
});

// Exit after 30 seconds
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
