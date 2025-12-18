/**
 * Unit tests for the semantic classifier module
 */

import { describe, it, expect } from 'vitest';
import {
  isText,
  isImage,
  isIcon,
  isButton,
  isCard,
  classifyNode,
  toIRNode,
  recognizeSemantics,
} from '../../../src/core/recognize/classifier.js';
import type { LayoutNode } from '../../../src/core/types.js';

// Helper to create a minimal LayoutNode
function createNode(overrides: Partial<LayoutNode> = {}): LayoutNode {
  return {
    id: '1:1',
    name: 'TestNode',
    type: 'FRAME',
    boundingBox: { x: 0, y: 0, width: 100, height: 100 },
    layout: {
      type: 'column',
      gap: 0,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      mainAlign: 'start',
      crossAlign: 'start',
    },
    children: [],
    ...overrides,
  };
}

describe('isText', () => {
  it('should return true for TEXT nodes with text content', () => {
    const node = createNode({ type: 'TEXT', text: 'Hello' });
    expect(isText(node)).toBe(true);
  });

  it('should return false for TEXT nodes without text content', () => {
    const node = createNode({ type: 'TEXT' });
    expect(isText(node)).toBe(false);
  });

  it('should return false for non-TEXT nodes', () => {
    const node = createNode({ type: 'FRAME' });
    expect(isText(node)).toBe(false);
  });
});

describe('isImage', () => {
  it('should return true for nodes with image fill', () => {
    const node = createNode({
      fills: [{ type: 'image', imageRef: 'abc123', opacity: 1 }],
    });
    expect(isImage(node)).toBe(true);
  });

  it('should return false for nodes without image fill', () => {
    const node = createNode({
      fills: [{ type: 'solid', color: { hex: '#fff', rgba: { r: 255, g: 255, b: 255, a: 1 } }, opacity: 1 }],
    });
    expect(isImage(node)).toBe(false);
  });

  it('should return false for nodes without fills', () => {
    const node = createNode();
    expect(isImage(node)).toBe(false);
  });
});

describe('isIcon', () => {
  it('should return true for small VECTOR nodes', () => {
    const node = createNode({
      type: 'VECTOR',
      boundingBox: { x: 0, y: 0, width: 24, height: 24 },
    });
    expect(isIcon(node)).toBe(true);
  });

  it('should return true for small ELLIPSE nodes', () => {
    const node = createNode({
      type: 'ELLIPSE',
      boundingBox: { x: 0, y: 0, width: 16, height: 16 },
    });
    expect(isIcon(node)).toBe(true);
  });

  it('should return true for small image nodes', () => {
    const node = createNode({
      type: 'RECTANGLE',
      boundingBox: { x: 0, y: 0, width: 32, height: 32 },
      fills: [{ type: 'image', imageRef: 'abc', opacity: 1 }],
    });
    expect(isIcon(node)).toBe(true);
  });

  it('should return false for large nodes', () => {
    const node = createNode({
      type: 'VECTOR',
      boundingBox: { x: 0, y: 0, width: 100, height: 100 },
    });
    expect(isIcon(node)).toBe(false);
  });

  it('should return false for non-square nodes', () => {
    const node = createNode({
      type: 'VECTOR',
      boundingBox: { x: 0, y: 0, width: 24, height: 100 },
    });
    expect(isIcon(node)).toBe(false);
  });

  it('should return true for small frames containing vectors', () => {
    const node = createNode({
      type: 'FRAME',
      boundingBox: { x: 0, y: 0, width: 24, height: 24 },
      children: [
        createNode({ type: 'VECTOR', boundingBox: { x: 0, y: 0, width: 20, height: 20 } }),
      ],
    });
    expect(isIcon(node)).toBe(true);
  });
});

describe('isButton', () => {
  it('should return true for button-like nodes', () => {
    const node = createNode({
      boundingBox: { x: 0, y: 0, width: 120, height: 44 },
      fills: [{ type: 'solid', color: { hex: '#3b82f6', rgba: { r: 59, g: 130, b: 246, a: 1 } }, opacity: 1 }],
      children: [
        createNode({ type: 'TEXT', text: 'Click me' }),
      ],
    });
    expect(isButton(node)).toBe(true);
  });

  it('should return false for nodes without background', () => {
    const node = createNode({
      boundingBox: { x: 0, y: 0, width: 120, height: 44 },
      children: [
        createNode({ type: 'TEXT', text: 'Click me' }),
      ],
    });
    expect(isButton(node)).toBe(false);
  });

  it('should return false for nodes without text', () => {
    const node = createNode({
      boundingBox: { x: 0, y: 0, width: 120, height: 44 },
      fills: [{ type: 'solid', color: { hex: '#3b82f6', rgba: { r: 59, g: 130, b: 246, a: 1 } }, opacity: 1 }],
      children: [],
    });
    expect(isButton(node)).toBe(false);
  });

  it('should return false for very tall nodes', () => {
    const node = createNode({
      boundingBox: { x: 0, y: 0, width: 120, height: 200 },
      fills: [{ type: 'solid', color: { hex: '#3b82f6', rgba: { r: 59, g: 130, b: 246, a: 1 } }, opacity: 1 }],
      children: [
        createNode({ type: 'TEXT', text: 'Click me' }),
      ],
    });
    expect(isButton(node)).toBe(false);
  });
});

describe('isCard', () => {
  it('should return true for nodes with corner radius and background', () => {
    const node = createNode({
      boundingBox: { x: 0, y: 0, width: 200, height: 150 },
      cornerRadius: 8,
      fills: [{ type: 'solid', color: { hex: '#fff', rgba: { r: 255, g: 255, b: 255, a: 1 } }, opacity: 1 }],
      children: [createNode({ id: '1:2' })],
    });
    expect(isCard(node)).toBe(true);
  });

  it('should return true for nodes with shadow and background', () => {
    const node = createNode({
      boundingBox: { x: 0, y: 0, width: 200, height: 150 },
      fills: [{ type: 'solid', color: { hex: '#fff', rgba: { r: 255, g: 255, b: 255, a: 1 } }, opacity: 1 }],
      effects: [{ type: 'drop-shadow', color: { hex: '#000', rgba: { r: 0, g: 0, b: 0, a: 0.1 } }, offset: { x: 0, y: 2 }, radius: 4, spread: 0 }],
      children: [createNode({ id: '1:2' })],
    });
    expect(isCard(node)).toBe(true);
  });

  it('should return false for small nodes', () => {
    const node = createNode({
      boundingBox: { x: 0, y: 0, width: 40, height: 40 },
      cornerRadius: 8,
      fills: [{ type: 'solid', color: { hex: '#fff', rgba: { r: 255, g: 255, b: 255, a: 1 } }, opacity: 1 }],
      children: [createNode({ id: '1:2' })],
    });
    expect(isCard(node)).toBe(false);
  });

  it('should return false for nodes without children', () => {
    const node = createNode({
      boundingBox: { x: 0, y: 0, width: 200, height: 150 },
      cornerRadius: 8,
      fills: [{ type: 'solid', color: { hex: '#fff', rgba: { r: 255, g: 255, b: 255, a: 1 } }, opacity: 1 }],
      children: [],
    });
    expect(isCard(node)).toBe(false);
  });
});

describe('classifyNode', () => {
  it('should classify text nodes', () => {
    const node = createNode({ type: 'TEXT', text: 'Hello' });
    expect(classifyNode(node)).toBe('Text');
  });

  it('should classify icon nodes', () => {
    const node = createNode({
      type: 'VECTOR',
      boundingBox: { x: 0, y: 0, width: 24, height: 24 },
    });
    expect(classifyNode(node)).toBe('Icon');
  });

  it('should classify image nodes', () => {
    const node = createNode({
      boundingBox: { x: 0, y: 0, width: 200, height: 150 },
      fills: [{ type: 'image', imageRef: 'abc123', opacity: 1 }],
    });
    expect(classifyNode(node)).toBe('Image');
  });

  it('should classify button nodes', () => {
    const node = createNode({
      boundingBox: { x: 0, y: 0, width: 120, height: 44 },
      fills: [{ type: 'solid', color: { hex: '#3b82f6', rgba: { r: 59, g: 130, b: 246, a: 1 } }, opacity: 1 }],
      children: [createNode({ type: 'TEXT', text: 'Click me' })],
    });
    expect(classifyNode(node)).toBe('Button');
  });

  it('should classify card nodes', () => {
    const node = createNode({
      boundingBox: { x: 0, y: 0, width: 200, height: 150 },
      cornerRadius: 8,
      fills: [{ type: 'solid', color: { hex: '#fff', rgba: { r: 255, g: 255, b: 255, a: 1 } }, opacity: 1 }],
      children: [createNode({ id: '1:2' })],
    });
    expect(classifyNode(node)).toBe('Card');
  });

  it('should default to Container', () => {
    const node = createNode({
      children: [createNode({ id: '1:2' })],
    });
    expect(classifyNode(node)).toBe('Container');
  });
});

describe('toIRNode', () => {
  it('should convert text node to TextIR', () => {
    const node = createNode({ type: 'TEXT', text: 'Hello World' });
    const result = toIRNode(node);

    expect(result.semanticType).toBe('Text');
    expect((result as any).text).toBe('Hello World');
  });

  it('should convert icon node to IconIR', () => {
    const node = createNode({
      type: 'VECTOR',
      boundingBox: { x: 0, y: 0, width: 24, height: 24 },
    });
    const result = toIRNode(node);

    expect(result.semanticType).toBe('Icon');
    expect((result as any).size).toBe(24);
  });

  it('should convert button node to ButtonIR', () => {
    const node = createNode({
      boundingBox: { x: 0, y: 0, width: 120, height: 44 },
      fills: [{ type: 'solid', color: { hex: '#3b82f6', rgba: { r: 59, g: 130, b: 246, a: 1 } }, opacity: 1 }],
      children: [createNode({ type: 'TEXT', text: 'Submit' })],
    });
    const result = toIRNode(node);

    expect(result.semanticType).toBe('Button');
    expect((result as any).label).toBe('Submit');
    expect((result as any).variant).toBe('primary');
  });

  it('should convert container with children recursively', () => {
    const node = createNode({
      children: [
        createNode({ id: '1:2', type: 'TEXT', text: 'Child' }),
      ],
    });
    const result = toIRNode(node);

    expect(result.semanticType).toBe('Container');
    expect((result as any).children).toHaveLength(1);
    expect((result as any).children[0].semanticType).toBe('Text');
  });
});

describe('recognizeSemantics', () => {
  it('should transform entire tree', () => {
    const node = createNode({
      children: [
        createNode({
          id: '1:2',
          boundingBox: { x: 0, y: 0, width: 200, height: 150 },
          cornerRadius: 8,
          fills: [{ type: 'solid', color: { hex: '#fff', rgba: { r: 255, g: 255, b: 255, a: 1 } }, opacity: 1 }],
          children: [
            createNode({ id: '1:3', type: 'TEXT', text: 'Card Title' }),
          ],
        }),
      ],
    });
    const result = recognizeSemantics(node);

    expect(result.semanticType).toBe('Container');
    expect((result as any).children[0].semanticType).toBe('Card');
    expect((result as any).children[0].children[0].semanticType).toBe('Text');
  });
});
