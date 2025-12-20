/**
 * Unit tests for the layout extractor module
 */

import { describe, it, expect } from 'vitest';
import {
  inferPadding,
  inferMainAxisAlign,
  inferCrossAxisAlign,
  extractLayoutMeta,
  addLayoutInfo,
} from '../../../src/core/layout/extractor.js';
import type { NormalizedNode } from '../../../src/core/types.js';

// Helper to create a minimal NormalizedNode
function createNode(overrides: Partial<NormalizedNode> = {}): NormalizedNode {
  return {
    id: '1:1',
    name: 'TestNode',
    type: 'FRAME',
    boundingBox: { x: 0, y: 0, width: 100, height: 100 },
    children: [],
    ...overrides,
  };
}

describe('inferPadding', () => {
  it('should return zero padding for no children', () => {
    const container = createNode();
    const result = inferPadding(container, []);
    expect(result).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it('should calculate padding from child positions', () => {
    const container = createNode({
      boundingBox: { x: 0, y: 0, width: 100, height: 100 },
    });
    const children = [
      createNode({ boundingBox: { x: 10, y: 20, width: 80, height: 60 } }),
    ];
    const result = inferPadding(container, children);

    expect(result).toEqual({ top: 20, right: 10, bottom: 20, left: 10 });
  });

  it('should handle multiple children', () => {
    const container = createNode({
      boundingBox: { x: 0, y: 0, width: 200, height: 100 },
    });
    const children = [
      createNode({ boundingBox: { x: 16, y: 16, width: 50, height: 68 } }),
      createNode({ boundingBox: { x: 134, y: 16, width: 50, height: 68 } }),
    ];
    const result = inferPadding(container, children);

    expect(result).toEqual({ top: 16, right: 16, bottom: 16, left: 16 });
  });
});

describe('inferMainAxisAlign', () => {
  it('should detect start alignment for row', () => {
    const container = createNode({
      boundingBox: { x: 0, y: 0, width: 200, height: 100 },
    });
    const children = [
      createNode({ boundingBox: { x: 10, y: 25, width: 50, height: 50 } }),
      createNode({ boundingBox: { x: 70, y: 25, width: 50, height: 50 } }),
    ];
    const result = inferMainAxisAlign(container, children, 'row');
    expect(result).toBe('start');
  });

  it('should detect center alignment for row', () => {
    const container = createNode({
      boundingBox: { x: 0, y: 0, width: 200, height: 100 },
    });
    const children = [
      createNode({ boundingBox: { x: 50, y: 25, width: 50, height: 50 } }),
      createNode({ boundingBox: { x: 100, y: 25, width: 50, height: 50 } }),
    ];
    // Content from 50-150, padding 50 on each side
    const result = inferMainAxisAlign(container, children, 'row');
    expect(result).toBe('center');
  });

  it('should detect end alignment for row', () => {
    const container = createNode({
      boundingBox: { x: 0, y: 0, width: 200, height: 100 },
    });
    const children = [
      createNode({ boundingBox: { x: 90, y: 25, width: 50, height: 50 } }),
      createNode({ boundingBox: { x: 145, y: 25, width: 50, height: 50 } }),
    ];
    // Content from 90-195, padding 90 left, 5 right
    const result = inferMainAxisAlign(container, children, 'row');
    expect(result).toBe('end');
  });

  it('should detect center alignment for column', () => {
    const container = createNode({
      boundingBox: { x: 0, y: 0, width: 100, height: 200 },
    });
    const children = [
      createNode({ boundingBox: { x: 25, y: 50, width: 50, height: 50 } }),
      createNode({ boundingBox: { x: 25, y: 100, width: 50, height: 50 } }),
    ];
    const result = inferMainAxisAlign(container, children, 'column');
    expect(result).toBe('center');
  });
});

describe('inferCrossAxisAlign', () => {
  it('should detect center alignment for row cross-axis', () => {
    const container = createNode({
      boundingBox: { x: 0, y: 0, width: 200, height: 100 },
    });
    const children = [
      createNode({ boundingBox: { x: 10, y: 25, width: 50, height: 50 } }),
      createNode({ boundingBox: { x: 70, y: 25, width: 50, height: 50 } }),
    ];
    const result = inferCrossAxisAlign(container, children, 'row');
    expect(result).toBe('center');
  });

  it('should detect start alignment for column cross-axis', () => {
    const container = createNode({
      boundingBox: { x: 0, y: 0, width: 100, height: 200 },
    });
    const children = [
      createNode({ boundingBox: { x: 10, y: 10, width: 50, height: 50 } }),
      createNode({ boundingBox: { x: 10, y: 70, width: 50, height: 50 } }),
    ];
    const result = inferCrossAxisAlign(container, children, 'column');
    expect(result).toBe('start');
  });
});

describe('extractLayoutMeta', () => {
  it('should use Figma auto-layout when available', () => {
    const node = createNode({
      figmaLayout: {
        mode: 'horizontal',
        gap: 12,
        padding: { top: 16, right: 16, bottom: 16, left: 16 },
        mainAxisAlign: 'CENTER',
        crossAxisAlign: 'CENTER',
      },
    });
    const result = extractLayoutMeta(node);

    expect(result.type).toBe('row');
    expect(result.gap).toBe(12);
    expect(result.padding).toEqual({ top: 16, right: 16, bottom: 16, left: 16 });
    expect(result.mainAlign).toBe('center');
    expect(result.crossAlign).toBe('center');
  });

  it('should infer layout from positions when no auto-layout', () => {
    const node = createNode({
      boundingBox: { x: 0, y: 0, width: 200, height: 100 },
      children: [
        createNode({ boundingBox: { x: 10, y: 25, width: 50, height: 50 } }),
        createNode({ boundingBox: { x: 70, y: 25, width: 50, height: 50 } }),
      ],
    });
    const result = extractLayoutMeta(node);

    expect(result.type).toBe('row');
    expect(result.gap).toBe(10);
  });
});

describe('addLayoutInfo', () => {
  it('should add layout to node and children', () => {
    const node = createNode({
      children: [
        createNode({
          id: '1:2',
          children: [
            createNode({ id: '1:3' }),
          ],
        }),
      ],
    });
    const result = addLayoutInfo(node);

    expect(result.layout).toBeDefined();
    expect(result.children).toHaveLength(1);
    expect(result.children[0].layout).toBeDefined();
    expect(result.children[0].children).toHaveLength(1);
    expect(result.children[0].children[0].layout).toBeDefined();
  });

  it('should preserve visual properties', () => {
    const node = createNode({
      fills: [{ type: 'solid', color: { hex: '#fff', rgba: { r: 255, g: 255, b: 255, a: 1 } }, opacity: 1 }],
      cornerRadius: 8,
      opacity: 0.8,
    });
    const result = addLayoutInfo(node);

    expect(result.fills).toBeDefined();
    expect(result.cornerRadius).toBe(8);
    expect(result.opacity).toBe(0.8);
  });

  it('should preserve text properties', () => {
    const node = createNode({
      text: 'Hello',
      typography: {
        fontFamily: 'Inter',
        fontSize: 16,
        fontWeight: 400,
        lineHeight: 24,
        letterSpacing: 0,
        textAlign: 'left',
      },
    });
    const result = addLayoutInfo(node);

    expect(result.text).toBe('Hello');
    expect(result.typography).toBeDefined();
  });
});
