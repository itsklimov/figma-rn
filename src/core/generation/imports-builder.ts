/**
 * Imports Builder - Collect required imports from IR tree
 */

import type { IRNode } from '../types.js';

/**
 * Collect RN components needed based on IR tree
 */
function collectComponents(node: IRNode, set: Set<string>): void {
  switch (node.semanticType) {
    case 'Container':
    case 'Card':
      set.add('View');
      for (const child of node.children) {
        collectComponents(child, set);
      }
      break;
    case 'Text':
      set.add('Text');
      break;
    case 'Image':
      set.add('Image');
      break;
    case 'Icon':
      set.add('Image');
      set.add('TouchableOpacity');
      break;
    case 'Button':
      set.add('TouchableOpacity');
      set.add('Text');
      break;
  }
}

/**
 * Build import statements from IR tree
 */
export function buildImports(root: IRNode): string {
  const rnComponents = new Set<string>(['StyleSheet']);

  collectComponents(root, rnComponents);

  const sorted = Array.from(rnComponents).sort();

  return [
    `import React from 'react';`,
    `import { ${sorted.join(', ')} } from 'react-native';`,
  ].join('\n');
}
