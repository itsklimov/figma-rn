/**
 * Repetition Detector - Identify repeated blocks for component extraction
 */

import type { IRNode, ContainerIR, CardIR, TextIR, ButtonIR } from '../types.js';
import type { ComponentHint } from './types.js';

/** Minimum occurrences to extract a component */
const MIN_OCCURRENCES = 2;

/**
 * Generate a structural fingerprint for a node
 * Used to identify structurally identical subtrees
 */
function getStructuralFingerprint(node: IRNode): string {
  const parts: string[] = [node.semanticType];

  if (node.semanticType === 'Container' || node.semanticType === 'Card') {
    const container = node as ContainerIR | CardIR;
    parts.push(`[${container.children.map(c => getStructuralFingerprint(c)).join(',')}]`);
  }

  return parts.join(':');
}

/**
 * Extract variable props from a node (text content, labels, etc.)
 */
function extractVariableProps(node: IRNode): Record<string, string> {
  const props: Record<string, string> = {};

  switch (node.semanticType) {
    case 'Text': {
      const textNode = node as TextIR;
      props['text'] = textNode.text;
      break;
    }
    case 'Button': {
      const buttonNode = node as ButtonIR;
      props['label'] = buttonNode.label;
      break;
    }
    case 'Container':
    case 'Card': {
      // Collect props from children recursively
      const container = node as ContainerIR | CardIR;
      container.children.forEach((child, index) => {
        const childProps = extractVariableProps(child);
        for (const [key, value] of Object.entries(childProps)) {
          props[`child${index}_${key}`] = value;
        }
      });
      break;
    }
  }

  return props;
}

/**
 * Generate a component name from a node
 */
function generateComponentName(node: IRNode): string {
  // Clean the node name
  const cleaned = node.name
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .trim()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');

  if (cleaned.length >= 3) {
    return cleaned;
  }

  // Fallback based on semantic type
  switch (node.semanticType) {
    case 'Card':
      return 'CardComponent';
    case 'Container':
      return 'SectionComponent';
    case 'Button':
      return 'ActionButton';
    default:
      return 'ExtractedComponent';
  }
}

/**
 * Collect all nodes with their fingerprints
 */
function collectNodes(
  node: IRNode,
  results: Map<string, IRNode[]>
): void {
  // Only consider extractable nodes (containers, cards, buttons with sufficient complexity)
  const isExtractable =
    node.semanticType === 'Container' ||
    node.semanticType === 'Card' ||
    node.semanticType === 'Button';

  if (isExtractable) {
    // For containers, only consider those with children (non-trivial)
    if (node.semanticType === 'Container' || node.semanticType === 'Card') {
      const container = node as ContainerIR | CardIR;
      if (container.children.length > 0) {
        const fingerprint = getStructuralFingerprint(node);
        const existing = results.get(fingerprint) || [];
        existing.push(node);
        results.set(fingerprint, existing);
      }

      // Recurse into children
      for (const child of container.children) {
        collectNodes(child, results);
      }
    } else {
      // Button nodes
      const fingerprint = getStructuralFingerprint(node);
      const existing = results.get(fingerprint) || [];
      existing.push(node);
      results.set(fingerprint, existing);
    }
  }
}

/**
 * Merge props variations from multiple instances
 */
function mergePropsVariations(instances: IRNode[]): Record<string, string[]> {
  const variations: Record<string, string[]> = {};

  for (const instance of instances) {
    const props = extractVariableProps(instance);
    for (const [key, value] of Object.entries(props)) {
      if (!variations[key]) {
        variations[key] = [];
      }
      if (!variations[key].includes(value)) {
        variations[key].push(value);
      }
    }
  }

  return variations;
}

/**
 * Detect repeated blocks that should be extracted into components
 *
 * @param root - Root IR node to analyze
 * @returns List of component extraction hints
 *
 * @example
 * ```typescript
 * const hints = detectRepetitions(screenIR.root);
 * // hints: [{ componentName: 'ProductCard', instanceIds: ['1:5', '1:10'], propsVariations: { text: ['Item 1', 'Item 2'] } }]
 * ```
 */
export function detectRepetitions(root: IRNode): ComponentHint[] {
  const nodesByFingerprint = new Map<string, IRNode[]>();
  collectNodes(root, nodesByFingerprint);

  const hints: ComponentHint[] = [];

  for (const [_fingerprint, nodes] of nodesByFingerprint) {
    // Need minimum occurrences
    if (nodes.length < MIN_OCCURRENCES) continue;

    // Use the first instance to generate the component name
    const componentName = generateComponentName(nodes[0]);
    const instanceIds = nodes.map(n => n.id);
    const propsVariations = mergePropsVariations(nodes);

    hints.push({
      componentName,
      instanceIds,
      propsVariations,
    });
  }

  return hints;
}
