/**
 * List Detector - Identify repeating items for FlatList generation
 *
 * Detects containers that should become FlatList based on:
 * 1. Intent: Explicit scrolling enabled (overflow: scroll)
 * 2. Scale: 3+ structurally similar items
 */

import type { IRNode, ContainerIR, CardIR, LayoutMeta } from '../types.js';
import type { ListHint } from './types.js';

/**
 * Minimum items to consider a list if NO scrolling is detected.
 */
const MIN_LIST_ITEMS = 3;

/**
 * Dimension similarity tolerance (10%).
 */
const SIZE_TOLERANCE = 0.1;

const MIN_DIMENSION = 0.01;

/**
 * Type guard for container-like nodes
 */
function isContainerLike(node: IRNode): node is ContainerIR | CardIR {
  return node.semanticType === 'Container' || node.semanticType === 'Card';
}

/**
 * Check if two nodes have similar dimensions
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
 */
function hasSameStructure(a: IRNode, b: IRNode): boolean {
  if (a.semanticType !== b.semanticType) return false;

  if (isContainerLike(a) && isContainerLike(b)) {
    if (a.children.length !== b.children.length) return false;
    for (let i = 0; i < a.children.length; i++) {
      if (a.children[i].semanticType !== b.children[i].semanticType) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Generate a short hash from node ID
 */
function shortHash(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    const char = id.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36).slice(0, 4);
}

/**
 * Infer a type name from a node's structure
 */
function inferTypeName(node: IRNode): string {
  // Use component name if it's a component
  if (node.semanticType === 'Component') {
    return (node as any).componentName;
  }

  const name = node.name
    .replace(/[^a-zA-Z0-9]/g, '')
    .replace(/^\d+/, '');

  if (name.length >= 3) {
    return name.charAt(0).toUpperCase() + name.slice(1) + 'Item';
  }

  const hash = shortHash(node.id);
  switch (node.semanticType) {
    case 'Card': return `CardItem${hash}`;
    case 'Container': return `ListItem${hash}`;
    case 'Button': return `ButtonItem${hash}`;
    default: return `Item${hash}`;
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

  if (children.length === 0) return null;

  // Rule 1: Scrolling Intent (overflow = scroll)
  // If explicitly scrollable, we treat it as a list even if it has few items
  // (Assuming the children represent the items or the template)
  const isScrollable = layout.overflow === 'scroll';
  
  // Rule 2: Scale (repetition)
  // If not explicitly scrollable, we need enough repetition to justify a list
  if (!isScrollable && children.length < MIN_LIST_ITEMS) {
    return null;
  }

  // Verify Similarity
  // Even if scrollable, a FlatList requires similar items.
  // If we have > 1 item, check they are consistent.
  // If we have 1 item and it's scrollable, assumes it's the template.
  
  const firstChild = children[0];
  
  if (children.length > 1) {
    const allSimilar = children.every(child =>
      hasSameStructure(child, firstChild) && hasSimilarSize(child, firstChild)
    );
    if (!allSimilar) {
      // If scrollable but heterogeneous, it's a ScrollView, not a FlatList
      // We return null here because this detector is specifically for FlatLists
      return null;
    }
  }

  return {
    containerId: container.id,
    itemIds: children.map(c => c.id),
    orientation: getOrientation(layout),
    itemType: inferTypeName(firstChild),
  };
}

function detectListsRecursive(node: IRNode, results: ListHint[]): void {
  if (!isContainerLike(node)) return;

  const hint = detectListInContainer(node);
  if (hint) {
    results.push(hint);
    return; // Don't recurse into list items
  }

  if ('children' in node) {
    for (const child of node.children) {
      detectListsRecursive(child, results);
    }
  }
}

export function detectLists(root: IRNode): ListHint[] {
  const results: ListHint[] = [];
  detectListsRecursive(root, results);
  return results;
}
