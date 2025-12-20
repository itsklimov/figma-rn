/**
 * Unit tests for the layout detector module
 */

import { describe, it, expect } from 'vitest';
import {
  isRowByPosition,
  isColumnByPosition,
  isStackByPosition,
  detectLayoutType,
  calculateRowGap,
  calculateColumnGap,
} from '../../../src/core/layout/detector.js';
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

describe('isRowByPosition', () => {
  it('should return true for horizontally arranged children', () => {
    const children = [
      createNode({ boundingBox: { x: 0, y: 0, width: 50, height: 50 } }),
      createNode({ boundingBox: { x: 60, y: 0, width: 50, height: 50 } }),
      createNode({ boundingBox: { x: 120, y: 0, width: 50, height: 50 } }),
    ];
    expect(isRowByPosition(children)).toBe(true);
  });

  it('should return true for children with slight vertical variance', () => {
    const children = [
      createNode({ boundingBox: { x: 0, y: 0, width: 50, height: 50 } }),
      createNode({ boundingBox: { x: 60, y: 5, width: 50, height: 50 } }),
      createNode({ boundingBox: { x: 120, y: 2, width: 50, height: 50 } }),
    ];
    expect(isRowByPosition(children)).toBe(true);
  });

  it('should return false for vertically arranged children', () => {
    const children = [
      createNode({ boundingBox: { x: 0, y: 0, width: 50, height: 50 } }),
      createNode({ boundingBox: { x: 0, y: 60, width: 50, height: 50 } }),
      createNode({ boundingBox: { x: 0, y: 120, width: 50, height: 50 } }),
    ];
    expect(isRowByPosition(children)).toBe(false);
  });

  it('should return false for overlapping children', () => {
    const children = [
      createNode({ boundingBox: { x: 0, y: 0, width: 100, height: 50 } }),
      createNode({ boundingBox: { x: 50, y: 0, width: 100, height: 50 } }),
    ];
    expect(isRowByPosition(children)).toBe(false);
  });

  it('should return false for single child', () => {
    const children = [
      createNode({ boundingBox: { x: 0, y: 0, width: 50, height: 50 } }),
    ];
    expect(isRowByPosition(children)).toBe(false);
  });
});

describe('isColumnByPosition', () => {
  it('should return true for vertically arranged children', () => {
    const children = [
      createNode({ boundingBox: { x: 0, y: 0, width: 50, height: 50 } }),
      createNode({ boundingBox: { x: 0, y: 60, width: 50, height: 50 } }),
      createNode({ boundingBox: { x: 0, y: 120, width: 50, height: 50 } }),
    ];
    expect(isColumnByPosition(children)).toBe(true);
  });

  it('should return true for children with slight horizontal variance', () => {
    const children = [
      createNode({ boundingBox: { x: 0, y: 0, width: 50, height: 50 } }),
      createNode({ boundingBox: { x: 5, y: 60, width: 50, height: 50 } }),
      createNode({ boundingBox: { x: 2, y: 120, width: 50, height: 50 } }),
    ];
    expect(isColumnByPosition(children)).toBe(true);
  });

  it('should return false for horizontally arranged children', () => {
    const children = [
      createNode({ boundingBox: { x: 0, y: 0, width: 50, height: 50 } }),
      createNode({ boundingBox: { x: 60, y: 0, width: 50, height: 50 } }),
      createNode({ boundingBox: { x: 120, y: 0, width: 50, height: 50 } }),
    ];
    expect(isColumnByPosition(children)).toBe(false);
  });

  it('should return false for single child', () => {
    const children = [
      createNode({ boundingBox: { x: 0, y: 0, width: 50, height: 50 } }),
    ];
    expect(isColumnByPosition(children)).toBe(false);
  });
});

describe('isStackByPosition', () => {
  it('should return true for overlapping children', () => {
    const children = [
      createNode({ boundingBox: { x: 0, y: 0, width: 100, height: 100 } }),
      createNode({ boundingBox: { x: 10, y: 10, width: 80, height: 80 } }),
    ];
    expect(isStackByPosition(children)).toBe(true);
  });

  it('should return false for non-overlapping children', () => {
    const children = [
      createNode({ boundingBox: { x: 0, y: 0, width: 50, height: 50 } }),
      createNode({ boundingBox: { x: 60, y: 0, width: 50, height: 50 } }),
    ];
    expect(isStackByPosition(children)).toBe(false);
  });

  it('should return false for slightly touching children', () => {
    const children = [
      createNode({ boundingBox: { x: 0, y: 0, width: 50, height: 50 } }),
      createNode({ boundingBox: { x: 49, y: 0, width: 50, height: 50 } }),
    ];
    // Minor overlap should not count as stack
    expect(isStackByPosition(children)).toBe(false);
  });

  it('should return false for single child', () => {
    const children = [
      createNode({ boundingBox: { x: 0, y: 0, width: 50, height: 50 } }),
    ];
    expect(isStackByPosition(children)).toBe(false);
  });
});

describe('detectLayoutType', () => {
  it('should use Figma auto-layout when available (horizontal)', () => {
    const node = createNode({
      figmaLayout: {
        mode: 'horizontal',
        gap: 8,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        mainAxisAlign: 'MIN',
        crossAxisAlign: 'CENTER',
      },
    });
    expect(detectLayoutType(node)).toBe('row');
  });

  it('should use Figma auto-layout when available (vertical)', () => {
    const node = createNode({
      figmaLayout: {
        mode: 'vertical',
        gap: 8,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        mainAxisAlign: 'MIN',
        crossAxisAlign: 'CENTER',
      },
    });
    expect(detectLayoutType(node)).toBe('column');
  });

  it('should detect row from positions', () => {
    const node = createNode({
      children: [
        createNode({ boundingBox: { x: 0, y: 0, width: 50, height: 50 } }),
        createNode({ boundingBox: { x: 60, y: 0, width: 50, height: 50 } }),
      ],
    });
    expect(detectLayoutType(node)).toBe('row');
  });

  it('should detect column from positions', () => {
    const node = createNode({
      children: [
        createNode({ boundingBox: { x: 0, y: 0, width: 50, height: 50 } }),
        createNode({ boundingBox: { x: 0, y: 60, width: 50, height: 50 } }),
      ],
    });
    expect(detectLayoutType(node)).toBe('column');
  });

  it('should detect stack for overlapping children', () => {
    const node = createNode({
      children: [
        createNode({ boundingBox: { x: 0, y: 0, width: 100, height: 100 } }),
        createNode({ boundingBox: { x: 10, y: 10, width: 80, height: 80 } }),
      ],
    });
    expect(detectLayoutType(node)).toBe('stack');
  });

  it('should return absolute for no children', () => {
    const node = createNode({ children: [] });
    expect(detectLayoutType(node)).toBe('absolute');
  });

  it('should return column for single child', () => {
    const node = createNode({
      children: [createNode({ boundingBox: { x: 10, y: 10, width: 50, height: 50 } })],
    });
    expect(detectLayoutType(node)).toBe('column');
  });
});

describe('calculateRowGap', () => {
  it('should calculate average gap between horizontal children', () => {
    const children = [
      createNode({ boundingBox: { x: 0, y: 0, width: 50, height: 50 } }),
      createNode({ boundingBox: { x: 60, y: 0, width: 50, height: 50 } }),
      createNode({ boundingBox: { x: 120, y: 0, width: 50, height: 50 } }),
    ];
    expect(calculateRowGap(children)).toBe(10);
  });

  it('should handle varying gaps', () => {
    const children = [
      createNode({ boundingBox: { x: 0, y: 0, width: 50, height: 50 } }),
      createNode({ boundingBox: { x: 58, y: 0, width: 50, height: 50 } }),
      createNode({ boundingBox: { x: 120, y: 0, width: 50, height: 50 } }),
    ];
    // Gaps: 8, 12 -> average 10
    expect(calculateRowGap(children)).toBe(10);
  });

  it('should return 0 for single child', () => {
    const children = [
      createNode({ boundingBox: { x: 0, y: 0, width: 50, height: 50 } }),
    ];
    expect(calculateRowGap(children)).toBe(0);
  });

  it('should return 0 for touching elements', () => {
    const children = [
      createNode({ boundingBox: { x: 0, y: 0, width: 50, height: 50 } }),
      createNode({ boundingBox: { x: 50, y: 0, width: 50, height: 50 } }),
    ];
    expect(calculateRowGap(children)).toBe(0);
  });
});

describe('calculateColumnGap', () => {
  it('should calculate average gap between vertical children', () => {
    const children = [
      createNode({ boundingBox: { x: 0, y: 0, width: 50, height: 50 } }),
      createNode({ boundingBox: { x: 0, y: 66, width: 50, height: 50 } }),
      createNode({ boundingBox: { x: 0, y: 132, width: 50, height: 50 } }),
    ];
    expect(calculateColumnGap(children)).toBe(16);
  });

  it('should return 0 for single child', () => {
    const children = [
      createNode({ boundingBox: { x: 0, y: 0, width: 50, height: 50 } }),
    ];
    expect(calculateColumnGap(children)).toBe(0);
  });
});
