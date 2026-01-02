/**
 * Modal Overlay Detector
 *
 * Detects modal overlays (bottom sheets, dialogs, action sheets) in Figma designs.
 * When a screen contains a modal demonstration, extracts just the modal content
 * for code generation instead of the entire screen.
 *
 * Detection signals:
 * 1. Child frame covers entire parent (same bounding box size)
 * 2. Has semi-transparent fill (scrim/backdrop)
 * 3. Contains a content frame aligned to edge (bottom sheet, side sheet, etc.)
 * 4. Content frame has partial corner radius (e.g., [16, 16, 0, 0] for bottom sheet)
 */

import type { FigmaNode } from '../../api/types.js';

/**
 * Type of modal overlay detected
 */
export type ModalType = 'bottom-sheet' | 'top-sheet' | 'dialog' | 'side-sheet-left' | 'side-sheet-right';

/**
 * Result of modal overlay detection
 */
export interface ModalOverlayResult {
  /** Whether a modal overlay was detected */
  hasModalOverlay: boolean;
  /** Type of modal detected */
  modalType?: ModalType;
  /** ID of the overlay frame (scrim + content) */
  overlayId?: string;
  /** ID of the actual content to generate code for */
  contentId?: string;
  /** Name of the content frame */
  contentName?: string;
  /** IDs of background elements to exclude from generation */
  backgroundIds: string[];
}

/**
 * Check if a fill is semi-transparent (scrim indicator)
 * Works with raw Figma API fill data (before transformation)
 */
function hasSemiTransparentFill(node: FigmaNode): boolean {
  // Access raw fills from the node (may be in different formats)
  const rawNode = node as any;
  const fills = rawNode.fills;

  if (!fills || !Array.isArray(fills)) return false;

  return fills.some((fill: any) => {
    if (fill.visible === false) return false;

    // Check for semi-transparent solid fill (raw Figma uses uppercase type)
    if (fill.type === 'SOLID' || fill.type === 'solid') {
      const opacity = fill.opacity ?? 1;
      const alpha = fill.color?.a ?? 1;
      const effectiveOpacity = opacity * alpha;
      // Semi-transparent: between 0.1 and 0.8 (not fully opaque, not invisible)
      return effectiveOpacity > 0.1 && effectiveOpacity < 0.8;
    }

    return false;
  });
}

/**
 * Check if node covers its parent (same or larger size)
 */
function coversParent(node: FigmaNode, parent: FigmaNode): boolean {
  if (!node.boundingBox || !parent.boundingBox) return false;

  const nodeBB = node.boundingBox;
  const parentBB = parent.boundingBox;

  // Allow small tolerance (2px)
  const widthMatch = Math.abs(nodeBB.width - parentBB.width) <= 2;
  const heightMatch = Math.abs(nodeBB.height - parentBB.height) <= 2;

  return widthMatch && heightMatch;
}

/**
 * Check if corner radius indicates a bottom sheet (top corners rounded, bottom corners 0)
 */
function hasBottomSheetCorners(node: FigmaNode): boolean {
  const radii = (node as any).rectangleCornerRadii;
  if (!radii || !Array.isArray(radii) || radii.length !== 4) return false;

  // [topLeft, topRight, bottomRight, bottomLeft]
  // Bottom sheet: top corners > 0, bottom corners = 0
  const [topLeft, topRight, bottomRight, bottomLeft] = radii;
  return topLeft > 0 && topRight > 0 && bottomRight === 0 && bottomLeft === 0;
}

/**
 * Check if corner radius indicates a top sheet (bottom corners rounded, top corners 0)
 */
function hasTopSheetCorners(node: FigmaNode): boolean {
  const radii = (node as any).rectangleCornerRadii;
  if (!radii || !Array.isArray(radii) || radii.length !== 4) return false;

  const [topLeft, topRight, bottomRight, bottomLeft] = radii;
  return topLeft === 0 && topRight === 0 && bottomRight > 0 && bottomLeft > 0;
}

/**
 * Check if node is aligned to bottom of parent
 */
function isAlignedToBottom(node: FigmaNode, parent: FigmaNode): boolean {
  if (!node.boundingBox || !parent.boundingBox) return false;

  const nodeBottom = node.boundingBox.y + node.boundingBox.height;
  const parentBottom = parent.boundingBox.y + parent.boundingBox.height;

  // Within 5px of bottom
  return Math.abs(nodeBottom - parentBottom) <= 5;
}

/**
 * Check if node is aligned to top of parent
 */
function isAlignedToTop(node: FigmaNode, parent: FigmaNode): boolean {
  if (!node.boundingBox || !parent.boundingBox) return false;

  // Within 5px of top
  return Math.abs(node.boundingBox.y - parent.boundingBox.y) <= 5;
}

/**
 * Check if name suggests a sheet/modal pattern
 */
function hasSheetName(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.includes('sheet') ||
    lower.includes('modal') ||
    lower.includes('bottom') ||
    lower.includes('drawer') ||
    lower.includes('overlay')
  );
}

/**
 * Find the modal content frame within an overlay
 */
function findModalContent(overlay: FigmaNode): { node: FigmaNode; type: ModalType } | null {
  if (!overlay.children) return null;

  for (const child of overlay.children) {
    // Skip if it's just a grabber or similar small element
    if (!child.boundingBox || child.boundingBox.height < 50) continue;

    // Check for bottom sheet patterns
    if (hasBottomSheetCorners(child) && isAlignedToBottom(child, overlay)) {
      return { node: child, type: 'bottom-sheet' };
    }

    // Check for top sheet patterns
    if (hasTopSheetCorners(child) && isAlignedToTop(child, overlay)) {
      return { node: child, type: 'top-sheet' };
    }

    // Check by name + position
    if (hasSheetName(child.name)) {
      if (isAlignedToBottom(child, overlay)) {
        return { node: child, type: 'bottom-sheet' };
      }
      if (isAlignedToTop(child, overlay)) {
        return { node: child, type: 'top-sheet' };
      }
    }

    // Recurse into children (e.g., the overlay might have a wrapper)
    const nested = findModalContent(child);
    if (nested) return nested;
  }

  return null;
}

/**
 * Collect all background element IDs (siblings of the overlay)
 */
function collectBackgroundIds(root: FigmaNode, overlayId: string): string[] {
  const backgroundIds: string[] = [];

  function collectIds(node: FigmaNode): void {
    backgroundIds.push(node.id);
    if (node.children) {
      for (const child of node.children) {
        collectIds(child);
      }
    }
  }

  // Collect IDs from siblings of the overlay (these are background elements)
  if (root.children) {
    for (const child of root.children) {
      if (child.id !== overlayId) {
        collectIds(child);
      }
    }
  }

  return backgroundIds;
}

/**
 * Detect modal overlay in a Figma node tree
 *
 * @param root - The root FigmaNode of the screen
 * @returns Detection result indicating if a modal was found and what to generate
 */
export function detectModalOverlay(root: FigmaNode): ModalOverlayResult {
  const result: ModalOverlayResult = {
    hasModalOverlay: false,
    backgroundIds: [],
  };

  if (!root.children) return result;

  // Look for overlay frame among direct children
  for (const child of root.children) {
    // Skip if not a frame-like node
    if (child.type !== 'FRAME' && child.type !== 'GROUP') continue;

    // Check if this child covers the parent (full-screen overlay)
    if (!coversParent(child, root)) continue;

    // Check if it has a semi-transparent fill (scrim)
    if (!hasSemiTransparentFill(child)) continue;

    // Found a potential overlay - look for modal content inside
    const content = findModalContent(child);

    if (content) {
      result.hasModalOverlay = true;
      result.modalType = content.type;
      result.overlayId = child.id;
      result.contentId = content.node.id;
      result.contentName = content.node.name;
      result.backgroundIds = collectBackgroundIds(root, child.id);

      return result;
    }
  }

  return result;
}

/**
 * Extract the modal content node from the tree
 * Returns a new tree with just the modal content as root
 */
export function extractModalContent(root: FigmaNode, contentId: string): FigmaNode | null {
  function findNode(node: FigmaNode): FigmaNode | null {
    if (node.id === contentId) return node;

    if (node.children) {
      for (const child of node.children) {
        const found = findNode(child);
        if (found) return found;
      }
    }

    return null;
  }

  return findNode(root);
}
