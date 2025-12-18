/**
 * JSX Builder - Transform IR tree to JSX string
 */

import type { IRNode } from '../types.js';
import { toValidIdentifier, escapeJSXText } from './utils.js';

/**
 * Derive a valid JS style name from node name
 */
function deriveStyleName(node: IRNode): string {
  return toValidIdentifier(node.name);
}

/**
 * Build JSX string from IR node tree
 *
 * @param node - IR node to transform
 * @param indent - Current indentation level
 * @returns JSX string
 */
export function buildJSX(node: IRNode, indent: number = 0): string {
  const spaces = '  '.repeat(indent);
  const styleName = deriveStyleName(node);

  switch (node.semanticType) {
    case 'Container':
    case 'Card': {
      if (node.children.length === 0) {
        return `${spaces}<View style={styles.${styleName}} />`;
      }
      const childrenJSX = node.children
        .map((child) => buildJSX(child, indent + 1))
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
      // Use imageRef if available, otherwise add placeholder comment
      const source = node.imageRef
        ? `require('${node.imageRef}')`
        : `{ uri: '' } /* TODO: Add image source */`;
      return `${spaces}<Image source={${source}} style={styles.${styleName}} />`;
    }

    case 'Button': {
      const escapedLabel = escapeJSXText(node.label);
      return `${spaces}<TouchableOpacity style={styles.${styleName}} onPress={() => {}}>
${spaces}  <Text style={styles.${styleName}Text}>${escapedLabel}</Text>
${spaces}</TouchableOpacity>`;
    }

    case 'Icon': {
      // Use iconRef if available, otherwise add placeholder comment
      const iconSource = node.iconRef
        ? `require('${node.iconRef}')`
        : `{ uri: '' } /* TODO: Add icon source */`;
      return `${spaces}<Image source={${iconSource}} style={styles.${styleName}} />`;
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
