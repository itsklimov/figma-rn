/**
 * Unit tests for the filter module
 */

import { describe, it, expect } from 'vitest';
import { shouldFilter, filterNode, filterTree } from '../../../src/core/normalize/filter.js';
import type { FigmaNode } from '../../../src/api/types.js';

// Helper to create a minimal FigmaNode
function createNode(overrides: Partial<FigmaNode> = {}): FigmaNode {
  return {
    id: '1:1',
    name: 'TestNode',
    type: 'FRAME',
    visible: true,
    boundingBox: { x: 0, y: 0, width: 100, height: 100 },
    ...overrides,
  };
}

describe('shouldFilter', () => {
  describe('hidden nodes', () => {
    it('should filter nodes with visible: false', () => {
      const node = createNode({ visible: false });
      expect(shouldFilter(node)).toBe('hidden');
    });

    it('should not filter nodes with visible: true', () => {
      const node = createNode({ visible: true });
      expect(shouldFilter(node)).toBeNull();
    });

    it('should not filter nodes without visible property (defaults to visible)', () => {
      const node = createNode();
      delete (node as any).visible;
      expect(shouldFilter(node)).toBeNull();
    });
  });

  describe('annotation patterns', () => {
    it('should filter nodes matching *annotation* pattern', () => {
      const node = createNode({ name: 'My Annotation Layer' });
      expect(shouldFilter(node)).toBe('pattern-match');
    });

    it('should filter nodes matching *measure* pattern', () => {
      const node = createNode({ name: 'measure-line' });
      expect(shouldFilter(node)).toBe('pattern-match');
    });

    it('should filter nodes matching *measurement* pattern', () => {
      const node = createNode({ name: 'measurement overlay' });
      expect(shouldFilter(node)).toBe('pattern-match');
    });

    it('should filter nodes matching *redline* pattern', () => {
      const node = createNode({ name: 'Redline Specs' });
      expect(shouldFilter(node)).toBe('pattern-match');
    });
  });

  describe('system UI elements', () => {
    it('should filter StatusBar', () => {
      const node = createNode({ name: 'StatusBar' });
      expect(shouldFilter(node)).toBe('status-bar');
    });

    it('should filter Status Bar', () => {
      const node = createNode({ name: 'Status Bar' });
      // May match pattern or specific check - either way, node is filtered
      expect(shouldFilter(node)).not.toBeNull();
    });

    it('should filter Home Indicator', () => {
      const node = createNode({ name: 'Home Indicator' });
      // May match pattern or specific check - either way, node is filtered
      expect(shouldFilter(node)).not.toBeNull();
    });

    it('should filter HomeIndicator', () => {
      const node = createNode({ name: 'HomeIndicator' });
      expect(shouldFilter(node)).toBe('home-indicator');
    });
  });

  describe('custom patterns', () => {
    it('should filter nodes matching custom patterns', () => {
      const node = createNode({ name: 'debug-overlay' });
      const patterns = ['*debug*'];
      expect(shouldFilter(node, patterns)).toBe('pattern-match');
    });

    it('should not filter nodes when custom patterns exclude default patterns', () => {
      const node = createNode({ name: 'My Annotation' });
      const patterns = ['*debug*']; // annotation is not in this list
      expect(shouldFilter(node, patterns)).toBeNull();
    });
  });
});

describe('filterNode', () => {
  it('should return null for hidden nodes', () => {
    const node = createNode({ visible: false });
    expect(filterNode(node)).toBeNull();
  });

  it('should return NormalizedNode for visible nodes', () => {
    const node = createNode();
    const result = filterNode(node);

    expect(result).not.toBeNull();
    expect(result?.id).toBe('1:1');
    expect(result?.name).toBe('TestNode');
    expect(result?.type).toBe('FRAME');
  });

  it('should preserve bounding box', () => {
    const node = createNode({
      boundingBox: { x: 10, y: 20, width: 200, height: 300 },
    });
    const result = filterNode(node);

    expect(result?.boundingBox).toEqual({ x: 10, y: 20, width: 200, height: 300 });
  });

  it('should preserve fills', () => {
    const node = createNode({
      fills: [{ type: 'solid', color: { hex: '#ff0000', rgba: { r: 255, g: 0, b: 0, a: 1 } }, opacity: 1 }],
    });
    const result = filterNode(node);

    expect(result?.fills).toHaveLength(1);
    expect(result?.fills?.[0].type).toBe('solid');
  });

  it('should preserve text properties', () => {
    const node = createNode({
      type: 'TEXT',
      text: 'Hello World',
      typography: {
        fontFamily: 'Inter',
        fontSize: 16,
        fontWeight: 400,
        lineHeight: 24,
        letterSpacing: 0,
        textAlign: 'left',
      },
    });
    const result = filterNode(node);

    expect(result?.text).toBe('Hello World');
    expect(result?.typography?.fontFamily).toBe('Inter');
  });

  it('should preserve auto-layout information', () => {
    const node = createNode({
      layout: {
        mode: 'vertical',
        gap: 8,
        padding: { top: 16, right: 16, bottom: 16, left: 16 },
        mainAxisAlign: 'MIN',
        crossAxisAlign: 'CENTER',
        wrap: false,
      },
    });
    const result = filterNode(node);

    expect(result?.figmaLayout?.mode).toBe('vertical');
    expect(result?.figmaLayout?.gap).toBe(8);
  });

  it('should not include auto-layout when mode is none', () => {
    const node = createNode({
      layout: {
        mode: 'none',
        gap: 0,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        mainAxisAlign: 'MIN',
        crossAxisAlign: 'MIN',
        wrap: false,
      },
    });
    const result = filterNode(node);

    expect(result?.figmaLayout).toBeUndefined();
  });
});

describe('filterTree', () => {
  it('should recursively filter children', () => {
    const node = createNode({
      children: [
        createNode({ id: '1:2', name: 'Visible Child' }),
        createNode({ id: '1:3', name: 'Hidden Child', visible: false }),
        createNode({ id: '1:4', name: 'Annotation Layer' }),
      ],
    });
    const result = filterTree(node);

    expect(result?.children).toHaveLength(1);
    expect(result?.children[0].name).toBe('Visible Child');
  });

  it('should recursively filter nested children', () => {
    const node = createNode({
      children: [
        createNode({
          id: '1:2',
          name: 'Parent',
          children: [
            createNode({ id: '1:3', name: 'Visible Nested' }),
            createNode({ id: '1:4', name: 'Hidden Nested', visible: false }),
          ],
        }),
      ],
    });
    const result = filterTree(node);

    expect(result?.children).toHaveLength(1);
    expect(result?.children[0].children).toHaveLength(1);
    expect(result?.children[0].children[0].name).toBe('Visible Nested');
  });

  it('should return empty children array when no children', () => {
    const node = createNode();
    const result = filterTree(node);

    expect(result?.children).toEqual([]);
  });

  it('should filter root node if hidden', () => {
    const node = createNode({ visible: false });
    const result = filterTree(node);

    expect(result).toBeNull();
  });
});
