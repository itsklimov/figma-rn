/**
 * Internal type definitions for the Figma API layer
 * These are clean, normalized types for working with Figma data
 */

/**
 * Parsed Figma URL components
 */
export interface ParsedFigmaUrl {
  /** File key extracted from URL */
  fileKey: string;
  /** Optional node ID if URL points to specific node */
  nodeId: string | null;
}

/**
 * Color representation with multiple formats
 */
export interface Color {
  /** Hex format: #RRGGBB or #RRGGBBAA */
  hex: string;
  /** RGBA components (0-255 for RGB, 0-1 for alpha) */
  rgba: {
    r: number;
    g: number;
    b: number;
    a: number;
  };
}

/**
 * Single stop in a gradient
 */
export interface GradientStop {
  /** Position along gradient (0-1) */
  position: number;
  /** Color at this stop */
  color: Color;
}

/**
 * Gradient definition
 */
export interface Gradient {
  /** Gradient type */
  type: 'linear' | 'radial';
  /** Color stops */
  stops: GradientStop[];
  /** Angle in degrees (for linear gradients) */
  angle?: number;
}

/**
 * Bounding box dimensions
 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Padding/spacing on all sides
 */
export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Corner radius - uniform or individual corners
 */
export type CornerRadius =
  | number
  | {
      topLeft: number;
      topRight: number;
      bottomRight: number;
      bottomLeft: number;
    };

/**
 * Layout alignment options
 */
export type MainAxisAlign = 'MIN' | 'MAX' | 'CENTER' | 'SPACE_BETWEEN' | 'SPACE_AROUND';
export type CrossAxisAlign = 'MIN' | 'MAX' | 'CENTER' | 'BASELINE' | 'STRETCH';

/**
 * Auto-layout information
 */
export interface LayoutInfo {
  /** Layout direction */
  mode: 'horizontal' | 'vertical' | 'none';
  /** Gap between items */
  gap: number;
  /** Padding around container */
  padding: Padding;
  /** Main axis alignment */
  mainAxisAlign: MainAxisAlign;
  /** Cross axis alignment */
  crossAxisAlign: CrossAxisAlign;
  /** Whether layout wraps */
  wrap: boolean;
  /** Gap between wrapped rows/columns */
  wrapGap?: number;
}

/**
 * Typography/text styling
 */
export interface TypographyInfo {
  /** Font family name */
  fontFamily: string;
  /** Font size in pixels */
  fontSize: number;
  /** Font weight (100-900) */
  fontWeight: number;
  /** Line height in pixels */
  lineHeight: number;
  /** Letter spacing in pixels */
  letterSpacing: number;
  /** Text alignment */
  textAlign: 'left' | 'center' | 'right' | 'justify';
  /** Text decoration */
  textDecoration?: 'none' | 'underline' | 'line-through';
  /** Text transform */
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
}

/**
 * Shadow effect
 */
export interface ShadowEffect {
  type: 'drop-shadow' | 'inner-shadow';
  color: Color;
  offset: { x: number; y: number };
  radius: number;
  spread: number;
}

/**
 * Blur effect
 */
export interface BlurEffect {
  type: 'layer-blur' | 'background-blur';
  radius: number;
}

/**
 * Any visual effect
 */
export type Effect = ShadowEffect | BlurEffect;

/**
 * Solid color fill
 */
export interface SolidFill {
  type: 'solid';
  color: Color;
  opacity: number;
}

/**
 * Gradient fill
 */
export interface GradientFill {
  type: 'gradient';
  gradient: Gradient;
  opacity: number;
}

/**
 * Image fill
 */
export interface ImageFill {
  type: 'image';
  imageRef: string;
  opacity: number;
  scaleMode?: 'fill' | 'fit' | 'crop' | 'tile';
}

/**
 * Any fill type
 */
export type Fill = SolidFill | GradientFill | ImageFill;

/**
 * Stroke/border styling
 */
export interface Stroke {
  /** Stroke color */
  color: Color;
  /** Stroke width */
  weight: number;
  /** Stroke opacity */
  opacity?: number;
  /** Stroke alignment relative to edge */
  align: 'inside' | 'outside' | 'center';
  /** Stroke cap style */
  cap?: 'none' | 'round' | 'square';
  /** Stroke join style */
  join?: 'miter' | 'round' | 'bevel';
}

/**
 * Component property types
 */
export type ComponentPropertyType = 'VARIANT' | 'TEXT' | 'BOOLEAN' | 'INSTANCE_SWAP';

/**
 * Component property definition
 */
export interface ComponentProperty {
  /** Property type */
  type: ComponentPropertyType;
  /** Current or default value */
  value: string | boolean;
  /** Available options (for VARIANT type) */
  options?: string[];
}

/**
 * Variable alias for bound variables
 */
export interface VariableAlias {
  type: 'VARIABLE_ALIAS';
  id: string;
}

/**
 * Bound variables (Design Tokens)
 */
export interface BoundVariables {
  [key: string]: VariableAlias | VariableAlias[] | { [subkey: string]: VariableAlias };
}

/**
 * Style references (Typography, Color, etc.)
 */
export interface StyleReferences {
  fill?: string;
  stroke?: string;
  text?: string;
  effect?: string;
  grid?: string;
}

/**
 * Constraints for resizing
 */
export interface Constraints {
  horizontal: 'LEFT' | 'RIGHT' | 'CENTER' | 'LEFT_RIGHT' | 'SCALE';
  vertical: 'TOP' | 'BOTTOM' | 'CENTER' | 'TOP_BOTTOM' | 'SCALE';
}

/**
 * Node types in Figma
 */
export type NodeType =
  | 'DOCUMENT'
  | 'CANVAS'
  | 'FRAME'
  | 'GROUP'
  | 'SECTION'
  | 'VECTOR'
  | 'BOOLEAN_OPERATION'
  | 'STAR'
  | 'LINE'
  | 'ELLIPSE'
  | 'REGULAR_POLYGON'
  | 'RECTANGLE'
  | 'TEXT'
  | 'SLICE'
  | 'COMPONENT'
  | 'COMPONENT_SET'
  | 'INSTANCE'
  | 'STICKY'
  | 'SHAPE_WITH_TEXT'
  | 'CONNECTOR';

/**
 * Complete Figma node representation
 */
export interface FigmaNode {
  /** Unique node ID */
  id: string;
  /** Node name */
  name: string;
  /** Node type */
  type: NodeType;
  /** Child nodes */
  children?: FigmaNode[];
  /** Bounding box */
  boundingBox?: BoundingBox;
  /** Layout information (for frames/groups with auto-layout) */
  layout?: LayoutInfo;
  /** Typography (for text nodes) */
  typography?: TypographyInfo;
  /** Text content (for text nodes) */
  text?: string;
  /** Fill styles */
  fills?: Fill[];
  /** Stroke styles */
  strokes?: Stroke[];
  /** Corner radius */
  cornerRadius?: CornerRadius;
  /** Visual effects */
  effects?: Effect[];
  /** Opacity (0-1) */
  opacity?: number;
  /** Blend mode */
  blendMode?: string;
  /** Whether node is visible */
  visible?: boolean;
  /** Whether node has render bounds (false = Figma determined it renders nothing) */
  hasRenderBounds?: boolean;
  /** Whether node is locked */
  locked?: boolean;
  /** Component properties (for component/instance nodes) */
  componentProperties?: Record<string, ComponentProperty>;
  /** Component ID (for instance nodes) */
  componentId?: string;
  /** Component set ID (for variant instances) */
  componentSetId?: string;
  /** Export settings */
  exportSettings?: ImageExportOptions[];
  /** Constraints for resizing behavior */
  constraints?: Constraints;
  /** Absolute transform matrix */
  transform?: number[][];
  /** Plugin data */
  pluginData?: Record<string, any>;
  /** Shared plugin data */
  sharedPluginData?: Record<string, Record<string, any>>;
  /** Layout sizing mode for primary axis (auto-layout) */
  primaryAxisSizingMode?: 'FIXED' | 'AUTO';
  /** Layout sizing mode for counter axis (auto-layout) */
  counterAxisSizingMode?: 'FIXED' | 'AUTO';
  /** Alignment in parent auto-layout (cross-axis, "Align Self") */
  layoutAlign?: 'MIN' | 'MAX' | 'CENTER' | 'STRETCH' | 'INHERIT';
  /** Flex grow in parent auto-layout ("Fill Container") */
  layoutGrow?: number;
  /** Whether the node is absolutely positioned within an auto-layout frame */
  layoutPositioning?: 'AUTO' | 'ABSOLUTE';
  /** Scrolling behavior */
  overflowDirection?: 'NONE' | 'HORIZONTAL_SCROLLING' | 'VERTICAL_SCROLLING' | 'BOTH_SCROLLING';
  /** explicit scroll behavior property */
  scrollBehavior?: string;
  /** Bound variables (tokens) */
  boundVariables?: BoundVariables;
  /** Style references */
  styles?: StyleReferences;
}

/**
 * Figma file metadata
 */
export interface FigmaFile {
  /** File key */
  key: string;
  /** File name */
  name: string;
  /** Last modified timestamp */
  lastModified: string;
  /** Version ID */
  version: string;
  /** Editor type */
  editorType?: 'figma' | 'figjam';
  /** Thumbnail URL */
  thumbnailUrl?: string;
}

/**
 * Transformed node for internal use
 */
export interface TransformedNode {
  id: string;
  name: string;
  type: string;
  document: unknown;
  metadata?: {
    width?: number;
    height?: number;
    x?: number;
    y?: number;
  };
}

/**
 * Result from fetching nodes
 */
export interface FetchNodesResult {
  /** Fetched nodes by ID */
  nodes: Record<string, TransformedNode>;
  /** File key */
  fileKey: string;
  /** Raw API response */
  rawResponse?: unknown;
}

/**
 * Image export format
 */
export type ImageFormat = 'png' | 'jpg' | 'svg' | 'pdf';

/**
 * Image export options
 */
export interface ImageExportOptions {
  /** Export format */
  format: ImageFormat;
  /** Scale factor (1x, 2x, 3x, etc.) */
  scale?: number;
  /** Constraint for export size */
  constraint?: {
    type: 'scale' | 'width' | 'height';
    value: number;
  };
  /** SVG-specific options */
  svgOptions?: {
    /** Include "id" attributes */
    svgIdAttribute?: boolean;
    /** Simplify inside/outside strokes */
    svgSimplifyStroke?: boolean;
  };
}

/**
 * Image export result
 */
export interface ImageExportResult {
  /** Node ID */
  nodeId: string;
  /** Image URL (temporary, expires) */
  url: string;
  /** Error if export failed */
  error?: string;
}

/**
 * Color variable definition
 */
export interface ColorVariable {
  /** Variable ID */
  id: string;
  /** Variable name */
  name: string;
  /** Collection ID */
  collectionId: string;
  /** Collection name */
  collectionName: string;
  /** Variable values by mode */
  values: Record<
    string,
    {
      color: Color;
      opacity?: number;
    }
  >;
}

/**
 * Variables API result
 */
export interface VariablesResult {
  /** Whether the request was successful */
  success: boolean;
  /** Whether the file has Enterprise plan (required for variables) */
  isEnterprise: boolean;
  /** Color variables */
  colors: Record<string, ColorVariable>;
  /** Collections metadata */
  collections: Record<
    string,
    {
      id: string;
      name: string;
      modes: Array<{ modeId: string; name: string }>;
    }
  >;
  /** Error message if failed */
  error?: string;
}

/**
 * Style definition from Figma
 */
export interface FigmaStyle {
  key: string;
  name: string;
  styleType: 'FILL' | 'TEXT' | 'EFFECT' | 'GRID';
  description?: string;
}

/**
 * Result from fetching styles
 */
export interface StylesResult {
  styles: Record<string, FigmaStyle>;
}
