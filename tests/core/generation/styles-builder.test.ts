import { describe, it, expect } from 'vitest';
import { buildStyles } from '../../../src/core/generation/styles-builder.js';
import type { ContainerIR, StylesBundle } from '../../../src/core/types.js';
import type { TokenMappings } from '../../../src/core/mapping/token-matcher.js';

describe('buildStyles', () => {
  const baseBoundingBox = { x: 0, y: 0, width: 100, height: 100 };
  const baseLayout = {
    type: 'column' as const,
    gap: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    mainAlign: 'start' as const,
    crossAlign: 'start' as const,
    sizing: { horizontal: 'fixed' as const, vertical: 'fixed' as const },
  };

  const emptyMappings: TokenMappings = {
    colors: {},
    spacing: {},
    radii: {},
    typography: {},
    shadows: {},
  };

  it('should generate StyleSheet.create structure', () => {
    const root: ContainerIR = {
      id: '1:1',
      name: 'container',
      semanticType: 'Container',
      boundingBox: baseBoundingBox,
      styleRef: 'container',
      layout: baseLayout,
      children: [],
    };

    const stylesBundle: StylesBundle = {
      styles: {
        container: {
          id: 'container',
          backgroundColor: '#FFFFFF',
        },
      },
      tokens: {
        colors: {},
        spacing: {},
        radii: {},
        typography: {},
        shadows: {},
      },
    };

    const result = buildStyles(root, stylesBundle, emptyMappings);
    expect(result.code).toContain('const styles = StyleSheet.create({');
    expect(result.code).toContain('container: {');
    expect(result.code).toContain("backgroundColor: '#FFFFFF'");
    expect(result.code).toContain('});');
  });

  it('should generate layout properties for containers', () => {
    const root: ContainerIR = {
      id: '1:1',
      name: 'row',
      semanticType: 'Container',
      boundingBox: baseBoundingBox,
      styleRef: 'row',
      layout: {
        type: 'row',
        gap: 16,
        padding: { top: 8, right: 16, bottom: 8, left: 16 },
        mainAlign: 'space-between',
        crossAlign: 'center',
        sizing: { horizontal: 'fixed' as const, vertical: 'fixed' as const },
      },
      children: [],
    };

    const stylesBundle: StylesBundle = {
      styles: {
        row: { id: 'row' },
      },
      tokens: {
        colors: {},
        spacing: {},
        radii: {},
        typography: {},
        shadows: {},
      },
    };

    const result = buildStyles(root, stylesBundle, emptyMappings);
    expect(result.code).toContain("flexDirection: 'row'");
    expect(result.code).toContain('gap: 16');
    expect(result.code).toContain("justifyContent: 'space-between'");
    expect(result.code).toContain("alignItems: 'center'");
    expect(result.code).toContain('paddingTop: 8');
    expect(result.code).toContain('paddingRight: 16');
    expect(result.code).toContain('paddingBottom: 8');
    expect(result.code).toContain('paddingLeft: 16');
  });

  it('should apply color mappings from theme', () => {
    const root: ContainerIR = {
      id: '1:1',
      name: 'card',
      semanticType: 'Container',
      boundingBox: baseBoundingBox,
      styleRef: 'card',
      layout: baseLayout,
      children: [],
    };

    const stylesBundle: StylesBundle = {
      styles: {
        card: {
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
    };

    const mappings: TokenMappings = {
      colors: { '#3B82F6': 'theme.colors.primary' },
      spacing: {},
      radii: {},
      typography: {},
      shadows: {},
    };

    const result = buildStyles(root, stylesBundle, mappings);
    expect(result.code).toContain('backgroundColor: theme.colors.primary');
    expect(result.unmapped.colors).not.toContain('#3B82F6');
  });

  it('should add TODO comment for unmapped colors', () => {
    const root: ContainerIR = {
      id: '1:1',
      name: 'box',
      semanticType: 'Container',
      boundingBox: baseBoundingBox,
      styleRef: 'box',
      layout: baseLayout,
      children: [],
    };

    const stylesBundle: StylesBundle = {
      styles: {
        box: {
          id: 'box',
          backgroundColor: '#FF5733',
        },
      },
      tokens: {
        colors: {},
        spacing: {},
        radii: {},
        typography: {},
        shadows: {},
      },
    };

    const result = buildStyles(root, stylesBundle, emptyMappings);
    expect(result.code).toContain("backgroundColor: '#FF5733'");
    expect(result.code).toContain('// TODO: map to theme');
    expect(result.unmapped.colors).toContain('#FF5733');
  });

  it('should generate border radius properties', () => {
    const root: ContainerIR = {
      id: '1:1',
      name: 'rounded',
      semanticType: 'Container',
      boundingBox: baseBoundingBox,
      styleRef: 'rounded',
      layout: baseLayout,
      children: [],
    };

    const stylesBundle: StylesBundle = {
      styles: {
        rounded: {
          id: 'rounded',
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
    };

    const result = buildStyles(root, stylesBundle, emptyMappings);
    expect(result.code).toContain('borderRadius: 8');
  });

  it('should generate individual corner radius', () => {
    const root: ContainerIR = {
      id: '1:1',
      name: 'asymmetric',
      semanticType: 'Container',
      boundingBox: baseBoundingBox,
      styleRef: 'asymmetric',
      layout: baseLayout,
      children: [],
    };

    const stylesBundle: StylesBundle = {
      styles: {
        asymmetric: {
          id: 'asymmetric',
          borderRadius: {
            topLeft: 8,
            topRight: 8,
            bottomRight: 0,
            bottomLeft: 0,
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
    };

    const result = buildStyles(root, stylesBundle, emptyMappings);
    expect(result.code).toContain('borderTopLeftRadius: 8');
    expect(result.code).toContain('borderTopRightRadius: 8');
    expect(result.code).not.toContain('borderBottomRightRadius');
    expect(result.code).not.toContain('borderBottomLeftRadius');
  });

  it('should generate shadow properties', () => {
    const root: ContainerIR = {
      id: '1:1',
      name: 'elevated',
      semanticType: 'Container',
      boundingBox: baseBoundingBox,
      styleRef: 'elevated',
      layout: baseLayout,
      children: [],
    };

    const stylesBundle: StylesBundle = {
      styles: {
        elevated: {
          id: 'elevated',
          shadow: {
            color: '#000000',
            offsetX: 0,
            offsetY: 4,
            blur: 8,
            spread: 0,
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
    };

    const result = buildStyles(root, stylesBundle, emptyMappings);
    expect(result.code).toContain("shadowColor: '#000000'");
    expect(result.code).toContain('shadowOffset: { width: 0, height: 4 }');
    expect(result.code).toContain('shadowOpacity: 1');
    expect(result.code).toContain('shadowRadius: 8');
    expect(result.code).toContain('elevation: 4');
  });

  it('should generate typography properties', () => {
    const root: ContainerIR = {
      id: '1:1',
      name: 'title',
      semanticType: 'Container',
      boundingBox: baseBoundingBox,
      styleRef: 'title',
      layout: baseLayout,
      children: [],
    };

    const stylesBundle: StylesBundle = {
      styles: {
        title: {
          id: 'title',
          typography: {
            fontFamily: 'Inter',
            fontSize: 24,
            fontWeight: 700,
            lineHeight: 32,
            letterSpacing: -0.5,
            textAlign: 'center',
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
    };

    const result = buildStyles(root, stylesBundle, emptyMappings);
    expect(result.code).toContain("fontFamily: 'Inter'");
    expect(result.code).toContain('fontSize: 24');
    expect(result.code).toContain("fontWeight: '700'");
    expect(result.code).toContain('lineHeight: 32');
    expect(result.code).toContain('letterSpacing: -0.5');
    expect(result.code).toContain("textAlign: 'center'");
    expect(result.code).toContain("color: '#1F2937'");
  });

  it('should handle opacity less than 1', () => {
    const root: ContainerIR = {
      id: '1:1',
      name: 'translucent',
      semanticType: 'Container',
      boundingBox: baseBoundingBox,
      styleRef: 'translucent',
      layout: baseLayout,
      children: [],
    };

    const stylesBundle: StylesBundle = {
      styles: {
        translucent: {
          id: 'translucent',
          opacity: 0.5,
        },
      },
      tokens: {
        colors: {},
        spacing: {},
        radii: {},
        typography: {},
        shadows: {},
      },
    };

    const result = buildStyles(root, stylesBundle, emptyMappings);
    expect(result.code).toContain('opacity: 0.5');
  });

  it('should not include opacity when it equals 1', () => {
    const root: ContainerIR = {
      id: '1:1',
      name: 'opaque',
      semanticType: 'Container',
      boundingBox: baseBoundingBox,
      styleRef: 'opaque',
      layout: baseLayout,
      children: [],
    };

    const stylesBundle: StylesBundle = {
      styles: {
        opaque: {
          id: 'opaque',
          opacity: 1,
        },
      },
      tokens: {
        colors: {},
        spacing: {},
        radii: {},
        typography: {},
        shadows: {},
      },
    };

    const result = buildStyles(root, stylesBundle, emptyMappings);
    expect(result.code).not.toContain('opacity:');
  });

  describe('Unistyles support', () => {
    it('should wrap styles in theme callback for unistyles pattern', () => {
      const root: ContainerIR = {
        id: '1:1',
        name: 'container',
        semanticType: 'Container',
        boundingBox: baseBoundingBox,
        styleRef: 'container',
        layout: baseLayout,
        children: [],
      };

      const stylesBundle: StylesBundle = {
        styles: {
          container: {
            id: 'container',
            backgroundColor: '#FFFFFF',
          },
        },
        tokens: {
          colors: {},
          spacing: {},
          radii: {},
          typography: {},
          shadows: {},
        },
      };

      const result = buildStyles(root, stylesBundle, emptyMappings, {
        stylePattern: 'unistyles',
      });

      expect(result.code).toContain('const styles = StyleSheet.create(theme => ({');
      expect(result.code).toContain('}));');
      expect(result.code).toContain('container: {');
    });

    it('should use standard StyleSheet.create for non-unistyles patterns', () => {
      const root: ContainerIR = {
        id: '1:1',
        name: 'container',
        semanticType: 'Container',
        boundingBox: baseBoundingBox,
        styleRef: 'container',
        layout: baseLayout,
        children: [],
      };

      const stylesBundle: StylesBundle = {
        styles: {
          container: {
            id: 'container',
            backgroundColor: '#FFFFFF',
          },
        },
        tokens: {
          colors: {},
          spacing: {},
          radii: {},
          typography: {},
          shadows: {},
        },
      };

      const result = buildStyles(root, stylesBundle, emptyMappings, {
        stylePattern: 'StyleSheet',
      });

      expect(result.code).toContain('const styles = StyleSheet.create({');
      expect(result.code).not.toContain('theme => ({');
      expect(result.code).toMatch(/}\);$/);
    });

    it('should preserve theme token references in unistyles output', () => {
      const root: ContainerIR = {
        id: '1:1',
        name: 'card',
        semanticType: 'Container',
        boundingBox: baseBoundingBox,
        styleRef: 'card',
        layout: baseLayout,
        children: [],
      };

      const stylesBundle: StylesBundle = {
        styles: {
          card: {
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
      };

      const mappings: TokenMappings = {
        colors: { '#3B82F6': 'theme.colors.primary' },
        spacing: {},
        radii: {},
        typography: {},
        shadows: {},
      };

      const result = buildStyles(root, stylesBundle, mappings, {
        stylePattern: 'unistyles',
      });

      // Theme tokens work in both patterns - theme is available via callback
      expect(result.code).toContain('backgroundColor: theme.colors.primary');
      expect(result.code).toContain('theme => ({');
    });
  });
});
