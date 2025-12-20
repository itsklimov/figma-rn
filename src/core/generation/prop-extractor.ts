import { IRNode, RepeaterIR, TextIR, ImageIR } from '../types.js';
import { toValidIdentifier } from './utils.js';

export interface ExtractedProps {
  props: Record<string, { type: 'string' | 'image'; value: string; defaultValue: string }>;
  // We don't necessarily need to modify children here if we handle the binding in the builder,
  // but modifying them to point to the prop is cleaner.
}

/**
 * Scans a component's children to identify and extract potential props.
 * Modifies the children in-place to reference the props? 
 * Or just returns the props and the builder does the substitution?
 * 
 * Let's try to be non-destructive first, checking what we can extract.
 */
export function extractProps(root: IRNode): ExtractedProps {
  const props: ExtractedProps['props'] = {};
  // Track seen content to reuse props: Map<"name|type|value", finalName>
  const contentMap = new Map<string, string>();

  function traverse(node: IRNode, depth: number) {
    // 1. Extract Text
    if (node.semanticType === 'Text' && 'text' in node && node.text) {
      const textNode = node as any;
      const nodeName = node.name || 'text';
      const contentKey = `${nodeName}|text|${textNode.text}`;
      
      if (contentMap.has(contentKey)) {
        node.propName = contentMap.get(contentKey);
        return;
      }

      let propName = toValidIdentifier(nodeName);
      
      // Semantic heuristics for common patterns
      const lowerName = nodeName.toLowerCase();
      if (lowerName.includes('title') || lowerName === 'header' || lowerName === 'headline') {
        propName = 'title';
      } else if (lowerName.includes('description') || lowerName.includes('subtitle') || lowerName.includes('body')) {
        propName = 'description';
      } else if (lowerName === 'label' || lowerName === 'placeholder') {
        propName = lowerName;
      } else if (lowerName.includes('price')) {
        propName = 'price';
      } else if (lowerName.includes('date') || lowerName.includes('time')) {
        propName = 'dateTime';
      }
      
      // Ensure specific naming for common elements
      let finalName = propName;
      let counter = 1;
      while (props[finalName] && props[finalName].value !== textNode.text) {
        finalName = `${propName}${counter++}`;
      }

      if (!props[finalName]) {
        props[finalName] = {
          type: 'string',
          value: textNode.text,
          defaultValue: textNode.text,
        };
      }
      
      node.propName = finalName;
      contentMap.set(contentKey, finalName);
    }

    // 2. Extract Images
    if (node.semanticType === 'Image') {
      const imageNode = node as any;
      const nodeName = node.name || 'image';
      const contentKey = `${nodeName}|image|${imageNode.imageRef || ''}`;

      if (contentMap.has(contentKey)) {
        node.propName = contentMap.get(contentKey);
        return;
      }

      const propName = toValidIdentifier(nodeName);
      let finalName = propName;
      let counter = 1;
      while (props[finalName] && props[finalName].value !== imageNode.imageRef) {
        finalName = `${propName}${counter++}`;
      }

      if (!props[finalName]) {
        props[finalName] = {
          type: 'image',
          value: imageNode.imageRef || '',
          defaultValue: imageNode.imageRef || '',
        };
      }
      
      node.propName = finalName;
      contentMap.set(contentKey, finalName);
    }

    // 3. Handle Repeaters
    if (node.semanticType === 'Repeater') {
      const repeater = node as RepeaterIR;
      const variations: Record<string, 'string' | 'image'> = {};
      
      // Pass 1: Discover all text/image nodes in the item template
      // We assume children[0] is the template
      const template = repeater.children[0];
      
      const findDynamicNodes = (n: IRNode, path: string[] = []) => {
        if (n.semanticType === 'Text') {
          const textNode = n as TextIR;
          const propName = toValidIdentifier(n.name || 'text');
          variations[path.concat(propName).join('_')] = 'string';
        } else if (n.semanticType === 'Image') {
          const propName = toValidIdentifier(n.name || 'image');
          variations[path.concat(propName).join('_')] = 'image';
        }
        
        if ('children' in n) {
          n.children.forEach((child, idx) => findDynamicNodes(child, path.concat(String(idx))));
        }
      };
      
      findDynamicNodes(template);
      
      // For now, we'll mark the whole repeater as needing a data array prop
      // at the parent level.
      // But we don't want to descend into its children and number them!
      // So we return early.
      return;
    }

    if ('children' in node) {
      for (const child of node.children) {
        traverse(child, depth + 1);
      }
    }
  }

  traverse(root, 0);
  return { props };
}
