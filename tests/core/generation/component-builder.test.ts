import { describe, it, expect } from 'vitest';
import { generateComponent, generateComponentMultiFile } from '../../../src/core/generation/component-builder.js';
import type { ScreenIR, ContainerIR, TextIR, ButtonIR, ComponentIR, ImageIR } from '../../../src/core/types.js';
import type { TokenMappings } from '../../../src/core/mapping/token-matcher.js';
import type { DetectionResult } from '../../../src/core/detection/types.js';

describe('generateComponent', () => {
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

  it('should generate complete TSX component', () => {
    const screen: ScreenIR = {
      id: 'screen_1',
      name: 'ProductCard',
      root: {
        id: '1:1',
        name: 'container',
        semanticType: 'Container',
        boundingBox: baseBoundingBox,
        styleRef: 'container',
        layout: baseLayout,
        children: [
          {
            id: '1:2',
            name: 'title',
            semanticType: 'Text',
            boundingBox: baseBoundingBox,
            styleRef: 'title',
            text: 'Product Name',
          } as TextIR,
        ],
      } as ContainerIR,
      stylesBundle: {
        styles: {
          container: { id: 'container', backgroundColor: '#ffffff' },
          title: {
            id: 'title',
            typography: {
              fontFamily: 'Inter',
              fontSize: 18,
              fontWeight: 600,
              lineHeight: 24,
              letterSpacing: 0,
              textAlign: 'left',
              color: '#1f2937',
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
    expect(result.code).toContain('export function ProductCard(');

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
        styleRef: 'container',
        layout: baseLayout,
        children: [],
      } as ContainerIR,
      stylesBundle: {
        styles: { container: { id: 'container' } },
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
        styleRef: 'container',
        layout: baseLayout,
        children: [],
      } as ContainerIR,
      stylesBundle: {
        styles: { container: { id: 'container' } },
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

    expect(result.code).toContain('export function UserProfileCard(');
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
        styleRef: 'card',
        layout: baseLayout,
        children: [],
      } as ContainerIR,
      stylesBundle: {
        styles: {
          card: {
            id: 'card',
            backgroundColor: '#ff5733',
            borderRadius: 12,
          },
        },
        tokens: {
          colors: { color_0: '#ff5733' },
          spacing: {},
          radii: { radius_0: 12 },
          typography: {},
          shadows: {},
        },
      },
    };

    const result = generateComponent(screen, emptyMappings);

    expect(result.unmappedTokens.colors).toContain('#ff5733');
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
        styleRef: 'submitBtn',
        label: 'Submit',
        variant: 'primary',
      } as ButtonIR,
      stylesBundle: {
        styles: {
          submitBtn: {
            id: 'submitBtn',
            backgroundColor: '#3b82f6',
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
        styleRef: 'card',
        layout: baseLayout,
        children: [],
      } as ContainerIR,
      stylesBundle: {
        styles: {
          card: {
            id: 'card',
            backgroundColor: '#3b82f6',
          },
        },
        tokens: {
          colors: { color_0: '#3b82f6' },
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

  it('should not generate self-recursive subcomponents for redundant component wrappers', () => {
    const screen: ScreenIR = {
      id: 'screen_1',
      name: 'ProfileScreen',
      root: {
        id: '1:1',
        name: 'container',
        semanticType: 'Container',
        boundingBox: baseBoundingBox,
        styleRef: 'screen',
        layout: baseLayout,
        children: [
          {
            id: 'comp:1',
            name: 'Avatar Master',
            semanticType: 'Component',
            componentId: 'avatar-master',
            componentName: 'AvatarMaster',
            boundingBox: baseBoundingBox,
            styleRef: 'avatarRoot',
            layout: baseLayout,
            children: [
              {
                id: 'comp:2',
                name: 'AvatarMaster',
                semanticType: 'Component',
                componentId: 'avatar-master-inner',
                componentName: 'AvatarMaster',
                boundingBox: baseBoundingBox,
                styleRef: 'avatarInner',
                layout: baseLayout,
                children: [
                  {
                    id: 'text:1',
                    name: 'title',
                    semanticType: 'Text',
                    boundingBox: baseBoundingBox,
                    styleRef: 'title',
                    text: 'Profile',
                  } as TextIR,
                ],
              } as ComponentIR,
            ],
          } as ComponentIR,
        ],
      } as ContainerIR,
      stylesBundle: {
        styles: {
          screen: { id: 'screen' },
          avatarRoot: { id: 'avatarRoot' },
          avatarInner: { id: 'avatarInner' },
          title: {
            id: 'title',
            typography: {
              fontFamily: 'Inter',
              fontSize: 16,
              fontWeight: 400,
              lineHeight: 20,
              letterSpacing: 0,
              textAlign: 'left',
              color: '#111111',
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

    expect(result.code).toContain('function AvatarMaster');
    expect(result.code).toContain('<Text style={styles.title}>');
    expect(result.code).not.toMatch(/function AvatarMaster\([^]*?<AvatarMaster\b/);
  });

  it('should tolerate component instances without children during subcomponent generation', () => {
    const screen: ScreenIR = {
      id: 'screen_1',
      name: 'ProfileScreen',
      root: {
        id: '1:1',
        name: 'screen',
        semanticType: 'Container',
        boundingBox: baseBoundingBox,
        styleRef: 'screen',
        layout: baseLayout,
        children: [
          {
            id: '1:2',
            name: 'AvatarMaster',
            semanticType: 'Component',
            componentId: 'avatar_master',
            componentName: 'AvatarMaster',
            boundingBox: baseBoundingBox,
            styleRef: 'avatarRoot',
            layout: baseLayout,
            children: undefined,
          } as any,
        ],
      } as ContainerIR,
      stylesBundle: {
        styles: {
          screen: { id: 'screen' },
          avatarRoot: { id: 'avatarRoot' },
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

    expect(result.code).toContain('function AvatarMaster');
    expect(result.code).toContain('<View style={styles.avatarRoot} />');
  });

  it('should tolerate detection results without component hints', () => {
    const screen: ScreenIR = {
      id: 'screen_1',
      name: 'ProfileScreen',
      root: {
        id: '1:1',
        name: 'screen',
        semanticType: 'Container',
        boundingBox: baseBoundingBox,
        styleRef: 'screen',
        layout: baseLayout,
        children: [
          {
            id: '1:2',
            name: 'AvatarMaster',
            semanticType: 'Component',
            componentId: 'avatar_master',
            componentName: 'AvatarMaster',
            boundingBox: baseBoundingBox,
            styleRef: 'avatarRoot',
            layout: baseLayout,
            children: [],
          } as ComponentIR,
        ],
      } as ContainerIR,
      stylesBundle: {
        styles: {
          screen: { id: 'screen' },
          avatarRoot: { id: 'avatarRoot' },
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

    const result = generateComponent(screen, emptyMappings, {
      detectionResult: {} as any,
    });

    expect(result.code).toContain('function AvatarMaster');
  });

  it('should not hoist nested component props into the root screen public API', () => {
    const screen: ScreenIR = {
      id: 'screen_1',
      name: 'ProfileScreen',
      root: {
        id: '1:1',
        name: 'screen',
        semanticType: 'Container',
        boundingBox: baseBoundingBox,
        styleRef: 'screen',
        layout: baseLayout,
        children: [
          {
            id: '1:2',
            name: 'title',
            semanticType: 'Text',
            boundingBox: baseBoundingBox,
            styleRef: 'title',
            text: 'Profile',
          } as TextIR,
          {
            id: '1:3',
            name: 'MasterCard',
            semanticType: 'Component',
            componentId: 'master_card',
            componentName: 'MasterCard',
            boundingBox: baseBoundingBox,
            styleRef: 'masterCard',
            layout: baseLayout,
            children: [
              {
                id: '1:4',
                name: 'rating',
                semanticType: 'Text',
                boundingBox: baseBoundingBox,
                styleRef: 'rating',
                text: '4.9',
              } as TextIR,
            ],
          } as ComponentIR,
        ],
      } as ContainerIR,
      stylesBundle: {
        styles: {
          screen: { id: 'screen' },
          title: {
            id: 'title',
            typography: {
              fontFamily: 'Inter',
              fontSize: 16,
              fontWeight: 500,
              lineHeight: 20,
              letterSpacing: 0,
              textAlign: 'left',
              color: '#111111',
            },
          },
          masterCard: { id: 'masterCard' },
          rating: {
            id: 'rating',
            typography: {
              fontFamily: 'Inter',
              fontSize: 12,
              fontWeight: 400,
              lineHeight: 16,
              letterSpacing: 0,
              textAlign: 'left',
              color: '#222222',
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
    const rootPropsInterface = result.code.match(/interface ProfileScreenProps \{[\s\S]*?\n\}/)?.[0] || '';
    const subComponentPropsInterface = result.code.match(/interface MasterCardProps \{[\s\S]*?\n\}/)?.[0] || '';

    expect(result.code).toContain('interface ProfileScreenProps');
    expect(rootPropsInterface).toContain('title: string;');
    expect(rootPropsInterface).not.toContain('rating: string;');
    expect(result.code).toContain('interface MasterCardProps');
    expect(result.code).toContain('function MasterCard');
    expect(subComponentPropsInterface).toContain('rating: string;');
  });

  it('should not forward stale nested component props that are unused by generated JSX', () => {
    const staleImageProp = {
      childIcon: {
        type: 'image' as const,
        value: 'icon-hash',
        defaultValue: 'icon-hash',
      },
    };

    const screen: ScreenIR = {
      id: 'screen_1',
      name: 'ProfileScreen',
      root: {
        id: '1:1',
        name: 'screen',
        semanticType: 'Container',
        boundingBox: baseBoundingBox,
        styleRef: 'screen',
        layout: baseLayout,
        children: [
          {
            id: '1:2',
            name: 'Parent',
            semanticType: 'Component',
            componentId: 'parent_component',
            componentName: 'Parent',
            boundingBox: baseBoundingBox,
            styleRef: 'parent',
            layout: baseLayout,
            children: [
              {
                id: '1:3',
                name: 'Child',
                semanticType: 'Component',
                componentId: 'child_component',
                componentName: 'Child',
                boundingBox: baseBoundingBox,
                styleRef: 'child',
                layout: baseLayout,
                children: [],
                props: staleImageProp,
              } as ComponentIR,
            ],
          } as ComponentIR,
        ],
      } as ContainerIR,
      stylesBundle: {
        styles: {
          screen: { id: 'screen' },
          parent: { id: 'parent' },
          child: { id: 'child' },
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

    expect(result.code).toContain('function Child({})');
    expect(result.code).toContain('function Parent({})');
    expect(result.code).not.toContain('<Child childIcon={childIcon} />');
    expect(result.code).not.toContain('childIcon: ImageSourcePropType;');
  });

  it('should not pass nested component props from a parent scope that does not define them', () => {
    const screen: ScreenIR = {
      id: 'screen_1',
      name: 'ProfileScreen',
      root: {
        id: '1:1',
        name: 'screen',
        semanticType: 'Container',
        boundingBox: baseBoundingBox,
        styleRef: 'screen',
        layout: baseLayout,
        children: [
          {
            id: '1:2',
            name: 'Header',
            semanticType: 'Component',
            componentId: 'header_component',
            componentName: 'Header',
            boundingBox: baseBoundingBox,
            styleRef: 'header',
            layout: baseLayout,
            children: [
              {
                id: '1:3',
                name: 'label',
                semanticType: 'Text',
                boundingBox: baseBoundingBox,
                styleRef: 'label',
                text: 'Welcome',
              } as TextIR,
            ],
          } as ComponentIR,
        ],
      } as ContainerIR,
      stylesBundle: {
        styles: {
          screen: { id: 'screen' },
          header: { id: 'header' },
          label: {
            id: 'label',
            typography: {
              fontFamily: 'Inter',
              fontSize: 18,
              fontWeight: 600,
              lineHeight: 24,
              letterSpacing: 0,
              textAlign: 'left',
              color: '#1f2937',
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

    expect(result.code).toContain('<Header />');
    expect(result.code).not.toContain('<Header label={label} />');
  });

  it('should treat unresolved image props as optional and avoid web placeholders', () => {
    const screen: ScreenIR = {
      id: 'screen_1',
      name: 'ProfileScreen',
      root: {
        id: '1:1',
        name: 'screen',
        semanticType: 'Container',
        boundingBox: baseBoundingBox,
        styleRef: 'screen',
        layout: baseLayout,
        children: [
          {
            id: '1:2',
            name: 'Badge',
            semanticType: 'Component',
            componentId: 'badge_component',
            componentName: 'Badge',
            boundingBox: baseBoundingBox,
            styleRef: 'badge',
            layout: baseLayout,
            children: [
              {
                id: '1:3',
                name: 'statusIcon',
                semanticType: 'Image',
                boundingBox: baseBoundingBox,
                styleRef: 'statusIcon',
                imageRef: '',
              } as ImageIR,
            ],
          } as ComponentIR,
        ],
      } as ContainerIR,
      stylesBundle: {
        styles: {
          screen: { id: 'screen' },
          badge: { id: 'badge' },
          statusIcon: { id: 'statusIcon' },
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

    expect(result.code).toContain('statusIcon?: ImageSourcePropType;');
    expect(result.code).toContain('{statusIcon && (');
    expect(result.code).toContain('source={statusIcon}');
    expect(result.code).not.toContain('via.placeholder.com');
  });
});

describe('generateComponentMultiFile', () => {
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

  it('should generate main component file', () => {
    const screen: ScreenIR = {
      id: 'screen_1',
      name: 'ProductScreen',
      root: {
        id: '1:1',
        name: 'container',
        semanticType: 'Container',
        boundingBox: baseBoundingBox,
        styleRef: 'container',
        layout: baseLayout,
        children: [],
      } as ContainerIR,
      stylesBundle: {
        styles: { container: { id: 'container' } },
        tokens: {
          colors: {},
          spacing: {},
          radii: {},
          typography: {},
          shadows: {},
        },
      },
    };

    const result = generateComponentMultiFile(screen, emptyMappings);

    expect(result.mainComponent.path).toBe('components/ProductScreen.tsx');
    expect(result.mainComponent.content).toContain('export function ProductScreen(');
  });

  it('should generate tokens file when no project theme', () => {
    const screen: ScreenIR = {
      id: 'screen_1',
      name: 'TestScreen',
      root: {
        id: '1:1',
        name: 'container',
        semanticType: 'Container',
        boundingBox: baseBoundingBox,
        styleRef: 'container',
        layout: baseLayout,
        children: [],
      } as ContainerIR,
      stylesBundle: {
        styles: { container: { id: 'container', backgroundColor: '#3b82f6' } },
        tokens: {
          colors: { color_0: '#3b82f6' },
          spacing: { spacing_0: 16 },
          radii: {},
          typography: {},
          shadows: {},
        },
      },
    };

    const result = generateComponentMultiFile(screen, emptyMappings, {
      hasProjectTheme: false,
    });

    expect(result.tokens).not.toBeNull();
    expect(result.tokens!.path).toContain('tokens.ts');
    expect(result.tokens!.content).toContain('export const colors');
  });

  it('should not generate tokens file when project theme exists', () => {
    const screen: ScreenIR = {
      id: 'screen_1',
      name: 'TestScreen',
      root: {
        id: '1:1',
        name: 'container',
        semanticType: 'Container',
        boundingBox: baseBoundingBox,
        styleRef: 'container',
        layout: baseLayout,
        children: [],
      } as ContainerIR,
      stylesBundle: {
        styles: { container: { id: 'container' } },
        tokens: {
          colors: { color_0: '#3b82f6' },
          spacing: {},
          radii: {},
          typography: {},
          shadows: {},
        },
      },
    };

    const result = generateComponentMultiFile(screen, emptyMappings, {
      hasProjectTheme: true,
    });

    expect(result.tokens).toBeNull();
  });

  it('should generate extracted components from detection hints', () => {
    const screen: ScreenIR = {
      id: 'screen_1',
      name: 'TestScreen',
      root: {
        id: '1:1',
        name: 'container',
        semanticType: 'Container',
        boundingBox: baseBoundingBox,
        styleRef: 'container',
        layout: baseLayout,
        children: [
          {
            id: 'card_1',
            name: 'ProductCard',
            semanticType: 'Container',
            boundingBox: baseBoundingBox,
            styleRef: 'style_card',
            layout: baseLayout,
            children: [],
          } as ContainerIR,
          {
            id: 'card_2',
            name: 'ProductCard',
            semanticType: 'Container',
            boundingBox: baseBoundingBox,
            styleRef: 'style_card',
            layout: baseLayout,
            children: [],
          } as ContainerIR,
        ],
      } as ContainerIR,
      stylesBundle: {
        styles: {
          container: { id: 'container' },
          style_card: { id: 'card' },
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

    const detectionResult: DetectionResult = {
      lists: [],
      components: [
        {
          componentName: 'ProductCard',
          instanceIds: ['card_1', 'card_2'],
          propsVariations: {},
        },
      ],
    };

    const result = generateComponentMultiFile(screen, emptyMappings, {
      detectionResult,
    });

    expect(result.extractedComponents).toHaveLength(1);
    expect(result.extractedComponents[0].path).toContain('ProductCard.tsx');
    expect(result.extractedComponents[0].content).toContain('export function ProductCard');
  });

  it('should use custom output directory', () => {
    const screen: ScreenIR = {
      id: 'screen_1',
      name: 'TestScreen',
      root: {
        id: '1:1',
        name: 'container',
        semanticType: 'Container',
        boundingBox: baseBoundingBox,
        styleRef: 'container',
        layout: baseLayout,
        children: [],
      } as ContainerIR,
      stylesBundle: {
        styles: { container: { id: 'container' } },
        tokens: {
          colors: {},
          spacing: {},
          radii: {},
          typography: {},
          shadows: {},
        },
      },
    };

    const result = generateComponentMultiFile(screen, emptyMappings, {
      outputDir: 'src/screens',
    });

    expect(result.mainComponent.path).toBe('src/screens/TestScreen.tsx');
  });
});
