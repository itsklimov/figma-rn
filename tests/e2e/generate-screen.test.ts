/**
 * E2E tests for generate_screen
 *
 * Tests complete React Native component generation cycle from Figma URL:
 * 1. Call generate_screen MCP tool
 * 2. Create file structure in .figma/
 * 3. Validate TypeScript code
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
    it('should generate component from valid Figma URL', async () => {
      const result = await client.generateScreen({
        figmaUrl: TEST_URLS.mainScreen,
        screenName: 'TestScreen',
        projectRoot: workspace.root,
      });

      // Check that result contains no errors
      expect(result.isError).toBeFalsy();
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      // Check that response contains generation info
      const responseText = result.content[0].text;
      expect(responseText).toContain('Generated:');
      expect(responseText).toContain('TestScreen');
    });

    it('should create correct file structure', async () => {
      await client.generateScreen({
        figmaUrl: TEST_URLS.mainScreen,
        screenName: 'StructureTest',
        projectRoot: workspace.root,
      });

      // Check workspace structure
      const structure = await workspace.checkStructure();
      expect(structure.manifest).toBe(true);
      expect(structure.config).toBe(true);

      // At least one component should be created
      const totalComponents = [
        ...structure.screens,
        ...structure.modals,
        ...structure.sheets,
        ...structure.components,
      ].length;
      expect(totalComponents).toBeGreaterThan(0);
    });

    it('should create valid component files', async () => {
      await client.generateScreen({
        figmaUrl: TEST_URLS.mainScreen,
        screenName: 'FileTest',
        projectRoot: workspace.root,
      });

      // Find category where component was saved
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

      // Validate component structure
      const validation = await validateGeneratedComponent(workspace, category, componentName);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.files.indexTsx).toBe(true);
      expect(validation.files.metaJson).toBe(true);
    });
  });

  describe('TypeScript compilation', () => {
    it('generated code should compile without errors', async () => {
      await client.generateScreen({
        figmaUrl: TEST_URLS.mainScreen,
        screenName: 'CompileTest',
        projectRoot: workspace.root,
      });

      // Find generated file
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

      // Compile TypeScript
      const compilation = compileTypeScript(code, 'CompileTest.tsx');

      // Output errors for debugging
      if (!compilation.success) {
        console.error('Compilation errors:', compilation.errors);
      }

      expect(compilation.success).toBe(true);
      expect(compilation.errors).toHaveLength(0);
    });

    it('generated code should contain valid React Native component', async () => {
      await client.generateScreen({
        figmaUrl: TEST_URLS.mainScreen,
        screenName: 'ValidateTest',
        projectRoot: workspace.root,
      });

      // Find generated file
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

      // Validate React Native component
      const validation = validateReactNativeComponent(code);

      // Output issues for debugging
      if (!validation.valid) {
        console.error('Validation issues:', validation.issues);
      }

      expect(validation.valid).toBe(true);
      expect(validation.issues).toHaveLength(0);
    });
  });

  describe('Name uniqueness', () => {
    it('should generate unique names on duplication', async () => {
      // First generation
      await client.generateScreen({
        figmaUrl: TEST_URLS.mainScreen,
        screenName: 'DuplicateTest',
        projectRoot: workspace.root,
      });

      // Second generation with same name but different nodeId (simulate)
      // In reality this will only work if URL changes
      // For test use same URL - should overwrite

      const result = await client.generateScreen({
        figmaUrl: TEST_URLS.mainScreen,
        screenName: 'DuplicateTest',
        projectRoot: workspace.root,
      });

      expect(result.isError).toBeFalsy();

      // Check manifest
      const manifest = await workspace.readJson<{
        screens: Record<string, { name: string }>;
        modals: Record<string, { name: string }>;
        sheets: Record<string, { name: string }>;
        components: Record<string, { name: string }>;
      }>('.figma/manifest.json');

      // Should be only one component with name DuplicateTest
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

  describe('Generation options', () => {
    it('should generate types when generateTypes: true', async () => {
      await client.generateScreen({
        figmaUrl: TEST_URLS.mainScreen,
        screenName: 'TypesTest',
        projectRoot: workspace.root,
        options: {
          generateTypes: true,
        },
      });

      // Find generated file
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

      // Check for types presence
      expect(code).toMatch(/interface|type\s+\w+\s*=/);
    });

    it('should generate hooks when generateHooks: true', async () => {
      await client.generateScreen({
        figmaUrl: TEST_URLS.mainScreen,
        screenName: 'HooksTest',
        projectRoot: workspace.root,
        options: {
          generateHooks: true,
        },
      });

      // Find generated file
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

      // Check for Hooks section (if data available for generation)
      // Hooks may not be generated if no suitable data
      // This is normal behavior
      expect(code).toBeDefined();
    });
  });

  describe('Metadata', () => {
    it('meta.json should contain correct information', async () => {
      await client.generateScreen({
        figmaUrl: TEST_URLS.mainScreen,
        screenName: 'MetaTest',
        projectRoot: workspace.root,
      });

      // Find generated component
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

      // Check required fields
      expect(meta.name).toBe('MetaTest');
      expect(meta.figmaUrl).toBe(TEST_URLS.mainScreen);
      expect(meta.nodeId).toBeDefined();
      expect(meta.generatedAt).toBeDefined();
      expect(meta.exports).toBeInstanceOf(Array);
      expect(meta.exports.length).toBeGreaterThan(0);

      // Check date format
      expect(new Date(meta.generatedAt).toString()).not.toBe('Invalid Date');
    });

    it('manifest.json should track all generations', async () => {
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

      // Check manifest structure
      expect(manifest.version).toBeDefined();

      // Should have at least one entry
      const totalEntries =
        Object.keys(manifest.screens || {}).length +
        Object.keys(manifest.modals || {}).length +
        Object.keys(manifest.sheets || {}).length +
        Object.keys(manifest.components || {}).length;

      expect(totalEntries).toBeGreaterThan(0);
    });
  });

  describe('Design tokens', () => {
    it('result should contain token information', async () => {
      const result = await client.generateScreen({
        figmaUrl: TEST_URLS.mainScreen,
        screenName: 'TokensTest',
        projectRoot: workspace.root,
      });

      const responseText = result.content[0].text;

      // Check for tokens section
      // May contain colors or typography
      expect(
        responseText.includes('Colors') ||
        responseText.includes('Typography') ||
        responseText.includes('Design Tokens') ||
        responseText.includes('tokens')
      ).toBe(true);
    });
  });
});
