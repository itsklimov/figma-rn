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
} from './types.js';
import { normalizeTree } from './normalize/index.js';
import { addLayoutInfo } from './layout/index.js';
import { mapConstraints } from './layout/constraint-mapper.js';
import { recognizeSemantics } from './recognize/index.js';
import { extractStyleFromProps, extractTokens, createEmptyStylesBundle } from './styles/index.js';
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
 */
function collectStyles(
  node: IRNode,
  propsMap: Map<string, NodeVisualProps>
): Record<string, ReturnType<typeof extractStyleFromProps>> {
  const styles: Record<string, ReturnType<typeof extractStyleFromProps>> = {};

  function walk(n: IRNode): void {
    const props = propsMap.get(n.id);
    if (props) {
      styles[n.styleRef] = extractStyleFromProps(n.styleRef, props);
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
 * Stage 1: Normalize
 * Filter out hidden/irrelevant nodes and unwrap useless groups
 */
export function normalize(
  node: FigmaNode,
  options?: PipelineOptions
): NormalizedNode | null {
  const ignorePatterns = options?.ignorePatterns || [
    ...defaultConventions.ignorePatterns,
    ...defaultConventions.annotationPatterns,
  ];
  return normalizeTree(node, ignorePatterns);
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

  return { styles, tokens };
}

/**
 * Main pipeline: Transform FigmaNode to ScreenIR
 *
 * Pipeline stages:
 * 1. Normalize: Filter hidden nodes, unwrap useless groups
 * 2. Add Layout: Detect row/column/stack, extract padding/gap
 * 3. Recognize: Classify into semantic types (Container, Text, Button, etc.)
 * 4. Extract Styles: Collect visual styles and design tokens
 */
export function transformToScreenIR(
  input: FigmaNode,
  options?: PipelineOptions
): ScreenIR {
  // Stage 1: Normalize
  const normalized = normalize(input, options);

  if (normalized === null) {
    // Root node was filtered out - return empty screen
    return {
      id: input.id,
      name: input.name,
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
    };
  }

  // Stage 2: Add Layout
  const withLayout = addLayout(normalized);

  // Stage 3: Recognize
  const ir = recognize(withLayout);

  // Stage 4: Extract Styles
  const stylesBundle = extractStyles(ir, withLayout, options);

  return {
    id: input.id,
    name: input.name,
    root: ir,
    stylesBundle,
  };
}

/**
 * Export individual stages for debugging/testing
 */
export const stages = {
  normalize,
  addLayout,
  recognize,
  extractStyles,
};
