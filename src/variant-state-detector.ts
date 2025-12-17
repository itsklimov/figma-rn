/**
 * Detection of Figma component variants and states
 * Analysis of component sets, detection of interactive states and generation of TypeScript types
 */

/**
 * Component variant property
 */
export interface VariantProperty {
  name: string; // e.g., "size", "type", "state"
  values: string[]; // e.g., ["small", "medium", "large"]
  defaultValue: string;
}

/**
 * Style override for state
 */
export interface StateStyle {
  state: 'default' | 'pressed' | 'disabled' | 'loading' | 'error' | 'hover' | 'focused';
  styleOverrides: Record<string, any>;
  hasIndicator: boolean; // loading indicator, error icon, etc.
}

/**
 * Variant detection result
 */
export interface VariantDetection {
  isComponentSet: boolean;
  variants: VariantProperty[];
  states: StateStyle[];
  suggestedPropsInterface: string; // TypeScript interface
  suggestedStyleVariants: string; // createStyles variant code
}

/**
 * Figma node interface with component set support
 */
interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];

  // Component properties
  componentPropertyDefinitions?: {
    [propertyName: string]: {
      type: 'VARIANT' | 'TEXT' | 'BOOLEAN' | 'INSTANCE_SWAP';
      defaultValue: any;
      variantOptions?: string[];
    };
  };

  // Visual properties for state detection
  opacity?: number;
  visible?: boolean;
  fills?: Array<{
    type: string;
    color?: {
      r: number;
      g: number;
      b: number;
      a: number;
    };
    opacity?: number;
  }>;
  effects?: Array<{
    type: string;
    visible?: boolean;
  }>;

  // Property overrides for instances
  variantProperties?: Record<string, string>;
}

/**
 * Normalize string for comparison (lowercase, without special characters)
 */
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Convert string to camelCase
 */
function toCamelCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase());
}

/**
 * Convert string to PascalCase
 */
function toPascalCase(str: string): string {
  const camel = toCamelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

/**
 * Check if node is a component set
 */
function isComponentSet(node: FigmaNode): boolean {
  return node.type === 'COMPONENT_SET';
}

/**
 * Parse component variant name to extract properties
 * Examples: "State=Pressed", "Type=Primary, Size=Large"
 */
function parseVariantName(name: string): Record<string, string> {
  const properties: Record<string, string> = {};

  // Split by comma for multiple properties
  const parts = name.split(',').map(p => p.trim());

  for (const part of parts) {
    // Look for "Property=Value" pattern
    const match = part.match(/^([^=]+)=(.+)$/);
    if (match) {
      const propName = match[1].trim();
      const propValue = match[2].trim();
      properties[propName] = propValue;
    }
  }

  return properties;
}

/**
 * Extract variant properties from set child components
 */
function extractVariantPropertiesFromChildren(children: FigmaNode[]): VariantProperty[] {
  const propertyMap = new Map<string, Set<string>>();

  // Iterate through all child components
  for (const child of children) {
    if (child.type === 'COMPONENT') {
      const properties = parseVariantName(child.name);

      // Collect all values for each property
      for (const [propName, propValue] of Object.entries(properties)) {
        if (!propertyMap.has(propName)) {
          propertyMap.set(propName, new Set());
        }
        propertyMap.get(propName)!.add(propValue);
      }
    }
  }

  // Convert to VariantProperty array
  const variants: VariantProperty[] = [];
  for (const [name, valuesSet] of propertyMap.entries()) {
    const values = Array.from(valuesSet).sort();
    variants.push({
      name,
      values,
      defaultValue: values[0], // first value as default
    });
  }

  return variants;
}

/**
 * Extract variant properties from component API definitions
 */
function extractVariantPropertiesFromDefinitions(
  definitions: FigmaNode['componentPropertyDefinitions']
): VariantProperty[] {
  if (!definitions) {
    return [];
  }

  const variants: VariantProperty[] = [];

  for (const [propName, propDef] of Object.entries(definitions)) {
    if (propDef.type === 'VARIANT' && propDef.variantOptions) {
      variants.push({
        name: propName,
        values: propDef.variantOptions,
        defaultValue: propDef.defaultValue || propDef.variantOptions[0],
      });
    }
  }

  return variants;
}

/**
 * Detect state type by property name or value
 */
function detectStateType(propName: string, propValue: string): StateStyle['state'] | null {
  const normalizedProp = normalizeString(propName);
  const normalizedValue = normalizeString(propValue);

  // Check by property name
  if (normalizedProp === 'state' || normalizedProp === 'variant' || normalizedProp === 'status') {
    // Check value
    if (normalizedValue.includes('press') || normalizedValue === 'active') {
      return 'pressed';
    }
    if (normalizedValue.includes('disable')) {
      return 'disabled';
    }
    if (normalizedValue.includes('load')) {
      return 'loading';
    }
    if (normalizedValue.includes('error') || normalizedValue.includes('invalid')) {
      return 'error';
    }
    if (normalizedValue.includes('hover')) {
      return 'hover';
    }
    if (normalizedValue.includes('focus')) {
      return 'focused';
    }
    if (normalizedValue.includes('default') || normalizedValue.includes('normal') || normalizedValue === 'idle') {
      return 'default';
    }
  }

  return null;
}

/**
 * Analyze node visual characteristics for state detection
 */
function analyzeVisualState(node: FigmaNode): Partial<StateStyle> {
  const styleOverrides: Record<string, any> = {};
  let hasIndicator = false;

  // Check transparency (disabled often has opacity: 0.5)
  if (node.opacity !== undefined && node.opacity < 1) {
    styleOverrides.opacity = node.opacity;
    if (node.opacity <= 0.6) {
      // Likely disabled state
      hasIndicator = true;
    }
  }

  // Check visibility
  if (node.visible === false) {
    styleOverrides.display = 'none';
  }

  // Analyze fills for color changes
  if (node.fills && node.fills.length > 0) {
    const primaryFill = node.fills[0];
    if (primaryFill.type === 'SOLID' && primaryFill.color) {
      const { r, g, b, a } = primaryFill.color;
      styleOverrides.backgroundColor = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
    }
  }

  // Look for indicators (loading spinners, error icons)
  if (node.children) {
    for (const child of node.children) {
      const childName = normalizeString(child.name);

      // Loading indicators
      if (childName.includes('spinner') || childName.includes('loader') || childName.includes('loading')) {
        hasIndicator = true;
      }

      // Error indicators
      if (childName.includes('error') || childName.includes('alert') || childName.includes('warning')) {
        hasIndicator = true;
      }

      // Success indicators
      if (childName.includes('check') || childName.includes('success')) {
        hasIndicator = true;
      }
    }
  }

  return { styleOverrides, hasIndicator };
}

/**
 * Detect states from variants and child nodes
 */
function detectStates(node: FigmaNode, variants: VariantProperty[]): StateStyle[] {
  const states: StateStyle[] = [];
  const stateMap = new Map<StateStyle['state'], Partial<StateStyle>>();

  // Initialize default state
  stateMap.set('default', {
    state: 'default',
    styleOverrides: {},
    hasIndicator: false,
  });

  // Analyze variants to find states
  for (const variant of variants) {
    for (const value of variant.values) {
      const stateType = detectStateType(variant.name, value);
      if (stateType && !stateMap.has(stateType)) {
        stateMap.set(stateType, {
          state: stateType,
          styleOverrides: {},
          hasIndicator: false,
        });
      }
    }
  }

  // Analyze child components to extract style overrides
  if (node.children) {
    for (const child of node.children) {
      if (child.type === 'COMPONENT') {
        const properties = parseVariantName(child.name);

        // Detect state of this variant
        let detectedState: StateStyle['state'] | null = null;
        for (const [propName, propValue] of Object.entries(properties)) {
          const state = detectStateType(propName, propValue);
          if (state) {
            detectedState = state;
            break;
          }
        }

        if (detectedState) {
          // Analyze visual characteristics
          const visual = analyzeVisualState(child);
          const existing = stateMap.get(detectedState);

          stateMap.set(detectedState, {
            state: detectedState,
            styleOverrides: { ...existing?.styleOverrides, ...visual.styleOverrides },
            hasIndicator: existing?.hasIndicator || visual.hasIndicator || false,
          });
        }
      }
    }
  }

  // Convert Map to array
  for (const stateData of stateMap.values()) {
    states.push(stateData as StateStyle);
  }

  return states;
}

/**
 * Generate TypeScript interface for variant props
 */
function generatePropsInterface(componentName: string, variants: VariantProperty[]): string {
  const interfaceName = `${toPascalCase(componentName)}Props`;

  let code = `interface ${interfaceName} {\n`;

  for (const variant of variants) {
    const propName = toCamelCase(variant.name);
    const propType = variant.values.map(v => `'${v}'`).join(' | ');

    code += `  /** ${variant.name} variant */\n`;
    code += `  ${propName}?: ${propType};\n`;
  }

  code += `}\n`;

  return code;
}

/**
 * Generate style variants code for createStyles
 */
function generateStyleVariantsCode(states: StateStyle[]): string {
  let code = `const styles = StyleSheet.create({\n`;
  code += `  container: {\n`;
  code += `    // base styles\n`;
  code += `  },\n`;

  for (const state of states) {
    if (state.state === 'default') {
      continue; // default already included in container
    }

    const stateName = state.state;
    code += `  ${stateName}: {\n`;

    for (const [key, value] of Object.entries(state.styleOverrides)) {
      if (typeof value === 'string') {
        code += `    ${key}: '${value}',\n`;
      } else if (typeof value === 'number') {
        code += `    ${key}: ${value},\n`;
      } else {
        code += `    ${key}: ${JSON.stringify(value)},\n`;
      }
    }

    code += `  },\n`;
  }

  code += `});\n`;

  return code;
}

/**
 * Main function for detecting variants and states
 *
 * @param node - Figma node to analyze
 * @returns variant and state detection result
 */
export function detectVariantsAndStates(node: any): VariantDetection {
  const figmaNode = node as FigmaNode;

  // Check if node is a component set
  const isSet = isComponentSet(figmaNode);

  let variants: VariantProperty[] = [];

  if (isSet && figmaNode.children) {
    // Extract variants from child components
    variants = extractVariantPropertiesFromChildren(figmaNode.children);
  } else if (figmaNode.componentPropertyDefinitions) {
    // Extract variants from API definitions
    variants = extractVariantPropertiesFromDefinitions(figmaNode.componentPropertyDefinitions);
  }

  // Detect states
  const states = detectStates(figmaNode, variants);

  // Generate TypeScript interface
  const suggestedPropsInterface = variants.length > 0
    ? generatePropsInterface(figmaNode.name, variants)
    : '';

  // Generate style variants code
  const suggestedStyleVariants = states.length > 0
    ? generateStyleVariantsCode(states)
    : '';

  return {
    isComponentSet: isSet,
    variants,
    states,
    suggestedPropsInterface,
    suggestedStyleVariants,
  };
}

/**
 * Generate variant props for component
 *
 * @param detection - variant detection result
 * @param componentName - component name
 * @returns TypeScript props interface code
 */
export function generateVariantProps(detection: VariantDetection, componentName: string): string {
  if (detection.variants.length === 0) {
    return `// No variants detected for ${componentName}`;
  }

  return generatePropsInterface(componentName, detection.variants);
}

/**
 * Generate style variants
 *
 * @param detection - variant detection result
 * @returns React Native styles code with variants
 */
export function generateStyleVariants(detection: VariantDetection): string {
  if (detection.states.length === 0) {
    return `// No states detected`;
  }

  let code = `// Detected states: ${detection.states.map(s => s.state).join(', ')}\n\n`;
  code += detection.suggestedStyleVariants;

  // Additional information about indicators
  const statesWithIndicators = detection.states.filter(s => s.hasIndicator);
  if (statesWithIndicators.length > 0) {
    code += `\n// States with indicators: ${statesWithIndicators.map(s => s.state).join(', ')}\n`;
    code += `// Recommended to add conditional rendering for loading/error indicators\n`;
  }

  return code;
}
