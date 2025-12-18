/**
 * Semantic classifier - classifies nodes into semantic types
 */

import type {
  LayoutNode,
  SemanticType,
  IRNode,
  ContainerIR,
  TextIR,
  ImageIR,
  ButtonIR,
  CardIR,
  IconIR,
  LayoutMeta,
} from '../types.js';

/**
 * Default icon size range
 */
const ICON_MIN_SIZE = 8;
const ICON_MAX_SIZE = 48;

/**
 * Check if a node is a text element
 */
export function isText(node: LayoutNode): boolean {
  return node.type === 'TEXT' && !!node.text;
}

/**
 * Check if a node is an image
 */
export function isImage(node: LayoutNode): boolean {
  // Check if any fill is an image
  if (node.fills) {
    return node.fills.some(fill => fill.type === 'image');
  }
  return false;
}

/**
 * Check if a node is an icon
 * Icons are small vectors or images
 */
export function isIcon(
  node: LayoutNode,
  minSize = ICON_MIN_SIZE,
  maxSize = ICON_MAX_SIZE
): boolean {
  const { width, height } = node.boundingBox;

  // Must be small
  if (width > maxSize || height > maxSize) {
    return false;
  }
  if (width < minSize || height < minSize) {
    return false;
  }

  // Must be roughly square (aspect ratio close to 1)
  const aspectRatio = width / height;
  if (aspectRatio < 0.5 || aspectRatio > 2) {
    return false;
  }

  // Vector types are icons
  if (
    node.type === 'VECTOR' ||
    node.type === 'BOOLEAN_OPERATION' ||
    node.type === 'STAR' ||
    node.type === 'ELLIPSE' ||
    node.type === 'REGULAR_POLYGON' ||
    node.type === 'LINE'
  ) {
    return true;
  }

  // Small images can be icons
  if (isImage(node)) {
    return true;
  }

  // Small frames/groups with vectors inside
  if ((node.type === 'FRAME' || node.type === 'GROUP') && node.children.length > 0) {
    // All children should be vectors
    return node.children.every(
      child =>
        child.type === 'VECTOR' ||
        child.type === 'BOOLEAN_OPERATION' ||
        child.type === 'LINE' ||
        child.type === 'ELLIPSE' ||
        child.type === 'REGULAR_POLYGON'
    );
  }

  return false;
}

/**
 * Check if a node is a button
 * Button = container with background + centered text (optionally + icon)
 */
export function isButton(node: LayoutNode): boolean {
  // Must have children
  if (node.children.length === 0) {
    return false;
  }

  // Must have a background (fill)
  const hasBackground = node.fills && node.fills.length > 0 && node.fills.some(f => f.type === 'solid');
  if (!hasBackground) {
    return false;
  }

  // Must have at least one text child
  const hasText = node.children.some(child => child.type === 'TEXT' && child.text);
  if (!hasText) {
    return false;
  }

  // Should be reasonably sized (not too tall)
  const { width, height } = node.boundingBox;
  if (height > 80 || width < 40) {
    return false;
  }

  // Aspect ratio should be button-like (wider than tall)
  const aspectRatio = width / height;
  if (aspectRatio < 1.5 && width < 60) {
    // Exception: small square buttons (icon buttons) are ok
    if (aspectRatio < 0.8 || aspectRatio > 1.2) {
      return false;
    }
  }

  return true;
}

/**
 * Check if a node is a card
 * Card = container with visual treatment (corner radius, shadow, or distinct background)
 */
export function isCard(node: LayoutNode): boolean {
  // Must have children
  if (node.children.length === 0) {
    return false;
  }

  // Check for visual treatment
  const hasCornerRadius = node.cornerRadius !== undefined && node.cornerRadius !== 0;
  const hasShadow = node.effects && node.effects.some(e => e.type === 'drop-shadow');
  const hasBackground = node.fills && node.fills.length > 0;

  // Must have at least two visual treatments, or corner radius + background
  const visualTreatments = [hasCornerRadius, hasShadow, hasBackground].filter(Boolean).length;
  if (visualTreatments < 2) {
    return false;
  }

  // Should be reasonably sized (not too small)
  const { width, height } = node.boundingBox;
  if (width < 60 || height < 60) {
    return false;
  }

  return true;
}

/**
 * Classify a single node into a semantic type
 */
export function classifyNode(node: LayoutNode): SemanticType {
  // Order matters - check more specific types first

  // Text
  if (isText(node)) {
    return 'Text';
  }

  // Icon (before Image, as icons can be images)
  if (isIcon(node)) {
    return 'Icon';
  }

  // Image
  if (isImage(node)) {
    return 'Image';
  }

  // Button (before Card, as buttons can have card-like styling)
  if (isButton(node)) {
    return 'Button';
  }

  // Card
  if (isCard(node)) {
    return 'Card';
  }

  // Default: Container
  return 'Container';
}

/**
 * Generate a unique style reference ID
 */
function generateStyleRef(node: LayoutNode): string {
  return `style_${node.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
}

/**
 * Extract button label from children
 */
function extractButtonLabel(node: LayoutNode): string {
  const textChild = node.children.find(child => child.type === 'TEXT' && child.text);
  return textChild?.text ?? 'Button';
}

/**
 * Extract button icon reference from children
 */
function extractButtonIcon(node: LayoutNode): string | undefined {
  const iconChild = node.children.find(child => isIcon(child));
  return iconChild ? generateStyleRef(iconChild) : undefined;
}

/**
 * Infer button variant from styling
 */
function inferButtonVariant(node: LayoutNode): ButtonIR['variant'] {
  // Check for outline style (stroke but no fill)
  const hasStroke = node.strokes && node.strokes.length > 0;
  const hasSolidFill = node.fills && node.fills.some(f => f.type === 'solid' && f.opacity > 0.1);

  if (hasStroke && !hasSolidFill) {
    return 'outline';
  }

  // Check for ghost style (very low opacity fill)
  if (node.fills) {
    const lowOpacityFill = node.fills.find(f => f.type === 'solid' && f.opacity < 0.2);
    if (lowOpacityFill) {
      return 'ghost';
    }
  }

  // Default to primary
  return 'primary';
}

/**
 * Convert a LayoutNode to an IRNode
 */
export function toIRNode(node: LayoutNode): IRNode {
  const semanticType = classifyNode(node);
  const styleRef = generateStyleRef(node);

  const baseProps = {
    id: node.id,
    name: node.name,
    boundingBox: node.boundingBox,
    styleRef,
  };

  switch (semanticType) {
    case 'Text':
      return {
        ...baseProps,
        semanticType: 'Text',
        text: node.text ?? '',
      } as TextIR;

    case 'Image':
      const imageRef = node.fills?.find(f => f.type === 'image');
      return {
        ...baseProps,
        semanticType: 'Image',
        imageRef: imageRef?.type === 'image' ? imageRef.imageRef : undefined,
      } as ImageIR;

    case 'Icon':
      return {
        ...baseProps,
        semanticType: 'Icon',
        iconRef: styleRef,
        size: Math.max(node.boundingBox.width, node.boundingBox.height),
      } as IconIR;

    case 'Button':
      return {
        ...baseProps,
        semanticType: 'Button',
        label: extractButtonLabel(node),
        iconRef: extractButtonIcon(node),
        variant: inferButtonVariant(node),
      } as ButtonIR;

    case 'Card':
      return {
        ...baseProps,
        semanticType: 'Card',
        layout: node.layout,
        children: node.children.map(child => toIRNode(child)),
      } as CardIR;

    case 'Container':
    default:
      return {
        ...baseProps,
        semanticType: 'Container',
        layout: node.layout,
        children: node.children.map(child => toIRNode(child)),
      } as ContainerIR;
  }
}

/**
 * Recognize semantic structure in a layout tree
 */
export function recognizeSemantics(node: LayoutNode): IRNode {
  return toIRNode(node);
}
