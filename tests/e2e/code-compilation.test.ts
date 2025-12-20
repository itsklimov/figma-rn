/**
 * E2E tests for TypeScript code compilation validation
 *
 * These tests verify that generated code:
 * 1. Compiles with TypeScript compiler without errors
 * 2. Contains valid React Native components
 * 3. Has correct export structure
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
    if (client) {
      await client.stop();
    }
  });

  beforeEach(async () => {
    workspace = await createTempWorkspace();
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  /**
   * Helper function to get generated code
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

  describe('TypeScript compilation', () => {
    it('code should compile without syntax errors', async () => {
      const code = await generateAndGetCode('SyntaxTest');

      const result = compileTypeScript(code, 'SyntaxTest.tsx');

      // Filter only critical syntax errors
      const syntaxErrors = result.errors.filter(e =>
        e.code && (e.code >= 1000 && e.code < 2000)
      );

      expect(syntaxErrors).toHaveLength(0);
    });

    it('code should compile without type errors', async () => {
      const code = await generateAndGetCode('TypesErrorTest');

      const result = compileTypeScript(code, 'TypesErrorTest.tsx');

      // Выводим ошибки для отладки
      if (result.errors.length > 0) {
        console.log('Type errors found:');
        result.errors.forEach(e => {
          console.log(`  [${e.code}] Line ${e.line}: ${e.message}`);
        });
      }

      // Main check
      expect(result.success).toBe(true);
    });

    it('code should not have critical warnings', async () => {
      const code = await generateAndGetCode('WarningsTest');

      const result = compileTypeScript(code, 'WarningsTest.tsx');

      // Critical warnings (not just informational)
      const criticalWarnings = result.warnings.filter(w =>
        w.message.toLowerCase().includes('deprecated') ||
        w.message.toLowerCase().includes('unsafe')
      );

      expect(criticalWarnings).toHaveLength(0);
    });
  });

  describe('React Native component structure', () => {
    it('should import React', async () => {
      const code = await generateAndGetCode('ReactImportTest');

      expect(code).toMatch(/from ['"]react['"]/);
    });

    it('should import react-native components', async () => {
      const code = await generateAndGetCode('RNImportTest');

      expect(code).toMatch(/from ['"]react-native['"]/);
    });

    it('should export component with PascalCase name', async () => {
      const code = await generateAndGetCode('ExportTest');

      // Check export const or export function with PascalCase
      expect(code).toMatch(/export\s+(const|function)\s+[A-Z][a-zA-Z0-9]*/);
    });

    it('should contain JSX elements', async () => {
      const code = await generateAndGetCode('JsxTest');

      // Check for at least one JSX element
      expect(code).toMatch(/<[A-Z][a-zA-Z0-9]*/);
    });

    it('should define styles', async () => {
      const code = await generateAndGetCode('StylesTest');

      // Check for createStyles or StyleSheet.create
      expect(
        code.includes('createStyles') ||
        code.includes('StyleSheet.create')
      ).toBe(true);
    });
  });

  describe('Exports and types', () => {
    it('should export Props interface', async () => {
      const code = await generateAndGetCode('PropsTest');

      const result = compileTypeScript(code, 'PropsTest.tsx');

      // Check that there's export with "Props" in name
      const hasPropsExport = result.fileInfo?.exports.some(e =>
        e.includes('Props')
      );

      expect(hasPropsExport).toBe(true);
    });

    it('fileInfo should contain correct information', async () => {
      const code = await generateAndGetCode('FileInfoTest');

      const result = compileTypeScript(code, 'FileInfoTest.tsx');

      expect(result.fileInfo).toBeDefined();
      expect(result.fileInfo?.exports.length).toBeGreaterThan(0);
      expect(result.fileInfo?.imports.length).toBeGreaterThan(0);

      // Should have component
      expect(result.fileInfo?.componentName).toBeDefined();
    });
  });

  describe('Full validation', () => {
    it('compileAndValidate should pass for valid code', async () => {
      const code = await generateAndGetCode('FullValidationTest');

      const { compilation, validation } = compileAndValidate(code, 'FullValidationTest.tsx');

      // Compilation
      if (!compilation.success) {
        console.log('Compilation errors:');
        compilation.errors.forEach(e => console.log(`  ${e.message}`));
      }
      expect(compilation.success).toBe(true);

      // React Native validation
      if (!validation.valid) {
        console.log('Validation issues:');
        validation.issues.forEach(i => console.log(`  ${i}`));
      }
      expect(validation.valid).toBe(true);
    });
  });

  describe('Complex cases handling', () => {
    it('should handle code with conditional rendering', async () => {
      const code = await generateAndGetCode('ConditionalTest');

      // Check that code compiles even with conditions
      const result = compileTypeScript(code, 'ConditionalTest.tsx');
      expect(result.success).toBe(true);
    });

    it('should handle code with map/filter in JSX', async () => {
      const code = await generateAndGetCode('MapFilterTest');

      // Проверяем компиляцию
      const result = compileTypeScript(code, 'MapFilterTest.tsx');
      expect(result.success).toBe(true);
    });

    it('should handle code with spread styles', async () => {
      const code = await generateAndGetCode('SpreadStylesTest');

      // Проверяем компиляцию
      const result = compileTypeScript(code, 'SpreadStylesTest.tsx');
      expect(result.success).toBe(true);
    });
  });

  describe('Specific React Native patterns', () => {
    it('should correctly type FlatList if present', async () => {
      const code = await generateAndGetCode('FlatListTest');

      const result = compileTypeScript(code, 'FlatListTest.tsx');

      // If FlatList is present, it should be correctly imported
      if (code.includes('FlatList')) {
        expect(code).toMatch(/FlatList.*from\s+['"]react-native['"]/s);
      }

      expect(result.success).toBe(true);
    });

    it('should correctly handle useTheme hook if present', async () => {
      const code = await generateAndGetCode('UseThemeTest');

      const result = compileTypeScript(code, 'UseThemeTest.tsx');

      // If useTheme is present, check usage
      if (code.includes('useTheme')) {
        expect(code).toMatch(/const\s+\{.*\}\s*=\s*useTheme/);
      }

      expect(result.success).toBe(true);
    });

    it('should correctly handle scale function if present', async () => {
      const code = await generateAndGetCode('ScaleTest');

      const result = compileTypeScript(code, 'ScaleTest.tsx');

      // If scale is present, check call
      if (code.includes('scale(')) {
        expect(code).toMatch(/scale\(\d+\)/);
      }

      expect(result.success).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty children', async () => {
      const code = await generateAndGetCode('EmptyChildrenTest');

      const result = compileTypeScript(code, 'EmptyChildrenTest.tsx');
      expect(result.success).toBe(true);
    });

    it('should handle nested styles', async () => {
      const code = await generateAndGetCode('NestedStylesTest');

      const result = compileTypeScript(code, 'NestedStylesTest.tsx');
      expect(result.success).toBe(true);

      // Check that there are nested styles
      expect(code).toMatch(/styles\.\w+/);
    });

    it('should handle comments in code', async () => {
      const code = await generateAndGetCode('CommentsTest');

      // Comments should not break compilation
      const result = compileTypeScript(code, 'CommentsTest.tsx');
      expect(result.success).toBe(true);
    });
  });
});

describe('TypeScript Compiler Helper', () => {
  describe('compileTypeScript', () => {
    it('should compile valid TypeScript code', () => {
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

      // Output errors for debugging if present
      if (!result.success) {
        console.log('Compilation errors:', result.errors);
      }

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect syntax errors', () => {
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

    it('should extract file information', () => {
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
    it('should pass validation for correct component', () => {
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

    it('should detect missing React import', () => {
      const code = `
        import { View, Text } from 'react-native';

        export const NoReactImport = () => <View><Text>Test</Text></View>;
      `;

      const result = validateReactNativeComponent(code);
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Missing React import');
    });

    it('should detect missing react-native import', () => {
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
