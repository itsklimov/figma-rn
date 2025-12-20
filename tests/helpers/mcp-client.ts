/**
 * MCP Client for e2e testing
 * JSON-RPC client for interacting with MCP server via stdio
 */

import { spawn, ChildProcess } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ES Module compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface MCPRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface MCPToolResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

export interface GenerateScreenParams {
  figmaUrl: string;
  screenName?: string;
  projectRoot?: string;
  options?: {
    generateTypes?: boolean;
    generateHooks?: boolean;
    detectAnimations?: boolean;
  };
}

export interface GenerateFlowParams {
  screens: Array<{
    figmaUrl: string;
    screenName: string;
  }>;
  options?: {
    generateNavigation?: boolean;
    generateSharedTypes?: boolean;
    generateIndex?: boolean;
  };
}

export class MCPClient {
  private process: ChildProcess | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number, {
    resolve: (value: MCPResponse) => void;
    reject: (error: Error) => void;
  }>();
  private buffer = '';
  private serverReady = false;

  /**
   * Starts MCP server and waits for readiness
   */
  async start(figmaToken: string): Promise<void> {
    const serverPath = join(__dirname, '../../dist/index.js');

    this.process = spawn('node', [serverPath], {
      env: {
        ...process.env,
        FIGMA_TOKEN: figmaToken,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (!this.process.stdout || !this.process.stdin) {
      throw new Error('Failed to create stdio pipes');
    }

    // Process stdout (JSON-RPC responses)
    this.process.stdout.on('data', (data: Buffer) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    // Log stderr (server debug information)
    this.process.stderr?.on('data', (data: Buffer) => {
      const message = data.toString();
      // Detect server readiness from stderr messages
      if (message.includes('Marafet Figma MCP Server')) {
        this.serverReady = true;
      }
      // For debugging, uncomment:
      // console.error('[MCP Server]', message);
    });

    this.process.on('error', (error) => {
      console.error('MCP process error:', error);
    });

    this.process.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`MCP process exited with code ${code}`);
      }
    });

    // Wait for server readiness
    await this.waitForReady(10000);
  }

  /**
   * Waits for server readiness
   */
  private waitForReady(timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const check = () => {
        if (this.serverReady) {
          resolve();
          return;
        }

        if (Date.now() - startTime > timeout) {
          reject(new Error('MCP server startup timeout'));
          return;
        }

        setTimeout(check, 100);
      };

      check();
    });
  }

  /**
   * Processes buffer and extracts JSON-RPC responses
   */
  private processBuffer(): void {
    // JSON-RPC messages are separated by newline
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const response: MCPResponse = JSON.parse(line);
        const pending = this.pendingRequests.get(response.id);
        if (pending) {
          this.pendingRequests.delete(response.id);
          pending.resolve(response);
        }
      } catch (error) {
        // Ignore non-JSON output (may be debug information)
      }
    }
  }

  /**
   * Sends JSON-RPC request and waits for response
   */
  private async sendRequest(method: string, params?: Record<string, unknown>): Promise<MCPResponse> {
    if (!this.process?.stdin) {
      throw new Error('MCP server not started');
    }

    const id = ++this.requestId;
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      const requestStr = JSON.stringify(request) + '\n';
      this.process!.stdin!.write(requestStr, (error) => {
        if (error) {
          this.pendingRequests.delete(id);
          reject(error);
        }
      });

      // 60 second timeout (API calls can be slow)
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 60000);
    });
  }

  /**
   * Gets list of available tools
   */
  async listTools(): Promise<Array<{ name: string; description: string }>> {
    const response = await this.sendRequest('tools/list');

    if (response.error) {
      throw new Error(response.error.message);
    }

    const result = response.result as { tools: Array<{ name: string; description: string }> };
    return result.tools;
  }

  /**
   * Calls generate_screen tool
   */
  async generateScreen(params: GenerateScreenParams): Promise<MCPToolResult> {
    const response = await this.sendRequest('tools/call', {
      name: 'generate_screen',
      arguments: params,
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.result as MCPToolResult;
  }

  /**
   * Calls generate_flow tool
   */
  async generateFlow(params: GenerateFlowParams): Promise<MCPToolResult> {
    const response = await this.sendRequest('tools/call', {
      name: 'generate_flow',
      arguments: params,
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.result as MCPToolResult;
  }

  /**
   * Calls a generic tool
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    const response = await this.sendRequest('tools/call', {
      name,
      arguments: args,
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.result as MCPToolResult;
  }

  /**
   * Stops MCP server
   */
  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill('SIGTERM');

      // Wait for process to finish
      await new Promise<void>((resolve) => {
        if (!this.process) {
          resolve();
          return;
        }

        const timeout = setTimeout(() => {
          this.process?.kill('SIGKILL');
          resolve();
        }, 5000);

        this.process.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      this.process = null;
    }

    // Clear pending requests
    for (const [id, { reject }] of this.pendingRequests) {
      reject(new Error('MCP server stopped'));
    }
    this.pendingRequests.clear();
  }
}

/**
 * Creates and starts MCP client
 */
export async function createMCPClient(figmaToken: string): Promise<MCPClient> {
  const client = new MCPClient();
  await client.start(figmaToken);
  return client;
}
