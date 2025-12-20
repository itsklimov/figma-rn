/**
 * Layout detector - determines layout type from node structure
 */

import type { NormalizedNode, LayoutType } from '../types.js';

/**
 * Threshold for considering elements aligned (in pixels)
 */
const ALIGNMENT_THRESHOLD = 2;

/**
 * Threshold for considering gaps consistent
 */
const GAP_VARIANCE_THRESHOLD = 4;

/**
 * Check if children are arranged horizontally (row layout)
 * Children are considered in a row if:
 * - They have similar Y positions (aligned top or center)
 * - They are arranged left-to-right with consistent spacing
 */
export function isRowByPosition(children: NormalizedNode[]): boolean {
  if (children.length < 2) {
    return false;
  }

  // Check if children are vertically aligned (similar Y positions)
  const yPositions = children.map(c => c.boundingBox.y);
  const minY = Math.min(...yPositions);
  const maxY = Math.max(...yPositions);

  // If Y variance is too large, not a row
  if (maxY - minY > ALIGNMENT_THRESHOLD + 20) {
    return false;
  }

  // Check if children are arranged left-to-right
  const sortedByX = [...children].sort((a, b) => a.boundingBox.x - b.boundingBox.x);

  // Check if each child is to the right of the previous one
  for (let i = 1; i < sortedByX.length; i++) {
    const prev = sortedByX[i - 1];
    const curr = sortedByX[i];

    // Current should start after previous ends (or at least not overlap significantly)
    const prevRight = prev.boundingBox.x + prev.boundingBox.width;
    if (curr.boundingBox.x < prevRight - ALIGNMENT_THRESHOLD) {
      return false;
    }
  }

  return true;
}

/**
 * Check if children are arranged vertically (column layout)
 * Children are considered in a column if:
 * - They have similar X positions (aligned left or center)
 * - They are arranged top-to-bottom with consistent spacing
 */
export function isColumnByPosition(children: NormalizedNode[]): boolean {
  if (children.length < 2) {
    return false;
  }

  // Check if children are horizontally aligned (similar X positions)
  const xPositions = children.map(c => c.boundingBox.x);
  const minX = Math.min(...xPositions);
  const maxX = Math.max(...xPositions);

  // If X variance is too large, not a column
  if (maxX - minX > ALIGNMENT_THRESHOLD + 20) {
    return false;
  }

  // Check if children are arranged top-to-bottom
  const sortedByY = [...children].sort((a, b) => a.boundingBox.y - b.boundingBox.y);

  // Check if each child is below the previous one
  for (let i = 1; i < sortedByY.length; i++) {
    const prev = sortedByY[i - 1];
    const curr = sortedByY[i];

    // Current should start after previous ends (or at least not overlap significantly)
    const prevBottom = prev.boundingBox.y + prev.boundingBox.height;
    if (curr.boundingBox.y < prevBottom - ALIGNMENT_THRESHOLD) {
      return false;
    }
  }

  return true;
}

/**
 * Check if children are overlapping (stack layout)
 * Stack layout means multiple children occupy similar positions
 */
export function isStackByPosition(children: NormalizedNode[]): boolean {
  if (children.length < 2) {
    return false;
  }

  // Check if any two children significantly overlap
  for (let i = 0; i < children.length; i++) {
    for (let j = i + 1; j < children.length; j++) {
      const a = children[i].boundingBox;
      const b = children[j].boundingBox;

      // Calculate overlap
      const overlapX = Math.max(
        0,
        Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
      );
      const overlapY = Math.max(
        0,
        Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
      );

      // If overlap area is significant relative to smaller element
      const overlapArea = overlapX * overlapY;
      const smallerArea = Math.min(a.width * a.height, b.width * b.height);

      // If overlap is more than 50% of smaller element, it's a stack
      if (overlapArea > smallerArea * 0.5) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Detect layout type from node structure
 * Priority:
 * 1. Use Figma auto-layout if available
 * 2. Detect from children positions
 * 3. Fall back to 'absolute' for unknown layouts
 */
export function detectLayoutType(node: NormalizedNode): LayoutType {
  // If Figma auto-layout is present, use it
  if (node.figmaLayout) {
    return node.figmaLayout.mode === 'horizontal' ? 'row' : 'column';
  }

  // No children = no layout needed
  if (node.children.length === 0) {
    return 'absolute';
  }

  // Single child = treat as column (vertical)
  if (node.children.length === 1) {
    return 'column';
  }

  // Check for stack (overlapping children) first
  if (isStackByPosition(node.children)) {
    return 'stack';
  }

  // Check for row layout
  if (isRowByPosition(node.children)) {
    return 'row';
  }

  // Check for column layout
  if (isColumnByPosition(node.children)) {
    return 'column';
  }

  // Default to absolute for complex layouts
  return 'absolute';
}

/**
 * Calculate the average gap between children in a row
 */
export function calculateRowGap(children: NormalizedNode[]): number {
  if (children.length < 2) {
    return 0;
  }

  const sortedByX = [...children].sort((a, b) => a.boundingBox.x - b.boundingBox.x);
  const gaps: number[] = [];

  for (let i = 1; i < sortedByX.length; i++) {
    const prev = sortedByX[i - 1];
    const curr = sortedByX[i];
    const gap = curr.boundingBox.x - (prev.boundingBox.x + prev.boundingBox.width);
    gaps.push(Math.max(0, gap));
  }

  // Return average gap, rounded
  const avg = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;
  return Math.round(avg);
}

/**
 * Calculate the average gap between children in a column
 */
export function calculateColumnGap(children: NormalizedNode[]): number {
  if (children.length < 2) {
    return 0;
  }

  const sortedByY = [...children].sort((a, b) => a.boundingBox.y - b.boundingBox.y);
  const gaps: number[] = [];

  for (let i = 1; i < sortedByY.length; i++) {
    const prev = sortedByY[i - 1];
    const curr = sortedByY[i];
    const gap = curr.boundingBox.y - (prev.boundingBox.y + prev.boundingBox.height);
    gaps.push(Math.max(0, gap));
  }

  // Return average gap, rounded
  const avg = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;
  return Math.round(avg);
}
