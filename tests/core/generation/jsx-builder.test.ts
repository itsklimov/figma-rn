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
  };

  it('should generate View for Container', () => {
    const node: ContainerIR = {
      id: '1:1',
      name: 'container',
      semanticType: 'Container',
      boundingBox: baseBoundingBox,
      styleRef: 'style_1',
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
      styleRef: 'style_1',
      layout: baseLayout,
      children: [],
    };

    const result = buildJSX(node, 0);
    expect(result).toContain('<View');
    expect(result).toContain('style={styles.productCard}');
  });

  it('should generate Text with content', () => {
    const node: TextIR = {
      id: '1:1',
      name: 'title',
      semanticType: 'Text',
      boundingBox: baseBoundingBox,
      styleRef: 'style_1',
      text: 'Hello World',
    };

    const result = buildJSX(node, 0);
    expect(result).toContain('<Text');
    expect(result).toContain('style={styles.title}');
    expect(result).toContain('Hello World');
    expect(result).toContain('</Text>');
  });

  it('should escape special characters in Text', () => {
    const node: TextIR = {
      id: '1:1',
      name: 'message',
      semanticType: 'Text',
      boundingBox: baseBoundingBox,
      styleRef: 'style_1',
      text: 'Say "Hello"\nNew line',
    };

    const result = buildJSX(node, 0);
    expect(result).toContain('\\"Hello\\"');
    expect(result).toContain('\\n');
  });

  it('should generate Image with imageRef', () => {
    const node: ImageIR = {
      id: '1:1',
      name: 'avatar',
      semanticType: 'Image',
      boundingBox: baseBoundingBox,
      styleRef: 'style_1',
      imageRef: './assets/avatar.png',
    };

    const result = buildJSX(node, 0);
    expect(result).toContain('<Image');
    expect(result).toContain('style={styles.avatar}');
    expect(result).toContain("require('./assets/avatar.png')");
  });

  it('should generate Image with TODO for missing imageRef', () => {
    const node: ImageIR = {
      id: '1:1',
      name: 'placeholder',
      semanticType: 'Image',
      boundingBox: baseBoundingBox,
      styleRef: 'style_1',
    };

    const result = buildJSX(node, 0);
    expect(result).toContain('TODO: Add image source');
  });

  it('should generate TouchableOpacity for Button', () => {
    const node: ButtonIR = {
      id: '1:1',
      name: 'submitButton',
      semanticType: 'Button',
      boundingBox: baseBoundingBox,
      styleRef: 'style_1',
      label: 'Submit',
      variant: 'primary',
    };

    const result = buildJSX(node, 0);
    expect(result).toContain('<TouchableOpacity');
    expect(result).toContain('style={styles.submitButton}');
    expect(result).toContain('onPress={() => {}}');
    expect(result).toContain('<Text');
    expect(result).toContain('style={styles.submitButtonText}');
    expect(result).toContain('Submit');
    expect(result).toContain('</TouchableOpacity>');
  });

  it('should generate Image for Icon', () => {
    const node: IconIR = {
      id: '1:1',
      name: 'settingsIcon',
      semanticType: 'Icon',
      boundingBox: baseBoundingBox,
      styleRef: 'style_1',
      iconRef: './assets/icons/settings.png',
      size: 24,
    };

    const result = buildJSX(node, 0);
    expect(result).toContain('<Image');
    expect(result).toContain('style={styles.settingsIcon}');
    expect(result).toContain("require('./assets/icons/settings.png')");
  });

  it('should handle nested children with proper indentation', () => {
    const node: ContainerIR = {
      id: '1:1',
      name: 'wrapper',
      semanticType: 'Container',
      boundingBox: baseBoundingBox,
      styleRef: 'style_1',
      layout: baseLayout,
      children: [
        {
          id: '1:2',
          name: 'inner',
          semanticType: 'Container',
          boundingBox: baseBoundingBox,
          styleRef: 'style_2',
          layout: baseLayout,
          children: [
            {
              id: '1:3',
              name: 'deepText',
              semanticType: 'Text',
              boundingBox: baseBoundingBox,
              styleRef: 'style_3',
              text: 'Deep',
            } as TextIR,
          ],
        } as ContainerIR,
      ],
    };

    const result = buildJSX(node, 0);
    // Check proper nesting structure
    expect(result).toContain('<View style={styles.wrapper}>');
    expect(result).toContain('<View style={styles.inner}>');
    expect(result).toContain('<Text style={styles.deepText}>');
    // Check indentation increases
    const lines = result.split('\n');
    const innerLine = lines.find(l => l.includes('styles.inner'));
    const deepLine = lines.find(l => l.includes('styles.deepText'));
    expect(innerLine).toBeDefined();
    expect(deepLine).toBeDefined();
    // Inner should have 2 spaces, deep should have 4
    expect(innerLine!.indexOf('<')).toBe(2);
    expect(deepLine!.indexOf('<')).toBe(4);
  });

  it('should self-close empty Container', () => {
    const node: ContainerIR = {
      id: '1:1',
      name: 'empty',
      semanticType: 'Container',
      boundingBox: baseBoundingBox,
      styleRef: 'style_1',
      layout: baseLayout,
      children: [],
    };

    const result = buildJSX(node, 0);
    expect(result).toContain('<View style={styles.empty} />');
  });
});

describe('collectStyleNames', () => {
  const baseBoundingBox = { x: 0, y: 0, width: 100, height: 100 };
  const baseLayout = {
    type: 'column' as const,
    gap: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    mainAlign: 'start' as const,
    crossAlign: 'start' as const,
  };

  it('should collect style names from tree', () => {
    const node: ContainerIR = {
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

    const names = collectStyleNames(node);
    expect(names).toContain('container');
    expect(names).toContain('title');
  });

  it('should collect button text style names', () => {
    const node: ButtonIR = {
      id: '1:1',
      name: 'submitBtn',
      semanticType: 'Button',
      boundingBox: baseBoundingBox,
      styleRef: 'style_1',
      label: 'Submit',
      variant: 'primary',
    };

    const names = collectStyleNames(node);
    expect(names).toContain('submitBtn');
    expect(names).toContain('submitBtnText');
  });
});
