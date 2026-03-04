import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createMCPClient, MCPClient } from '../helpers/mcp-client';
import { createTempWorkspace, TempWorkspace } from '../helpers/temp-workspace';
import { requireFigmaToken } from '../fixtures/test-figma-urls';

// Live Figma API debug test (opt-in): set RUN_FIGMA_E2E=1
const LIVE_FIGMA_URL = process.env.FIGMA_E2E_URL;
const RUN_LIVE_FIGMA_E2E =
  process.env.RUN_FIGMA_E2E === '1' &&
  process.env.RUN_FIGMA_DEBUG === '1' &&
  !!LIVE_FIGMA_URL;

if (!RUN_LIVE_FIGMA_E2E) {
  describe('get_screen tool debug (live figma)', () => {
    it('is disabled by default (set RUN_FIGMA_E2E=1, RUN_FIGMA_DEBUG=1, FIGMA_E2E_URL)', () => {
      expect(RUN_LIVE_FIGMA_E2E).toBe(false);
    });
  });
} else {
  describe('get_screen tool debug', () => {
    let client: MCPClient;
    let figmaToken: string;
    let workspace: TempWorkspace;

    beforeAll(async () => {
      figmaToken = requireFigmaToken();
      client = await createMCPClient(figmaToken);
    });

    afterAll(async () => {
      await client.stop();
    });

    it('should execute get_screen successfully', async () => {
      workspace = await createTempWorkspace();

      try {
        console.log('Running get_screen for:', LIVE_FIGMA_URL);
        console.log('Project root:', workspace.root);

        const result = await client.callTool('get_screen', {
          figmaUrl: LIVE_FIGMA_URL!,
          componentName: 'DebugScreen',
          projectRoot: workspace.root,
        });

        console.log('Result success:', !result.isError);

        if (result.isError) {
          console.error('get_screen error:', JSON.stringify(result.content, null, 2));
        } else {
          console.log('Generated content length:', result.content.length);
          const codeBlock = result.content.find(c => c.type === 'text' && c.text.includes('```tsx'));
          if (codeBlock) {
            console.log('Code generated successfully');
          } else {
            console.warn('No code block found in response');
          }
        }

        expect(result.isError).toBe(false);
      } catch (error) {
        console.error('Test threw error:', error);
        throw error;
      } finally {
        await workspace.cleanup();
      }
    });
  });
}
