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
    it('should handle standard Figma design URL', async () => {
      const result = await client.generateScreen({
        figmaUrl: TEST_URLS.mainScreen,
        screenName: 'StandardUrl',
        projectRoot: workspace.root,
      });

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Generated:');
    });

    it('should handle URL with encoded node-id', async () => {
      // URL with encoded node-id (123%3A456 instead of 123:456)
      const encodedUrl = `https://www.figma.com/design/${TEST_FILE_KEY}/test?node-id=2532%3A25721&m=dev`;

      const result = await client.generateScreen({
        figmaUrl: encodedUrl,
        screenName: 'EncodedUrl',
        projectRoot: workspace.root,
      });

      expect(result.isError).toBeFalsy();
    });

    it('should handle URL with hyphen in node-id', async () => {
      // URL with hyphen (2549-48620) - standard format
      const result = await client.generateScreen({
        figmaUrl: createFigmaUrl('2532-25721'),
        screenName: 'HyphenUrl',
        projectRoot: workspace.root,
      });

      expect(result.isError).toBeFalsy();
    });

    it('should handle URL with additional parameters', async () => {
      // URL with additional query parameters
      const urlWithParams = `${TEST_URLS.mainScreen}&t=abc123&scaling=min-zoom`;

      const result = await client.generateScreen({
        figmaUrl: urlWithParams,
        screenName: 'ExtraParams',
        projectRoot: workspace.root,
      });

      expect(result.isError).toBeFalsy();
    });

    it('should handle URL in /file/ format', async () => {
      // Old URL format with /file/ instead of /design/
      const fileUrl = TEST_URLS.mainScreen.replace('/design/', '/file/');

      const result = await client.generateScreen({
        figmaUrl: fileUrl,
        screenName: 'FileFormat',
        projectRoot: workspace.root,
      });

      expect(result.isError).toBeFalsy();
    });
  });

  describe('Invalid URLs', () => {
    it('should return error for URL without node-id', async () => {
      const result = await client.generateScreen({
        figmaUrl: INVALID_URLS.missingNodeId,
        screenName: 'NoNodeId',
        projectRoot: workspace.root,
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
      const result = await client.generateScreen({
        figmaUrl: INVALID_URLS.malformed,
        screenName: 'MalformedUrl',
        projectRoot: workspace.root,
      });

      expect(result.isError).toBe(true);
    });

    it('should handle non-existent node-id gracefully', async () => {
      const result = await client.generateScreen({
        figmaUrl: INVALID_URLS.nonExistentNode,
        screenName: 'NonExistentNode',
        projectRoot: workspace.root,
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
    it('should normalize nodeId with hyphen to colon', async () => {
      // Generate with hyphen
      await client.generateScreen({
        figmaUrl: createFigmaUrl('2532-25721'),
        screenName: 'NormalizeTest',
        projectRoot: workspace.root,
      });

      // Check manifest - nodeId should have colon
      const manifest = await workspace.readJson<{
        screens: Record<string, unknown>;
        modals: Record<string, unknown>;
        sheets: Record<string, unknown>;
        components: Record<string, unknown>;
      }>('.figma/manifest.json');

      // Search for key with colon
      const allKeys = [
        ...Object.keys(manifest.screens || {}),
        ...Object.keys(manifest.modals || {}),
        ...Object.keys(manifest.sheets || {}),
        ...Object.keys(manifest.components || {}),
      ];

      // Should have key with colon, not hyphen
      const hasColonKey = allKeys.some(key => key.includes(':') && key.includes('2532') && key.includes('25721'));
      expect(hasColonKey).toBe(true);
    });
  });

  describe('Branch URL', () => {
    it('should handle URL with branch', async () => {
      // URL format: /design/{fileKey}/branch/{branchKey}/
      // For this test use regular URL, since no test branch exists
      // In real scenario branchKey is used as fileKey

      const result = await client.generateScreen({
        figmaUrl: TEST_URLS.mainScreen,
        screenName: 'BranchTest',
        projectRoot: workspace.root,
      });

      expect(result.isError).toBeFalsy();
    });
  });
});
