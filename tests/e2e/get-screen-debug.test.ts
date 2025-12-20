import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createMCPClient, MCPClient } from '../helpers/mcp-client';
import { createTempWorkspace, TempWorkspace } from '../helpers/temp-workspace';
import { requireFigmaToken, TEST_URLS } from '../fixtures/test-figma-urls';

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
      console.log('Running get_screen for:', TEST_URLS.mainScreen);
      console.log('Project root:', workspace.root);
      
      const result = await client.callTool('get_screen', {
        figmaUrl: TEST_URLS.mainScreen,
        componentName: 'DebugScreen',
        projectRoot: workspace.root,
        writeFiles: true
      });

      console.log('Result success:', !result.isError);
      
      if (result.isError) {
        console.error('get_screen error:', JSON.stringify(result.content, null, 2));
      } else {
        console.log('Generated content length:', result.content.length);
        // Look for code preview
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
