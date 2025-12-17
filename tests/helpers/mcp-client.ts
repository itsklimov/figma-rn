/**
 * MCP Client для e2e тестирования
 * JSON-RPC клиент для взаимодействия с MCP сервером через stdio
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
   * Запускает MCP сервер и ожидает его готовности
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

    // Обрабатываем stdout (JSON-RPC ответы)
    this.process.stdout.on('data', (data: Buffer) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    // Логируем stderr (отладочная информация сервера)
    this.process.stderr?.on('data', (data: Buffer) => {
      const message = data.toString();
      // Детектируем готовность сервера по сообщениям в stderr
      if (message.includes('Marafet Figma MCP Server')) {
        this.serverReady = true;
      }
      // Для отладки можно раскомментировать:
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

    // Ждём готовности сервера
    await this.waitForReady(10000);
  }

  /**
   * Ожидает готовности сервера
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
   * Обрабатывает буфер и извлекает JSON-RPC ответы
   */
  private processBuffer(): void {
    // JSON-RPC сообщения разделены переносом строки
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
        // Игнорируем не-JSON вывод (может быть отладочная информация)
      }
    }
  }

  /**
   * Отправляет JSON-RPC запрос и ожидает ответ
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

      // Таймаут 60 секунд (API вызовы могут быть медленными)
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 60000);
    });
  }

  /**
   * Получает список доступных инструментов
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
   * Вызывает инструмент generate_screen
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
   * Вызывает инструмент generate_flow
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
   * Останавливает MCP сервер
   */
  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill('SIGTERM');

      // Ждём завершения процесса
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

    // Очищаем pending requests
    for (const [id, { reject }] of this.pendingRequests) {
      reject(new Error('MCP server stopped'));
    }
    this.pendingRequests.clear();
  }
}

/**
 * Создаёт и запускает MCP клиент
 */
export async function createMCPClient(figmaToken: string): Promise<MCPClient> {
  const client = new MCPClient();
  await client.start(figmaToken);
  return client;
}
