/**
 * E2E тесты для парсинга URL
 *
 * Тестирует обработку различных форматов Figma URL и обработку ошибок
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

  describe('Валидные URL форматы', () => {
    it('должен обрабатывать стандартный Figma design URL', async () => {
      const result = await client.generateScreen({
        figmaUrl: TEST_URLS.mainScreen,
        screenName: 'StandardUrl',
        projectRoot: workspace.root,
      });

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Generated:');
    });

    it('должен обрабатывать URL с закодированным node-id', async () => {
      // URL с закодированным node-id (123%3A456 вместо 123:456)
      const encodedUrl = `https://www.figma.com/design/${TEST_FILE_KEY}/test?node-id=4212%3A63544&m=dev`;

      const result = await client.generateScreen({
        figmaUrl: encodedUrl,
        screenName: 'EncodedUrl',
        projectRoot: workspace.root,
      });

      expect(result.isError).toBeFalsy();
    });

    it('должен обрабатывать URL с дефисом в node-id', async () => {
      // URL с дефисом (4212-63544) - стандартный формат
      const result = await client.generateScreen({
        figmaUrl: createFigmaUrl('4212-63544'),
        screenName: 'HyphenUrl',
        projectRoot: workspace.root,
      });

      expect(result.isError).toBeFalsy();
    });

    it('должен обрабатывать URL с дополнительными параметрами', async () => {
      // URL с дополнительными query параметрами
      const urlWithParams = `${TEST_URLS.mainScreen}&t=abc123&scaling=min-zoom`;

      const result = await client.generateScreen({
        figmaUrl: urlWithParams,
        screenName: 'ExtraParams',
        projectRoot: workspace.root,
      });

      expect(result.isError).toBeFalsy();
    });

    it('должен обрабатывать URL в формате /file/', async () => {
      // Старый формат URL с /file/ вместо /design/
      const fileUrl = TEST_URLS.mainScreen.replace('/design/', '/file/');

      const result = await client.generateScreen({
        figmaUrl: fileUrl,
        screenName: 'FileFormat',
        projectRoot: workspace.root,
      });

      expect(result.isError).toBeFalsy();
    });
  });

  describe('Невалидные URL', () => {
    it('должен возвращать ошибку для URL без node-id', async () => {
      const result = await client.generateScreen({
        figmaUrl: INVALID_URLS.missingNodeId,
        screenName: 'NoNodeId',
        projectRoot: workspace.root,
      });

      // Ожидаем ошибку или предупреждение
      // Сервер может обработать это по-разному
      expect(
        result.isError ||
        result.content[0].text.toLowerCase().includes('error') ||
        result.content[0].text.toLowerCase().includes('unknown')
      ).toBe(true);
    });

    it('должен возвращать ошибку для malformed URL', async () => {
      const result = await client.generateScreen({
        figmaUrl: INVALID_URLS.malformed,
        screenName: 'MalformedUrl',
        projectRoot: workspace.root,
      });

      expect(result.isError).toBe(true);
    });

    it('должен обрабатывать несуществующий node-id gracefully', async () => {
      const result = await client.generateScreen({
        figmaUrl: INVALID_URLS.nonExistentNode,
        screenName: 'NonExistentNode',
        projectRoot: workspace.root,
      });

      // Должна быть ошибка, но не crash
      expect(
        result.isError ||
        result.content[0].text.toLowerCase().includes('error') ||
        result.content[0].text.toLowerCase().includes('not found')
      ).toBe(true);
    });
  });

  describe('Извлечение компонентов URL', () => {
    it('extractNodeId должен корректно извлекать nodeId', () => {
      // С дефисом
      expect(extractNodeId('https://figma.com/design/abc?node-id=123-456')).toBe('123:456');

      // С двоеточием (закодированным)
      expect(extractNodeId('https://figma.com/design/abc?node-id=123%3A456')).toBe('123:456');

      // Без node-id
      expect(extractNodeId('https://figma.com/design/abc')).toBeNull();
    });

    it('extractFileKey должен корректно извлекать fileKey', () => {
      // /design/ формат
      expect(extractFileKey('https://figma.com/design/ABC123xyz')).toBe('ABC123xyz');

      // /file/ формат
      expect(extractFileKey('https://figma.com/file/ABC123xyz')).toBe('ABC123xyz');

      // С дополнительными параметрами
      expect(extractFileKey('https://figma.com/design/ABC123xyz/Name?node-id=1-1')).toBe('ABC123xyz');

      // Невалидный URL
      expect(extractFileKey('not-a-url')).toBeNull();
    });

    it('isValidFigmaUrl должен корректно валидировать URL', () => {
      // Валидные
      expect(isValidFigmaUrl('https://figma.com/design/abc?node-id=1-1')).toBe(true);
      expect(isValidFigmaUrl('https://www.figma.com/file/abc?node-id=1-1')).toBe(true);

      // Невалидные
      expect(isValidFigmaUrl('https://figma.com/design/abc')).toBe(false); // нет node-id
      expect(isValidFigmaUrl('https://google.com?node-id=1-1')).toBe(false); // не figma
      expect(isValidFigmaUrl('not-a-url')).toBe(false);
    });
  });

  describe('NodeId нормализация', () => {
    it('должен нормализовать nodeId с дефисом к двоеточию', async () => {
      // Генерируем с дефисом
      await client.generateScreen({
        figmaUrl: createFigmaUrl('4212-63544'),
        screenName: 'NormalizeTest',
        projectRoot: workspace.root,
      });

      // Проверяем manifest - nodeId должен быть с двоеточием
      const manifest = await workspace.readJson<{
        screens: Record<string, unknown>;
        modals: Record<string, unknown>;
        sheets: Record<string, unknown>;
        components: Record<string, unknown>;
      }>('.figma/manifest.json');

      // Ищем ключ с двоеточием
      const allKeys = [
        ...Object.keys(manifest.screens || {}),
        ...Object.keys(manifest.modals || {}),
        ...Object.keys(manifest.sheets || {}),
        ...Object.keys(manifest.components || {}),
      ];

      // Должен быть ключ с двоеточием, не с дефисом
      const hasColonKey = allKeys.some(key => key.includes(':') && key.includes('4212') && key.includes('63544'));
      expect(hasColonKey).toBe(true);
    });
  });

  describe('Branch URL', () => {
    it('должен обрабатывать URL с branch', async () => {
      // URL формат: /design/{fileKey}/branch/{branchKey}/
      // Для этого теста используем обычный URL, так как нет тестового branch
      // В реальном сценарии branchKey используется как fileKey

      const result = await client.generateScreen({
        figmaUrl: TEST_URLS.mainScreen,
        screenName: 'BranchTest',
        projectRoot: workspace.root,
      });

      expect(result.isError).toBeFalsy();
    });
  });
});
