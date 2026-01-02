/**
 * Pipeline - main transformation pipeline
 * Orchestrates the transformation from FigmaNode to ScreenIR
 */

import type { FigmaNode } from '../api/types.js';
import type {
  NormalizedNode,
  LayoutNode,
  LayoutType,
  IRNode,
  ScreenIR,
  StylesBundle,
  PipelineOptions,
  Fill,
  Stroke,
  Effect,
  CornerRadius,
  TypographyInfo,
  ButtonIR,
} from './types.js';
import { normalizeTree, type FilterOptions } from './normalize/index.js';
import { addLayoutInfo } from './layout/index.js';
import { mapConstraints } from './layout/constraint-mapper.js';
import { recognizeSemantics } from './recognize/index.js';
import { extractStyleFromProps, extractTokens, createEmptyStylesBundle } from './styles/index.js';
import { detectSafeArea, type SafeAreaDetectionResult } from './detection/index.js';
import { detectModalOverlay, extractModalContent, type ModalOverlayResult } from './detection/index.js';
import { BoundingBox } from '../api/types.js';

/**
 * Properties needed for style extraction
 */
interface NodeVisualProps {
  fills?: Fill[];
  strokes?: Stroke[];
  effects?: Effect[];
  cornerRadius?: CornerRadius;
  opacity?: number;
  typography?: TypographyInfo;
  width: number;
  height: number;
  // Advanced properties
  boundVariables?: any;
  styles?: any;
  constraints?: any;
  scrollBehavior?: string;
  layout?: import('./types.js').LayoutMeta;
}

/**
 * Build a map of node IDs to their visual properties from a LayoutNode tree
 */
function buildVisualPropsMap(node: LayoutNode): Map<string, NodeVisualProps> {
  const map = new Map<string, NodeVisualProps>();

  function walk(n: LayoutNode, parentBounds?: BoundingBox, parentLayout?: LayoutType): void {
    let absoluteProps = {};
    
    // Apply constraints only if:
    // 1. Parent is absolute/stack OR node is explicitly ABSOLUTE positioned
    // 2. We have parent context for calculation
    const isInsideFlow = parentLayout === 'row' || parentLayout === 'column';
    const isExplicitlyAbsolute = (n as any).layoutPositioning === 'ABSOLUTE';

    if (n.constraints && parentBounds && (!isInsideFlow || isExplicitlyAbsolute)) {
      // Cast to FigmaNode as mapConstraints expects it, but we only need compatible shape
      const constraints = mapConstraints(n as unknown as FigmaNode, parentBounds);
      if (constraints) {
        absoluteProps = constraints;
      }
    }
    
    map.set(n.id, {
      fills: n.fills,
      strokes: n.strokes,
      effects: n.effects,
      cornerRadius: n.cornerRadius,
      opacity: n.opacity,
      typography: n.typography,
      width: n.boundingBox.width,
      height: n.boundingBox.height,
      boundVariables: (n as any).boundVariables,
      styles: (n as any).styles,
      constraints: (n as any).constraints,
      scrollBehavior: (n as any).scrollBehavior,
      layout: n.layout,
      ...absoluteProps
    });

    for (const child of n.children) {
      walk(child, n.boundingBox, n.layout.type);
    }
  }

  walk(node);
  return map;
}

/**
 * Collect all styles from an IR tree using the visual props map
 * Implements content-aware deduplication and collision handling
 */
function collectStyles(
  node: IRNode,
  propsMap: Map<string, NodeVisualProps>
): Record<string, ReturnType<typeof extractStyleFromProps>> {
  const styles: Record<string, ReturnType<typeof extractStyleFromProps>> = {};
  
  // Track hashes of styles to deduplicate identical content
  // Hash -> styleRef
  const hashToRef = new Map<string, string>();
  
  // Helper to generate a stable hash for a style object
  function getStyleHash(style: any): string {
    // Sort keys to ensure deterministic hash for same properties
    const sortedProps = Object.keys(style).sort().reduce((acc: any, key) => {
      acc[key] = style[key];
      return acc;
    }, {});
    return JSON.stringify(sortedProps);
  }

  function registerStyle(n: { styleRef: string }, props: NodeVisualProps): void {
    const style = extractStyleFromProps(n.styleRef, props);
    const hash = getStyleHash(style);

    // 1. Check if we already have this exact style content under ANY name
    const existingRef = hashToRef.get(hash);
    if (existingRef) {
      // Reuse existing style name
      n.styleRef = existingRef;
      return;
    }

    // 2. Check if the preferred name is already taken by DIFFERENT content
    let finalRef = n.styleRef;
    let counter = 1;
    
    while (styles[finalRef]) {
      const existingStyle = styles[finalRef];
      if (getStyleHash(existingStyle) === hash) {
        // Same content already registered under this name
        n.styleRef = finalRef;
        hashToRef.set(hash, finalRef);
        return;
      }
      // Name collision with different content - use suffix without underscore
      // to avoid mismatch with toValidIdentifier which strips underscores
      finalRef = `${n.styleRef}${counter++}`;
    }

    // 3. Register new style
    n.styleRef = finalRef;
    styles[finalRef] = extractStyleFromProps(finalRef, props); // Re-extract with final name for ID consistency
    hashToRef.set(hash, finalRef);
  }

  function walk(n: IRNode): void {
    const props = propsMap.get(n.id);
    if (props) {
      registerStyle(n, props);
    }

    if (n.semanticType === 'Button') {
      const btn = n as ButtonIR;
      if (btn.textId && btn.textStyleRef) {
        const textProps = propsMap.get(btn.textId);
        if (textProps) {
          // Wrap in object compatible with registerStyle interface
          const pseudoNode = { styleRef: btn.textStyleRef };
          registerStyle(pseudoNode, textProps);
          btn.textStyleRef = pseudoNode.styleRef;
        }
      }
      if (btn.iconId && btn.iconStyleRef) {
        const iconProps = propsMap.get(btn.iconId);
        if (iconProps) {
          const pseudoNode = { styleRef: btn.iconStyleRef };
          registerStyle(pseudoNode, iconProps);
          btn.iconStyleRef = pseudoNode.styleRef;
        }
      }
    }

    if ('children' in n && n.children) {
      for (const child of n.children) {
        walk(child);
      }
    }
  }

  walk(node);
  return styles;
}

import { defaultConventions } from '../api/config.js';

/**
 * Stage 0a: Detect Modal Overlay
 * Identify if the screen is demonstrating a modal component (bottom sheet, dialog, etc.)
 * If detected, we'll extract just the modal content for code generation
 */
export function detectModalOverlayContent(node: FigmaNode): ModalOverlayResult {
  return detectModalOverlay(node);
}

/**
 * Stage 0b: Detect Safe Area
 * Identify OS chrome elements and calculate safe area insets
 * This runs BEFORE normalization to extract layout info before filtering
 */
export function detectSafeAreaInsets(node: FigmaNode): SafeAreaDetectionResult {
  return detectSafeArea(node);
}

/**
 * Stage 1: Normalize
 * Filter out hidden/irrelevant nodes and unwrap useless groups
 * Uses excludeIds from safe area detection to filter OS chrome
 */
export function normalize(
  node: FigmaNode,
  options?: PipelineOptions,
  safeAreaResult?: SafeAreaDetectionResult
): NormalizedNode | null {
  const ignorePatterns = options?.ignorePatterns || [
    ...defaultConventions.ignorePatterns,
    ...defaultConventions.annotationPatterns,
  ];

  const filterOptions: FilterOptions = {
    ignorePatterns,
    excludeIds: safeAreaResult?.excludeIds,
  };

  return normalizeTree(node, filterOptions);
}

/**
 * Stage 2: Add Layout
 * Detect layout types and extract spacing information
 */
export function addLayout(node: NormalizedNode): LayoutNode {
  return addLayoutInfo(node);
}

/**
 * Stage 3: Recognize
 * Classify nodes into semantic types (Container, Text, Button, etc.)
 */
export function recognize(node: LayoutNode): IRNode {
  return recognizeSemantics(node);
}

/**
 * Stage 4: Extract Styles
 * Extract visual styles and design tokens
 */
export function extractStyles(
  ir: IRNode,
  layoutNode: LayoutNode,
  _options?: PipelineOptions
): StylesBundle {
  // Build map of visual properties from the layout tree
  const propsMap = buildVisualPropsMap(layoutNode);

  // Collect styles from the IR tree
  const styles = collectStyles(ir, propsMap);

  // Extract tokens from collected styles
  const tokens = extractTokens(styles);

  // Also collect layout spacing values (gap, padding) from IR tree
  collectLayoutSpacing(ir, tokens.spacing);

  return { styles, tokens };
}

/**
 * Collect gap and padding values from IR tree layout metadata
 * These are separate from ExtractedStyle and need explicit collection
 */
function collectLayoutSpacing(node: IRNode, spacing: Record<string, number>): void {
  // Collect from current node's layout
  if ('layout' in node && node.layout) {
    const layout = node.layout as any;

    // Collect gap
    if (layout.gap > 0 && !Object.values(spacing).includes(layout.gap)) {
      const index = Object.keys(spacing).length;
      spacing[`spacing_${index}`] = layout.gap;
    }

    // Collect padding
    if (layout.padding) {
      const { top, right, bottom, left } = layout.padding;
      for (const val of [top, right, bottom, left]) {
        if (val > 0 && !Object.values(spacing).includes(val)) {
          const index = Object.keys(spacing).length;
          spacing[`spacing_${index}`] = val;
        }
      }
    }
  }

  // Recurse into children
  if ('children' in node && node.children) {
    for (const child of node.children) {
      collectLayoutSpacing(child, spacing);
    }
  }
}

/**
 * Main pipeline: Transform FigmaNode to ScreenIR
 *
 * Pipeline stages:
 * 0a. Detect Modal Overlay: Identify modal demonstrations and extract just the modal
 * 0b. Detect Safe Area: Identify OS chrome and extract insets BEFORE filtering
 * 1. Normalize: Filter hidden nodes, unwrap useless groups
 * 2. Add Layout: Detect row/column/stack, extract padding/gap
 * 3. Recognize: Classify into semantic types (Container, Text, Button, etc.)
 * 4. Extract Styles: Collect visual styles and design tokens
 */
export function transformToScreenIR(
  input: FigmaNode,
  options?: PipelineOptions
): ScreenIR {
  // Stage 0a: Detect Modal Overlay
  // If the screen is demonstrating a modal (bottom sheet, dialog, etc.),
  // extract just the modal content for code generation
  const modalResult = detectModalOverlayContent(input);
  let effectiveInput = input;
  let effectiveName = input.name;

  if (modalResult.hasModalOverlay && modalResult.contentId) {
    const modalContent = extractModalContent(input, modalResult.contentId);
    if (modalContent) {
      effectiveInput = modalContent;
      effectiveName = modalResult.contentName || modalContent.name;
      console.log(`📱 Detected ${modalResult.modalType}: extracting "${effectiveName}" for generation`);
    }
  }

  // Stage 0b: Detect Safe Area (BEFORE filtering)
  // This extracts layout information from OS chrome elements before we remove them
  const safeAreaResult = detectSafeAreaInsets(effectiveInput);

  // Stage 1: Normalize (using safe area excludeIds)
  const normalized = normalize(effectiveInput, options, safeAreaResult);

  if (normalized === null) {
    // Root node was filtered out - return empty screen
    return {
      id: effectiveInput.id,
      name: effectiveName,
      root: {
        id: input.id,
        name: input.name,
        semanticType: 'Container',
        boundingBox: { x: 0, y: 0, width: 0, height: 0 },
        styleRef: 'style_empty',
        layout: {
          type: 'column',
          gap: 0,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          mainAlign: 'start',
          crossAlign: 'start',
          sizing: {
            horizontal: 'fixed',
            vertical: 'fixed',
          },
        },
        children: [],
      },
      stylesBundle: createEmptyStylesBundle(),
      safeAreaInsets: safeAreaResult.insets,
      hasSafeAreaLayout: safeAreaResult.hasSafeAreaLayout,
    };
  }

  // Stage 2: Add Layout
  const withLayout = addLayout(normalized);

  // Stage 3: Recognize
  const ir = recognize(withLayout);

  // Stage 4: Extract Styles
  const stylesBundle = extractStyles(ir, withLayout, options);

  return {
    id: effectiveInput.id,
    name: effectiveName,
    root: ir,
    stylesBundle,
    safeAreaInsets: safeAreaResult.insets,
    hasSafeAreaLayout: safeAreaResult.hasSafeAreaLayout,
  };
}

/**
 * Export individual stages for debugging/testing
 */
export const stages = {
  detectModalOverlayContent,
  detectSafeAreaInsets,
  normalize,
  addLayout,
  recognize,
  extractStyles,
};
