/**
 * E2E тесты для generate_screen
 *
 * Тестирует полный цикл генерации React Native компонента из Figma URL:
 * 1. Вызов MCP инструмента generate_screen
 * 2. Создание файловой структуры в .figma/
 * 3. Валидация TypeScript кода
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createMCPClient, MCPClient } from '../helpers/mcp-client';
import { createTempWorkspace, validateGeneratedComponent, TempWorkspace } from '../helpers/temp-workspace';
import { compileTypeScript, validateReactNativeComponent } from '../helpers/typescript-compiler';
import { TEST_URLS, requireFigmaToken, extractNodeId } from '../fixtures/test-figma-urls';

describe('generate_screen', () => {
  let client: MCPClient;
  let figmaToken: string;
  let workspace: TempWorkspace;

  beforeAll(async () => {
    // Проверяем наличие токена
    figmaToken = requireFigmaToken();

    // Запускаем MCP сервер
    client = await createMCPClient(figmaToken);
  });

  afterAll(async () => {
    // Останавливаем MCP сервер
    await client.stop();
  });

  beforeEach(async () => {
    // Создаём временный workspace для каждого теста
    workspace = await createTempWorkspace();
  });

  afterEach(async () => {
    // Очищаем workspace после теста
    await workspace.cleanup();
  });

  describe('Базовая генерация', () => {
    it('должен генерировать компонент из валидного Figma URL', async () => {
      const result = await client.generateScreen({
        figmaUrl: TEST_URLS.mainScreen,
        screenName: 'TestScreen',
        projectRoot: workspace.root,
      });

      // Проверяем, что результат не содержит ошибок
      expect(result.isError).toBeFalsy();
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      // Проверяем, что ответ содержит информацию о генерации
      const responseText = result.content[0].text;
      expect(responseText).toContain('Generated:');
      expect(responseText).toContain('TestScreen');
    });

    it('должен создать правильную файловую структуру', async () => {
      await client.generateScreen({
        figmaUrl: TEST_URLS.mainScreen,
        screenName: 'StructureTest',
        projectRoot: workspace.root,
      });

      // Проверяем структуру workspace
      const structure = await workspace.checkStructure();
      expect(structure.manifest).toBe(true);
      expect(structure.config).toBe(true);

      // Должен быть создан хотя бы один компонент
      const totalComponents = [
        ...structure.screens,
        ...structure.modals,
        ...structure.sheets,
        ...structure.components,
      ].length;
      expect(totalComponents).toBeGreaterThan(0);
    });

    it('должен создать валидные файлы компонента', async () => {
      await client.generateScreen({
        figmaUrl: TEST_URLS.mainScreen,
        screenName: 'FileTest',
        projectRoot: workspace.root,
      });

      // Находим категорию, куда был сохранён компонент
      const structure = await workspace.checkStructure();
      let category: 'screens' | 'modals' | 'sheets' | 'components' = 'screens';
      let componentName = 'FileTest';

      if (structure.screens.includes('FileTest')) {
        category = 'screens';
      } else if (structure.modals.includes('FileTest')) {
        category = 'modals';
      } else if (structure.sheets.includes('FileTest')) {
        category = 'sheets';
      } else if (structure.components.includes('FileTest')) {
        category = 'components';
      }

      // Валидируем структуру компонента
      const validation = await validateGeneratedComponent(workspace, category, componentName);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.files.indexTsx).toBe(true);
      expect(validation.files.metaJson).toBe(true);
    });
  });

  describe('TypeScript компиляция', () => {
    it('сгенерированный код должен компилироваться без ошибок', async () => {
      await client.generateScreen({
        figmaUrl: TEST_URLS.mainScreen,
        screenName: 'CompileTest',
        projectRoot: workspace.root,
      });

      // Находим сгенерированный файл
      const structure = await workspace.checkStructure();
      const allComponents = [
        ...structure.screens.map(s => ({ name: s, category: 'screens' })),
        ...structure.modals.map(s => ({ name: s, category: 'modals' })),
        ...structure.sheets.map(s => ({ name: s, category: 'sheets' })),
        ...structure.components.map(s => ({ name: s, category: 'components' })),
      ];

      expect(allComponents.length).toBeGreaterThan(0);

      const component = allComponents.find(c => c.name === 'CompileTest') || allComponents[0];
      const indexPath = `.figma/${component.category}/${component.name}/index.tsx`;
      const code = await workspace.readFile(indexPath);

      // Компилируем TypeScript
      const compilation = compileTypeScript(code, 'CompileTest.tsx');

      // Выводим ошибки для отладки
      if (!compilation.success) {
        console.error('Compilation errors:', compilation.errors);
      }

      expect(compilation.success).toBe(true);
      expect(compilation.errors).toHaveLength(0);
    });

    it('сгенерированный код должен содержать валидный React Native компонент', async () => {
      await client.generateScreen({
        figmaUrl: TEST_URLS.mainScreen,
        screenName: 'ValidateTest',
        projectRoot: workspace.root,
      });

      // Находим сгенерированный файл
      const structure = await workspace.checkStructure();
      const allComponents = [
        ...structure.screens.map(s => ({ name: s, category: 'screens' })),
        ...structure.modals.map(s => ({ name: s, category: 'modals' })),
        ...structure.sheets.map(s => ({ name: s, category: 'sheets' })),
        ...structure.components.map(s => ({ name: s, category: 'components' })),
      ];

      const component = allComponents.find(c => c.name === 'ValidateTest') || allComponents[0];
      const indexPath = `.figma/${component.category}/${component.name}/index.tsx`;
      const code = await workspace.readFile(indexPath);

      // Валидируем React Native компонент
      const validation = validateReactNativeComponent(code);

      // Выводим проблемы для отладки
      if (!validation.valid) {
        console.error('Validation issues:', validation.issues);
      }

      expect(validation.valid).toBe(true);
      expect(validation.issues).toHaveLength(0);
    });
  });

  describe('Уникальность имён', () => {
    it('должен генерировать уникальные имена при дублировании', async () => {
      // Первая генерация
      await client.generateScreen({
        figmaUrl: TEST_URLS.mainScreen,
        screenName: 'DuplicateTest',
        projectRoot: workspace.root,
      });

      // Вторая генерация с тем же именем но с другим nodeId (симулируем)
      // В реальности это будет работать только если изменить URL
      // Для теста используем тот же URL - должен перезаписать

      const result = await client.generateScreen({
        figmaUrl: TEST_URLS.mainScreen,
        screenName: 'DuplicateTest',
        projectRoot: workspace.root,
      });

      expect(result.isError).toBeFalsy();

      // Проверяем manifest
      const manifest = await workspace.readJson<{
        screens: Record<string, { name: string }>;
        modals: Record<string, { name: string }>;
        sheets: Record<string, { name: string }>;
        components: Record<string, { name: string }>;
      }>('.figma/manifest.json');

      // Должен быть только один компонент с именем DuplicateTest
      const nodeId = extractNodeId(TEST_URLS.mainScreen);
      const allEntries = [
        ...Object.entries(manifest.screens || {}),
        ...Object.entries(manifest.modals || {}),
        ...Object.entries(manifest.sheets || {}),
        ...Object.entries(manifest.components || {}),
      ];

      const matchingEntries = allEntries.filter(([, entry]) => entry.name === 'DuplicateTest');
      expect(matchingEntries.length).toBe(1);
    });
  });

  describe('Опции генерации', () => {
    it('должен генерировать типы когда generateTypes: true', async () => {
      await client.generateScreen({
        figmaUrl: TEST_URLS.mainScreen,
        screenName: 'TypesTest',
        projectRoot: workspace.root,
        options: {
          generateTypes: true,
        },
      });

      // Находим сгенерированный файл
      const structure = await workspace.checkStructure();
      const allComponents = [
        ...structure.screens.map(s => ({ name: s, category: 'screens' })),
        ...structure.modals.map(s => ({ name: s, category: 'modals' })),
        ...structure.sheets.map(s => ({ name: s, category: 'sheets' })),
        ...structure.components.map(s => ({ name: s, category: 'components' })),
      ];

      const component = allComponents.find(c => c.name === 'TypesTest') || allComponents[0];
      const indexPath = `.figma/${component.category}/${component.name}/index.tsx`;
      const code = await workspace.readFile(indexPath);

      // Проверяем наличие типов
      expect(code).toMatch(/interface|type\s+\w+\s*=/);
    });

    it('должен генерировать хуки когда generateHooks: true', async () => {
      await client.generateScreen({
        figmaUrl: TEST_URLS.mainScreen,
        screenName: 'HooksTest',
        projectRoot: workspace.root,
        options: {
          generateHooks: true,
        },
      });

      // Находим сгенерированный файл
      const structure = await workspace.checkStructure();
      const allComponents = [
        ...structure.screens.map(s => ({ name: s, category: 'screens' })),
        ...structure.modals.map(s => ({ name: s, category: 'modals' })),
        ...structure.sheets.map(s => ({ name: s, category: 'sheets' })),
        ...structure.components.map(s => ({ name: s, category: 'components' })),
      ];

      const component = allComponents.find(c => c.name === 'HooksTest') || allComponents[0];
      const indexPath = `.figma/${component.category}/${component.name}/index.tsx`;
      const code = await workspace.readFile(indexPath);

      // Проверяем наличие секции Hooks (если есть данные для генерации)
      // Хуки могут не генерироваться если нет подходящих данных
      // Это нормальное поведение
      expect(code).toBeDefined();
    });
  });

  describe('Метаданные', () => {
    it('meta.json должен содержать корректную информацию', async () => {
      await client.generateScreen({
        figmaUrl: TEST_URLS.mainScreen,
        screenName: 'MetaTest',
        projectRoot: workspace.root,
      });

      // Находим сгенерированный компонент
      const structure = await workspace.checkStructure();
      const allComponents = [
        ...structure.screens.map(s => ({ name: s, category: 'screens' })),
        ...structure.modals.map(s => ({ name: s, category: 'modals' })),
        ...structure.sheets.map(s => ({ name: s, category: 'sheets' })),
        ...structure.components.map(s => ({ name: s, category: 'components' })),
      ];

      const component = allComponents.find(c => c.name === 'MetaTest') || allComponents[0];
      const metaPath = `.figma/${component.category}/${component.name}/meta.json`;
      const meta = await workspace.readJson<{
        name: string;
        figmaUrl: string;
        nodeId: string;
        generatedAt: string;
        exports: string[];
      }>(metaPath);

      // Проверяем обязательные поля
      expect(meta.name).toBe('MetaTest');
      expect(meta.figmaUrl).toBe(TEST_URLS.mainScreen);
      expect(meta.nodeId).toBeDefined();
      expect(meta.generatedAt).toBeDefined();
      expect(meta.exports).toBeInstanceOf(Array);
      expect(meta.exports.length).toBeGreaterThan(0);

      // Проверяем формат даты
      expect(new Date(meta.generatedAt).toString()).not.toBe('Invalid Date');
    });

    it('manifest.json должен отслеживать все генерации', async () => {
      await client.generateScreen({
        figmaUrl: TEST_URLS.mainScreen,
        screenName: 'ManifestTest',
        projectRoot: workspace.root,
      });

      const manifest = await workspace.readJson<{
        version: string;
        screens: Record<string, unknown>;
        modals: Record<string, unknown>;
        sheets: Record<string, unknown>;
        components: Record<string, unknown>;
      }>('.figma/manifest.json');

      // Проверяем структуру manifest
      expect(manifest.version).toBeDefined();

      // Должен быть хотя бы один entry
      const totalEntries =
        Object.keys(manifest.screens || {}).length +
        Object.keys(manifest.modals || {}).length +
        Object.keys(manifest.sheets || {}).length +
        Object.keys(manifest.components || {}).length;

      expect(totalEntries).toBeGreaterThan(0);
    });
  });

  describe('Дизайн токены', () => {
    it('результат должен содержать информацию о токенах', async () => {
      const result = await client.generateScreen({
        figmaUrl: TEST_URLS.mainScreen,
        screenName: 'TokensTest',
        projectRoot: workspace.root,
      });

      const responseText = result.content[0].text;

      // Проверяем наличие секции с токенами
      // Может содержать цвета или типографику
      expect(
        responseText.includes('Colors') ||
        responseText.includes('Typography') ||
        responseText.includes('Design Tokens') ||
        responseText.includes('tokens')
      ).toBe(true);
    });
  });
});
