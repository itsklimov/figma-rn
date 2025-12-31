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
  '*-guide',
  '*_guide',
];

/**
 * OS component patterns - these are device chrome elements that should never be rendered
 * Includes iOS status bar, home indicator, Android navigation bar, etc.
 */
const OS_COMPONENT_PATTERNS = [
  // iOS Status Bar variations
  'StatusBar',
  'Status Bar',
  'Status bar',
  'status bar',
  '_StatusBar*',
  '*StatusBar*',
  // iOS Home Indicator variations
  'Home Indicator',
  'Home indicator',
  'HomeIndicator',
  'home indicator',
  '*Home Indicator*',
  '*HomeIndicator*',
  // iOS Device overlays
  'iPhone*Overlay',
  'iPhone*Frame',
  'Device Frame',
  'Device Overlay',
  // Android system UI
  'Navigation Bar',
  'NavigationBar',
  'System Bar',
  'SystemBar',
  // Generic device chrome
  '*Device Chrome*',
  '*Safe Area*',
  'SafeArea',
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
 * Check if node is an OS component (device chrome that shouldn't be rendered)
 */
function isOSComponent(node: FigmaNode): FilterReason | null {
  const name = node.name.toLowerCase();

  // Pattern-based OS component detection
  if (matchesAnyPattern(node.name, OS_COMPONENT_PATTERNS)) {
    if (name.includes('status') && name.includes('bar')) {
      return 'status-bar';
    }
    if (name.includes('home') && name.includes('indicator')) {
      return 'home-indicator';
    }
    return 'os-component';
  }

  // Heuristic detection for status bars
  if (name.includes('status') && name.includes('bar')) {
    return 'status-bar';
  }

  // Heuristic detection for home indicators
  if (name.includes('home') && name.includes('indicator')) {
    return 'home-indicator';
  }

  // Heuristic detection for navigation bars (Android)
  if (name.includes('navigation') && name.includes('bar')) {
    return 'os-component';
  }

  return null;
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

  // OS component detection (highest priority - filter early)
  const osReason = isOSComponent(node);
  if (osReason !== null) {
    return osReason;
  }

  // Name-based pattern matching for annotations, guides, etc.
  if (matchesAnyPattern(node.name, ignorePatterns)) {
    return 'pattern-match';
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
  if (node.layoutPositioning) normalizedNode.layoutPositioning = node.layoutPositioning;
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
 * Filter options for normalization
 */
export interface FilterOptions {
  /** Pattern-based filtering for annotations, guides, etc. */
  ignorePatterns?: string[];
  /** Specific node IDs to exclude (e.g., from safe area detection) */
  excludeIds?: Set<string>;
}

/**
 * Recursively filter a Figma node tree
 * Returns null if the node itself should be filtered
 */
export function filterNode(
  node: FigmaNode,
  options?: FilterOptions
): NormalizedNode | null {
  const { ignorePatterns, excludeIds } = options || {};

  // Check if this node is in the exclude list (from safe area detection)
  if (excludeIds?.has(node.id)) {
    return null;
  }

  // Check if this node should be filtered by pattern/rules
  const filterReason = shouldFilter(node, ignorePatterns);
  if (filterReason !== null) {
    return null;
  }

  // Create normalized node
  const normalizedNode = toNormalizedNode(node);

  // Recursively filter children
  if (node.children && node.children.length > 0) {
    normalizedNode.children = node.children
      .map(child => filterNode(child, options))
      .filter((child): child is NormalizedNode => child !== null);
  }

  return normalizedNode;
}

/**
 * Filter the entire tree starting from root
 * This is the main entry point for the filter module
 *
 * @param root - Root FigmaNode to filter
 * @param optionsOrPatterns - Either FilterOptions object or legacy string[] of patterns
 */
export function filterTree(
  root: FigmaNode,
  optionsOrPatterns?: FilterOptions | string[]
): NormalizedNode | null {
  // Support both new FilterOptions and legacy string[] signature
  const options: FilterOptions = Array.isArray(optionsOrPatterns)
    ? { ignorePatterns: optionsOrPatterns }
    : optionsOrPatterns || {};

  return filterNode(root, options);
}
