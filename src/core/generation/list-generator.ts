/**
 * List Generator - Generate FlatList components from ListHint
 */

import type { IRNode, ContainerIR, CardIR, TextIR, ButtonIR } from '../types.js';
import type { ListHint } from '../detection/types.js';
import type { TokenMappings } from '../mapping/token-matcher.js';
import { toValidIdentifier, escapeJSXText } from './utils.js';


/**
 * Result of FlatList generation
 */
export interface FlatListResult {
  /** Additional imports needed */
  imports: string[];
  /** TypeScript interface for list item */
  typeDefinition: string;
  /** renderItem function code */
  renderItemFunction: string;
  /** FlatList JSX */
  flatListJSX: string;
  /** Style name for list item */
  itemStyleName: string;
  /** Static data array definition */
  dataConstant: string;
  /** Optional separator render function */
  separatorFunction?: string;
}

/**
 * Infer props from an IR node for type generation
 */
function inferPropsFromNode(node: IRNode): Record<string, string> {
  const props: Record<string, string> = {
    id: 'string',
  };

  function extractProps(n: IRNode, prefix = ''): void {
    switch (n.semanticType) {
      case 'Text': {
        const textNode = n as TextIR;
        // Always use the node's own name for uniqueness
        const propName = toValidIdentifier(n.name);
        props[propName] = 'string';
        break;
      }
      case 'Button': {
        const buttonNode = n as ButtonIR;
        // Always use the node's own name for uniqueness
        const propName = toValidIdentifier(n.name);
        props[propName] = 'string';
        break;
      }
      case 'Container':
      case 'Card': {
        const container = n as ContainerIR | CardIR;
        for (const child of container.children) {
          extractProps(child, ''); // Don't pass prefix to avoid name collisions
        }
        break;
      }
    }
  }

  extractProps(node);
  return props;
}

/**
 * Generate TypeScript interface from props
 */
function generateTypeInterface(typeName: string, props: Record<string, string>): string {
  const propsStr = Object.entries(props)
    .map(([name, type]) => `  ${name}: ${type};`)
    .join('\n');

  return `interface ${typeName} {\n${propsStr}\n}`;
}

/**
 * Generate renderItem function with proper JSX
 */
function generateRenderItem(
  hint: ListHint,
  itemNode: IRNode,
  indent: number
): string {
  const spaces = '  '.repeat(indent);
  const itemStyleName = toValidIdentifier(itemNode.name);

  // Simple renderItem that references the item component
  return `${spaces}const renderItem = ({ item }: { item: ${hint.itemType} }) => (
${spaces}  <${hint.itemType}Component item={item} />
${spaces});`;
}

/**
 * Generate FlatList JSX
 */
function generateFlatListJSX(
  hint: ListHint,
  styleName: string,
  indent: number
): string {
  const spaces = '  '.repeat(indent);
  const horizontal = hint.orientation === 'horizontal';

  const props = [
    `data={${toCamelCase(hint.itemType)}Data}`,
    'renderItem={renderItem}',
    `keyExtractor={(item: ${hint.itemType}) => item.id}`,
    horizontal ? 'horizontal' : '',
    horizontal ? 'showsHorizontalScrollIndicator={false}' : 'showsVerticalScrollIndicator={false}',
    `style={styles.${styleName}}`,
  ].filter(Boolean);

  return `${spaces}<FlatList
${props.map(p => `${spaces}  ${p}`).join('\n')}
${spaces}/>`;
}

/**
 * Convert PascalCase to camelCase
 */
function toCamelCase(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

/**
 * Type guard to check if node is a container-like type
 */
function isContainerNode(node: IRNode): node is ContainerIR | CardIR {
  return node.semanticType === 'Container' || node.semanticType === 'Card';
}

/**
 * Extract data values from an instance node based on prop structure
 */
function extractValuesFromNode(node: IRNode): Record<string, string> {
  const values: Record<string, string> = {
    id: node.id, // ID is always needed
  };

  function traverse(n: IRNode) {
    switch (n.semanticType) {
      case 'Text': {
        const textNode = n as TextIR;
        const propName = toValidIdentifier(n.name);
        values[propName] = textNode.text;
        break;
      }
      case 'Button': {
        const buttonNode = n as ButtonIR;
        const propName = toValidIdentifier(n.name);
        values[propName] = buttonNode.label;
        break;
      }
      case 'Container':
      case 'Card': {
        const container = n as ContainerIR | CardIR;
        for (const child of container.children) {
          traverse(child);
        }
        break;
      }
    }
  }

  traverse(node);
  return values;
}

/**
 * Generate the static data constant
 */
function generateDataConstant(
  variableName: string,
  items: IRNode[]
): string {
  const dataObjects = items.map(item => {
    const values = extractValuesFromNode(item);
    // Format as simplified object string
    const props = Object.entries(values)
      .map(([k, v]) => `    ${k}: '${v.replace(/'/g, "\\'")}'`) // escape quotes
      .join(',\n');
    return `  {\n${props}\n  }`;
  });

  return `const ${variableName} = [\n${dataObjects.join(',\n')}\n];`;
}

/**
 * Generate FlatList code from a ListHint
 *
 * @param hint - ListHint from detection layer
 * @param irTree - IR tree to find the list container
 * @param indent - Indentation level
 * @returns FlatListResult with all generated code parts
 *
 * @example
 * ```typescript
 * const hints = detectLists(screenIR.root);
 * for (const hint of hints) {
 *   const result = generateFlatList(hint, screenIR.root);
 *   // Use result.flatListJSX in place of repeated Views
 * }
 * ```
 */
export function generateFlatList(
  hint: ListHint,
  irTree: IRNode,
  mappings: TokenMappings,
  indent: number = 0
): FlatListResult {
  // Find the container node with proper type validation
  const container = findNodeById(irTree, hint.containerId);

  const dataVariableName = `${toCamelCase(hint.itemType)}Data`;

  // Validate that we found a container with children
  if (!container || !isContainerNode(container) || container.children.length === 0) {
    // Fallback for empty/missing/invalid container
    return {
      imports: ['FlatList'],
      typeDefinition: `interface ${hint.itemType} {\n  id: string;\n}`,
      renderItemFunction: `const renderItem = ({ item }: { item: ${hint.itemType} }) => (\n  <View />\n);`,
      flatListJSX: `<FlatList data={[]} renderItem={renderItem} keyExtractor={(item) => item.id} />`,
      itemStyleName: 'item',
      dataConstant: `const ${dataVariableName}: ${hint.itemType}[] = [];`,
    };
  }

  // Use first item as template
  const templateItem = container.children[0];
  const props = inferPropsFromNode(templateItem);
  const typeDefinition = generateTypeInterface(hint.itemType, props);
  const itemStyleName = toValidIdentifier(templateItem.name);

  // Generate Data Constant
  // Verify we actually have children to generate data from
  const dataConstant = generateDataConstant(dataVariableName, container.children);

  // Generate renderItem
  const renderItemName = `render${hint.itemType}`;
  const renderItemFunction = generateRenderItem(hint, templateItem, indent);
  
  // Update renderItem name in function definition
  const finalRenderItemFunction = renderItemFunction.replace(
    'const renderItem =', 
    `const ${renderItemName} =`
  );

  // Handle Spacing (Gap)
  const gap = (container as any).layout?.gap || 0;
  let separatorFunction = '';
  let separatorProp = '';

  if (gap > 0) {
    const separatorName = `render${hint.itemType}Separator`;
    const dim = hint.orientation === 'horizontal' ? 'width' : 'height';
    
    // Use mapping for gap if available
    const spacingMappings = mappings?.spacing || {};
    const matchedGap = spacingMappings[gap] || String(gap);
    const gapValue = matchedGap === String(gap) ? gap : matchedGap;
    
    separatorFunction = `const ${separatorName} = () => <View style={{ ${dim}: ${gapValue} }} />;`;
    separatorProp = `ItemSeparatorComponent={${separatorName}}`;
  }

  // Generate FlatList JSX
  const containerStyleName = toValidIdentifier(container.name);
  // Need to update generateFlatListJSX to accept renderItemName
  let flatListJSX = generateFlatListJSX(hint, containerStyleName, indent).replace(
    'renderItem={renderItem}',
    `renderItem={${renderItemName}}`
  );
  
  if (separatorProp) {
    flatListJSX = flatListJSX.replace(
      '/>',
      `  ${separatorProp}\n${'  '.repeat(indent)}/>`
    );
  }

  return {
    imports: ['FlatList'],
    typeDefinition,
    renderItemFunction: finalRenderItemFunction,
    separatorFunction,
    flatListJSX,
    itemStyleName,
    dataConstant,
  };
}

/**
 * Find a node by ID in the IR tree
 * Includes cycle detection to prevent infinite recursion
 */
function findNodeById(node: IRNode, id: string, visited: Set<string> = new Set()): IRNode | null {
  if (node.id === id) return node;

  // Cycle detection - if we've seen this node before, stop
  if (visited.has(node.id)) return null;
  visited.add(node.id);

  if ('children' in node) {
    for (const child of node.children) {
      const found = findNodeById(child, id, visited);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Build a map from text content to prop names for replacement
 */
function buildTextToPropMap(node: IRNode, prefix = ''): Map<string, string> {
  const map = new Map<string, string>();

  function traverse(n: IRNode, p: string): void {
    switch (n.semanticType) {
      case 'Text': {
        const textNode = n as TextIR;
        // Always use the node's own name for uniqueness (matches inferPropsFromNode)
        const propName = toValidIdentifier(n.name);
        map.set(textNode.text, propName);
        break;
      }
      case 'Button': {
        const buttonNode = n as ButtonIR;
        // Always use the node's own name for uniqueness (matches inferPropsFromNode)
        const propName = toValidIdentifier(n.name);
        map.set(buttonNode.label, propName);
        break;
      }
      case 'Container':
      case 'Card': {
        const container = n as ContainerIR | CardIR;
        for (const child of container.children) {
          traverse(child, ''); // Don't pass prefix to avoid name collisions
        }
        break;
      }
    }
  }

  traverse(node, prefix);
  return map;
}

/**
 * Replace hardcoded text values with prop references in JSX
 */
function replaceTextWithProps(jsx: string, textToPropMap: Map<string, string>): string {
  let result = jsx;

  // Replace text content: <Text ...>hardcoded text</Text> -> <Text ...>{propName}</Text>
  for (const [text, propName] of textToPropMap.entries()) {
    const escapedText = escapeJSXText(text);
    // Replace in Text components
    result = result.replace(
      new RegExp(`<Text([^>]*)>${escapedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</Text>`, 'g'),
      `<Text$1>{${propName}}</Text>`
    );
    // Replace in TouchableOpacity (for buttons)
    result = result.replace(
      new RegExp(`<Text([^>]*)>${escapedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</Text>`, 'g'),
      `<Text$1>{${propName}}</Text>`
    );
  }

  return result;
}

/**
 * Generate a complete item component for extraction
 */
/**
 * Generate a complete item component for extraction
 */
export function generateItemComponent(
  hint: ListHint,
  templateItem: IRNode,
  buildJSX: (node: IRNode, indent: number) => string
): string {
  const props = inferPropsFromNode(templateItem);
  const typeDefinition = generateTypeInterface(hint.itemType, props);
  const componentName = `${hint.itemType}Component`;

  // Generate simple item component
  const propsDestructure = Object.keys(props).join(', ');

  // Generate JSX from template item
  // Use the passed buildJSX function
  let itemJSX = buildJSX(templateItem, 2);

  // Build map of text content to prop names
  const textToPropMap = buildTextToPropMap(templateItem);

  // Replace hardcoded text with prop references
  itemJSX = replaceTextWithProps(itemJSX, textToPropMap);

  return `${typeDefinition}

interface ${componentName}Props {
  item: ${hint.itemType};
}

export function ${componentName}({ item }: ${componentName}Props) {
  const { ${propsDestructure} } = item;
  return (
${itemJSX}
  );
}`;
}
