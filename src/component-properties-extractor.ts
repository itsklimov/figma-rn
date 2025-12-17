/**
 * Extract component properties and variant information from Figma
 * Map Figma variants to React props
 */

interface FigmaApiNode {
  type: string;
  name: string;
  componentPropertyDefinitions?: {
    [propertyName: string]: {
      type: 'VARIANT' | 'TEXT' | 'BOOLEAN' | 'INSTANCE_SWAP';
      defaultValue: any;
      variantOptions?: string[];
    };
  };
  componentPropertyReferences?: {
    [propertyName: string]: string;
  };
  children?: FigmaApiNode[];
}

interface ComponentPropertyInfo {
  componentName: string;
  isInstance: boolean;
  availableProperties?: {
    name: string;
    type: 'VARIANT' | 'TEXT' | 'BOOLEAN' | 'INSTANCE_SWAP';
    options?: string[];
    defaultValue?: any;
  }[];
  selectedValues?: {
    [propertyName: string]: string | boolean;
  };
  suggestedProps?: {
    propName: string;
    propType: string;
    defaultValue?: string;
    description: string;
  }[];
}

/**
 * Convert string to camelCase
 */
function camelCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase());
}

/**
 * Generate suggested React props based on Figma component properties
 */
function generateSuggestedProps(info: ComponentPropertyInfo): ComponentPropertyInfo['suggestedProps'] {
  const props: ComponentPropertyInfo['suggestedProps'] = [];

  if (info.availableProperties) {
    for (const prop of info.availableProperties) {
      const propName = camelCase(prop.name);

      switch (prop.type) {
        case 'VARIANT':
          props.push({
            propName,
            propType: prop.options ? prop.options.map((o) => `'${o}'`).join(' | ') : 'string',
            defaultValue: prop.defaultValue ? `'${prop.defaultValue}'` : undefined,
            description: `Variant: ${prop.name}`,
          });
          break;

        case 'BOOLEAN':
          props.push({
            propName,
            propType: 'boolean',
            defaultValue: prop.defaultValue?.toString(),
            description: `Toggle: ${prop.name}`,
          });
          break;

        case 'TEXT':
          props.push({
            propName,
            propType: 'string',
            defaultValue: prop.defaultValue ? `'${prop.defaultValue}'` : undefined,
            description: `Text content: ${prop.name}`,
          });
          break;

        case 'INSTANCE_SWAP':
          props.push({
            propName,
            propType: 'React.ReactNode',
            description: `Swappable instance: ${prop.name}`,
          });
          break;
      }
    }
  }

  return props;
}

/**
 * Extract component property information from Figma node
 */
export function extractComponentProperties(node: FigmaApiNode): ComponentPropertyInfo | null {
  if (node.type !== 'COMPONENT' && node.type !== 'INSTANCE') {
    return null;
  }

  const info: ComponentPropertyInfo = {
    componentName: node.name,
    isInstance: node.type === 'INSTANCE',
  };

  // Extract property definitions (for COMPONENT nodes)
  if (node.componentPropertyDefinitions) {
    info.availableProperties = Object.entries(node.componentPropertyDefinitions).map(
      ([name, def]: [string, any]) => ({
        name,
        type: def.type,
        options: def.variantOptions,
        defaultValue: def.defaultValue,
      })
    );
  }

  // Extract selected values (for INSTANCE nodes)
  if (node.componentPropertyReferences) {
    info.selectedValues = {};
    for (const [propName, value] of Object.entries(node.componentPropertyReferences)) {
      info.selectedValues[propName] = value as string;
    }
  }

  // Generate React prop suggestions
  info.suggestedProps = generateSuggestedProps(info);

  return info;
}

/**
 * Format component properties for LLM
 */
export function formatComponentProperties(info: ComponentPropertyInfo): string {
  let output = `## Component: ${info.componentName}\n\n`;
  output += `**Type**: ${info.isInstance ? 'Instance' : 'Component Definition'}\n\n`;

  if (info.availableProperties && info.availableProperties.length > 0) {
    output += `### Available Properties\n\n`;
    for (const prop of info.availableProperties) {
      output += `- **${prop.name}** (${prop.type})`;
      if (prop.options) {
        output += `: ${prop.options.join(' | ')}`;
      }
      if (prop.defaultValue !== undefined) {
        output += ` [default: ${prop.defaultValue}]`;
      }
      output += '\n';
    }
    output += '\n';
  }

  if (info.selectedValues && Object.keys(info.selectedValues).length > 0) {
    output += `### Selected Values\n\n`;
    for (const [name, value] of Object.entries(info.selectedValues)) {
      output += `- **${name}**: ${value}\n`;
    }
    output += '\n';
  }

  if (info.suggestedProps && info.suggestedProps.length > 0) {
    output += `### Suggested React Props\n\n`;
    output += '```typescript\n';
    output += `interface ${info.componentName.replace(/[^a-zA-Z0-9]/g, '')}Props {\n`;
    for (const prop of info.suggestedProps) {
      output += `  /** ${prop.description} */\n`;
      output += `  ${prop.propName}?: ${prop.propType};\n`;
    }
    output += '}\n';
    output += '```\n\n';
  }

  return output;
}

/**
 * Recursively find all component instances in node tree
 */
export function findAllComponentInstances(node: FigmaApiNode): ComponentPropertyInfo[] {
  const results: ComponentPropertyInfo[] = [];

  const info = extractComponentProperties(node);
  if (info) {
    results.push(info);
  }

  if (node.children) {
    for (const child of node.children) {
      results.push(...findAllComponentInstances(child));
    }
  }

  return results;
}
