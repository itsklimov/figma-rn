/**
 * Filter module - removes hidden and irrelevant nodes from the Figma tree
 */

import type { FigmaNode } from '../../api/types.js';
import type { NormalizedNode, FilterReason } from '../types.js';

/**
 * Default patterns for nodes that should be filtered out
 */
const DEFAULT_IGNORE_PATTERNS = [
  '*annotation*',
  '*measure*',
  '*measurement*',
  '*redline*',
  '*spec*',
  'StatusBar',
  'Status Bar',
  'Home Indicator',
  'HomeIndicator',
  'iPhone*Overlay',
  '*-guide',
  '*_guide',
];

/**
 * Check if a string matches a wildcard pattern
 */
function matchesPattern(name: string, pattern: string): boolean {
  const lowerName = name.toLowerCase();
  const lowerPattern = pattern.toLowerCase();

  // Convert wildcard pattern to regex
  const regexPattern = lowerPattern
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape special chars
    .replace(/\\\*/g, '.*'); // Convert \* back to .*

  return new RegExp(`^${regexPattern}$`).test(lowerName);
}

/**
 * Check if a name matches any of the given patterns
 */
function matchesAnyPattern(name: string, patterns: string[]): boolean {
  return patterns.some(pattern => matchesPattern(name, pattern));
}

/**
 * Determine if a node should be filtered and why
 */
export function shouldFilter(
  node: FigmaNode,
  ignorePatterns: string[] = DEFAULT_IGNORE_PATTERNS
): FilterReason | null {
  // Hidden nodes
  if (node.visible === false) {
    return 'hidden';
  }

  // Name-based pattern matching
  if (matchesAnyPattern(node.name, ignorePatterns)) {
    return 'pattern-match';
  }

  // Status bar detection (by name or position)
  const isStatusBar =
    node.name.toLowerCase().includes('status') &&
    node.name.toLowerCase().includes('bar');
  if (isStatusBar) {
    return 'status-bar';
  }

  // Home indicator detection
  const isHomeIndicator =
    node.name.toLowerCase().includes('home') &&
    node.name.toLowerCase().includes('indicator');
  if (isHomeIndicator) {
    return 'home-indicator';
  }

  return null;
}

/**
 * Create a NormalizedNode from a FigmaNode, preserving relevant properties
 */
function toNormalizedNode(node: FigmaNode): NormalizedNode {
  const normalizedNode: NormalizedNode = {
    id: node.id,
    name: node.name,
    type: node.type,
    boundingBox: node.boundingBox ?? { x: 0, y: 0, width: 0, height: 0 },
    children: [],
  };

  // Copy optional visual properties
  if (node.fills && node.fills.length > 0) {
    normalizedNode.fills = node.fills;
  }
  if (node.strokes && node.strokes.length > 0) {
    normalizedNode.strokes = node.strokes;
  }
  if (node.effects && node.effects.length > 0) {
    normalizedNode.effects = node.effects;
  }
  if (node.cornerRadius !== undefined) {
    normalizedNode.cornerRadius = node.cornerRadius;
  }
  if (node.opacity !== undefined && node.opacity !== 1) {
    normalizedNode.opacity = node.opacity;
  }

  // Copy sizing modes
  if (node.primaryAxisSizingMode) normalizedNode.primaryAxisSizingMode = node.primaryAxisSizingMode;
  if (node.counterAxisSizingMode) normalizedNode.counterAxisSizingMode = node.counterAxisSizingMode;
  if (node.layoutAlign) normalizedNode.layoutAlign = node.layoutAlign;
  if (node.layoutGrow !== undefined) normalizedNode.layoutGrow = node.layoutGrow;
  if (node.overflowDirection) normalizedNode.overflowDirection = node.overflowDirection;

  // Copy Advanced Properties
  if (node.constraints) normalizedNode.constraints = node.constraints;
  if (node.boundVariables) (normalizedNode as any).boundVariables = node.boundVariables;
  if (node.styles) (normalizedNode as any).styles = node.styles;
  if (node.scrollBehavior) (normalizedNode as any).scrollBehavior = node.scrollBehavior;

  // Copy text properties
  if (node.text) {
    normalizedNode.text = node.text;
  }
  if (node.typography) {
    normalizedNode.typography = node.typography;
  }

  // Copy Figma auto-layout
  if (node.layout && node.layout.mode !== 'none') {
    normalizedNode.figmaLayout = {
      mode: node.layout.mode,
      gap: node.layout.gap,
      padding: node.layout.padding,
      mainAxisAlign: node.layout.mainAxisAlign,
      crossAxisAlign: node.layout.crossAxisAlign,
    };
  }

  return normalizedNode;
}

/**
 * Recursively filter a Figma node tree
 * Returns null if the node itself should be filtered
 */
export function filterNode(
  node: FigmaNode,
  ignorePatterns?: string[]
): NormalizedNode | null {
  // Check if this node should be filtered
  const filterReason = shouldFilter(node, ignorePatterns);
  if (filterReason !== null) {
    return null;
  }

  // Create normalized node
  const normalizedNode = toNormalizedNode(node);

  // Recursively filter children
  if (node.children && node.children.length > 0) {
    normalizedNode.children = node.children
      .map(child => filterNode(child, ignorePatterns))
      .filter((child): child is NormalizedNode => child !== null);
  }

  return normalizedNode;
}

/**
 * Filter the entire tree starting from root
 * This is the main entry point for the filter module
 */
export function filterTree(
  root: FigmaNode,
  ignorePatterns?: string[]
): NormalizedNode | null {
  return filterNode(root, ignorePatterns);
}
