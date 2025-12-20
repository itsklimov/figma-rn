/**
 * Layout extractor - extracts layout metadata from nodes
 */

import type {
  NormalizedNode,
  LayoutMeta,
  LayoutNode,
  Padding,
  LayoutType,
} from '../types.js';
import { detectLayoutType, calculateRowGap, calculateColumnGap } from './detector.js';

/**
 * Map Figma alignment strings to normalized alignment
 */
function normalizeMainAxisAlign(
  figmaAlign: string | undefined
): LayoutMeta['mainAlign'] {
  switch (figmaAlign) {
    case 'MIN':
      return 'start';
    case 'MAX':
      return 'end';
    case 'CENTER':
      return 'center';
    case 'SPACE_BETWEEN':
      return 'space-between';
    case 'SPACE_AROUND':
      return 'space-around';
    default:
      return 'start';
  }
}

/**
 * Map Figma cross-axis alignment to normalized alignment
 */
function normalizeCrossAxisAlign(
  figmaAlign: string | undefined
): LayoutMeta['crossAlign'] {
  switch (figmaAlign) {
    case 'MIN':
      return 'start';
    case 'MAX':
      return 'end';
    case 'CENTER':
      return 'center';
    case 'BASELINE':
      return 'baseline';
    case 'STRETCH':
      return 'stretch';
    default:
      return 'start';
  }
}

/**
 * Infer padding from container and children positions
 */
export function inferPadding(
  container: NormalizedNode,
  children: NormalizedNode[]
): Padding {
  if (children.length === 0) {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }

  const containerBox = container.boundingBox;

  // Find the bounds of all children
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const child of children) {
    const box = child.boundingBox;
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }

  // Calculate padding (children positions are relative to container)
  // Note: In Figma, child positions are absolute, so we need to adjust
  return {
    top: Math.max(0, Math.round(minY - containerBox.y)),
    right: Math.max(0, Math.round(containerBox.x + containerBox.width - maxX)),
    bottom: Math.max(0, Math.round(containerBox.y + containerBox.height - maxY)),
    left: Math.max(0, Math.round(minX - containerBox.x)),
  };
}

/**
 * Infer main axis alignment from children positions
 */
export function inferMainAxisAlign(
  container: NormalizedNode,
  children: NormalizedNode[],
  layoutType: 'row' | 'column'
): LayoutMeta['mainAlign'] {
  if (children.length === 0) {
    return 'start';
  }

  const containerBox = container.boundingBox;

  if (layoutType === 'row') {
    // Check horizontal distribution
    const sortedByX = [...children].sort((a, b) => a.boundingBox.x - b.boundingBox.x);
    const firstChild = sortedByX[0];
    const lastChild = sortedByX[sortedByX.length - 1];

    const contentStart = firstChild.boundingBox.x - containerBox.x;
    const contentEnd =
      containerBox.x + containerBox.width - (lastChild.boundingBox.x + lastChild.boundingBox.width);

    // Check for centering
    if (Math.abs(contentStart - contentEnd) < 10) {
      return 'center';
    }

    // Check for end alignment
    if (contentEnd < 10 && contentStart > 20) {
      return 'end';
    }

    // Default to start
    return 'start';
  } else {
    // Check vertical distribution
    const sortedByY = [...children].sort((a, b) => a.boundingBox.y - b.boundingBox.y);
    const firstChild = sortedByY[0];
    const lastChild = sortedByY[sortedByY.length - 1];

    const contentStart = firstChild.boundingBox.y - containerBox.y;
    const contentEnd =
      containerBox.y + containerBox.height - (lastChild.boundingBox.y + lastChild.boundingBox.height);

    // Check for centering
    if (Math.abs(contentStart - contentEnd) < 10) {
      return 'center';
    }

    // Check for end alignment
    if (contentEnd < 10 && contentStart > 20) {
      return 'end';
    }

    // Default to start
    return 'start';
  }
}

/**
 * Infer cross axis alignment from children positions
 */
export function inferCrossAxisAlign(
  container: NormalizedNode,
  children: NormalizedNode[],
  layoutType: 'row' | 'column'
): LayoutMeta['crossAlign'] {
  if (children.length === 0) {
    return 'start';
  }

  const containerBox = container.boundingBox;

  if (layoutType === 'row') {
    // Cross axis is vertical for rows
    const avgTop = children.reduce((sum, c) => sum + (c.boundingBox.y - containerBox.y), 0) / children.length;
    const avgBottom =
      children.reduce(
        (sum, c) => sum + (containerBox.y + containerBox.height - (c.boundingBox.y + c.boundingBox.height)),
        0
      ) / children.length;

    if (Math.abs(avgTop - avgBottom) < 10) {
      return 'center';
    }
    if (avgBottom < avgTop) {
      return 'end';
    }
    return 'start';
  } else {
    // Cross axis is horizontal for columns
    const avgLeft = children.reduce((sum, c) => sum + (c.boundingBox.x - containerBox.x), 0) / children.length;
    const avgRight =
      children.reduce(
        (sum, c) => sum + (containerBox.x + containerBox.width - (c.boundingBox.x + c.boundingBox.width)),
        0
      ) / children.length;

    if (Math.abs(avgLeft - avgRight) < 10) {
      return 'center';
    }
    if (avgRight < avgLeft) {
      return 'end';
    }
    return 'start';
  }
}

/**
 * Extract complete layout metadata for a node
 */
/**
 * Extract sizing behavior (Fixed/Fill/Hug) for horizontal and vertical axes
 */
function extractSizing(
  node: NormalizedNode, 
  parentLayoutType: LayoutType | undefined
): LayoutMeta['sizing'] {
  const result: LayoutMeta['sizing'] = {
    horizontal: 'fixed',
    vertical: 'fixed'
  };

  // 1. "Fill Container" (layoutGrow = 1)
  // Depends on parent direction
  if (node.layoutGrow === 1 && parentLayoutType) {
    if (parentLayoutType === 'row') {
      result.horizontal = 'fill';
    } else if (parentLayoutType === 'column') {
      result.vertical = 'fill';
    }
  }

  // 2. "Fill Container" (layoutAlign = STRETCH) on Cross Axis
  if (node.layoutAlign === 'STRETCH' && parentLayoutType) {
    if (parentLayoutType === 'row') {
      result.vertical = 'fill';
    } else if (parentLayoutType === 'column') {
      result.horizontal = 'fill';
    }
  }

  // 3. "Hug Contents" (primaryAxisSizingMode = AUTO) on Main Axis
  // Depends on node's OWN direction (which we infer from layoutMode if present, or detectLayoutType?)
  // Actually, primaryAxisSizingMode is a property of the FRAME itself.
  // If I am a ROW, my primary axis is horizontal.
  // We can use node.figmaLayout.mode or detectLayoutType(node)
  
  // Note: We need to know OUR layout type to map primary/counter to H/V.
  // We can re-detect it or assume figmaLayout matches if present.
  const myLayoutType = node.figmaLayout?.mode || (detectLayoutType(node) === 'row' ? 'horizontal' : 'vertical');

  if (node.primaryAxisSizingMode === 'AUTO') {
    if (myLayoutType === 'horizontal') result.horizontal = 'hug';
    else result.vertical = 'hug';
  }

  if (node.counterAxisSizingMode === 'AUTO') {
    if (myLayoutType === 'horizontal') result.vertical = 'hug';
    else result.horizontal = 'hug';
  }

  return result;
}

/**
 * Extract complete layout metadata for a node
 */
export function extractLayoutMeta(node: NormalizedNode, parentLayoutType?: LayoutType): LayoutMeta {
  const layoutType = detectLayoutType(node);

  // If Figma auto-layout is available, use its values
  if (node.figmaLayout) {
    return {
      type: layoutType,
      gap: node.figmaLayout.gap,
      padding: node.figmaLayout.padding,
      mainAlign: normalizeMainAxisAlign(node.figmaLayout.mainAxisAlign),
      crossAlign: normalizeCrossAxisAlign(node.figmaLayout.crossAxisAlign),
      sizing: extractSizing(node, parentLayoutType),
      overflow: (node.overflowDirection && node.overflowDirection !== 'NONE') ? 'scroll' : undefined,
    };
  }

  // Infer values from positions
  let gap = 0;
  if (layoutType === 'row') {
    gap = calculateRowGap(node.children);
  } else if (layoutType === 'column') {
    gap = calculateColumnGap(node.children);
  }

  const padding = inferPadding(node, node.children);

  let mainAlign: LayoutMeta['mainAlign'] = 'start';
  let crossAlign: LayoutMeta['crossAlign'] = 'start';

  if (layoutType === 'row' || layoutType === 'column') {
    mainAlign = inferMainAxisAlign(node, node.children, layoutType);
    crossAlign = inferCrossAxisAlign(node, node.children, layoutType);
  }

  return {
    type: layoutType,
    gap,
    padding,
    mainAlign,
    crossAlign,
    sizing: extractSizing(node, parentLayoutType),
    overflow: (node.overflowDirection && node.overflowDirection !== 'NONE') ? 'scroll' : undefined,
  };
}

/**
 * Add layout information to a normalized node tree
 */
export function addLayoutInfo(node: NormalizedNode, parentLayoutType?: LayoutType): LayoutNode {
  // Extract layout metadata for this node FIRST to know its type
  // But wait, children need parent type.
  // So we calculate OUR layout first?
  // `extractLayoutMeta` needs parent type to calculate OUR sizing.
  // `addLayoutInfo` needs OUR type to pass to CHILDREN.
  
  const layout = extractLayoutMeta(node, parentLayoutType);

  // Recursively process children, passing OUR layout type
  const processedChildren = node.children.map(child => addLayoutInfo(child, layout.type));

  // Create the LayoutNode
  const layoutNode: LayoutNode = {
    id: node.id,
    name: node.name,
    type: node.type,
    boundingBox: node.boundingBox,
    layout,
    children: processedChildren,
  };

  // Copy optional properties
  if (node.fills) layoutNode.fills = node.fills;
  if (node.strokes) layoutNode.strokes = node.strokes;
  if (node.effects) layoutNode.effects = node.effects;
  if (node.cornerRadius !== undefined) layoutNode.cornerRadius = node.cornerRadius;
  if (node.opacity !== undefined) layoutNode.opacity = node.opacity;
  if (node.text) layoutNode.text = node.text;
  if (node.typography) layoutNode.typography = node.typography;
  if (node.figmaLayout) layoutNode.figmaLayout = node.figmaLayout;

  // Copy Advanced Properties
  if (node.constraints) layoutNode.constraints = node.constraints;
  if ((node as any).boundVariables) (layoutNode as any).boundVariables = (node as any).boundVariables;
  if ((node as any).styles) (layoutNode as any).styles = (node as any).styles;
  if (node.scrollBehavior) (layoutNode as any).scrollBehavior = node.scrollBehavior;

  return layoutNode;
}
