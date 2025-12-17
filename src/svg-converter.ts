/**
 * SVG to React Native component converter
 * Converts SVG files to react-native-svg components with type support
 */

// Conversion interfaces
export interface SVGConversionOptions {
  componentName: string;
  defaultSize?: number;
  defaultColor?: string;
  optimizeSvg?: boolean;
  exportType?: 'default' | 'named';
}

export interface IconSetOptions {
  icons: Array<{ name: string; svg: string }>;
  setName?: string; // e.g., 'AppIcons'
}

export interface ConversionResult {
  componentCode: string;
  imports: string[];
  propsInterface: string;
}

// SVG elements and their React Native equivalents
const SVG_ELEMENT_MAP: Record<string, string> = {
  svg: 'Svg',
  circle: 'Circle',
  ellipse: 'Ellipse',
  g: 'G',
  line: 'Line',
  path: 'Path',
  polygon: 'Polygon',
  polyline: 'Polyline',
  rect: 'Rect',
  text: 'Text',
  tspan: 'TSpan',
  defs: 'Defs',
  linearGradient: 'LinearGradient',
  radialGradient: 'RadialGradient',
  stop: 'Stop',
  clipPath: 'ClipPath',
  mask: 'Mask',
  use: 'Use',
};

// Attributes to remove during optimization
const REMOVABLE_ATTRS = [
  'xmlns',
  'xmlns:xlink',
  'xml:space',
  'version',
  'id',
  'data-name',
  'class',
];

// SVG attributes and their React Native equivalents
const ATTR_MAP: Record<string, string> = {
  'fill-opacity': 'fillOpacity',
  'fill-rule': 'fillRule',
  'stroke-dasharray': 'strokeDasharray',
  'stroke-dashoffset': 'strokeDashoffset',
  'stroke-linecap': 'strokeLinecap',
  'stroke-linejoin': 'strokeLinejoin',
  'stroke-miterlimit': 'strokeMiterlimit',
  'stroke-opacity': 'strokeOpacity',
  'stroke-width': 'strokeWidth',
  'clip-path': 'clipPath',
  'clip-rule': 'clipRule',
  'stop-color': 'stopColor',
  'stop-opacity': 'stopOpacity',
  'text-anchor': 'textAnchor',
  'font-family': 'fontFamily',
  'font-size': 'fontSize',
  'font-weight': 'fontWeight',
};

interface ParsedElement {
  tag: string;
  attributes: Record<string, string>;
  children: ParsedElement[];
  text?: string;
}

/**
 * Simple SVG to AST parser (without external dependencies)
 */
function parseSvgToAst(svgContent: string): ParsedElement {
  // Remove comments
  const cleaned = svgContent.replace(/<!--[\s\S]*?-->/g, '');

  const root: ParsedElement = {
    tag: 'root',
    attributes: {},
    children: [],
  };

  const stack: ParsedElement[] = [root];

  // Regular expression for parsing tags
  const tagRegex = /<([a-zA-Z][a-zA-Z0-9]*)\s*([^>]*?)\s*(\/?)>/g;
  const closeTagRegex = /<\/([a-zA-Z][a-zA-Z0-9]*)>/g;

  let lastIndex = 0;
  let match;

  // Combine opening and closing tags
  const allMatches: Array<{
    type: 'open' | 'close' | 'selfClose';
    tag: string;
    attrs?: string;
    index: number;
    length: number;
  }> = [];

  // Collect all opening tags
  while ((match = tagRegex.exec(cleaned)) !== null) {
    const isSelfClosing = match[3] === '/';
    allMatches.push({
      type: isSelfClosing ? 'selfClose' : 'open',
      tag: match[1],
      attrs: match[2],
      index: match.index,
      length: match[0].length,
    });
  }

  // Collect all closing tags
  while ((match = closeTagRegex.exec(cleaned)) !== null) {
    allMatches.push({
      type: 'close',
      tag: match[1],
      index: match.index,
      length: match[0].length,
    });
  }

  // Sort by position
  allMatches.sort((a, b) => a.index - b.index);

  // Process tags in order
  allMatches.forEach((item) => {
    const current = stack[stack.length - 1];

    // Extract text content between tags
    if (item.index > lastIndex) {
      const text = cleaned.substring(lastIndex, item.index).trim();
      if (text && current) {
        current.text = text;
      }
    }

    if (item.type === 'open' || item.type === 'selfClose') {
      const element: ParsedElement = {
        tag: item.tag,
        attributes: parseAttributes(item.attrs || ''),
        children: [],
      };

      current.children.push(element);

      if (item.type === 'open') {
        stack.push(element);
      }
    } else if (item.type === 'close') {
      stack.pop();
    }

    lastIndex = item.index + item.length;
  });

  return root.children[0] || root;
}

/**
 * Parse attributes from string
 */
function parseAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([a-zA-Z][a-zA-Z0-9-:]*)\s*=\s*["']([^"']*)["']/g;
  let match;

  while ((match = attrRegex.exec(attrString)) !== null) {
    attrs[match[1]] = match[2];
  }

  return attrs;
}

/**
 * SVG optimization - remove unnecessary attributes
 */
export function optimizeSvg(svgContent: string): string {
  let optimized = svgContent;

  // Remove unnecessary attributes
  REMOVABLE_ATTRS.forEach((attr) => {
    const regex = new RegExp(`\\s${attr}="[^"]*"`, 'g');
    optimized = optimized.replace(regex, '');
  });

  // Remove empty groups
  optimized = optimized.replace(/<g\s*><\/g>/g, '');

  // Remove extra whitespace
  optimized = optimized.replace(/\s+/g, ' ').trim();

  return optimized;
}

/**
 * Extract colors from SVG
 */
export function extractSvgColors(svgContent: string): string[] {
  const colors = new Set<string>();
  const colorRegex = /(fill|stroke)="(#[0-9a-fA-F]{3,6}|rgb[a]?\([^)]+\)|[a-z]+)"/g;
  let match;

  while ((match = colorRegex.exec(svgContent)) !== null) {
    const color = match[2];
    if (color !== 'none' && color !== 'transparent' && color !== 'currentColor') {
      colors.add(color);
    }
  }

  return Array.from(colors);
}

/**
 * Convert SVG attributes to React Native props
 */
function convertAttributes(
  attributes: Record<string, string>,
  isRoot: boolean,
  options: { replaceColor?: boolean; colorPropName?: string }
): Record<string, string> {
  const converted: Record<string, string> = {};

  Object.entries(attributes).forEach(([key, value]) => {
    // Skip unnecessary attributes
    if (REMOVABLE_ATTRS.includes(key)) {
      return;
    }

    // Convert attribute names
    const propName = ATTR_MAP[key] || key;

    // Special color handling
    if (options.replaceColor && (key === 'fill' || key === 'stroke')) {
      if (value !== 'none' && value !== 'transparent') {
        converted[propName] = `{${options.colorPropName || 'color'}}`;
        return;
      }
    }

    // Convert numeric values
    if (isNumeric(value) && key !== 'd' && key !== 'viewBox') {
      converted[propName] = value;
    } else {
      converted[propName] = value;
    }
  });

  return converted;
}

/**
 * Check if string is a number
 */
function isNumeric(str: string): boolean {
  return !isNaN(parseFloat(str)) && isFinite(Number(str));
}

/**
 * Convert AST to JSX code
 */
function astToJsx(
  element: ParsedElement,
  indent: number = 0,
  isRoot: boolean = false,
  options: { replaceColor?: boolean; colorPropName?: string } = {}
): string {
  const indentStr = '  '.repeat(indent);

  // Get React Native component
  const componentName = SVG_ELEMENT_MAP[element.tag] || element.tag;

  // Convert attributes
  const attrs = convertAttributes(element.attributes, isRoot, options);

  // Build attributes string
  const attrStrings: string[] = [];

  Object.entries(attrs).forEach(([key, value]) => {
    if (value.startsWith('{') && value.endsWith('}')) {
      // Already an expression
      attrStrings.push(`${key}=${value}`);
    } else if (isNumeric(value) && key !== 'd' && key !== 'viewBox') {
      attrStrings.push(`${key}={${value}}`);
    } else {
      attrStrings.push(`${key}="${value}"`);
    }
  });

  const attrStr = attrStrings.length > 0 ? ' ' + attrStrings.join(' ') : '';

  // Process children
  if (element.children.length === 0 && !element.text) {
    return `${indentStr}<${componentName}${attrStr} />`;
  }

  let childrenJsx = '';
  if (element.text) {
    childrenJsx = element.text;
  } else {
    childrenJsx = element.children
      .map((child) => astToJsx(child, indent + 1, false, options))
      .join('\n');
  }

  if (element.children.length === 0) {
    return `${indentStr}<${componentName}${attrStr}>${childrenJsx}</${componentName}>`;
  }

  return `${indentStr}<${componentName}${attrStr}>\n${childrenJsx}\n${indentStr}</${componentName}>`;
}

/**
 * Generate TypeScript interface for icon props
 */
function generatePropsInterface(
  componentName: string,
  hasColorProp: boolean,
  hasSizeProp: boolean
): string {
  const props: string[] = [];

  if (hasSizeProp) {
    props.push('  size?: number;');
  }
  if (hasColorProp) {
    props.push('  color?: string;');
  }
  props.push('  style?: any;');

  return `export interface ${componentName}Props {\n${props.join('\n')}\n}`;
}

/**
 * Main function for converting SVG to React Native component
 */
export function convertSvgToComponent(
  svgContent: string,
  options: SVGConversionOptions
): ConversionResult {
  const {
    componentName,
    defaultSize = 24,
    defaultColor = '#000000',
    optimizeSvg: shouldOptimize = true,
    exportType = 'named',
  } = options;

  // Optimize SVG if needed
  const processedSvg = shouldOptimize ? optimizeSvg(svgContent) : svgContent;

  // Parse SVG to AST
  const ast = parseSvgToAst(processedSvg);

  // Extract colors to determine if color prop is needed
  const colors = extractSvgColors(processedSvg);
  const hasMultipleColors = colors.length > 1;
  const hasColors = colors.length > 0;

  // Extract viewBox and dimensions
  const viewBox = ast.attributes.viewBox || ast.attributes.viewbox || '0 0 24 24';
  const [, , vbWidth, vbHeight] = viewBox.split(' ').map(Number);

  // Determine used components
  const usedComponents = new Set<string>();
  function collectComponents(element: ParsedElement) {
    const comp = SVG_ELEMENT_MAP[element.tag];
    if (comp) usedComponents.add(comp);
    element.children.forEach(collectComponents);
  }
  collectComponents(ast);

  // Build imports
  const imports = [`import React from 'react';`, `import { ${Array.from(usedComponents).join(', ')} } from 'react-native-svg';`];

  // Generate props interface
  const propsInterface = generatePropsInterface(componentName, hasColors && !hasMultipleColors, true);

  // Generate JSX for children
  const childrenJsx = ast.children
    .map((child) =>
      astToJsx(child, 2, false, {
        replaceColor: hasColors && !hasMultipleColors,
        colorPropName: 'color',
      })
    )
    .join('\n');

  // Generate component code
  const componentCode = `${imports.join('\n')}

${propsInterface}

${exportType === 'default' ? 'export default' : 'export'} function ${componentName}({
  size = ${defaultSize},
  color = '${defaultColor}',
  style,
}: ${componentName}Props) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="${viewBox}"
      style={style}
    >
${childrenJsx}
    </Svg>
  );
}`;

  return {
    componentCode,
    imports,
    propsInterface,
  };
}

/**
 * Generate icon set from multiple SVGs
 */
export function generateIconSet(options: IconSetOptions): string {
  const { icons, setName = 'Icons' } = options;

  // Convert all icons
  const convertedIcons = icons.map((icon) => {
    const result = convertSvgToComponent(icon.svg, {
      componentName: icon.name,
      exportType: 'named',
    });
    return {
      name: icon.name,
      code: result.componentCode,
      imports: result.imports,
    };
  });

  // Collect all unique imports
  const allImports = new Set<string>();
  convertedIcons.forEach((icon) => {
    icon.imports.forEach((imp) => allImports.add(imp));
  });

  // Collect all react-native-svg components
  const svgComponents = new Set<string>();
  convertedIcons.forEach((icon) => {
    const match = icon.imports.find((imp) => imp.includes('react-native-svg'));
    if (match) {
      const componentsMatch = match.match(/\{([^}]+)\}/);
      if (componentsMatch) {
        componentsMatch[1].split(',').forEach((comp) => {
          svgComponents.add(comp.trim());
        });
      }
    }
  });

  // Generate common interface
  const commonInterface = `export interface IconProps {
  size?: number;
  color?: string;
  style?: any;
}`;

  // Generate types for icon set
  const iconNames = icons.map((icon) => `'${icon.name}'`).join(' | ');
  const iconSetInterface = `export interface ${setName}Props extends IconProps {
  name: ${iconNames};
}`;

  // Generate individual components
  const individualComponents = convertedIcons.map((icon) => {
    // Remove imports from individual components as they will be at the beginning of the file
    const codeWithoutImports = icon.code
      .split('\n')
      .filter((line) => !line.startsWith('import'))
      .join('\n')
      .trim();

    return codeWithoutImports;
  }).join('\n\n');

  // Generate main icon set component
  const iconSetComponent = `export function ${setName}({ name, ...props }: ${setName}Props) {
  switch (name) {
${icons.map((icon) => `    case '${icon.name}': return <${icon.name} {...props} />;`).join('\n')}
    default: return null;
  }
}`;

  // Assemble final code
  const finalCode = `import React from 'react';
import { ${Array.from(svgComponents).join(', ')} } from 'react-native-svg';

${commonInterface}

${iconSetInterface}

${individualComponents}

${iconSetComponent}

// Export icon name constants
export const IconNames = {
${icons.map((icon) => `  ${icon.name}: '${icon.name}' as const,`).join('\n')}
};`;

  return finalCode;
}
