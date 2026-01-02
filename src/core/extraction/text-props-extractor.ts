/**
 * Text Props Extractor
 * 
 * Extracts text content from IR nodes as props definitions.
 * Used for generating typed interfaces and mock data from Figma content.
 */

import type { IRNode, TextIR } from '../types.js';

/**
 * Property definition extracted from text nodes
 */
export interface PropDef {
  name: string;
  type: 'string' | 'number';
  defaultValue: string;
}

/**
 * Collected props from a component subtree
 */
export interface ExtractedTextProps {
  props: PropDef[];
  dataItems: Record<string, string>[];
}

/**
 * Check if a prop name is meaningful (not generic)
 *
 * Filters out:
 * - Generic names: text, element, label, frame, group, container
 * - Auto-generated numbered variants: text_12345, element_67890
 * - Figma auto-names: Frame 1234, Vector 56, Rectangle 78, etc.
 * - Path/shape names: path102, ellipse2460, union, subtract
 * - Style-prefixed numbers: style3000, style2345
 * - Single letters: a, b, c
 * - Pure numbers: 123, 456
 */
export function isMeaningfulPropName(name: string): boolean {
  if (!name || name.length === 0) {
    return false;
  }

  const lowerName = name.toLowerCase();

  // Skip generic names
  const genericNames = ['text', 'element', 'label', 'frame', 'group', 'container', 'view', 'box', 'wrapper', 'row', 'column'];
  if (genericNames.includes(lowerName)) {
    return false;
  }

  // Skip auto-generated names like "text_12345" or "element1"
  if (/^(text|element|container|frame|group|view|box|wrapper|row|column)_?\d*$/i.test(name)) {
    return false;
  }

  // Skip Figma auto-names: Frame 1234, Vector 56, etc.
  if (/^(Frame|Vector|Rectangle|Ellipse|Line|Star|Instance|Polygon|Boolean|Component|Group)\s*\d*$/i.test(name)) {
    return false;
  }

  // Skip path/shape names: path102, ellipse2460, union1
  if (/^(path|ellipse|union|subtract|intersect|vector|rectangle|line|polygon|star)\d*$/i.test(name)) {
    return false;
  }

  // Skip vector layer names: vector39Stroke, vector39Fill
  if (/^vector\d+(stroke|fill)?$/i.test(name)) {
    return false;
  }

  // Skip style-prefixed numbers: style3000
  if (/^style\d+$/i.test(name)) {
    return false;
  }

  // Skip single letters
  if (/^[a-zA-Z]$/.test(name)) {
    return false;
  }

  // Skip pure numbers
  if (/^\d+$/.test(name)) {
    return false;
  }

  // Skip generic numbered elements: element1, item2
  if (/^(element|item|child|node)\d+$/i.test(name)) {
    return false;
  }

  // Skip container numbered variants: container51275
  if (/^container\d+$/i.test(name)) {
    return false;
  }

  return true;
}

/**
 * Result of shouldCreateProp() check
 */
export interface PropCreationResult {
  create: boolean;
  reason?: string;
  existingPropName?: string;
}

/**
 * Determines whether a prop should be created for a node.
 */
export function shouldCreateProp(
  node: { name: string; semanticType: string; text?: string },
  existingProps: Map<string, string>
): PropCreationResult {
  const { name, semanticType, text } = node;

  if (!isMeaningfulPropName(name)) {
    return {
      create: false,
      reason: `Name "${name}" is not meaningful`,
    };
  }

  if (semanticType === 'Text' && text) {
    const contentKey = `text:${text}`;
    if (existingProps.has(contentKey)) {
      return {
        create: false,
        reason: `Duplicate text content`,
        existingPropName: existingProps.get(contentKey),
      };
    }
  }

  if (semanticType !== 'Text' && semanticType !== 'Image' && !text) {
    return {
      create: false,
      reason: `Structural node has no text content`,
    };
  }

  return { create: true };
}

/**
 * Recursively extract text props from an IR subtree
 */
export function extractTextProps(node: IRNode): PropDef[] {
  const props: PropDef[] = [];

  if (node.semanticType === 'Text') {
    const textNode = node as TextIR;
    if (textNode.propName && isMeaningfulPropName(textNode.propName)) {
      props.push({
        name: textNode.propName,
        type: 'string',
        defaultValue: textNode.defaultValue ?? textNode.text,
      });
    }
  }

  // Recurse into children
  if ('children' in node && Array.isArray(node.children)) {
    for (const child of node.children) {
      props.push(...extractTextProps(child));
    }
  }

  return props;
}

/**
 * Extract data from repeated component instances
 * Returns an array of data items with values from each instance
 */
export function extractRepeatedData(instances: IRNode[]): ExtractedTextProps {
  if (instances.length === 0) {
    return { props: [], dataItems: [] };
  }

  // Get props structure from first instance
  const firstProps = extractTextProps(instances[0]);
  
  // Filter to meaningful props that appear in first instance
  const propNames = firstProps
    .filter(p => isMeaningfulPropName(p.name))
    .map(p => p.name);

  // Collect data from all instances
  const dataItems: Record<string, string>[] = [];
  
  for (const instance of instances) {
    const instanceProps = extractTextProps(instance);
    const item: Record<string, string> = {};
    
    for (const propName of propNames) {
      const prop = instanceProps.find(p => p.name === propName);
      if (prop) {
        item[propName] = prop.defaultValue;
      }
    }
    
    dataItems.push(item);
  }

  return {
    props: firstProps.filter(p => isMeaningfulPropName(p.name)),
    dataItems,
  };
}

/**
 * Generate TypeScript interface from extracted props
 */
export function generateInterface(componentName: string, props: PropDef[]): string {
  if (props.length === 0) {
    return '';
  }

  const lines = [`interface ${componentName}Props {`];
  
  for (const prop of props) {
    lines.push(`  /** Default: "${prop.defaultValue}" */`);
    lines.push(`  ${prop.name}?: ${prop.type};`);
  }
  
  lines.push('}');
  
  return lines.join('\n');
}

/**
 * Generate mock data array from extracted instances
 */
export function generateMockData(
  variableName: string, 
  typeName: string, 
  dataItems: Record<string, string>[]
): string {
  if (dataItems.length === 0) {
    return '';
  }

  const itemsJson = dataItems.map((item, i) => {
    const entries = Object.entries(item)
      .map(([key, value]) => `    ${key}: '${value.replace(/'/g, "\\'")}'`)
      .join(',\n');
    return `  {\n    id: '${i}',\n${entries}\n  }`;
  }).join(',\n');

  return `const ${variableName}: ${typeName}[] = [\n${itemsJson}\n];`;
}
