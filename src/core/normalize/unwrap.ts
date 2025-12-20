/**
 * Unwrap module - removes useless wrapper groups from the tree
 */

import type { NormalizedNode } from '../types.js';

/**
 * Check if a node is a "useless group" that should be unwrapped
 * A useless group is one that:
 * - Has no fills
 * - Has no strokes
 * - Has no effects
 * - Has no corner radius
 * - Is a GROUP type (not FRAME which often carries layout intent)
 */
export function isUselessGroup(node: NormalizedNode): boolean {
  // Only consider GROUP nodes for unwrapping
  if (node.type !== 'GROUP') {
    return false;
  }

  // Must have exactly one child to be "unwrappable"
  if (node.children.length !== 1) {
    return false;
  }

  // Check if it has any visual properties
  const hasVisualProperties =
    (node.fills && node.fills.length > 0) ||
    (node.strokes && node.strokes.length > 0) ||
    (node.effects && node.effects.length > 0) ||
    node.cornerRadius !== undefined ||
    (node.opacity !== undefined && node.opacity !== 1);

  return !hasVisualProperties;
}

/**
 * Check if a node is a wrapper group (multiple children, no visuals)
 * These can be unwrapped by promoting children to parent level
 */
export function isWrapperGroup(node: NormalizedNode): boolean {
  // Only consider GROUP nodes
  if (node.type !== 'GROUP') {
    return false;
  }

  // Must have children
  if (node.children.length === 0) {
    return false;
  }

  // Check if it has any visual properties
  const hasVisualProperties =
    (node.fills && node.fills.length > 0) ||
    (node.strokes && node.strokes.length > 0) ||
    (node.effects && node.effects.length > 0) ||
    node.cornerRadius !== undefined ||
    (node.opacity !== undefined && node.opacity !== 1);

  return !hasVisualProperties;
}

/**
 * Unwrap a single useless group node by returning its only child
 */
function unwrapSingleChild(node: NormalizedNode): NormalizedNode {
  if (!isUselessGroup(node)) {
    return node;
  }

  // Return the single child, preserving the parent's bounding box if child lacks one
  const child = node.children[0];
  return {
    ...child,
    // If child has no bounding box, use parent's
    boundingBox: child.boundingBox ?? node.boundingBox,
  };
}

/**
 * Recursively unwrap useless groups in the tree
 * This promotes single children up and flattens unnecessary nesting
 */
export function unwrapUselessGroups(node: NormalizedNode): NormalizedNode {
  // First, recursively process children
  const processedChildren = node.children.map(child => unwrapUselessGroups(child));

  // Create node with processed children
  let result: NormalizedNode = {
    ...node,
    children: processedChildren,
  };

  // Check if this node itself should be unwrapped
  if (isUselessGroup(result)) {
    result = unwrapSingleChild(result);
  }

  return result;
}

/**
 * Flatten wrapper groups by promoting their children
 * This is different from unwrap - it handles groups with multiple children
 */
export function flattenWrapperGroups(nodes: NormalizedNode[]): NormalizedNode[] {
  const result: NormalizedNode[] = [];

  for (const node of nodes) {
    // Recursively process children first
    const processedNode: NormalizedNode = {
      ...node,
      children: flattenWrapperGroups(node.children),
    };

    // If this is a wrapper group, promote its children
    if (isWrapperGroup(processedNode)) {
      result.push(...processedNode.children);
    } else {
      result.push(processedNode);
    }
  }

  return result;
}
