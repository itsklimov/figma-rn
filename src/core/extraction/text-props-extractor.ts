/**
 * Text Props Extractor
 * 
 * Extracts text content from IR nodes as props definitions.
 * Used for generating typed interfaces and mock data from Figma content.
 */

import type { IRNode, TextIR, ComponentIR } from '../types.js';

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
 */
function isMeaningfulPropName(name: string): boolean {
  // Skip generic names like "text", "element", "label" alone
  const genericNames = ['text', 'element', 'label', 'frame', 'group', 'container'];
  if (genericNames.includes(name.toLowerCase())) {
    return false;
  }
  // Skip auto-generated names like "text_12345"
  if (/^(text|element|container|frame|group)_\d+$/i.test(name)) {
    return false;
  }
  return name.length > 0;
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
