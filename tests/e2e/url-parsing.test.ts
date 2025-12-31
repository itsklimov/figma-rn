/**
 * E2E tests for URL parsing
 *
 * Tests handling of various Figma URL formats and error handling
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createMCPClient, MCPClient } from '../helpers/mcp-client';
import { createTempWorkspace, TempWorkspace } from '../helpers/temp-workspace';
import {
  TEST_URLS,
  INVALID_URLS,
  requireFigmaToken,
  extractNodeId,
  extractFileKey,
  isValidFigmaUrl,
  createFigmaUrl,
  TEST_FILE_KEY,
} from '../fixtures/test-figma-urls';

describe('URL Parsing', () => {
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

  beforeEach(async () => {
    workspace = await createTempWorkspace();
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  describe('Valid URL formats', () => {
    // Single API test to verify end-to-end generation works
    // Other URL format validations are done via unit tests below
    it('should handle standard Figma design URL', async () => {
      const result = await client.getScreen({
        figmaUrl: TEST_URLS.mainScreen,
        componentName: 'StandardUrl',
        outputDir: workspace.root,
      });

      expect(result.isError).toBeFalsy();
      const responseText = result.content.map(c => c.text).join('\n');
      expect(responseText).toContain('Generated');
    });
  });

  describe('Invalid URLs', () => {
    it('should return error for URL without node-id', async () => {
      const result = await client.getScreen({
        figmaUrl: INVALID_URLS.missingNodeId,
        componentName: 'NoNodeId',
        outputDir: workspace.root,
      });

      // Expect error or warning
      // Server may handle this differently
      expect(
        result.isError ||
        result.content[0].text.toLowerCase().includes('error') ||
        result.content[0].text.toLowerCase().includes('unknown')
      ).toBe(true);
    });

    it('should return error for malformed URL', async () => {
      const result = await client.getScreen({
        figmaUrl: INVALID_URLS.malformed,
        componentName: 'MalformedUrl',
        outputDir: workspace.root,
      });

      expect(result.isError).toBe(true);
    });

    it('should handle non-existent node-id gracefully', async () => {
      const result = await client.getScreen({
        figmaUrl: INVALID_URLS.nonExistentNode,
        componentName: 'NonExistentNode',
        outputDir: workspace.root,
      });

      // Should be error, but not crash
      expect(
        result.isError ||
        result.content[0].text.toLowerCase().includes('error') ||
        result.content[0].text.toLowerCase().includes('not found')
      ).toBe(true);
    });
  });

  describe('URL Components Extraction', () => {
    it('extractNodeId should correctly extract nodeId', () => {
      // With hyphen
      expect(extractNodeId('https://figma.com/design/abc?node-id=123-456')).toBe('123:456');

      // With colon (encoded)
      expect(extractNodeId('https://figma.com/design/abc?node-id=123%3A456')).toBe('123:456');

      // Without node-id
      expect(extractNodeId('https://figma.com/design/abc')).toBeNull();
    });

    it('extractFileKey should correctly extract fileKey', () => {
      // /design/ format
      expect(extractFileKey('https://figma.com/design/ABC123xyz')).toBe('ABC123xyz');

      // /file/ format
      expect(extractFileKey('https://figma.com/file/ABC123xyz')).toBe('ABC123xyz');

      // With additional parameters
      expect(extractFileKey('https://figma.com/design/ABC123xyz/Name?node-id=1-1')).toBe('ABC123xyz');

      // Invalid URL
      expect(extractFileKey('not-a-url')).toBeNull();
    });

    it('isValidFigmaUrl should correctly validate URL', () => {
      // Valid
      expect(isValidFigmaUrl('https://figma.com/design/abc?node-id=1-1')).toBe(true);
      expect(isValidFigmaUrl('https://www.figma.com/file/abc?node-id=1-1')).toBe(true);

      // Invalid
      expect(isValidFigmaUrl('https://figma.com/design/abc')).toBe(false); // no node-id
      expect(isValidFigmaUrl('https://google.com?node-id=1-1')).toBe(false); // not figma
      expect(isValidFigmaUrl('not-a-url')).toBe(false);
    });
  });

  describe('NodeId normalization', () => {
    it('should normalize nodeId with hyphen to colon format', () => {
      // Test URL parsing normalization (unit test, no API call)
      const urlWithHyphen = createFigmaUrl('2804-44718');
      const nodeId = extractNodeId(urlWithHyphen);

      // extractNodeId should convert hyphen to colon
      expect(nodeId).toBe('2804:44718');
    });
  });

  describe('Branch URL', () => {
    it('should parse branch URL format correctly', () => {
      // URL format: /design/{fileKey}/branch/{branchKey}/
      // This test verifies URL parsing, not API call (no test branch exists)
      const branchUrl = `https://www.figma.com/design/${TEST_FILE_KEY}/branch/abc123?node-id=1-1`;

      expect(isValidFigmaUrl(branchUrl)).toBe(true);
      expect(extractFileKey(branchUrl)).toBe(TEST_FILE_KEY);
      expect(extractNodeId(branchUrl)).toBe('1:1');
    });
  });
});
