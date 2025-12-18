/**
 * List Detector - Identify repeating items for FlatList generation
 *
 * Detects containers with 3+ similar children that should become FlatList.
 * Similarity is determined by matching semantic structure and similar dimensions.
 */

import type { IRNode, ContainerIR, CardIR, LayoutMeta } from '../types.js';
import type { ListHint } from './types.js';

/**
 * Minimum items to consider a list.
 * 3 items ensures we're detecting actual lists, not just paired elements.
 */
const MIN_LIST_ITEMS = 3;

/**
 * Dimension similarity tolerance (10%).
 * Allows for minor sizing variations while still detecting consistent items.
 */
const SIZE_TOLERANCE = 0.1;

/**
 * Minimum dimension value to prevent division by zero.
 * Uses 0.01 instead of 0 to handle edge cases with zero-sized nodes.
 */
const MIN_DIMENSION = 0.01;

/**
 * Type guard for container-like nodes (Container or Card)
 */
function isContainerLike(node: IRNode): node is ContainerIR | CardIR {
  return node.semanticType === 'Container' || node.semanticType === 'Card';
}

/**
 * Check if two nodes have similar dimensions
 * Uses safe math to prevent division by zero
 */
function hasSimilarSize(a: IRNode, b: IRNode): boolean {
  const widthA = Math.max(a.boundingBox.width, MIN_DIMENSION);
  const widthB = Math.max(b.boundingBox.width, MIN_DIMENSION);
  const heightA = Math.max(a.boundingBox.height, MIN_DIMENSION);
  const heightB = Math.max(b.boundingBox.height, MIN_DIMENSION);

  const widthRatio = Math.abs(widthA - widthB) / Math.max(widthA, widthB);
  const heightRatio = Math.abs(heightA - heightB) / Math.max(heightA, heightB);
  return widthRatio <= SIZE_TOLERANCE && heightRatio <= SIZE_TOLERANCE;
}

/**
 * Check if two nodes have the same semantic structure
 * Compares semantic type, child count, and child types for containers
 */
function hasSameStructure(a: IRNode, b: IRNode): boolean {
  // Must have same semantic type
  if (a.semanticType !== b.semanticType) return false;

  // For containers/cards, check children structure
  if (isContainerLike(a) && isContainerLike(b)) {
    // Must have same number of children
    if (a.children.length !== b.children.length) return false;

    // Each child must have same semantic type
    for (let i = 0; i < a.children.length; i++) {
      if (a.children[i].semanticType !== b.children[i].semanticType) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Generate a short hash from node ID for uniqueness
 */
function shortHash(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    const char = id.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36).slice(0, 4);
}

/**
 * Infer a type name from a node's structure
 * Adds hash suffix to generic names to prevent collisions
 */
function inferTypeName(node: IRNode): string {
  // Use node name if it's meaningful
  const name = node.name
    .replace(/[^a-zA-Z0-9]/g, '')
    .replace(/^\d+/, ''); // Remove leading numbers

  if (name.length >= 3) {
    // PascalCase the name
    return name.charAt(0).toUpperCase() + name.slice(1) + 'Item';
  }

  // Fallback based on semantic type - add hash for uniqueness
  const hash = shortHash(node.id);
  switch (node.semanticType) {
    case 'Card':
      return `CardItem${hash}`;
    case 'Container':
      return `ListItem${hash}`;
    case 'Button':
      return `ButtonItem${hash}`;
    default:
      return `Item${hash}`;
  }
}

/**
 * Determine orientation from layout type
 */
function getOrientation(layout: LayoutMeta): 'horizontal' | 'vertical' {
  return layout.type === 'row' ? 'horizontal' : 'vertical';
}

/**
 * Check if a container's children form a list pattern
 */
function detectListInContainer(container: ContainerIR | CardIR): ListHint | null {
  const { children, layout } = container;

  // Need minimum items
  if (children.length < MIN_LIST_ITEMS) return null;

  // All children should be similar to the first one
  const firstChild = children[0];
  const allSimilar = children.every(child =>
    hasSameStructure(child, firstChild) && hasSimilarSize(child, firstChild)
  );

  if (!allSimilar) return null;

  return {
    containerId: container.id,
    itemIds: children.map(c => c.id),
    orientation: getOrientation(layout),
    itemType: inferTypeName(firstChild),
  };
}

/**
 * Recursively detect lists in an IR tree
 * Stops recursion when a list is detected to avoid detecting list items as separate lists
 */
function detectListsRecursive(node: IRNode, results: ListHint[]): void {
  // Only check containers and cards for list patterns
  if (!isContainerLike(node)) return;

  const hint = detectListInContainer(node);
  if (hint) {
    results.push(hint);
    // Stop recursion here - detected list items shouldn't be analyzed further
    // This prevents false positives where list items themselves are detected as lists
    return;
  }

  // No list pattern found - recurse into children to find nested lists
  for (const child of node.children) {
    detectListsRecursive(child, results);
  }
}

/**
 * Detect repeating items that should become FlatList
 *
 * @param root - Root IR node to analyze
 * @returns List of detected list patterns
 *
 * @example
 * ```typescript
 * const hints = detectLists(screenIR.root);
 * // hints: [{ containerId: '1:5', itemIds: ['1:6', '1:7', '1:8'], orientation: 'vertical', itemType: 'ProductItem' }]
 * ```
 */
export function detectLists(root: IRNode): ListHint[] {
  const results: ListHint[] = [];
  detectListsRecursive(root, results);
  return results;
}
