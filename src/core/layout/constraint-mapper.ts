/**
 * Constraint Mapper
 * Converts Figma constraints (LEFT, RIGHT, CENTER, SCALE) into React Native styles
 * for absolute positioned elements.
 */

import { FigmaNode, BoundingBox } from '../../api/types.js';
import { formatPercent } from '../generation/utils.js';

type ConstraintStyle = {
  position: 'absolute';
  left?: number | string;
  right?: number | string;
  top?: number | string;
  bottom?: number | string;
  width?: number | string;
  height?: number | string;
  alignSelf?: 'center' | 'stretch';
};

/**
 * Calculate horizontal styles based on constraints
 */
function getHorizontalStyles(
  node: FigmaNode,
  parentBounds: BoundingBox
): Partial<ConstraintStyle> {
  if (!node.boundingBox || !node.constraints) {
    // Default to left-aligned if no constraints
    return {
      left: node.boundingBox ? node.boundingBox.x - parentBounds.x : 0,
    };
  }

  const { horizontal } = node.constraints;
  const { x, width } = node.boundingBox;
  const parentWidth = parentBounds.width;
  
  // Calculate relative X position
  const relativeX = x - parentBounds.x;

  switch (horizontal) {
    case 'LEFT':
      return {
        left: relativeX,
      };

    case 'RIGHT':
      return {
        right: parentWidth - (relativeX + width),
      };

    case 'CENTER':
      // Approximate center using percentage or calculation
      // For now, simpler to use left + width, usually Figma centers by coordinates
      // Ideally: left: '50%', transform: [{ translateX: -width/2 }] (not strictly valid in all RN contexts without clean transforms)
      // Fallback: fixed left for now, but explicit layout alignment handles 'center' better
      return {
        left: relativeX + (parentWidth - width) / 2 - (parentWidth / 2 - width / 2), // Just relativeX effectively
        // In RN absolute layout, strictly centering often requires:
        // left: (parentW - w) / 2
      };

    case 'LEFT_RIGHT': // Stretch
      return {
        left: relativeX,
        right: parentWidth - (relativeX + width),
        width: 'auto', // let left/right determine width
      };

    case 'SCALE':
      return {
        left: formatPercent((relativeX / parentWidth) * 100),
        width: formatPercent((width / parentWidth) * 100),
      };

    default:
      return { left: relativeX };
  }
}

/**
 * Calculate vertical styles based on constraints
 */
function getVerticalStyles(
  node: FigmaNode,
  parentBounds: BoundingBox
): Partial<ConstraintStyle> {
  if (!node.boundingBox || !node.constraints) {
    return {
      top: node.boundingBox ? node.boundingBox.y - parentBounds.y : 0,
    };
  }

  const { vertical } = node.constraints;
  const { y, height } = node.boundingBox;
  const parentHeight = parentBounds.height;
  
  const relativeY = y - parentBounds.y;

  switch (vertical) {
    case 'TOP':
      return {
        top: relativeY,
      };

    case 'BOTTOM':
      return {
        bottom: parentHeight - (relativeY + height),
      };

    case 'CENTER':
        // absolute positioning center vertical
      return {
        top: relativeY,
      };

    case 'TOP_BOTTOM': // Stretch
      return {
        top: relativeY,
        bottom: parentHeight - (relativeY + height),
        height: 'auto',
      };

    case 'SCALE':
      return {
        top: formatPercent((relativeY / parentHeight) * 100),
        height: formatPercent((height / parentHeight) * 100),
      };

    default:
      return { top: relativeY };
  }
}

/**
 * Main constraint mapper
 */
export function mapConstraints(
  node: FigmaNode,
  parentBounds?: BoundingBox
): ConstraintStyle | null {
  // Only applies if we have bounds and constraints
  if (!node.boundingBox || !node.constraints) {
    return null;
  }

  // If no parent bounds (root node?), can't calculate relative constraints
  if (!parentBounds) {
    return null;
  }

  return {
    position: 'absolute',
    ...getHorizontalStyles(node, parentBounds),
    ...getVerticalStyles(node, parentBounds),
  };
}
