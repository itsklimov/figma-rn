import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildUniqueAssetFilename } from '../../src/edge/asset-downloader';
import { createMCPClient, MCPClient } from '../helpers/mcp-client';
import {
  analyzeGeneratedCode,
  analyzeInputOutputFidelity,
  formatGetScreenResponse,
  resolveNamedImportTarget,
  resolveThemeImportTarget,
} from '../../src/edge/tools/get-screen';
import type { ScreenIR } from '../../src/core/types';

describe('MCP tool contract', () => {
  let client: MCPClient;

  beforeAll(async () => {
    client = await createMCPClient('figd_123456789012345678901234567890123456');
  });

  afterAll(async () => {
    if (client) {
      await client.stop();
    }
  });

  it('should expose only get_screen in tools/list', async () => {
    const tools = await client.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0]?.name).toBe('get_screen');
  });

  it('should return unknown tool error without legacy names', async () => {
    const result = await client.callTool('unknown_tool', {});
    const text = result.content
      .filter((part): part is Extract<typeof part, { type: 'text' }> => part.type === 'text')
      .map((part) => part.text)
      .join('\n');

    expect(result.isError).toBe(true);
    expect(text).toContain('Unknown tool: unknown_tool');
    expect(text).toContain('Available tools:');
    expect(text).toContain('- get_screen');
    expect(text).not.toContain('generate_screen');
    expect(text).not.toContain('generate_flow');
  });

  it('should include machine-readable summary and code in get_screen response formatting', () => {
    const response = formatGetScreenResponse({
      success: true,
      screenIR: {
        id: 'screen_1',
        name: 'AuditScreen',
        root: {
          id: '1:1',
          name: 'Root',
          semanticType: 'Container',
          boundingBox: { x: 0, y: 0, width: 100, height: 100 },
          styleRef: 'root',
          layout: {
            type: 'column',
            gap: 0,
            padding: { top: 0, right: 0, bottom: 0, left: 0 },
            mainAlign: 'start',
            crossAlign: 'start',
            sizing: { horizontal: 'fixed', vertical: 'fixed' },
          },
          children: [],
        },
        stylesBundle: {
          styles: { root: { id: 'root' } },
          tokens: { colors: {}, spacing: {}, radii: {}, typography: {}, shadows: {} },
        },
      } as any,
      multiFileResult: {
        mainComponent: {
          path: 'components/AuditScreen.tsx',
          content: "export function AuditScreen() {\n  return null;\n}",
        },
        extractedComponents: [
          {
            path: 'components/Header.tsx',
            content: "export function Header() {\n  return null;\n}",
          },
        ],
        tokens: {
          path: 'components/tokens.ts',
          content: 'export const tokens = {};',
        },
        unmappedTokens: {
          colors: ['#FFFFFF'],
          spacing: [8],
          radii: [16],
        },
      },
      analysis: {
        validation: {
          lineCount: 3,
          todoCount: 1,
          placeholderCount: 0,
          relativeAssetImportCount: 1,
          selfRecursiveComponents: [],
          missingReactNativeImports: [],
          warnings: ['One TODO remains'],
        },
        integration: {
          theme: {
            importPath: '@app/theme',
            sourceFile: '/tmp/audit/src/theme/index.ts',
            exportName: 'theme',
            confidence: 'high',
            scannedFiles: ['src/theme/index.ts'],
            warnings: [],
          },
          assets: {
            strategy: 'relative-to-generated-output',
            files: [
              {
                nodeId: '1:2',
                filename: 'hero.png',
                relativePath: './assets/images/hero.png',
                category: 'image',
              },
            ],
          },
          config: {
            stylePattern: 'StyleSheet',
            importPrefix: '@app',
            tokenFileCount: 1,
            tokenFiles: ['src/theme/index.ts'],
          },
        },
        publicApi: {
          exportName: 'AuditScreen',
          props: [{ name: 'title', type: 'string', optional: false }],
        },
        fidelity: {
          input: {
            semanticTypes: { Container: 1, Text: 1, Image: 1, Button: 1 },
            textNodes: 1,
            imageLikeNodes: 1,
            interactiveNodes: 1,
            componentNodes: 0,
            detectedLists: 0,
            detectedRepeatedComponents: 0,
            assetsDownloaded: 1,
          },
          output: {
            textElements: 1,
            imageElements: 1,
            svgElements: 0,
            touchables: 1,
            pressables: 0,
            flatLists: 0,
            scrollViews: 0,
            componentFunctions: 1,
            assetRequires: 1,
          },
          gaps: [],
        },
      },
      writeResult: {
        success: true,
        projectRoot: '/tmp/audit',
        folder: '.figma/screens/AuditScreen',
        indexPath: '.figma/screens/AuditScreen/index.tsx',
        extractedPaths: ['.figma/screens/AuditScreen/Header.tsx'],
        tokensPath: '.figma/screens/AuditScreen/tokens.ts',
        screenshotPath: '.figma/screens/AuditScreen/screenshot.png',
        assetsCount: 2,
        isUpdate: false,
      },
      screenshot: Buffer.from('image'),
    } as any);

    const text = response
      .filter((part): part is Extract<typeof part, { type: 'text' }> => part.type === 'text')
      .map((part) => part.text)
      .join('\n');

    expect(text).toContain('## Summary JSON');
    expect(text).toContain('```json');
    expect(text).toContain('"screenName": "AuditScreen"');
    expect(text).toContain('"strategy": "relative-to-generated-output"');
    expect(text).toContain('"todoCount": 1');
    expect(text).toContain('"exportName": "AuditScreen"');
    expect(text).toContain('"fidelity"');
    expect(text).toContain('"textNodes": 1');
    expect(text).toContain('## Main Component');
    expect(text).toContain('```tsx');
    expect(text).toContain('export function AuditScreen()');
    expect(text).toContain('## Extracted Component: components/Header.tsx');
    expect(text).toContain('## Tokens File');
    expect(response.some((part) => part.type === 'image')).toBe(true);
  });

  it('should resolve theme import only from files that actually export theme', async () => {
    const root = await mkdtemp(join(tmpdir(), 'theme-resolve-'));

    try {
      await mkdir(join(root, 'src/theme'), { recursive: true });
      await mkdir(join(root, 'src/styles'), { recursive: true });
      await writeFile(join(root, 'src/styles/colors.ts'), 'export const colors = { primary: "#000" };');
      await writeFile(join(root, 'src/theme/index.ts'), 'export const theme = { colors: {} };');

      const resolved = await resolveThemeImportTarget(root, {
        version: '1.0.0',
        projectRoot: root,
        tokenFiles: ['src/styles/colors.ts', 'src/theme/index.ts'],
        hooks: {},
        utils: {},
        importPrefix: '@app',
        framework: 'react-native',
        stylePattern: 'StyleSheet',
      });

      expect(resolved.importPath).toBe('@app/theme');
      expect(resolved.exportName).toBe('theme');
      expect(resolved.confidence).toBe('high');
      expect(resolved.warnings).toHaveLength(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('should resolve scale import only from files that actually export the helper', async () => {
    const root = await mkdtemp(join(tmpdir(), 'scale-resolve-'));

    try {
      await mkdir(join(root, 'src/utils'), { recursive: true });
      await writeFile(join(root, 'src/utils/scaling.ts'), 'export const scale = (value: number) => value;');
      await writeFile(join(root, 'src/utils/other.ts'), 'export const noop = () => 0;');

      const resolved = await resolveNamedImportTarget(root, 'src/utils/scaling.ts', '@app', 'scale');
      const unresolved = await resolveNamedImportTarget(root, 'src/utils/other.ts', '@app', 'scale');

      expect(resolved.importPath).toBe('@app/utils/scaling');
      expect(resolved.confidence).toBe('high');
      expect(resolved.warnings).toHaveLength(0);

      expect(unresolved.importPath).toBeUndefined();
      expect(unresolved.confidence).toBe('none');
      expect(unresolved.warnings[0]).toContain('does not export "scale"');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('should report validation issues that block one-shot integration', () => {
    const analysis = analyzeGeneratedCode(`
import React from 'react';
import { View } from 'react-native';

function AvatarMaster() {
  return <AvatarMaster />;
}

export function Demo() {
  return (
    <View>
      <TouchableOpacity />
      <Image source={{ uri: '' } /* TODO: Add image source */} />
    </View>
  );
}
`);

    expect(analysis.selfRecursiveComponents).toContain('AvatarMaster');
    expect(analysis.missingReactNativeImports).toContain('TouchableOpacity');
    expect(analysis.missingReactNativeImports).toContain('Image');
    expect(analysis.todoCount).toBeGreaterThan(0);
    expect(analysis.placeholderCount).toBeGreaterThan(0);
    expect(analysis.warnings.length).toBeGreaterThan(0);
  });

  it('should compare Figma input structure to generated output without project-specific assumptions', () => {
    const screen: ScreenIR = {
      id: 'screen_1',
      name: 'AuditScreen',
      root: {
        id: '1:1',
        name: 'Root',
        semanticType: 'Container',
        boundingBox: { x: 0, y: 0, width: 100, height: 100 },
        styleRef: 'root',
        layout: {
          type: 'column',
          gap: 0,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          mainAlign: 'start',
          crossAlign: 'start',
          sizing: { horizontal: 'fixed', vertical: 'fixed' },
        },
        children: [
          {
            id: '1:2',
            name: 'Title',
            semanticType: 'Text',
            boundingBox: { x: 0, y: 0, width: 100, height: 20 },
            styleRef: 'title',
            text: 'Hello',
          },
          {
            id: '1:3',
            name: 'Hero',
            semanticType: 'Image',
            boundingBox: { x: 0, y: 0, width: 100, height: 100 },
            styleRef: 'hero',
            imageRef: 'hero-ref',
          },
          {
            id: '1:4',
            name: 'CTA',
            semanticType: 'Button',
            boundingBox: { x: 0, y: 0, width: 100, height: 40 },
            styleRef: 'cta',
            label: 'Tap',
            variant: 'primary',
          },
        ],
      } as any,
      stylesBundle: {
        styles: { root: { id: 'root' } },
        tokens: { colors: {}, spacing: {}, radii: {}, typography: {}, shadows: {} },
      },
    };

    const fidelity = analyzeInputOutputFidelity(
      screen,
      { lists: [], components: [] },
      `
        import React from 'react';
        import { Image, Text, TouchableOpacity, View } from 'react-native';

        export function AuditScreen() {
          return (
            <View>
              <Text>Hello</Text>
              <Image source={require('./assets/images/hero.png')} />
              <TouchableOpacity />
            </View>
          );
        }
      `,
      [
        {
          nodeId: '1:3',
          imageRef: 'hero-ref',
          filename: 'hero.png',
          localPath: '/tmp/hero.png',
          relativePath: './assets/images/hero.png',
          category: 'image',
        },
      ]
    );

    expect(fidelity.input.textNodes).toBe(1);
    expect(fidelity.input.imageLikeNodes).toBe(1);
    expect(fidelity.input.interactiveNodes).toBe(1);
    expect(fidelity.output.textElements).toBe(1);
    expect(fidelity.output.imageElements).toBe(1);
    expect(fidelity.output.touchables).toBe(1);
    expect(fidelity.gaps).toHaveLength(0);
  });

  it('should generate deterministic unique asset filenames for colliding names', () => {
    const used = new Set<string>();
    const first = buildUniqueAssetFilename('vector', 'svg', 'node-a', used);
    const second = buildUniqueAssetFilename('vector', 'svg', 'node-b', used);

    const usedAgain = new Set<string>();
    const repeatFirst = buildUniqueAssetFilename('vector', 'svg', 'node-a', usedAgain);
    const repeatSecond = buildUniqueAssetFilename('vector', 'svg', 'node-b', usedAgain);

    expect(first).toBe('vector.svg');
    expect(second).toMatch(/^vector-[a-z0-9]{6}\.svg$/);
    expect(second).not.toBe(first);
    expect(repeatFirst).toBe(first);
    expect(repeatSecond).toBe(second);
  });
});
