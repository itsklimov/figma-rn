/**
 * Deterministic URL parsing tests
 *
 * Tests handling of various Figma URL formats without external API calls
 */

import { describe, it, expect } from 'vitest';
import { resolveComponentName } from '../../src/edge/name-resolver.js';
import type { Manifest } from '../../src/figma-workspace.js';
import {
  TEST_URLS,
  INVALID_URLS,
  extractNodeId,
  extractFileKey,
  isValidFigmaUrl,
  createFigmaUrl,
  TEST_FILE_KEY,
  MAIN_SCREEN_NODE_ID,
} from '../fixtures/test-figma-urls';

function createManifest(): Manifest {
  return {
    version: '3.0.0',
    projectRoot: '/tmp/project',
    config: {
      framework: 'react-native',
      stylePattern: 'StyleSheet',
      importPrefix: '@app',
    },
    screens: {},
    modals: {},
    sheets: {},
    components: {},
    icons: {},
  };
}

describe('URL Parsing', () => {
  describe('Valid URL formats', () => {
    it('should validate standard Figma design URL shape', () => {
      expect(isValidFigmaUrl(TEST_URLS.mainScreen)).toBe(true);
      expect(extractFileKey(TEST_URLS.mainScreen)).toBe(TEST_FILE_KEY);
      expect(extractNodeId(TEST_URLS.mainScreen)).toBe(MAIN_SCREEN_NODE_ID.replace(/-/g, ':'));
    });
  });

  describe('Invalid URLs', () => {
    it('should reject URL without node-id', () => {
      expect(isValidFigmaUrl(INVALID_URLS.missingNodeId)).toBe(false);
      expect(extractNodeId(INVALID_URLS.missingNodeId)).toBeNull();
    });

    it('should reject malformed URL', () => {
      expect(isValidFigmaUrl(INVALID_URLS.malformed)).toBe(false);
      expect(extractFileKey(INVALID_URLS.malformed)).toBeNull();
    });

    it('should parse non-existent node-id URL as structurally valid', () => {
      expect(isValidFigmaUrl(INVALID_URLS.nonExistentNode)).toBe(true);
      expect(extractNodeId(INVALID_URLS.nonExistentNode)).toBe('99999:99999');
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
      const urlWithHyphen = createFigmaUrl(MAIN_SCREEN_NODE_ID);
      const nodeId = extractNodeId(urlWithHyphen);

      // extractNodeId should convert hyphen to colon
      expect(nodeId).toBe(MAIN_SCREEN_NODE_ID.replace(/-/g, ':'));
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

  describe('Name resolution guardrails', () => {
    it('should auto-recover from temporary E2E names when explicit name is not provided', () => {
      const manifest = createManifest();
      manifest.screens['1:1'] = {
        name: 'E2EMainScreen',
        folder: '.figma/screens/E2EMainScreen',
        generatedAt: new Date().toISOString(),
        nodeId: '1:1',
        figmaUrl: 'https://www.figma.com/design/file?node-id=1-1',
      };

      const resolved = resolveComponentName(
        manifest,
        'screens',
        '1:1',
        'Главная клиент'
      );

      expect(resolved.name).toBe('GlavnayaKlient');
      expect(resolved.isUpdate).toBe(false);
      expect(resolved.previousName).toBe('E2EMainScreen');
    });

    it('should keep existing non-temporary names stable for updates', () => {
      const manifest = createManifest();
      manifest.screens['1:1'] = {
        name: 'HomeScreen',
        folder: '.figma/screens/HomeScreen',
        generatedAt: new Date().toISOString(),
        nodeId: '1:1',
        figmaUrl: 'https://www.figma.com/design/file?node-id=1-1',
      };

      const resolved = resolveComponentName(
        manifest,
        'screens',
        '1:1',
        'Главная клиент'
      );

      expect(resolved).toEqual({
        name: 'HomeScreen',
        isUpdate: true,
      });
    });

    it('should recover with a numeric suffix when recovered name is occupied', () => {
      const manifest = createManifest();
      manifest.screens['1:1'] = {
        name: 'E2EMainScreen',
        folder: '.figma/screens/E2EMainScreen',
        generatedAt: new Date().toISOString(),
        nodeId: '1:1',
        figmaUrl: 'https://www.figma.com/design/file?node-id=1-1',
      };
      manifest.screens['2:2'] = {
        name: 'GlavnayaKlient',
        folder: '.figma/screens/GlavnayaKlient',
        generatedAt: new Date().toISOString(),
        nodeId: '2:2',
        figmaUrl: 'https://www.figma.com/design/file?node-id=2-2',
      };

      const resolved = resolveComponentName(
        manifest,
        'screens',
        '1:1',
        'Главная клиент'
      );

      expect(resolved.name).toBe('GlavnayaKlient2');
      expect(resolved.isUpdate).toBe(false);
      expect(resolved.previousName).toBe('E2EMainScreen');
    });
  });
});
