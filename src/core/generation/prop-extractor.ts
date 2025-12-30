import { IRNode, RepeaterIR, TextIR, ImageIR, StylesBundle } from '../types.js';
import { toValidIdentifier } from './utils.js';

export interface ExtractedProps {
  props: Record<string, { type: 'string' | 'image' | 'style'; value: string; defaultValue: string; property?: string }>;
}

/**
 * Scans a component's children to identify and extract potential props.
 * Supports project-agnostic visual property extraction if variations are provided.
 */
export function extractProps(
  root: IRNode, 
  stylesBundle?: StylesBundle, 
  variations?: Record<string, string[]>
): ExtractedProps {
  const props: ExtractedProps['props'] = {};
  // Track seen content to reuse props: Map<"name|type|value|property", finalName>
  const contentMap = new Map<string, string>();

  function traverse(node: IRNode, depth: number, path: string[] = []) {
    const nodeName = node.name || (depth === 0 ? 'root' : 'node');
    const nodePath = path.join('_');
    const prefix = nodePath ? `${nodePath}_` : '';

    // 1. Extract Visual Styles (Agnostic parameterization)
    if (stylesBundle && node.styleRef) {
      const style = stylesBundle.styles[node.styleRef];
      if (style) {
        // Define which properties we can parameterize
        const styleProps: (keyof typeof style)[] = ['backgroundColor', 'borderColor'];
        
        for (const property of styleProps) {
          const value = style[property];
          if (value && typeof value === 'string') {
            const variantKey = `${prefix}${property}`;
            // If this property is known to vary (from detection) or if we want to extract it
            if (variations && variations[variantKey] && variations[variantKey].length > 1) {
              const contentKey = `${nodeName}|style|${value}|${property}`;
              
              if (!contentMap.has(contentKey)) {
                const propName = toValidIdentifier(variantKey);
                
                // Ensure unique name
                let finalName = propName;
                let counter = 1;
                while (props[finalName]) {
                  finalName = `${propName}${counter++}`;
                }

                props[finalName] = {
                  type: 'style',
                  value: value,
                  defaultValue: value,
                  property: property as string,
                };
                contentMap.set(contentKey, finalName);
              }

              // Bind node to this prop
              node.styleProps = node.styleProps || {};
              node.styleProps[property as string] = contentMap.get(contentKey)!;
            }
          }
        }

        // Special handling for Typography color
        if (style.typography?.color) {
          const property = 'color';
          const value = style.typography.color;
          const variantKey = `${prefix}${property}`;
          
          if (variations && variations[variantKey] && variations[variantKey].length > 1) {
            const contentKey = `${nodeName}|style|${value}|${property}`;
            if (!contentMap.has(contentKey)) {
              const propName = toValidIdentifier(variantKey);
              let finalName = propName;
              let counter = 1;
              while (props[finalName]) {
                finalName = `${propName}${counter++}`;
              }

              props[finalName] = {
                type: 'style',
                value: value,
                defaultValue: value,
                property: property,
              };
              contentMap.set(contentKey, finalName);
            }
            node.styleProps = node.styleProps || {};
            node.styleProps[property] = contentMap.get(contentKey)!;
          }
        }
      }
    }

    // 2. Extract Text
    if (node.semanticType === 'Text' && 'text' in node && node.text) {
      const textNode = node as any;
      const contentKey = `${nodeName}|text|${textNode.text}`;
      
      if (contentMap.has(contentKey)) {
        node.propName = contentMap.get(contentKey);
      } else {
        let propName = toValidIdentifier(nodeName);
        
        // Semantic heuristics
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
    }

    // 3. Extract Images
    if (node.semanticType === 'Image') {
      const imageNode = node as any;
      const contentKey = `${nodeName}|image|${imageNode.imageRef || ''}`;

      if (contentMap.has(contentKey)) {
        node.propName = contentMap.get(contentKey);
      } else {
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
    }

    // 4. Recurse into children
    if ('children' in node) {
      node.children.forEach((child, idx) => {
        traverse(child, depth + 1, path.concat(`child${idx}`));
      });
    }
  }

  traverse(root, 0);
  return { props };
}
