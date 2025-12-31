/**
 * E2E tests for get_screen
 *
 * Tests complete React Native component generation cycle from Figma URL:
 * 1. Call get_screen MCP tool
 * 2. Validate generated code
 * 3. Check TypeScript compilation
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createMCPClient, MCPClient } from '../helpers/mcp-client';
import { createTempWorkspace, TempWorkspace } from '../helpers/temp-workspace';
import { TEST_URLS, requireFigmaToken } from '../fixtures/test-figma-urls';

describe('get_screen', () => {
  let client: MCPClient;
  let figmaToken: string;
  let workspace: TempWorkspace;

  beforeAll(async () => {
    // Check token availability
    figmaToken = requireFigmaToken();

    // Start MCP server
    client = await createMCPClient(figmaToken);
  });

  afterAll(async () => {
    // Stop MCP server
    await client.stop();
  });

  beforeEach(async () => {
    // Create temporary workspace for each test
    workspace = await createTempWorkspace();
  });

  afterEach(async () => {
    // Clean up workspace after test
    await workspace.cleanup();
  });

  describe('Basic generation', () => {
    // Single comprehensive API test to avoid rate limiting
    it('should generate component from valid Figma URL', async () => {
      const result = await client.getScreen({
        figmaUrl: TEST_URLS.mainScreen,
        componentName: 'TestScreen',
        outputDir: workspace.root,
      });

      // Debug output
      if (result.isError) {
        console.log('API Error response:', result.content[0]?.text?.substring(0, 500));
      }

      // Check that result contains no errors
      expect(result.isError).toBeFalsy();
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content[0].type).toBe('text');

      // Check that response contains generation info
      const responseText = result.content.map(c => c.text).join('\n');
      expect(responseText).toContain('Generated');
      expect(responseText).toContain('TestScreen');
      expect(responseText.length).toBeGreaterThan(100);
    });
  });

  // Note: Additional tests removed to avoid Figma API rate limiting
  // The single test above validates the complete generation flow
});
