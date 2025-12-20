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
  ComponentIR,
  RepeaterIR,
  LayoutMeta,
} from '../types.js';

import { extractProps } from '../generation/prop-extractor.js';
import { toValidIdentifier, toPascalCase } from '../generation/utils.js';

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
 * Check if a node is an image or a large vector/shape
 * In v2, we treat all vectors as images (SVGs) if they aren't small icons.
 */
export function isImage(node: LayoutNode): boolean {
  // Standard image fills
  if (node.fills && node.fills.some(f => f.type === 'image')) {
    return true;
  }

  // Vector types are images (SVGs)
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
  // Vector types are almost always icons (SVGs)
  // We check size constraints for classification (Icon vs Image)
  // But they will be exported as SVG in both cases.
  const isVectorType = 
    node.type === 'VECTOR' ||
    node.type === 'BOOLEAN_OPERATION' ||
    node.type === 'STAR' ||
    node.type === 'ELLIPSE' ||
    node.type === 'REGULAR_POLYGON' ||
    node.type === 'LINE';

  // If not a vector, frame, group, or image, it's not an icon
  if (!isVectorType && node.type !== 'FRAME' && node.type !== 'GROUP' && !isImage(node)) {
    return false;
  }

  // Must be small for frames/images to be icons
  if (width > maxSize || height > maxSize) {
    return false;
  }
  if (width < minSize || height < minSize) {
    return false;
  }

  // Must be roughly square (aspect ratio close to 1) for containers/images
  const aspectRatio = width / height;
  if (aspectRatio < 0.5 || aspectRatio > 2) {
    return false;
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
 * Check if a node is a Figma Instance (Reusable Component)
 */
export function isComponent(node: LayoutNode): boolean {
  return node.type === 'INSTANCE';
}

/**
 * Classify a single node into a semantic type
 */
export function classifyNode(node: LayoutNode): SemanticType {
  // Order matters - check more specific types first

  // Component (First priority if explicitly an instance)
  if (isComponent(node)) {
    return 'Component';
  }

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
  // 1. Check if name is generic (trash)
  // Matches: "Frame 1", "Group 2", "Rectangle", "Vector 4", "Line", etc.
  // Also common Figma defaults like "Boolean Operation", "Union", "Subtract"
  const isGeneric = /^(Frame|Group|Rectangle|Vector|Star|Ellipse|Line|Boolean|Union|Subtract|Intersect|Exclude|Component|Instance)\s*\d*$/i.test(node.name);

  // 2. If name is meaningful, use it
  if (!isGeneric && node.name.trim().length > 0) {
    // Sanitize to camelCase
    const semanticName = toValidIdentifier(node.name);
    // Ensure we don't end up with empty string or purely numeric (utils handles this but double check)
    if (semanticName && semanticName !== 'element' && !/^style\d+$/.test(semanticName)) {
      return semanticName;
    }
  }

  // 3. Fallback: use semantic type + index-like suffix from ID
  // e.g. "container_123" instead of just "style_123"
  // We use the last part of ID to keep it deterministic but shorter
  const safeId = node.id.replace(/[^a-zA-Z0-9]/g, '_');
  const shortId = safeId.split('_').pop() || safeId;
  
  // Use lowercased semantic type if available, otherwise 'element'
  // We can't easily access the inferred semantic type here without cyclic deps or refactoring
  // So we'll use a rough guess based on node type
  let prefix = 'element';
  if (node.type === 'TEXT') prefix = 'text';
  else if (node.type === 'VECTOR') prefix = 'icon';
  else if (node.children && node.children.length > 0) prefix = 'container';

  return `${prefix}_${shortId}`;
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
 * Detect and group repeating sibling patterns into RepeaterIR nodes
 */
function processChildrenWithRepeaters(children: LayoutNode[]): IRNode[] {
  if (children.length < 2) {
    return children.map(child => toIRNode(child));
  }

  const result: IRNode[] = [];
  let i = 0;

  while (i < children.length) {
    const startIdx = i;
    const current = children[i];
    const baseName = current.name.replace(/\d+$/, '').trim();
    
    // Look for contiguous siblings with same base name OR same componentId
    let count = 1;
    while (i + count < children.length) {
      const next = children[i + count];
      const nextBaseName = next.name.replace(/\d+$/, '').trim();
      
      const sameName = baseName.length > 2 && baseName === nextBaseName;
      const sameComponent = (current as any).componentId && (current as any).componentId === (next as any).componentId;
      const sameTypeAndStructure = current.type === next.type && current.children.length === next.children.length;

      if ((sameName || sameComponent) && sameTypeAndStructure) {
        count++;
      } else {
        break;
      }
    }

    if (count >= 2) {
      // Create a RepeaterIR
      const repeatedItems = children.slice(startIdx, startIdx + count);
      const itemsIR = repeatedItems.map(item => toIRNode(item));
      
      const itemComponentName = toPascalCase(baseName);
      const dataPropName = toValidIdentifier(baseName).toUpperCase() + '_DATA';

      result.push({
        id: `repeater_${current.id}`,
        name: `${baseName} (Repeater)`,
        semanticType: 'Repeater',
        itemComponentName,
        dataPropName,
        children: itemsIR,
        // Inherit layout from items if they are in a flow, 
        // but repeaters usually just follow their parent flow.
        // We'll use a dummy layout or the first item's layout meta if relevant.
        layout: itemsIR[0] && 'layout' in itemsIR[0] ? (itemsIR[0] as any).layout : {
          type: 'column', gap: 0, padding: {top:0,right:0,bottom:0,left:0}, 
          mainAlign: 'start', crossAlign: 'start', sizing: {horizontal:'fixed', vertical:'fixed'}
        },
        styleRef: `style_${toValidIdentifier(baseName)}_repeater`,
        boundingBox: current.boundingBox, // roughly
      } as RepeaterIR);
      
      i += count;
    } else {
      result.push(toIRNode(current));
      i++;
    }
  }

  return result;
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
    case 'Component': {
      const children = node.children.map(child => toIRNode(child));
      // Create a temporary node to extract props from
      const tempNode = { ...baseProps, semanticType: 'Component', children } as IRNode;
      const { props } = extractProps(tempNode);

      return {
        ...baseProps,
        semanticType: 'Component',
        componentId: (node as any).componentId || 'unknown',
        componentName: toPascalCase(node.name),
        props,
        layout: node.layout,
        children,
      } as ComponentIR;
    }

    case 'Text': {
      // Extract propName from node.name for text-to-props extraction
      const textPropName = toValidIdentifier(node.name);
      return {
        ...baseProps,
        semanticType: 'Text',
        text: node.text ?? '',
        propName: textPropName,
        defaultValue: node.text ?? '',
      } as TextIR;
    }

    case 'Image': {
      const imageRef = node.fills?.find(f => f.type === 'image');
      return {
        ...baseProps,
        semanticType: 'Image',
        imageRef: imageRef?.type === 'image' ? imageRef.imageRef : undefined,
      } as ImageIR;
    }

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
        children: processChildrenWithRepeaters(node.children),
      } as CardIR;

    case 'Container':
    default:
      return {
        ...baseProps,
        semanticType: 'Container',
        layout: node.layout,
        children: processChildrenWithRepeaters(node.children),
      } as ContainerIR;
  }
}

/**
 * Recognize semantic structure in a layout tree
 */
export function recognizeSemantics(node: LayoutNode): IRNode {
  return toIRNode(node);
}
