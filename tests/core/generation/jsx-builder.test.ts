import { describe, it, expect } from 'vitest';
import { buildJSX, collectStyleNames } from '../../../src/core/generation/jsx-builder.js';
import type { ContainerIR, TextIR, ImageIR, ButtonIR, CardIR, IconIR } from '../../../src/core/types.js';

describe('buildJSX', () => {
  const baseBoundingBox = { x: 0, y: 0, width: 100, height: 100 };
  const baseLayout = {
    type: 'column' as const,
    gap: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    mainAlign: 'start' as const,
    crossAlign: 'start' as const,
    sizing: { horizontal: 'fixed' as const, vertical: 'fixed' as const },
  };

  it('should generate View for Container', () => {
    const node: ContainerIR = {
      id: '1:1',
      name: 'container',
      semanticType: 'Container',
      boundingBox: baseBoundingBox,
      styleRef: 'container',
      layout: baseLayout,
      children: [],
    };

    const result = buildJSX(node, 0);
    expect(result).toContain('<View');
    expect(result).toContain('style={styles.container}');
  });

  it('should generate View for Card', () => {
    const node: CardIR = {
      id: '1:1',
      name: 'productCard',
      semanticType: 'Card',
      boundingBox: baseBoundingBox,
      styleRef: 'productCard',
      layout: baseLayout,
      children: [],
    };

    const result = buildJSX(node, 0);
    expect(result).toContain('<View');
    expect(result).toContain('style={styles.productCard}');
  });

  it('should generate Text with styles', () => {
    const node: TextIR = {
      id: '1:1',
      name: 'title',
      semanticType: 'Text',
      boundingBox: baseBoundingBox,
      styleRef: 'title',
      text: 'Hello World',
    };

    const result = buildJSX(node, 0);
    expect(result).toContain('<Text style={styles.title}>');
    expect(result).toContain('Hello World');
  });

  it('should handle multi-line text', () => {
    const node: TextIR = {
      id: '1:1',
      name: 'message',
      semanticType: 'Text',
      boundingBox: baseBoundingBox,
      styleRef: 'message',
      text: 'Say "Hello"\nNew line',
    };

    const result = buildJSX(node, 0);
    expect(result).toContain('Say "Hello"');
    expect(result).toContain('{"\\n"}');
  });

  it('should generate Image', () => {
    const node: ImageIR = {
      id: '1:1',
      name: 'avatar',
      semanticType: 'Image',
      boundingBox: baseBoundingBox,
      styleRef: 'avatar',
      imageRef: 'abc123',
    };

    const imagePathMap = new Map([['abc123', './assets/avatar.png']]);
    const result = buildJSX(node, 0, imagePathMap);

    expect(result).toContain('<Image');
    expect(result).toContain("source={require('./assets/avatar.png')}");
    expect(result).toContain('style={styles.avatar}');
  });

  it('should generate Image with missing mapping', () => {
    const node: ImageIR = {
      id: '1:1',
      name: 'avatar',
      semanticType: 'Image',
      boundingBox: baseBoundingBox,
      styleRef: 'avatar',
      imageRef: 'abc123unmapped',
    };

    const result = buildJSX(node, 0);
    expect(result).toContain('source={{ uri: \'\' } /* TODO: Image ref: abc123unmapped */');
  });

  it('should generate placeholder for Image with no ref', () => {
    const node: ImageIR = {
      id: '1:1',
      name: 'placeholder',
      semanticType: 'Image',
      boundingBox: baseBoundingBox,
      styleRef: 'placeholder',
    };

    const result = buildJSX(node, 0);
    expect(result).toContain('<Image');
    expect(result).toContain('style={styles.placeholder}');
  });

  it('should generate Button', () => {
    const node: ButtonIR = {
      id: '1:1',
      name: 'submitButton',
      semanticType: 'Button',
      boundingBox: baseBoundingBox,
      styleRef: 'submitButton',
      label: 'Submit',
      variant: 'primary',
    };

    const result = buildJSX(node, 0);
    expect(result).toContain('<TouchableOpacity');
    expect(result).toContain('style={styles.submitButton}');
    expect(result).toContain('<Text');
    expect(result).toContain('Submit');
  });

  it('should generate Icon', () => {
    const node: IconIR = {
      id: '1:1',
      name: 'settingsIcon',
      semanticType: 'Icon',
      boundingBox: { x: 0, y: 0, width: 24, height: 24 },
      styleRef: 'settingsIcon',
      iconRef: 'settings',
      size: 24,
    };

    const imagePathMap = new Map([['settings', './assets/icons/settings.png']]);
    const result = buildJSX(node, 0, imagePathMap);

    expect(result).toContain('<TouchableOpacity');
    expect(result).toContain('<Image');
    expect(result).toContain("require('./assets/icons/settings.png')");
  });

  it('should handle nested children with proper indentation', () => {
    const node: ContainerIR = {
      id: '1:1',
      name: 'wrapper',
      semanticType: 'Container',
      boundingBox: baseBoundingBox,
      styleRef: 'wrapper',
      layout: baseLayout,
      children: [
        {
          id: '1:2',
          name: 'inner',
          semanticType: 'Container',
          boundingBox: baseBoundingBox,
          styleRef: 'inner',
          layout: baseLayout,
          children: [
            {
              id: '1:3',
              name: 'deepText',
              semanticType: 'Text',
              boundingBox: baseBoundingBox,
              styleRef: 'deepText',
              text: 'Deep',
            } as TextIR,
          ],
        } as ContainerIR,
      ],
    };

    const result = buildJSX(node, 0);
    expect(result).toContain('<View style={styles.wrapper}>');
    expect(result).toContain('<View style={styles.inner}>');
    expect(result).toContain('<Text style={styles.deepText}>');
  });
});

describe('buildJSX accessibility', () => {
  const baseBoundingBox = { x: 0, y: 0, width: 100, height: 100 };
  const baseLayout = {
    type: 'column' as const,
    gap: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    mainAlign: 'start' as const,
    crossAlign: 'start' as const,
    sizing: { horizontal: 'fixed' as const, vertical: 'fixed' as const },
  };

  it('should not add accessibilityLabel for regular Views', () => {
    const node: ContainerIR = {
      id: '1:1',
      name: 'empty',
      semanticType: 'Container',
      boundingBox: baseBoundingBox,
      styleRef: 'empty',
      layout: baseLayout,
      children: [],
    };

    const result = buildJSX(node, 0);
    expect(result).not.toContain('accessibilityLabel');
  });

  it('should add accessibilityRole for interactive elements', () => {
    const node: ButtonIR = {
      id: '1:1',
      name: 'submitButton',
      semanticType: 'Button',
      boundingBox: baseBoundingBox,
      styleRef: 'submitButton',
      label: 'Submit Order',
      variant: 'primary',
    };

    const result = buildJSX(node, 0);
    expect(result).toContain('accessibilityRole="button"');
    expect(result).toContain('accessibilityLabel="Submit Order"');
  });

  it('should add accessibility label for Images', () => {
    const node: ImageIR = {
      id: '1:1',
      name: 'productImage',
      semanticType: 'Image',
      boundingBox: baseBoundingBox,
      styleRef: 'productImage',
      imageRef: './product.png',
    };

    const result = buildJSX(node, 0);
    expect(result).toContain('accessibilityLabel="product Image"');
    expect(result).toContain('accessibilityRole="image"');
  });

  it('should use accessibilityRole="button" for Icons as they are wrapped in TouchableOpacity', () => {
    const node: IconIR = {
      id: '1:1',
      name: 'closeIcon',
      semanticType: 'Icon',
      boundingBox: { x: 0, y: 0, width: 24, height: 24 },
      styleRef: 'closeIcon',
      iconRef: './close.png',
      size: 24,
    };

    const result = buildJSX(node, 0);
    expect(result).toContain('accessibilityRole="button"');
    expect(result).toContain('accessibilityLabel="close Icon"');
  });

  it('should handle hitSlop for small Icons', () => {
    const node: IconIR = {
      id: '1:1',
      name: 'menuIcon',
      semanticType: 'Icon',
      boundingBox: { x: 0, y: 0, width: 24, height: 24 },
      styleRef: 'menuIcon',
      iconRef: './menu.png',
      size: 24,
    };

    const result = buildJSX(node, 0);
    // (44 - 24) / 2 = 10
    expect(result).toContain('hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}');
  });

  it('should use generic name suppression for accessibilityLabel', () => {
    const node: ImageIR = {
      id: '1:1',
      name: 'userProfileAvatar',
      semanticType: 'Image',
      boundingBox: baseBoundingBox,
      styleRef: 'userProfileAvatar',
      imageRef: './avatar.png',
    };

    const result = buildJSX(node, 0);
    expect(result).toContain('accessibilityLabel="user Profile Avatar"');
  });
});

describe('collectStyleNames', () => {
  const baseLayout = {
    type: 'column' as const,
    gap: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    mainAlign: 'start' as const,
    crossAlign: 'start' as const,
    sizing: { horizontal: 'fixed' as const, vertical: 'fixed' as const },
  };

  it('should collect style names from tree', () => {
    const node: ContainerIR = {
      id: '1:1',
      name: 'container',
      semanticType: 'Container',
      boundingBox: { x: 0, y: 0, width: 100, height: 100 },
      styleRef: 'container',
      layout: baseLayout,
      children: [
        {
          id: '1:2',
          name: 'title',
          semanticType: 'Text',
          boundingBox: { x: 0, y: 0, width: 100, height: 20 },
          styleRef: 'title',
          text: 'Title',
        } as TextIR,
      ],
    };

    const names = collectStyleNames(node);
    expect(names).toContain('container');
    expect(names).toContain('title');
  });

  it('should handle component children in Button', () => {
    const node: ButtonIR = {
      id: '1:1',
      name: 'submitBtn',
      semanticType: 'Button',
      boundingBox: { x: 0, y: 0, width: 100, height: 100 },
      styleRef: 'submitBtn',
      label: 'Submit',
      variant: 'primary',
    };

    const names = collectStyleNames(node);
    expect(names).toContain('submitBtn');
    expect(names).toContain('submitBtnText');
  });
});
