/**
 * JSX Builder - Transform IR tree to JSX string
 * Includes accessibility props for production-ready components
 */

import type { IRNode, IconIR } from '../types.js';
import { toValidIdentifier, escapeJSXText } from './utils.js';

/** Minimum touch target size for comfortable interaction */
const MIN_TOUCH_TARGET = 44;

/**
 * Derive a valid JS style name from node name
 */
function deriveStyleName(node: IRNode): string {
  return toValidIdentifier(node.name);
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
  // Convert camelCase/PascalCase/kebab-case to readable text
  return nodeName
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/"/g, '\\"'); // Escape double quotes for JSX attribute
}

/**
 * Build JSX string from IR node tree
 *
 * @param node - IR node to transform
 * @param indent - Current indentation level
 * @param imagePathMap - Optional mapping from imageRef to local file path
 * @returns JSX string
 */
export function buildJSX(node: IRNode, indent: number = 0, imagePathMap?: Map<string, string>): string {
  const spaces = '  '.repeat(indent);
  const styleName = deriveStyleName(node);

  switch (node.semanticType) {
    case 'Container':
    case 'Card': {
      if (node.children.length === 0) {
        return `${spaces}<View style={styles.${styleName}} />`;
      }
      const childrenJSX = node.children
        .map((child) => buildJSX(child, indent + 1, imagePathMap))
        .join('\n');
      return `${spaces}<View style={styles.${styleName}}>
${childrenJSX}
${spaces}</View>`;
    }

    case 'Text': {
      const escapedText = escapeJSXText(node.text);
      return `${spaces}<Text style={styles.${styleName}}>${escapedText}</Text>`;
    }

    case 'Image': {
      // Use imageRef if available, with mapping to local path
      let source: string;
      if (node.imageRef && imagePathMap?.has(node.imageRef)) {
        source = `require('${imagePathMap.get(node.imageRef)}')`;
      } else if (node.imageRef) {
        source = `{ uri: '' } /* TODO: Image ref: ${node.imageRef} */`;
      } else {
        source = `{ uri: '' } /* TODO: Add image source */`;
      }
      const a11yLabel = deriveA11yLabel(node.name);
      return `${spaces}<Image
${spaces}  source={${source}}
${spaces}  style={styles.${styleName}}
${spaces}  accessibilityRole="image"
${spaces}  accessibilityLabel="${a11yLabel}"
${spaces}/>`;
    }

    case 'Button': {
      const escapedLabel = escapeJSXText(node.label);
      return `${spaces}<TouchableOpacity
${spaces}  style={styles.${styleName}}
${spaces}  onPress={() => {}}
${spaces}  accessibilityRole="button"
${spaces}  accessibilityLabel="${escapedLabel}"
${spaces}>
${spaces}  <Text style={styles.${styleName}Text}>${escapedLabel}</Text>
${spaces}</TouchableOpacity>`;
    }

    case 'Icon': {
      // Use iconRef if available, with mapping to local path
      const iconNode = node as IconIR;
      let iconSource: string;
      if (iconNode.iconRef && imagePathMap?.has(iconNode.iconRef)) {
        iconSource = `require('${imagePathMap.get(iconNode.iconRef)}')`;
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
      return `${spaces}<TouchableOpacity
${spaces}  accessibilityRole="button"
${spaces}  accessibilityLabel="${a11yLabel}"${hitSlopProp}
${spaces}>
${spaces}  <Image source={${iconSource}} style={styles.${styleName}} />
${spaces}</TouchableOpacity>`;
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

    // Button generates additional text style
    if (n.semanticType === 'Button') {
      names.push(`${styleName}Text`);
    }

    // Recurse into children
    if (n.semanticType === 'Container' || n.semanticType === 'Card') {
      for (const child of n.children) {
        collect(child);
      }
    }
  }

  collect(node);
  return names;
}
