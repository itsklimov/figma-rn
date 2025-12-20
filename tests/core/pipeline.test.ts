/**
 * Unit tests for the pipeline module
 */

import { describe, it, expect } from 'vitest';
import { transformToScreenIR, stages } from '../../src/core/pipeline.js';
import type { FigmaNode } from '../../src/api/types.js';

// Helper to create a minimal FigmaNode
function createNode(overrides: Partial<FigmaNode> = {}): FigmaNode {
  return {
    id: '1:1',
    name: 'TestScreen',
    type: 'FRAME',
    visible: true,
    boundingBox: { x: 0, y: 0, width: 375, height: 812 },
    ...overrides,
  };
}

describe('transformToScreenIR', () => {
  it('should transform a simple screen', () => {
    const input = createNode({
      children: [
        createNode({
          id: '1:2',
          name: 'Header',
          type: 'FRAME',
          boundingBox: { x: 0, y: 0, width: 375, height: 60 },
          children: [
            {
              id: '1:3',
              name: 'Title',
              type: 'TEXT',
              text: 'Welcome',
              visible: true,
              boundingBox: { x: 16, y: 20, width: 100, height: 24 },
              typography: {
                fontFamily: 'Inter',
                fontSize: 20,
                fontWeight: 600,
                lineHeight: 24,
                letterSpacing: 0,
                textAlign: 'left',
              },
            },
          ],
        }),
      ],
    });

    const result = transformToScreenIR(input);

    expect(result.id).toBe('1:1');
    expect(result.name).toBe('TestScreen');
    expect(result.root.semanticType).toBe('Container');
    expect(result.stylesBundle).toBeDefined();
    expect(result.stylesBundle.tokens).toBeDefined();
  });

  it('should filter hidden nodes', () => {
    const input = createNode({
      children: [
        createNode({ id: '1:2', name: 'Visible', visible: true }),
        createNode({ id: '1:3', name: 'Hidden', visible: false }),
      ],
    });

    const result = transformToScreenIR(input);

    // Should only have one child (visible one)
    expect((result.root as any).children).toHaveLength(1);
    expect((result.root as any).children[0].name).toBe('Visible');
  });

  it('should filter annotation nodes', () => {
    const input = createNode({
      children: [
        createNode({ id: '1:2', name: 'Content' }),
        createNode({ id: '1:3', name: 'Annotation Layer' }),
        createNode({ id: '1:4', name: 'Measurement Guide' }),
      ],
    });

    const result = transformToScreenIR(input);

    expect((result.root as any).children).toHaveLength(1);
    expect((result.root as any).children[0].name).toBe('Content');
  });

  it('should recognize text nodes', () => {
    const input = createNode({
      children: [
        {
          id: '1:2',
          name: 'Title',
          type: 'TEXT',
          text: 'Hello World',
          visible: true,
          boundingBox: { x: 0, y: 0, width: 100, height: 24 },
        },
      ],
    });

    const result = transformToScreenIR(input);

    const textChild = (result.root as any).children[0];
    expect(textChild.semanticType).toBe('Text');
    expect(textChild.text).toBe('Hello World');
  });

  it('should recognize button nodes', () => {
    const input = createNode({
      children: [
        {
          id: '1:2',
          name: 'SubmitButton',
          type: 'FRAME',
          visible: true,
          boundingBox: { x: 0, y: 0, width: 120, height: 44 },
          fills: [{ type: 'solid', color: { hex: '#3b82f6', rgba: { r: 59, g: 130, b: 246, a: 1 } }, opacity: 1 }],
          cornerRadius: 8,
          children: [
            {
              id: '1:3',
              name: 'Label',
              type: 'TEXT',
              text: 'Submit',
              visible: true,
              boundingBox: { x: 40, y: 12, width: 40, height: 20 },
            },
          ],
        },
      ],
    });

    const result = transformToScreenIR(input);

    const button = (result.root as any).children[0];
    expect(button.semanticType).toBe('Button');
    expect(button.label).toBe('Submit');
  });

  it('should recognize card nodes', () => {
    const input = createNode({
      children: [
        {
          id: '1:2',
          name: 'Card',
          type: 'FRAME',
          visible: true,
          boundingBox: { x: 0, y: 0, width: 343, height: 120 },
          fills: [{ type: 'solid', color: { hex: '#ffffff', rgba: { r: 255, g: 255, b: 255, a: 1 } }, opacity: 1 }],
          cornerRadius: 12,
          effects: [{ type: 'drop-shadow', color: { hex: '#000000', rgba: { r: 0, g: 0, b: 0, a: 0.1 } }, offset: { x: 0, y: 2 }, radius: 8, spread: 0 }],
          children: [
            {
              id: '1:3',
              name: 'Title',
              type: 'TEXT',
              text: 'Card Title',
              visible: true,
              boundingBox: { x: 16, y: 16, width: 100, height: 24 },
            },
          ],
        },
      ],
    });

    const result = transformToScreenIR(input);

    const card = (result.root as any).children[0];
    expect(card.semanticType).toBe('Card');
  });

  it('should extract styles', () => {
    const input = createNode({
      fills: [{ type: 'solid', color: { hex: '#f3f4f6', rgba: { r: 243, g: 244, b: 246, a: 1 } }, opacity: 1 }],
      children: [
        {
          id: '1:2',
          name: 'Title',
          type: 'TEXT',
          text: 'Hello',
          visible: true,
          boundingBox: { x: 0, y: 0, width: 100, height: 24 },
          fills: [{ type: 'solid', color: { hex: '#1f2937', rgba: { r: 31, g: 41, b: 55, a: 1 } }, opacity: 1 }],
          typography: {
            fontFamily: 'Inter',
            fontSize: 16,
            fontWeight: 500,
            lineHeight: 24,
            letterSpacing: 0,
            textAlign: 'left',
          },
        },
      ],
    });

    const result = transformToScreenIR(input);

    // Should have styles
    expect(Object.keys(result.stylesBundle.styles).length).toBeGreaterThan(0);

    // Should have color tokens
    expect(Object.keys(result.stylesBundle.tokens.colors).length).toBeGreaterThan(0);

    // Should have typography tokens
    expect(Object.keys(result.stylesBundle.tokens.typography).length).toBeGreaterThan(0);
  });

  it('should handle empty/filtered root', () => {
    const input = createNode({ visible: false });

    const result = transformToScreenIR(input);

    expect(result.id).toBe('1:1');
    expect(result.root.semanticType).toBe('Container');
    expect((result.root as any).children).toEqual([]);
  });

  it('should use custom ignore patterns', () => {
    const input = createNode({
      children: [
        createNode({ id: '1:2', name: 'Content' }),
        createNode({ id: '1:3', name: 'debug-overlay' }),
      ],
    });

    const result = transformToScreenIR(input, {
      ignorePatterns: ['*debug*'],
    });

    expect((result.root as any).children).toHaveLength(1);
    expect((result.root as any).children[0].name).toBe('Content');
  });
});

describe('stages', () => {
  describe('normalize', () => {
    it('should return normalized tree', () => {
      const input = createNode({
        children: [createNode({ id: '1:2', visible: true })],
      });

      const result = stages.normalize(input);

      expect(result).not.toBeNull();
      expect(result?.id).toBe('1:1');
      expect(result?.children).toHaveLength(1);
    });

    it('should return null for hidden root', () => {
      const input = createNode({ visible: false });
      const result = stages.normalize(input);
      expect(result).toBeNull();
    });
  });

  describe('addLayout', () => {
    it('should add layout info to nodes', () => {
      const normalized = {
        id: '1:1',
        name: 'Test',
        type: 'FRAME',
        boundingBox: { x: 0, y: 0, width: 100, height: 100 },
        children: [],
      };

      const result = stages.addLayout(normalized);

      expect(result.layout).toBeDefined();
      expect(result.layout.type).toBeDefined();
    });
  });

  describe('recognize', () => {
    it('should classify nodes', () => {
      const layoutNode = {
        id: '1:1',
        name: 'Test',
        type: 'TEXT',
        text: 'Hello',
        boundingBox: { x: 0, y: 0, width: 100, height: 24 },
        layout: {
          type: 'column' as const,
          gap: 0,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          mainAlign: 'start' as const,
          crossAlign: 'start' as const,
        },
        children: [],
      };

      const result = stages.recognize(layoutNode);

      expect(result.semanticType).toBe('Text');
    });
  });
});
