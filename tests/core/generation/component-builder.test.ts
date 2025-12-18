import { describe, it, expect } from 'vitest';
import { generateComponent } from '../../../src/core/generation/component-builder.js';
import type { ScreenIR, ContainerIR, TextIR, ButtonIR } from '../../../src/core/types.js';
import type { TokenMappings } from '../../../src/core/mapping/token-matcher.js';

describe('generateComponent', () => {
  const baseBoundingBox = { x: 0, y: 0, width: 100, height: 100 };
  const baseLayout = {
    type: 'column' as const,
    gap: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    mainAlign: 'start' as const,
    crossAlign: 'start' as const,
  };

  const emptyMappings: TokenMappings = {
    colors: {},
    spacing: {},
    radii: {},
    typography: {},
    shadows: {},
  };

  it('should generate complete TSX component', () => {
    const screen: ScreenIR = {
      id: 'screen_1',
      name: 'ProductCard',
      root: {
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
            text: 'Product Name',
          } as TextIR,
        ],
      } as ContainerIR,
      stylesBundle: {
        styles: {
          style_1: { id: 'container', backgroundColor: '#FFFFFF' },
          style_2: {
            id: 'title',
            typography: {
              fontFamily: 'Inter',
              fontSize: 18,
              fontWeight: 600,
              lineHeight: 24,
              letterSpacing: 0,
              textAlign: 'left',
              color: '#1F2937',
            },
          },
        },
        tokens: {
          colors: {},
          spacing: {},
          radii: {},
          typography: {},
          shadows: {},
        },
      },
    };

    const result = generateComponent(screen, emptyMappings);

    // Check imports
    expect(result.code).toContain("import React from 'react';");
    expect(result.code).toContain("from 'react-native'");
    expect(result.code).toContain('StyleSheet');
    expect(result.code).toContain('View');
    expect(result.code).toContain('Text');

    // Check component definition
    expect(result.code).toContain('export function ProductCard()');

    // Check JSX structure
    expect(result.code).toContain('<View style={styles.container}>');
    expect(result.code).toContain('<Text style={styles.title}>');
    expect(result.code).toContain('Product Name');
    expect(result.code).toContain('</Text>');
    expect(result.code).toContain('</View>');

    // Check StyleSheet
    expect(result.code).toContain('const styles = StyleSheet.create({');
    expect(result.code).toContain('container: {');
    expect(result.code).toContain('title: {');
  });

  it('should use custom component name when provided', () => {
    const screen: ScreenIR = {
      id: 'screen_1',
      name: 'frame-123',
      root: {
        id: '1:1',
        name: 'container',
        semanticType: 'Container',
        boundingBox: baseBoundingBox,
        styleRef: 'style_1',
        layout: baseLayout,
        children: [],
      } as ContainerIR,
      stylesBundle: {
        styles: { style_1: { id: 'container' } },
        tokens: {
          colors: {},
          spacing: {},
          radii: {},
          typography: {},
          shadows: {},
        },
      },
    };

    const result = generateComponent(screen, emptyMappings, {
      componentName: 'MyCustomComponent',
    });

    expect(result.code).toContain('export function MyCustomComponent()');
  });

  it('should convert screen name to PascalCase', () => {
    const screen: ScreenIR = {
      id: 'screen_1',
      name: 'user-profile-card',
      root: {
        id: '1:1',
        name: 'container',
        semanticType: 'Container',
        boundingBox: baseBoundingBox,
        styleRef: 'style_1',
        layout: baseLayout,
        children: [],
      } as ContainerIR,
      stylesBundle: {
        styles: { style_1: { id: 'container' } },
        tokens: {
          colors: {},
          spacing: {},
          radii: {},
          typography: {},
          shadows: {},
        },
      },
    };

    const result = generateComponent(screen, emptyMappings);

    expect(result.code).toContain('export function UserProfileCard()');
  });

  it('should return unmapped tokens report', () => {
    const screen: ScreenIR = {
      id: 'screen_1',
      name: 'Card',
      root: {
        id: '1:1',
        name: 'card',
        semanticType: 'Container',
        boundingBox: baseBoundingBox,
        styleRef: 'style_1',
        layout: baseLayout,
        children: [],
      } as ContainerIR,
      stylesBundle: {
        styles: {
          style_1: {
            id: 'card',
            backgroundColor: '#FF5733',
            borderRadius: 12,
          },
        },
        tokens: {
          colors: { color_0: '#FF5733' },
          spacing: {},
          radii: { radius_0: 12 },
          typography: {},
          shadows: {},
        },
      },
    };

    const result = generateComponent(screen, emptyMappings);

    expect(result.unmappedTokens.colors).toContain('#FF5733');
    expect(result.unmappedTokens.radii).toContain(12);
  });

  it('should generate Button with TouchableOpacity', () => {
    const screen: ScreenIR = {
      id: 'screen_1',
      name: 'ButtonDemo',
      root: {
        id: '1:1',
        name: 'submitBtn',
        semanticType: 'Button',
        boundingBox: baseBoundingBox,
        styleRef: 'style_1',
        label: 'Submit',
        variant: 'primary',
      } as ButtonIR,
      stylesBundle: {
        styles: {
          style_1: {
            id: 'submitBtn',
            backgroundColor: '#3B82F6',
            borderRadius: 8,
          },
        },
        tokens: {
          colors: {},
          spacing: {},
          radii: {},
          typography: {},
          shadows: {},
        },
      },
    };

    const result = generateComponent(screen, emptyMappings);

    expect(result.code).toContain('TouchableOpacity');
    expect(result.code).toContain('<TouchableOpacity');
    expect(result.code).toContain('onPress={() => {}}');
    expect(result.code).toContain('Submit');
  });

  it('should apply token mappings to generated styles', () => {
    const screen: ScreenIR = {
      id: 'screen_1',
      name: 'ThemedCard',
      root: {
        id: '1:1',
        name: 'card',
        semanticType: 'Container',
        boundingBox: baseBoundingBox,
        styleRef: 'style_1',
        layout: baseLayout,
        children: [],
      } as ContainerIR,
      stylesBundle: {
        styles: {
          style_1: {
            id: 'card',
            backgroundColor: '#3B82F6',
          },
        },
        tokens: {
          colors: { color_0: '#3B82F6' },
          spacing: {},
          radii: {},
          typography: {},
          shadows: {},
        },
      },
    };

    const mappings: TokenMappings = {
      colors: { '#3B82F6': 'theme.colors.primary' },
      spacing: {},
      radii: {},
      typography: {},
      shadows: {},
    };

    const result = generateComponent(screen, mappings);

    expect(result.code).toContain('backgroundColor: theme.colors.primary');
    expect(result.unmappedTokens.colors).not.toContain('#3B82F6');
  });
});
