import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createMCPClient, MCPClient } from '../helpers/mcp-client';
import { createTempWorkspace, TempWorkspace } from '../helpers/temp-workspace';
import { requireFigmaToken, TEST_URLS } from '../fixtures/test-figma-urls';

const RUN_LIVE = process.env.FIGMA_LIVE_TESTS === '1';
const describeLive = RUN_LIVE ? describe : describe.skip;

describeLive('get_screen tool debug', () => {
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
      console.log('Running get_screen for:', TEST_URLS.complexLaunchScreen);
      console.log('Project root:', workspace.root);
      
      const result = await client.callTool('get_screen', {
        figmaUrl: TEST_URLS.complexLaunchScreen,
        componentName: 'ComplexLaunchScreen',
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
      expect(result.content.some((part) => part.type === 'image')).toBe(true);
      const text = result.content
        .filter((part): part is Extract<typeof part, { type: 'text' }> => part.type === 'text')
        .map((part) => part.text)
        .join('\n');
      expect(text).toContain('```tsx');
      expect(text).toContain('```json');
      expect(workspace.exists('.figma/screens/ComplexLaunchScreen/index.tsx')).toBe(true);
      expect(workspace.exists('.figma/screens/ComplexLaunchScreen/screenshot.png')).toBe(true);
    } catch (error) {
      console.error('Test threw error:', error);
      throw error;
    } finally {
      await workspace.cleanup();
    }
  });
});
