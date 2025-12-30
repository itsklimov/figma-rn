/**
 * Safe Area Detector
 *
 * Identifies OS chrome elements (StatusBar, HomeIndicator, SafeArea) and extracts
 * their dimensions to calculate safe area insets for proper code generation.
 *
 * Instead of filtering these elements and losing layout info, we:
 * 1. Detect them by name patterns and position heuristics
 * 2. Extract their bounding boxes to calculate insets
 * 3. Mark them for removal from render tree
 * 4. Provide inset data for SafeAreaView wrapper generation
 */

import type { FigmaNode } from '../../api/types.js';

/**
 * Safe area insets extracted from Figma design
 */
export interface SafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * Detected OS chrome element
 */
export interface OSChromeElement {
  id: string;
  name: string;
  type: 'status-bar' | 'home-indicator' | 'safe-area' | 'navigation-bar';
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * Result of safe area detection
 */
export interface SafeAreaDetectionResult {
  /** Calculated safe area insets */
  insets: SafeAreaInsets;
  /** Detected OS chrome elements (to be excluded from render) */
  chromeElements: OSChromeElement[];
  /** IDs of nodes to exclude from rendering */
  excludeIds: Set<string>;
  /** Whether the design appears to use safe area layout */
  hasSafeAreaLayout: boolean;
}

/**
 * Common iOS device dimensions for reference
 */
const IOS_DIMENSIONS = {
  // Status bar heights
  STATUS_BAR_STANDARD: 44,
  STATUS_BAR_LEGACY: 20,
  STATUS_BAR_DYNAMIC_ISLAND: 59,

  // Home indicator area
  HOME_INDICATOR_HEIGHT: 34,

  // Common screen widths
  SCREEN_WIDTH_STANDARD: 375,
  SCREEN_WIDTH_PLUS: 414,
  SCREEN_WIDTH_PRO_MAX: 428,
};

/**
 * Check if a node name matches status bar patterns
 */
function isStatusBarName(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower === 'statusbar' ||
    lower === 'status bar' ||
    lower === 'status_bar' ||
    lower.includes('statusbar') ||
    (lower.includes('status') && lower.includes('bar'))
  );
}

/**
 * Check if a node name matches home indicator patterns
 */
function isHomeIndicatorName(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower === 'homeindicator' ||
    lower === 'home indicator' ||
    lower === 'home_indicator' ||
    lower.includes('homeindicator') ||
    (lower.includes('home') && lower.includes('indicator'))
  );
}

/**
 * Check if a node name matches safe area patterns
 */
function isSafeAreaName(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower === 'safearea' ||
    lower === 'safe area' ||
    lower === 'safe_area' ||
    lower.includes('safearea') ||
    (lower.includes('safe') && lower.includes('area'))
  );
}

/**
 * Check if a node name matches navigation bar patterns (Android)
 */
function isNavigationBarName(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower === 'navigationbar' ||
    lower === 'navigation bar' ||
    lower === 'navigation_bar' ||
    (lower.includes('navigation') && lower.includes('bar')) ||
    lower === 'navbar'
  );
}

/**
 * Detect OS chrome element type from node
 */
function detectChromeType(node: FigmaNode): OSChromeElement['type'] | null {
  const name = node.name;

  if (isStatusBarName(name)) return 'status-bar';
  if (isHomeIndicatorName(name)) return 'home-indicator';
  if (isSafeAreaName(name)) return 'safe-area';
  if (isNavigationBarName(name)) return 'navigation-bar';

  return null;
}

/**
 * Check if element is positioned at top of screen (status bar heuristic)
 */
function isAtScreenTop(node: FigmaNode, rootBounds: { y: number }): boolean {
  if (!node.boundingBox) return false;
  // Element is within 5px of the root's top edge
  return Math.abs(node.boundingBox.y - rootBounds.y) < 5;
}

/**
 * Check if element is positioned at bottom of screen (home indicator heuristic)
 */
function isAtScreenBottom(node: FigmaNode, rootBounds: { y: number; height: number }): boolean {
  if (!node.boundingBox) return false;
  const rootBottom = rootBounds.y + rootBounds.height;
  const nodeBottom = node.boundingBox.y + node.boundingBox.height;
  // Element's bottom is within 5px of the root's bottom edge
  return Math.abs(nodeBottom - rootBottom) < 5;
}

/**
 * Check if dimensions match common status bar sizes
 */
function hasStatusBarDimensions(node: FigmaNode): boolean {
  if (!node.boundingBox) return false;
  const { height, width } = node.boundingBox;

  // Check for common status bar heights
  const isStatusBarHeight =
    height >= IOS_DIMENSIONS.STATUS_BAR_LEGACY - 2 &&
    height <= IOS_DIMENSIONS.STATUS_BAR_DYNAMIC_ISLAND + 5;

  // Should span most of the width
  const isFullWidth = width >= IOS_DIMENSIONS.SCREEN_WIDTH_STANDARD - 10;

  return isStatusBarHeight && isFullWidth;
}

/**
 * Check if dimensions match home indicator area
 */
function hasHomeIndicatorDimensions(node: FigmaNode): boolean {
  if (!node.boundingBox) return false;
  const { height, width } = node.boundingBox;

  // Home indicator area is typically 34pt tall
  const isHomeIndicatorHeight = height >= 30 && height <= 40;

  // Should span most of the width
  const isFullWidth = width >= IOS_DIMENSIONS.SCREEN_WIDTH_STANDARD - 10;

  return isHomeIndicatorHeight && isFullWidth;
}

/**
 * Recursively collect all OS chrome elements from the tree
 */
function collectChromeElements(
  node: FigmaNode,
  rootBounds: { x: number; y: number; width: number; height: number },
  results: OSChromeElement[] = []
): OSChromeElement[] {
  // Check by name first
  let chromeType = detectChromeType(node);

  // If no name match, try position + dimension heuristics for direct children of root
  if (!chromeType && node.boundingBox) {
    // Status bar heuristic: at top, full width, correct height
    if (isAtScreenTop(node, rootBounds) && hasStatusBarDimensions(node)) {
      chromeType = 'status-bar';
    }
    // Home indicator heuristic: at bottom, full width, correct height
    else if (isAtScreenBottom(node, rootBounds) && hasHomeIndicatorDimensions(node)) {
      chromeType = 'home-indicator';
    }
  }

  if (chromeType && node.boundingBox) {
    results.push({
      id: node.id,
      name: node.name,
      type: chromeType,
      boundingBox: {
        x: node.boundingBox.x,
        y: node.boundingBox.y,
        width: node.boundingBox.width,
        height: node.boundingBox.height,
      },
    });
  }

  // Recurse into children
  if (node.children) {
    for (const child of node.children) {
      collectChromeElements(child, rootBounds, results);
    }
  }

  return results;
}

/**
 * Calculate safe area insets from detected chrome elements
 */
function calculateInsets(
  chromeElements: OSChromeElement[],
  rootBounds: { x: number; y: number; width: number; height: number }
): SafeAreaInsets {
  const insets: SafeAreaInsets = {
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  };

  for (const element of chromeElements) {
    switch (element.type) {
      case 'status-bar':
        // Top inset is the height of the status bar
        const statusBarBottom = element.boundingBox.y + element.boundingBox.height - rootBounds.y;
        insets.top = Math.max(insets.top, statusBarBottom);
        break;

      case 'home-indicator':
      case 'navigation-bar':
        // Bottom inset is the height of the home indicator area
        const rootBottom = rootBounds.y + rootBounds.height;
        const indicatorTop = element.boundingBox.y;
        const bottomInset = rootBottom - indicatorTop;
        insets.bottom = Math.max(insets.bottom, bottomInset);
        break;

      case 'safe-area':
        // Safe area elements might define all insets
        // Calculate based on position relative to root
        const safeTop = element.boundingBox.y - rootBounds.y;
        const safeLeft = element.boundingBox.x - rootBounds.x;
        const safeRight = (rootBounds.x + rootBounds.width) - (element.boundingBox.x + element.boundingBox.width);
        const safeBottom = (rootBounds.y + rootBounds.height) - (element.boundingBox.y + element.boundingBox.height);

        // Only use if they seem intentional (> 0)
        if (safeTop > 0) insets.top = Math.max(insets.top, safeTop);
        if (safeBottom > 0) insets.bottom = Math.max(insets.bottom, safeBottom);
        if (safeLeft > 0) insets.left = Math.max(insets.left, safeLeft);
        if (safeRight > 0) insets.right = Math.max(insets.right, safeRight);
        break;
    }
  }

  return insets;
}

/**
 * Collect all node IDs that should be excluded from rendering
 * This includes the chrome element and all its children
 */
function collectExcludeIds(node: FigmaNode, excludeIds: Set<string>): void {
  excludeIds.add(node.id);
  if (node.children) {
    for (const child of node.children) {
      collectExcludeIds(child, excludeIds);
    }
  }
}

/**
 * Detect safe area layout from a Figma node tree
 *
 * @param root - The root FigmaNode of the screen
 * @returns Detection result with insets and elements to exclude
 */
export function detectSafeArea(root: FigmaNode): SafeAreaDetectionResult {
  const rootBounds = root.boundingBox ?? { x: 0, y: 0, width: 375, height: 812 };

  // Collect all OS chrome elements
  const chromeElements = collectChromeElements(root, rootBounds);

  // Calculate insets from chrome elements
  const insets = calculateInsets(chromeElements, rootBounds);

  // Collect IDs to exclude (including all children of chrome elements)
  const excludeIds = new Set<string>();

  // Find the actual nodes and collect their subtree IDs
  function findAndExclude(node: FigmaNode): void {
    const isChrome = chromeElements.some(c => c.id === node.id);
    if (isChrome) {
      collectExcludeIds(node, excludeIds);
    } else if (node.children) {
      for (const child of node.children) {
        findAndExclude(child);
      }
    }
  }
  findAndExclude(root);

  // Determine if design uses safe area layout
  const hasSafeAreaLayout =
    chromeElements.length > 0 ||
    insets.top > 0 ||
    insets.bottom > 0;

  return {
    insets,
    chromeElements,
    excludeIds,
    hasSafeAreaLayout,
  };
}

/**
 * Check if a node ID should be excluded from rendering
 */
export function shouldExcludeFromRender(nodeId: string, result: SafeAreaDetectionResult): boolean {
  return result.excludeIds.has(nodeId);
}
