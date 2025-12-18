/**
 * Unit tests for the unwrap module
 */

import { describe, it, expect } from 'vitest';
import { isUselessGroup, isWrapperGroup, unwrapUselessGroups, flattenWrapperGroups } from '../../../src/core/normalize/unwrap.js';
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

describe('isUselessGroup', () => {
  it('should return true for GROUP with single child and no visuals', () => {
    const node = createNode({
      type: 'GROUP',
      children: [createNode({ id: '1:2' })],
    });
    expect(isUselessGroup(node)).toBe(true);
  });

  it('should return false for FRAME nodes', () => {
    const node = createNode({
      type: 'FRAME',
      children: [createNode({ id: '1:2' })],
    });
    expect(isUselessGroup(node)).toBe(false);
  });

  it('should return false for GROUP with multiple children', () => {
    const node = createNode({
      type: 'GROUP',
      children: [
        createNode({ id: '1:2' }),
        createNode({ id: '1:3' }),
      ],
    });
    expect(isUselessGroup(node)).toBe(false);
  });

  it('should return false for GROUP with no children', () => {
    const node = createNode({
      type: 'GROUP',
      children: [],
    });
    expect(isUselessGroup(node)).toBe(false);
  });

  it('should return false for GROUP with fills', () => {
    const node = createNode({
      type: 'GROUP',
      children: [createNode({ id: '1:2' })],
      fills: [{ type: 'solid', color: { hex: '#000', rgba: { r: 0, g: 0, b: 0, a: 1 } }, opacity: 1 }],
    });
    expect(isUselessGroup(node)).toBe(false);
  });

  it('should return false for GROUP with strokes', () => {
    const node = createNode({
      type: 'GROUP',
      children: [createNode({ id: '1:2' })],
      strokes: [{ color: { hex: '#000', rgba: { r: 0, g: 0, b: 0, a: 1 } }, weight: 1, align: 'inside' }],
    });
    expect(isUselessGroup(node)).toBe(false);
  });

  it('should return false for GROUP with effects', () => {
    const node = createNode({
      type: 'GROUP',
      children: [createNode({ id: '1:2' })],
      effects: [{ type: 'drop-shadow', color: { hex: '#000', rgba: { r: 0, g: 0, b: 0, a: 1 } }, offset: { x: 0, y: 4 }, radius: 8, spread: 0 }],
    });
    expect(isUselessGroup(node)).toBe(false);
  });

  it('should return false for GROUP with cornerRadius', () => {
    const node = createNode({
      type: 'GROUP',
      children: [createNode({ id: '1:2' })],
      cornerRadius: 8,
    });
    expect(isUselessGroup(node)).toBe(false);
  });

  it('should return false for GROUP with non-1 opacity', () => {
    const node = createNode({
      type: 'GROUP',
      children: [createNode({ id: '1:2' })],
      opacity: 0.5,
    });
    expect(isUselessGroup(node)).toBe(false);
  });
});

describe('isWrapperGroup', () => {
  it('should return true for GROUP with children and no visuals', () => {
    const node = createNode({
      type: 'GROUP',
      children: [
        createNode({ id: '1:2' }),
        createNode({ id: '1:3' }),
      ],
    });
    expect(isWrapperGroup(node)).toBe(true);
  });

  it('should return false for FRAME', () => {
    const node = createNode({
      type: 'FRAME',
      children: [createNode({ id: '1:2' })],
    });
    expect(isWrapperGroup(node)).toBe(false);
  });

  it('should return false for GROUP with no children', () => {
    const node = createNode({
      type: 'GROUP',
      children: [],
    });
    expect(isWrapperGroup(node)).toBe(false);
  });

  it('should return false for GROUP with fills', () => {
    const node = createNode({
      type: 'GROUP',
      children: [createNode({ id: '1:2' })],
      fills: [{ type: 'solid', color: { hex: '#000', rgba: { r: 0, g: 0, b: 0, a: 1 } }, opacity: 1 }],
    });
    expect(isWrapperGroup(node)).toBe(false);
  });
});

describe('unwrapUselessGroups', () => {
  it('should unwrap a single useless group', () => {
    const innerNode = createNode({ id: '1:2', name: 'Inner' });
    const node = createNode({
      type: 'GROUP',
      name: 'Wrapper',
      children: [innerNode],
    });
    const result = unwrapUselessGroups(node);

    expect(result.id).toBe('1:2');
    expect(result.name).toBe('Inner');
  });

  it('should preserve non-useless groups', () => {
    const node = createNode({
      type: 'GROUP',
      name: 'GroupWithVisuals',
      children: [createNode({ id: '1:2' })],
      fills: [{ type: 'solid', color: { hex: '#fff', rgba: { r: 255, g: 255, b: 255, a: 1 } }, opacity: 1 }],
    });
    const result = unwrapUselessGroups(node);

    expect(result.name).toBe('GroupWithVisuals');
    expect(result.children).toHaveLength(1);
  });

  it('should recursively unwrap nested useless groups', () => {
    const innermost = createNode({ id: '1:3', name: 'Innermost' });
    const node = createNode({
      type: 'GROUP',
      name: 'Outer',
      children: [
        createNode({
          type: 'GROUP',
          id: '1:2',
          name: 'Inner',
          children: [innermost],
        }),
      ],
    });
    const result = unwrapUselessGroups(node);

    expect(result.name).toBe('Innermost');
  });

  it('should preserve bounding box when unwrapping', () => {
    const innerNode = createNode({
      id: '1:2',
      boundingBox: { x: 10, y: 20, width: 50, height: 50 },
    });
    const node = createNode({
      type: 'GROUP',
      boundingBox: { x: 0, y: 0, width: 100, height: 100 },
      children: [innerNode],
    });
    const result = unwrapUselessGroups(node);

    expect(result.boundingBox).toEqual({ x: 10, y: 20, width: 50, height: 50 });
  });
});

describe('flattenWrapperGroups', () => {
  it('should promote children of wrapper groups', () => {
    const nodes = [
      createNode({
        type: 'GROUP',
        id: '1:1',
        name: 'Wrapper',
        children: [
          createNode({ id: '1:2', name: 'Child1' }),
          createNode({ id: '1:3', name: 'Child2' }),
        ],
      }),
    ];
    const result = flattenWrapperGroups(nodes);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Child1');
    expect(result[1].name).toBe('Child2');
  });

  it('should preserve non-wrapper groups', () => {
    const nodes = [
      createNode({
        type: 'GROUP',
        name: 'GroupWithVisuals',
        children: [createNode({ id: '1:2' })],
        fills: [{ type: 'solid', color: { hex: '#fff', rgba: { r: 255, g: 255, b: 255, a: 1 } }, opacity: 1 }],
      }),
    ];
    const result = flattenWrapperGroups(nodes);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('GroupWithVisuals');
  });

  it('should recursively flatten nested wrapper groups', () => {
    const nodes = [
      createNode({
        type: 'GROUP',
        name: 'Outer',
        children: [
          createNode({
            type: 'GROUP',
            id: '1:2',
            name: 'Inner',
            children: [
              createNode({ id: '1:3', name: 'Deep1' }),
              createNode({ id: '1:4', name: 'Deep2' }),
            ],
          }),
        ],
      }),
    ];
    const result = flattenWrapperGroups(nodes);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Deep1');
    expect(result[1].name).toBe('Deep2');
  });

  it('should preserve FRAME nodes', () => {
    const nodes = [
      createNode({
        type: 'FRAME',
        name: 'Frame',
        children: [
          createNode({ id: '1:2', name: 'Child1' }),
          createNode({ id: '1:3', name: 'Child2' }),
        ],
      }),
    ];
    const result = flattenWrapperGroups(nodes);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Frame');
    expect(result[0].children).toHaveLength(2);
  });
});
