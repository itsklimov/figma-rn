/**
 * Core types for the Figma-to-ScreenIR transformation pipeline
 */

import type {
  BoundingBox,
  Padding,
  Fill,
  Stroke,
  Effect,
  CornerRadius,
  TypographyInfo,
  Constraints,
} from '../api/types.js';

// Re-export commonly used API types
export type { BoundingBox, Padding, Fill, Stroke, Effect, CornerRadius, TypographyInfo, Constraints };

// ============================================================================
// 2.1 Normalized Tree Types
// ============================================================================

/**
 * Reason a node was filtered out
 */
export type FilterReason =
  | 'hidden'
  | 'annotation'
  | 'measurement'
  | 'status-bar'
  | 'home-indicator'
  | 'os-component'
  | 'pattern-match';

/**
 * Node after filtering - clean, visible, relevant nodes only
 */
export interface NormalizedNode {
  id: string;
  name: string;
  type: string;
  boundingBox: BoundingBox;
  children: NormalizedNode[];

  // Visual properties (preserved from FigmaNode)
  fills?: Fill[];
  strokes?: Stroke[];
  effects?: Effect[];
  cornerRadius?: CornerRadius;
  opacity?: number;

  // Text properties
  text?: string;
  typography?: TypographyInfo;

  // Layout from Figma auto-layout
  figmaLayout?: {
    mode: 'horizontal' | 'vertical';
    gap: number;
    padding: Padding;
    mainAxisAlign: string;
    crossAxisAlign: string;
  };
  
  // Raw Figma layout props (needed for extractor)
  primaryAxisSizingMode?: 'FIXED' | 'AUTO';
  counterAxisSizingMode?: 'FIXED' | 'AUTO';
  layoutAlign?: 'INHERIT' | 'STRETCH' | 'MIN' | 'CENTER' | 'MAX';
  layoutGrow?: number;
  layoutPositioning?: 'AUTO' | 'ABSOLUTE';

  // Layout sizing from parent context (how this node behaves in parent)
  layoutSizing?: {
    horizontal: 'FIXED' | 'FILL' | 'HUG';
    vertical: 'FIXED' | 'FILL' | 'HUG';
  };
  // Prop binding
  propName?: string;

  // Constraints from Figma
  constraints?: Constraints;

  // Scrolling
  overflowDirection?: 'NONE' | 'HORIZONTAL_SCROLLING' | 'VERTICAL_SCROLLING' | 'BOTH_SCROLLING';
  scrollBehavior?: string;
}

// ============================================================================
// 2.2 Layout Tree Types
// ============================================================================

/**
 * Detected layout type
 */
export type LayoutType = 'row' | 'column' | 'stack' | 'absolute';

/**
 * Layout metadata extracted/inferred
 */
export interface LayoutMeta {
  type: LayoutType;
  gap: number;
  padding: Padding;
  mainAlign: 'start' | 'center' | 'end' | 'space-between' | 'space-around';
  crossAlign: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
  sizing: {
    horizontal: 'fixed' | 'fill' | 'hug';
    vertical: 'fixed' | 'fill' | 'hug';
  };
  overflow?: 'scroll' | 'hidden'; // derived from overflowDirection
}

/**
 * Node with layout information attached
 */
export interface LayoutNode extends Omit<NormalizedNode, 'children'> {
  layout: LayoutMeta;
  children: LayoutNode[];
}

// ============================================================================
// 2.3 Semantic IR Types
// ============================================================================

/**
 * Semantic element types
 */
export type SemanticType =
  | 'Container'
  | 'Text'
  | 'Image'
  | 'Button'
  | 'Card'
  | 'Icon'
  | 'Component'
  | 'Repeater';

/**
 * Base properties for all IR nodes
 */
interface IRNodeBase {
  id: string;
  name: string;
  semanticType: SemanticType;
  boundingBox: BoundingBox;
  styleRef: string; // Reference to style in StylesBundle
  propName?: string; // If set, this node's content is bound to a prop
  styleProps?: Record<string, string>; // Mapping of style property -> prop name
}

/**
 * Container - generic wrapper for other elements
 */
export interface ContainerIR extends IRNodeBase {
  semanticType: 'Container';
  layout: LayoutMeta;
  children: IRNode[];
}

/**
 * Text element
 */
export interface TextIR extends IRNodeBase {
  semanticType: 'Text';
  text: string;
  /** Original text value (for prop default) */
  defaultValue?: string;
}

/**
 * Image element
 */
export interface ImageIR extends IRNodeBase {
  semanticType: 'Image';
  imageRef?: string;
  children?: IRNode[]; // Optional - for images with overlays (text, gradient, badges)
  layout?: LayoutMeta; // Optional - for arranging children
}

/**
 * Button element - detected from shape + centered text pattern
 */
export interface ButtonIR extends IRNodeBase {
  semanticType: 'Button';
  label: string;
  iconRef?: string;
  textStyleRef?: string;
  iconStyleRef?: string;
  textId?: string;
  iconId?: string;
  variant: 'primary' | 'secondary' | 'outline' | 'ghost';
  children?: IRNode[]; // Optional - for complex buttons with custom internal structure
  layout?: LayoutMeta; // Optional - for arranging children
}

/**
 * Card element - container with visual treatment (radius/shadow/bg)
 */
export interface CardIR extends IRNodeBase {
  semanticType: 'Card';
  layout: LayoutMeta;
  children: IRNode[];
}

/**
 * Icon element - small vector/image
 */
export interface IconIR extends IRNodeBase {
  semanticType: 'Icon';
  iconRef: string;
  size: number;
  children?: IRNode[]; // Optional - for composite icons (icon + badge)
  layout?: LayoutMeta; // Optional - for arranging children
}

/**
 * Component element - reusable UI component from Figma instance
 */
export interface ComponentIR extends IRNodeBase {
  semanticType: 'Component';
  componentId: string;
  componentName: string;
  props?: Record<string, { type: 'string' | 'image'; value: string; defaultValue: string }>;
  layout: LayoutMeta;
  children: IRNode[]; // Components can have children (overrides)
}

/**
 * Repeater element - detected from repeating sibling patterns
 */
export interface RepeaterIR extends IRNodeBase {
  semanticType: 'Repeater';
  itemComponentName: string; // The name of the item component (e.g. 'MasterCard')
  dataPropName: string; // The name of the prop containing the array (e.g. 'masters')
  children: IRNode[]; // The original children (to extract data from)
  layout: LayoutMeta; // The layout of the items (row/col)
  propsVariations?: Record<string, string[]>; // Variations detected across items
}

/**
 * Union of all IR node types
 */
export type IRNode =
  | ContainerIR
  | TextIR
  | ImageIR
  | ButtonIR
  | CardIR
  | IconIR
  | ComponentIR
  | RepeaterIR;

// ============================================================================
// 2.4 Styles Bundle Types
// ============================================================================

/**
 * Extracted style for a single element
 */
export interface ExtractedStyle {
  id: string;

  // Background
  backgroundColor?: string;
  backgroundGradient?: {
    type: 'linear' | 'radial';
    colors: string[];
    positions: number[];
    angle?: number;
  };

  // Border
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number | {
    topLeft: number;
    topRight: number;
    bottomRight: number;
    bottomLeft: number;
  };

  // Shadow
  shadow?: {
    color: string;
    offsetX: number;
    offsetY: number;
    blur: number;
    spread: number;
  };

  // Typography (for Text nodes)
  typography?: {
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    lineHeight: number;
    letterSpacing: number;
    textAlign: 'left' | 'center' | 'right' | 'justify';
    color: string;
  };

  // Sizing
  width?: number | string;
  height?: number | string;

  // Positioning (Absolute)
  position?: 'absolute' | 'relative';
  left?: number | string;
  right?: number | string;
  top?: number | string;
  bottom?: number | string;

  // Opacity
  opacity?: number;

  // Layout (Flexbox)
  flexDirection?: 'row' | 'column';
  justifyContent?: string;
  alignItems?: string;
  alignSelf?: string;
  gap?: number;
  padding?: Padding;
  flex?: number;
}

/**
 * Design tokens extracted from the screen
 */
export interface DesignTokens {
  colors: Record<string, string>;
  spacing: Record<string, number>;
  radii: Record<string, number>;
  typography: Record<string, {
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    lineHeight: number;
  }>;
  shadows: Record<string, NonNullable<ExtractedStyle['shadow']>>;
}

/**
 * Complete styles bundle
 */
export interface StylesBundle {
  styles: Record<string, ExtractedStyle>;
  tokens: DesignTokens;
}

// ============================================================================
// Pipeline Types
// ============================================================================

/**
 * Pipeline configuration options
 */
export interface PipelineOptions {
  /** Patterns to ignore (e.g., '*annotation*', '*measure*') */
  ignorePatterns?: string[];
  /** Minimum size to consider an icon (default: 8) */
  iconMinSize?: number;
  /** Maximum size to consider an icon (default: 48) */
  iconMaxSize?: number;
  /** Project tokens to map against */
  projectTokens?: DesignTokens;
}

/**
 * Safe area insets detected from Figma design
 * Used to properly wrap content with SafeAreaView
 */
export interface SafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * Final output of the transformation pipeline
 */
export interface ScreenIR {
  id: string;
  name: string;
  root: IRNode;
  stylesBundle: StylesBundle;
  /** Safe area insets detected from OS chrome elements */
  safeAreaInsets?: SafeAreaInsets;
  /** Whether the design uses safe area layout (has status bar, home indicator, etc.) */
  hasSafeAreaLayout?: boolean;
}
