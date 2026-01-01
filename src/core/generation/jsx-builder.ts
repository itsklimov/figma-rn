/**
 * JSX Builder - Transform IR tree to JSX string
 * Includes accessibility props for production-ready components
 */

import type { IRNode, IconIR, ImageIR, StylesBundle, ExtractedStyle, RepeaterIR, ButtonIR } from '../types.js';
import type { TokenMappings } from '../mapping/token-matcher.js';
import { toValidIdentifier, escapeJSXText } from './utils.js';
import { mapColor } from './styles-builder.js';

/** Minimum touch target size for comfortable interaction */
const MIN_TOUCH_TARGET = 44;

/**
 * Derive a valid JS style name from node name
 */
function deriveStyleName(node: IRNode): string {
  // styleRef is already a valid identifier from generateStyleRef()
  // No need to transform again - it causes casing issues
  return node.styleRef;
}

/**
 * Generate the style attribute, merging static and dynamic styles if needed
 */
function getStyleAttribute(node: IRNode, styleName: string): string {
  if (node.styleProps) {
    const overrides = Object.entries(node.styleProps)
      .map(([prop, name]) => `${prop}: ${name}`)
      .join(', ');
    return `style={[styles.${styleName}, { ${overrides} }]}`;
  }
  return `style={styles.${styleName}}`;
}

/**
 * Calculate hitSlop needed to meet minimum touch target
 */
function calculateHitSlop(size: number): number {
  if (size >= MIN_TOUCH_TARGET) return 0;
  return Math.ceil((MIN_TOUCH_TARGET - size) / 2);
}

/**
 * Derive accessibility label from node name
 * Converts naming conventions to readable text and escapes quotes for JSX
 */
function deriveA11yLabel(nodeName: string): string {
  // Ignore generic names which are not useful for a11y
  const genericNames = ['vector', 'group', 'frame', 'rectangle', 'ellipse', 'star', 'line', 'union', 'subtract', 'intersect', 'exclude'];
  const sanitizedName = nodeName.toLowerCase().replace(/\s*\d*$/, '').trim();
  if (genericNames.includes(sanitizedName)) {
    return '';
  }

  // Convert camelCase/PascalCase/kebab-case to readable text
  return nodeName
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/"/g, '\\"'); // Escape double quotes for JSX attribute
}

/**
 * Generate LinearGradient props from ExtractedStyle.backgroundGradient
 */
function buildGradientProps(
  gradient: NonNullable<ExtractedStyle['backgroundGradient']>, 
  spaces: string,
  mappings?: TokenMappings
): string {
  const { colors, positions, angle } = gradient;
  
  // Map colors to tokens if mappings provided
  const mappedColors = mappings 
    ? colors.map(hex => mapColor(hex, mappings).value)
    : colors.map(hex => `'${hex}'`);
  
  // Convert angle to start/end points (simplified linear gradient)
  // Default: vertical top-to-bottom
  let start = { x: 0.5, y: 0 };
  let end = { x: 0.5, y: 1 };
  
  if (angle !== undefined) {
    // Convert angle to start/end (0 = top-to-bottom, 90 = left-to-right)
    const rad = (angle * Math.PI) / 180;
    start = { x: 0.5 - Math.sin(rad) * 0.5, y: 0.5 - Math.cos(rad) * 0.5 };
    end = { x: 0.5 + Math.sin(rad) * 0.5, y: 0.5 + Math.cos(rad) * 0.5 };
  }

  return `${spaces}  colors={[${mappedColors.join(', ')}]}
${spaces}  locations={${JSON.stringify(positions)}}
${spaces}  start={{ x: ${start.x.toFixed(2)}, y: ${start.y.toFixed(2)} }}
${spaces}  end={{ x: ${end.x.toFixed(2)}, y: ${end.y.toFixed(2)} }}`;
}

/**
 * Build JSX string from IR node tree
 *
 * @param node - IR node to transform
 * @param indent - Current indentation level
 * @param imagePathMap - Optional mapping from imageRef to local file path
 * @param jsxOverrides - Optional overrides for specific node IDs
 * @param stylesBundle - Optional styles bundle to check for gradients
 * @returns JSX string
 */
export function buildJSX(
  node: IRNode,
  indent: number = 0,
  imagePathMap?: Map<string, string>,
  jsxOverrides?: Map<string, string>,
  stylesBundle?: StylesBundle,
  mappings?: TokenMappings
): string {
  // Check for overrides (e.g. valid FlatList for a container)
  if (jsxOverrides?.has(node.id)) {
    const spaces = '  '.repeat(indent);
    return `${spaces}${jsxOverrides.get(node.id)!}`;
  }

  const spaces = '  '.repeat(indent);
  const styleName = deriveStyleName(node);
  
  // Check if this node has a gradient background
  const style = stylesBundle?.styles[node.styleRef];
  const hasGradient = style?.backgroundGradient != null;

  switch (node.semanticType) {
    case 'Container':
    case 'Card': {
      // Handle gradient wrapping for containers
      if (hasGradient && style?.backgroundGradient) {
        const gradientProps = buildGradientProps(style.backgroundGradient, spaces, mappings);
        const children = node.children || [];
        const styleAttr = getStyleAttribute(node, styleName);
        
        if (children.length === 0) {
          return `${spaces}<LinearGradient
${gradientProps}
${spaces}  ${styleAttr}
${spaces}/>`;
        }
        const childrenJSX = children
          .map((child) => buildJSX(child, indent + 1, imagePathMap, jsxOverrides, stylesBundle, mappings))
          .join('\n');
        return `${spaces}<LinearGradient
${gradientProps}
${spaces}  ${styleAttr}
${spaces}>
${childrenJSX}
${spaces}</LinearGradient>`;
      }

      // Regular View
      const children = node.children || [];
      const styleAttr = getStyleAttribute(node, styleName);
      
      if (children.length === 0) {
        return `${spaces}<View ${styleAttr} />`;
      }
      const childrenJSX = children
        .map((child) => buildJSX(child, indent + 1, imagePathMap, jsxOverrides, stylesBundle, mappings))
        .join('\n');
      return `${spaces}<View ${styleAttr}>
${childrenJSX}
${spaces}</View>`;
    }

    case 'Text': {
      const content = node.propName ? `{${node.propName}}` : escapeJSXText(node.text);
      const styleAttr = getStyleAttribute(node, styleName);
      return `${spaces}<Text ${styleAttr}>${content}</Text>`;
    }

    case 'Image': {
      const imgNode = node as ImageIR;

      // NEW: If image has children (overlays), render as View container
      if (imgNode.children && imgNode.children.length > 0) {
        const childrenJSX = imgNode.children
          .map((child) => buildJSX(child, indent + 1, imagePathMap, jsxOverrides, stylesBundle, mappings))
          .join('\n');
        const styleAttr = getStyleAttribute(node, styleName);

        return `${spaces}<View ${styleAttr}>
${childrenJSX}
${spaces}</View>`;
      }

      // DEFAULT: Render as simple Image component
      const styleAttr = getStyleAttribute(node, styleName);
      if (imgNode.propName) {
        return `${spaces}<Image
${spaces}  source={${imgNode.propName}}
${spaces}  ${styleAttr}
${spaces}  accessibilityRole="image"
${spaces}/>`;
      }

      // Use imageRef if available, with mapping to local path
      let source: string;
      let isSvg = false;
      if (imgNode.imageRef && imagePathMap?.has(imgNode.imageRef)) {
        const path = imagePathMap.get(imgNode.imageRef)!;
        source = `require('${path}')`;
        isSvg = path.toLowerCase().endsWith('.svg');
      } else if (imgNode.imageRef) {
        source = `{ uri: '' } /* TODO: Image ref: ${imgNode.imageRef} */`;
      } else {
        source = `{ uri: '' } /* TODO: Add image source */`;
      }

      const component = isSvg ? 'SvgIcon' : 'Image';
      const a11yLabel = deriveA11yLabel(node.name);
      const a11yProp = a11yLabel ? `\n${spaces}  accessibilityLabel="${a11yLabel}"` : '';

      return `${spaces}<${component}
${spaces}  source={${source}}
${spaces}  ${styleAttr}
${spaces}  accessibilityRole="image"${a11yProp}
${spaces}/>`;
    }

    case 'Button': {
      const btn = node as ButtonIR;
      const escapedLabel = escapeJSXText(btn.label);

      // NEW: If button has custom children, render them instead of default reconstruction
      if (btn.children && btn.children.length > 0) {
        const childrenJSX = btn.children
          .map((child) => buildJSX(child, indent + 1, imagePathMap, jsxOverrides, stylesBundle, mappings))
          .join('\n');

        return `${spaces}<TouchableOpacity
${spaces}  style={styles.${styleName}}
${spaces}  onPress={() => {}}
${spaces}  accessibilityRole="button"
${spaces}  accessibilityLabel="${escapedLabel}"
${spaces}>
${childrenJSX}
${spaces}</TouchableOpacity>`;
      }

      // DEFAULT: Reconstruct from label + iconRef (existing behavior for simple buttons)
      let iconJSX = '';
      if (btn.iconRef && btn.iconStyleRef) {
        let isSvg = false;
        let iconSource: string;
        if (imagePathMap?.has(btn.iconRef)) {
          const path = imagePathMap.get(btn.iconRef)!;
          iconSource = `require('${path}')`;
          isSvg = path.toLowerCase().endsWith('.svg');
        } else {
          iconSource = `{ uri: '' } /* TODO: Button icon: ${btn.iconRef} */`;
        }

        const component = isSvg ? 'SvgIcon' : 'Image';
        const iconStyleName = btn.iconStyleRef; // Already valid from generateStyleRef()
        iconJSX = `\n${spaces}  <${component} source={${iconSource}} style={styles.${iconStyleName}} />`;
      }

      const textStyleName = btn.textStyleRef ? btn.textStyleRef : `${styleName}Text`;

      return `${spaces}<TouchableOpacity
${spaces}  style={styles.${styleName}}
${spaces}  onPress={() => {}}
${spaces}  accessibilityRole="button"
${spaces}  accessibilityLabel="${escapedLabel}"
${spaces}>${iconJSX}
${spaces}  <Text style={styles.${textStyleName}}>${escapedLabel}</Text>
${spaces}</TouchableOpacity>`;
    }

    case 'Icon': {
      const iconNode = node as IconIR;

      // Check if this is a "vector group" - container with only vector/image children
      // These should be rendered as a single SVG, not individual elements
      const isVectorGroup = iconNode.children && iconNode.children.length > 0 &&
        iconNode.children.every(child =>
          child.semanticType === 'Icon' ||
          child.semanticType === 'Image' ||
          (child as any).type === 'VECTOR' ||
          (child as any).type === 'ELLIPSE' ||
          (child as any).type === 'BOOLEAN_OPERATION'
        );

      // For vector groups: render as single SVG using parent's iconRef
      // This prevents absolute positioning of individual vector paths
      if (isVectorGroup && iconNode.iconRef) {
        let iconSource: string;
        let isSvg = false;
        if (imagePathMap?.has(iconNode.iconRef)) {
          const path = imagePathMap.get(iconNode.iconRef)!;
          iconSource = `require('${path}')`;
          isSvg = path.toLowerCase().endsWith('.svg');
        } else {
          iconSource = `{ uri: '' } /* TODO: Export as single SVG: ${iconNode.iconRef} */`;
        }
        const component = isSvg ? 'SvgIcon' : 'Image';
        const a11yLabel = deriveA11yLabel(node.name);
        const a11yProp = a11yLabel ? `\n${spaces}  accessibilityLabel="${a11yLabel}"` : '';
        const hitSlop = calculateHitSlop(iconNode.size);
        const hitSlopProp = hitSlop > 0
          ? `\n${spaces}  hitSlop={{ top: ${hitSlop}, bottom: ${hitSlop}, left: ${hitSlop}, right: ${hitSlop} }}`
          : '';

        return `${spaces}<TouchableOpacity
${spaces}  accessibilityRole="button"${a11yProp}${hitSlopProp}
${spaces}>
${spaces}  <${component} source={${iconSource}} style={styles.${styleName}} />
${spaces}</TouchableOpacity>`;
      }

      // For icons with mixed children (not pure vector group): render children
      if (iconNode.children && iconNode.children.length > 0 && !isVectorGroup) {
        const childrenJSX = iconNode.children
          .map((child) => buildJSX(child, indent + 1, imagePathMap, jsxOverrides, stylesBundle, mappings))
          .join('\n');
        const a11yLabel = deriveA11yLabel(node.name);
        const a11yProp = a11yLabel ? `\n${spaces}  accessibilityLabel="${a11yLabel}"` : '';
        const hitSlop = calculateHitSlop(iconNode.size);
        const hitSlopProp = hitSlop > 0
          ? `\n${spaces}  hitSlop={{ top: ${hitSlop}, bottom: ${hitSlop}, left: ${hitSlop}, right: ${hitSlop} }}`
          : '';

        return `${spaces}<TouchableOpacity
${spaces}  accessibilityRole="button"${a11yProp}${hitSlopProp}
${spaces}>
${childrenJSX}
${spaces}</TouchableOpacity>`;
      }

      // DEFAULT: Use iconRef (existing behavior for simple icons)
      let iconSource: string;
      let isSvg = false;
      if (iconNode.iconRef && imagePathMap?.has(iconNode.iconRef)) {
        const path = imagePathMap.get(iconNode.iconRef)!;
        iconSource = `require('${path}')`;
        isSvg = path.toLowerCase().endsWith('.svg');
      } else if (iconNode.iconRef) {
        iconSource = `{ uri: '' } /* TODO: Icon ref: ${iconNode.iconRef} */`;
      } else {
        iconSource = `{ uri: '' } /* TODO: Add icon source */`;
      }
      const hitSlop = calculateHitSlop(iconNode.size);
      const a11yLabel = deriveA11yLabel(node.name);
      const hitSlopProp = hitSlop > 0
        ? `\n${spaces}  hitSlop={{ top: ${hitSlop}, bottom: ${hitSlop}, left: ${hitSlop}, right: ${hitSlop} }}`
        : '';

      const component = isSvg ? 'SvgIcon' : 'Image';
      const a11yProp = a11yLabel ? `\n${spaces}  accessibilityLabel="${a11yLabel}"` : '';

      return `${spaces}<TouchableOpacity
${spaces}  accessibilityRole="button"${a11yProp}${hitSlopProp}
${spaces}>
${spaces}  <${component} source={${iconSource}} style={styles.${styleName}} />
${spaces}</TouchableOpacity>`;
    }

    case 'Component': {
      const componentName = (node as any).componentName;
      const comp = node as any; // Cast to access props
      const props = comp.props || {};
      const propEntries = Object.keys(props);
      
      if (propEntries.length > 0) {
        const attributes = propEntries.map(p => `${p}={${p}}`).join(' ');
        return `${spaces}<${componentName} ${attributes} />`;
      }
      
      return `${spaces}<${componentName} />`;
    }

    case 'Repeater': {
      const repeater = node as RepeaterIR;
      return `${spaces}{${repeater.dataPropName}.map((item, index) => (
${spaces}  <${repeater.itemComponentName} key={index} {...item} />
${spaces}))}`;
    }

    default: {
      // Fallback for any unknown type
      return `${spaces}<View style={styles.${styleName}} />`;
    }
  }
}

/**
 * Collect all style names that will be referenced in JSX
 * Used to ensure StyleSheet has matching entries
 */
export function collectStyleNames(node: IRNode): string[] {
  const names: string[] = [];

  function collect(n: IRNode): void {
    const styleName = deriveStyleName(n);
    names.push(styleName);

    // Button generates additional text/icon styles
    if (n.semanticType === 'Button') {
      const btn = n as ButtonIR;
      if (btn.textStyleRef) {
        names.push(btn.textStyleRef); // Already valid from generateStyleRef()
      } else {
        names.push(`${styleName}Text`);
      }

      if (btn.iconStyleRef) {
        names.push(btn.iconStyleRef); // Already valid from generateStyleRef()
      } else if ((btn as any).iconRef) {
        names.push(`${styleName}Icon`);
      }
    }

    // Recurse into children (check at runtime for all types that might have children)
    if ('children' in n && n.children) {
      for (const child of n.children) {
        collect(child);
      }
    }
  }

  collect(node);
  return names;
}
