/**
 * E2E тесты для валидации компиляции TypeScript кода
 *
 * Эти тесты проверяют, что сгенерированный код:
 * 1. Компилируется TypeScript компилятором без ошибок
 * 2. Содержит валидные React Native компоненты
 * 3. Имеет правильную структуру экспортов
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createMCPClient, MCPClient } from '../helpers/mcp-client';
import { createTempWorkspace, TempWorkspace } from '../helpers/temp-workspace';
import {
  compileTypeScript,
  validateReactNativeComponent,
  compileAndValidate,
} from '../helpers/typescript-compiler';
import { TEST_URLS, requireFigmaToken } from '../fixtures/test-figma-urls';

describe('Code Compilation', () => {
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

  /**
   * Вспомогательная функция для получения сгенерированного кода
   */
  async function generateAndGetCode(screenName: string): Promise<string> {
    await client.generateScreen({
      figmaUrl: TEST_URLS.mainScreen,
      screenName,
      projectRoot: workspace.root,
    });

    const structure = await workspace.checkStructure();
    const allComponents = [
      ...structure.screens.map(s => ({ name: s, category: 'screens' })),
      ...structure.modals.map(s => ({ name: s, category: 'modals' })),
      ...structure.sheets.map(s => ({ name: s, category: 'sheets' })),
      ...structure.components.map(s => ({ name: s, category: 'components' })),
    ];

    const component = allComponents.find(c => c.name === screenName) || allComponents[0];
    const indexPath = `.figma/${component.category}/${component.name}/index.tsx`;

    return workspace.readFile(indexPath);
  }

  describe('TypeScript компиляция', () => {
    it('код должен компилироваться без синтаксических ошибок', async () => {
      const code = await generateAndGetCode('SyntaxTest');

      const result = compileTypeScript(code, 'SyntaxTest.tsx');

      // Фильтруем только критические синтаксические ошибки
      const syntaxErrors = result.errors.filter(e =>
        e.code && (e.code >= 1000 && e.code < 2000)
      );

      expect(syntaxErrors).toHaveLength(0);
    });

    it('код должен компилироваться без типовых ошибок', async () => {
      const code = await generateAndGetCode('TypesErrorTest');

      const result = compileTypeScript(code, 'TypesErrorTest.tsx');

      // Выводим ошибки для отладки
      if (result.errors.length > 0) {
        console.log('Type errors found:');
        result.errors.forEach(e => {
          console.log(`  [${e.code}] Line ${e.line}: ${e.message}`);
        });
      }

      // Основная проверка
      expect(result.success).toBe(true);
    });

    it('код не должен иметь критических warnings', async () => {
      const code = await generateAndGetCode('WarningsTest');

      const result = compileTypeScript(code, 'WarningsTest.tsx');

      // Критические warnings (не просто информационные)
      const criticalWarnings = result.warnings.filter(w =>
        w.message.toLowerCase().includes('deprecated') ||
        w.message.toLowerCase().includes('unsafe')
      );

      expect(criticalWarnings).toHaveLength(0);
    });
  });

  describe('Структура React Native компонента', () => {
    it('должен импортировать React', async () => {
      const code = await generateAndGetCode('ReactImportTest');

      expect(code).toMatch(/from ['"]react['"]/);
    });

    it('должен импортировать react-native компоненты', async () => {
      const code = await generateAndGetCode('RNImportTest');

      expect(code).toMatch(/from ['"]react-native['"]/);
    });

    it('должен экспортировать компонент с PascalCase именем', async () => {
      const code = await generateAndGetCode('ExportTest');

      // Проверяем export const или export function с PascalCase
      expect(code).toMatch(/export\s+(const|function)\s+[A-Z][a-zA-Z0-9]*/);
    });

    it('должен содержать JSX элементы', async () => {
      const code = await generateAndGetCode('JsxTest');

      // Проверяем наличие хотя бы одного JSX элемента
      expect(code).toMatch(/<[A-Z][a-zA-Z0-9]*/);
    });

    it('должен определять стили', async () => {
      const code = await generateAndGetCode('StylesTest');

      // Проверяем наличие createStyles или StyleSheet.create
      expect(
        code.includes('createStyles') ||
        code.includes('StyleSheet.create')
      ).toBe(true);
    });
  });

  describe('Экспорты и типы', () => {
    it('должен экспортировать Props interface', async () => {
      const code = await generateAndGetCode('PropsTest');

      const result = compileTypeScript(code, 'PropsTest.tsx');

      // Проверяем, что есть экспорт с "Props" в имени
      const hasPropsExport = result.fileInfo?.exports.some(e =>
        e.includes('Props')
      );

      expect(hasPropsExport).toBe(true);
    });

    it('fileInfo должен содержать корректную информацию', async () => {
      const code = await generateAndGetCode('FileInfoTest');

      const result = compileTypeScript(code, 'FileInfoTest.tsx');

      expect(result.fileInfo).toBeDefined();
      expect(result.fileInfo?.exports.length).toBeGreaterThan(0);
      expect(result.fileInfo?.imports.length).toBeGreaterThan(0);

      // Должен быть компонент
      expect(result.fileInfo?.componentName).toBeDefined();
    });
  });

  describe('Полная валидация', () => {
    it('compileAndValidate должен проходить для валидного кода', async () => {
      const code = await generateAndGetCode('FullValidationTest');

      const { compilation, validation } = compileAndValidate(code, 'FullValidationTest.tsx');

      // Компиляция
      if (!compilation.success) {
        console.log('Compilation errors:');
        compilation.errors.forEach(e => console.log(`  ${e.message}`));
      }
      expect(compilation.success).toBe(true);

      // Валидация React Native
      if (!validation.valid) {
        console.log('Validation issues:');
        validation.issues.forEach(i => console.log(`  ${i}`));
      }
      expect(validation.valid).toBe(true);
    });
  });

  describe('Обработка сложных случаев', () => {
    it('должен обрабатывать код с условным рендерингом', async () => {
      const code = await generateAndGetCode('ConditionalTest');

      // Проверяем что код компилируется даже если содержит условия
      const result = compileTypeScript(code, 'ConditionalTest.tsx');
      expect(result.success).toBe(true);
    });

    it('должен обрабатывать код с map/filter в JSX', async () => {
      const code = await generateAndGetCode('MapFilterTest');

      // Проверяем компиляцию
      const result = compileTypeScript(code, 'MapFilterTest.tsx');
      expect(result.success).toBe(true);
    });

    it('должен обрабатывать код со стилями spread', async () => {
      const code = await generateAndGetCode('SpreadStylesTest');

      // Проверяем компиляцию
      const result = compileTypeScript(code, 'SpreadStylesTest.tsx');
      expect(result.success).toBe(true);
    });
  });

  describe('Specific React Native patterns', () => {
    it('должен корректно типизировать FlatList если присутствует', async () => {
      const code = await generateAndGetCode('FlatListTest');

      const result = compileTypeScript(code, 'FlatListTest.tsx');

      // Если есть FlatList, он должен быть правильно импортирован
      if (code.includes('FlatList')) {
        expect(code).toMatch(/FlatList.*from\s+['"]react-native['"]/s);
      }

      expect(result.success).toBe(true);
    });

    it('должен корректно обрабатывать useTheme хук если присутствует', async () => {
      const code = await generateAndGetCode('UseThemeTest');

      const result = compileTypeScript(code, 'UseThemeTest.tsx');

      // Если есть useTheme, проверяем использование
      if (code.includes('useTheme')) {
        expect(code).toMatch(/const\s+\{.*\}\s*=\s*useTheme/);
      }

      expect(result.success).toBe(true);
    });

    it('должен корректно обрабатывать scale функцию если присутствует', async () => {
      const code = await generateAndGetCode('ScaleTest');

      const result = compileTypeScript(code, 'ScaleTest.tsx');

      // Если есть scale, проверяем вызов
      if (code.includes('scale(')) {
        expect(code).toMatch(/scale\(\d+\)/);
      }

      expect(result.success).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('должен обрабатывать пустые children', async () => {
      const code = await generateAndGetCode('EmptyChildrenTest');

      const result = compileTypeScript(code, 'EmptyChildrenTest.tsx');
      expect(result.success).toBe(true);
    });

    it('должен обрабатывать nested styles', async () => {
      const code = await generateAndGetCode('NestedStylesTest');

      const result = compileTypeScript(code, 'NestedStylesTest.tsx');
      expect(result.success).toBe(true);

      // Проверяем что есть вложенные стили
      expect(code).toMatch(/styles\.\w+/);
    });

    it('должен обрабатывать комментарии в коде', async () => {
      const code = await generateAndGetCode('CommentsTest');

      // Комментарии не должны ломать компиляцию
      const result = compileTypeScript(code, 'CommentsTest.tsx');
      expect(result.success).toBe(true);
    });
  });
});

describe('TypeScript Compiler Helper', () => {
  describe('compileTypeScript', () => {
    it('должен компилировать валидный TypeScript код', () => {
      const code = `
        import React from 'react';
        import { View, Text } from 'react-native';

        interface Props {
          title: string;
        }

        export const TestComponent = ({ title }: Props) => {
          return (
            <View>
              <Text>{title}</Text>
            </View>
          );
        };
      `;

      const result = compileTypeScript(code);

      // Выводим ошибки для отладки если есть
      if (!result.success) {
        console.log('Compilation errors:', result.errors);
      }

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('должен обнаруживать синтаксические ошибки', () => {
      const code = `
        import React from 'react';

        export const BadComponent = () => {
          return (
            <View>
              <Text>Missing closing tag
            </View>
          );
        };
      `;

      const result = compileTypeScript(code);
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('должен извлекать информацию о файле', () => {
      const code = `
        import React from 'react';
        import { View } from 'react-native';

        export interface MyProps {
          name: string;
        }

        export type MyType = string | number;

        export const MyComponent = () => <View />;
      `;

      const result = compileTypeScript(code);

      expect(result.fileInfo).toBeDefined();
      expect(result.fileInfo?.exports).toContain('MyProps');
      expect(result.fileInfo?.exports).toContain('MyType');
      expect(result.fileInfo?.exports).toContain('MyComponent');
      expect(result.fileInfo?.imports).toContain('react');
      expect(result.fileInfo?.imports).toContain('react-native');
    });
  });

  describe('validateReactNativeComponent', () => {
    it('должен проходить валидацию для корректного компонента', () => {
      const code = `
        import React from 'react';
        import { View, Text, StyleSheet } from 'react-native';

        export const ValidComponent = () => {
          return (
            <View style={styles.container}>
              <Text>Hello</Text>
            </View>
          );
        };

        const styles = StyleSheet.create({
          container: { flex: 1 }
        });
      `;

      const result = validateReactNativeComponent(code);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('должен обнаруживать отсутствие React импорта', () => {
      const code = `
        import { View, Text } from 'react-native';

        export const NoReactImport = () => <View><Text>Test</Text></View>;
      `;

      const result = validateReactNativeComponent(code);
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Missing React import');
    });

    it('должен обнаруживать отсутствие react-native импорта', () => {
      const code = `
        import React from 'react';

        export const NoRNImport = () => <div>Test</div>;
      `;

      const result = validateReactNativeComponent(code);
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Missing React Native import');
    });
  });
});
