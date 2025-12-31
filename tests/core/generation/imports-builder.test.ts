import { describe, it, expect } from 'vitest';
import { buildImports } from '../../../src/core/generation/imports-builder.js';
import type { IRNode, ContainerIR, TextIR, ImageIR, ButtonIR, IconIR } from '../../../src/core/types.js';

describe('buildImports', () => {
  const baseBoundingBox = { x: 0, y: 0, width: 100, height: 100 };
  const baseLayout = {
    type: 'column' as const,
    gap: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    mainAlign: 'start' as const,
    crossAlign: 'start' as const,
  };

  it('should always include StyleSheet', () => {
    const container: ContainerIR = {
      id: '1:1',
      name: 'container',
      semanticType: 'Container',
      boundingBox: baseBoundingBox,
      styleRef: 'style_1',
      layout: baseLayout,
      children: [],
    };

    const result = buildImports(container);
    expect(result).toContain('StyleSheet');
  });

  it('should include View for Container', () => {
    const container: ContainerIR = {
      id: '1:1',
      name: 'container',
      semanticType: 'Container',
      boundingBox: baseBoundingBox,
      styleRef: 'style_1',
      layout: baseLayout,
      children: [],
    };

    const result = buildImports(container);
    expect(result).toContain('View');
  });

  it('should include Text for Text node', () => {
    const container: ContainerIR = {
      id: '1:1',
      name: 'container',
      semanticType: 'Container',
      boundingBox: baseBoundingBox,
      styleRef: 'style_1',
      layout: baseLayout,
      children: [
        {
          id: '1:2',
          name: 'title',
          semanticType: 'Text',
          boundingBox: baseBoundingBox,
          styleRef: 'style_2',
          text: 'Hello',
        } as TextIR,
      ],
    };

    const result = buildImports(container);
    expect(result).toContain('Text');
  });

  it('should include Image for Image node', () => {
    const container: ContainerIR = {
      id: '1:1',
      name: 'container',
      semanticType: 'Container',
      boundingBox: baseBoundingBox,
      styleRef: 'style_1',
      layout: baseLayout,
      children: [
        {
          id: '1:2',
          name: 'avatar',
          semanticType: 'Image',
          boundingBox: baseBoundingBox,
          styleRef: 'style_2',
        } as ImageIR,
      ],
    };

    const result = buildImports(container);
    expect(result).toContain('Image');
  });

  it('should include TouchableOpacity and Text for Button', () => {
    const container: ContainerIR = {
      id: '1:1',
      name: 'container',
      semanticType: 'Container',
      boundingBox: baseBoundingBox,
      styleRef: 'style_1',
      layout: baseLayout,
      children: [
        {
          id: '1:2',
          name: 'submitBtn',
          semanticType: 'Button',
          boundingBox: baseBoundingBox,
          styleRef: 'style_2',
          label: 'Submit',
          variant: 'primary',
        } as ButtonIR,
      ],
    };

    const result = buildImports(container);
    expect(result).toContain('TouchableOpacity');
    expect(result).toContain('Text');
  });

  it('should include Image for Icon node', () => {
    const container: ContainerIR = {
      id: '1:1',
      name: 'container',
      semanticType: 'Container',
      boundingBox: baseBoundingBox,
      styleRef: 'style_1',
      layout: baseLayout,
      children: [
        {
          id: '1:2',
          name: 'settingsIcon',
          semanticType: 'Icon',
          boundingBox: baseBoundingBox,
          styleRef: 'style_2',
          iconRef: './assets/settings.png',
          size: 24,
        } as IconIR,
      ],
    };

    const result = buildImports(container);
    expect(result).toContain('Image');
  });

  it('should sort imports alphabetically', () => {
    const container: ContainerIR = {
      id: '1:1',
      name: 'container',
      semanticType: 'Container',
      boundingBox: baseBoundingBox,
      styleRef: 'style_1',
      layout: baseLayout,
      children: [
        {
          id: '1:2',
          name: 'text',
          semanticType: 'Text',
          boundingBox: baseBoundingBox,
          styleRef: 'style_2',
          text: 'Hello',
        } as TextIR,
        {
          id: '1:3',
          name: 'image',
          semanticType: 'Image',
          boundingBox: baseBoundingBox,
          styleRef: 'style_3',
        } as ImageIR,
      ],
    };

    const result = buildImports(container);
    // Should be alphabetical: Image, StyleSheet, Text, View
    expect(result).toMatch(/Image.*StyleSheet.*Text.*View/);
  });

  it('should format imports correctly', () => {
    const container: ContainerIR = {
      id: '1:1',
      name: 'container',
      semanticType: 'Container',
      boundingBox: baseBoundingBox,
      styleRef: 'style_1',
      layout: baseLayout,
      children: [],
    };

    const result = buildImports(container);
    expect(result).toContain("import React from 'react';");
    expect(result).toContain("from 'react-native'");
  });

  describe('Unistyles support', () => {
    it('should import StyleSheet from react-native-unistyles when using unistyles pattern', () => {
      const container: ContainerIR = {
        id: '1:1',
        name: 'container',
        semanticType: 'Container',
        boundingBox: baseBoundingBox,
        styleRef: 'style_1',
        layout: baseLayout,
        children: [],
      };

      const result = buildImports(container, [], undefined, {
        importPrefix: '@app',
        stylePattern: 'unistyles',
        hasProjectTheme: true,
      });

      expect(result).toContain("import { StyleSheet } from 'react-native-unistyles';");
      expect(result).not.toMatch(/import \{[^}]*StyleSheet[^}]*\} from 'react-native'/);
    });

    it('should not include separate theme import for unistyles', () => {
      const container: ContainerIR = {
        id: '1:1',
        name: 'container',
        semanticType: 'Container',
        boundingBox: baseBoundingBox,
        styleRef: 'style_1',
        layout: baseLayout,
        children: [],
      };

      const result = buildImports(container, [], undefined, {
        importPrefix: '@app',
        stylePattern: 'unistyles',
        hasProjectTheme: true,
        themeImportPath: '@app/styles',
      });

      expect(result).not.toContain("import { theme }");
      expect(result).not.toContain("import { useTheme }");
    });

    it('should still import other RN components normally with unistyles', () => {
      const container: ContainerIR = {
        id: '1:1',
        name: 'container',
        semanticType: 'Container',
        boundingBox: baseBoundingBox,
        styleRef: 'style_1',
        layout: baseLayout,
        children: [
          {
            id: '1:2',
            name: 'title',
            semanticType: 'Text',
            boundingBox: baseBoundingBox,
            styleRef: 'style_2',
            text: 'Hello',
          } as TextIR,
        ],
      };

      const result = buildImports(container, [], undefined, {
        importPrefix: '@app',
        stylePattern: 'unistyles',
        hasProjectTheme: true,
      });

      expect(result).toContain("import { Text, View } from 'react-native';");
      expect(result).toContain("import { StyleSheet } from 'react-native-unistyles';");
    });
  });
});
