import { describe, it, expect } from 'vitest';
import { mapConstraints } from '../../../src/core/layout/constraint-mapper.js';
import type { FigmaNode, BoundingBox } from '../../../src/api/types.js';

describe('mapConstraints', () => {
  const parentBounds: BoundingBox = { x: 0, y: 0, width: 430, height: 932 };

  const createNode = (
    bounds: BoundingBox,
    constraints: { horizontal: string; vertical: string }
  ): FigmaNode => ({
    id: 'test-node',
    name: 'Test',
    type: 'RECTANGLE',
    boundingBox: bounds,
    constraints,
  } as FigmaNode);

  describe('SCALE constraints', () => {
    it('should round horizontal percentages to 2 decimals', () => {
      const node = createNode(
        { x: 304.28, y: 10, width: 125.72, height: 100 },
        { horizontal: 'SCALE', vertical: 'TOP' }
      );

      const result = mapConstraints(node, parentBounds);

      expect(result?.left).toBe('70.76%'); // 304.28/430*100 = 70.762... → 70.76%
      expect(result?.width).toBe('29.24%'); // 125.72/430*100 = 29.239... → 29.24%
    });

    it('should round vertical percentages to 2 decimals', () => {
      const node = createNode(
        { x: 10, y: 13.29, width: 100, height: 905.42 },
        { horizontal: 'LEFT', vertical: 'SCALE' }
      );

      const result = mapConstraints(node, parentBounds);

      expect(result?.top).toBe('1.43%'); // 13.29/932*100 = 1.4257... → 1.43%
      expect(result?.height).toBe('97.15%'); // 905.42/932*100 = 97.1480... → 97.15%
    });

    it('should handle clean percentages without trailing zeros', () => {
      const node = createNode(
        { x: 0, y: 0, width: 215, height: 466 },
        { horizontal: 'SCALE', vertical: 'SCALE' }
      );

      const result = mapConstraints(node, parentBounds);

      expect(result?.left).toBe('0%');
      expect(result?.width).toBe('50%'); // 215/430 = 0.5 → 50%
      expect(result?.top).toBe('0%');
      expect(result?.height).toBe('50%'); // 466/932 = 0.5 → 50%
    });
  });

  describe('non-SCALE constraints', () => {
    it('should use pixel values for LEFT/TOP', () => {
      const node = createNode(
        { x: 16, y: 32, width: 100, height: 50 },
        { horizontal: 'LEFT', vertical: 'TOP' }
      );

      const result = mapConstraints(node, parentBounds);

      expect(result?.left).toBe(16);
      expect(result?.top).toBe(32);
    });

    it('should calculate RIGHT/BOTTOM correctly', () => {
      const node = createNode(
        { x: 314, y: 850, width: 100, height: 50 },
        { horizontal: 'RIGHT', vertical: 'BOTTOM' }
      );

      const result = mapConstraints(node, parentBounds);

      expect(result?.right).toBe(16); // 430 - (314 + 100) = 16
      expect(result?.bottom).toBe(32); // 932 - (850 + 50) = 32
    });
  });

  it('should return null if no constraints', () => {
    const node = createNode(
      { x: 0, y: 0, width: 100, height: 100 },
      undefined as any
    );

    const result = mapConstraints(node, parentBounds);

    expect(result).toBeNull();
  });

  it('should return null if no parent bounds', () => {
    const node = createNode(
      { x: 0, y: 0, width: 100, height: 100 },
      { horizontal: 'LEFT', vertical: 'TOP' }
    );

    const result = mapConstraints(node, undefined);

    expect(result).toBeNull();
  });
});
