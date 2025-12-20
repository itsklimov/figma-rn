/**
 * Component Builder - Orchestrate generation of complete TSX component
 * Supports both single-file and multi-file output with detection hints
 */

import type { ScreenIR, DesignTokens, IRNode, ComponentIR, StylesBundle, RepeaterIR, TextIR, ImageIR } from '../types.js';
import type { TokenMappings } from '../mapping/token-matcher.js';
import type { DetectionResult, ComponentHint, ListHint } from '../detection/types.js';
import { buildImports, type ImportConfig } from './imports-builder.js';
import { buildJSX } from './jsx-builder.js';
import { buildStyles } from './styles-builder.js';
import { generateFlatList, generateItemComponent } from './list-generator.js';
import { generateTokensIfNeeded } from './tokens-generator.js';
import { toValidIdentifier } from './utils.js';
import { extractProps } from './prop-extractor.js';

/**
 * Result of component generation
 */
export interface GenerationResult {
  /** Complete TSX file content */
  code: string;
  /** Tokens that couldn't be mapped to theme */
  unmappedTokens: {
    colors: string[];
    spacing: number[];
    radii: number[];
  };
}

/**
 * Options for component generation
 */
export interface GenerationOptions {
  /** Override component name (default: derived from screen name) */
  componentName?: string;
  /** Detection hints for quality improvements */
  detectionResult?: DetectionResult;
  /** Whether a project theme file exists */
  hasProjectTheme?: boolean;
  /** Output directory for generated files */
  outputDir?: string;
  /** Mapping from imageRef to local file path */
  imagePathMap?: Map<string, string>;
  /** Theme import path (e.g., '@app/styles/theme') */
  themeImportPath?: string;
  /** Assets import prefix (e.g., '@assets') */
  assetsPrefix?: string;
  /** Suppress TODO comments in output (default: false) */
  suppressTodos?: boolean;
  /** Responsive scaling function name (e.g., 'scale') */
  scaleFunction?: string;
  /** Style pattern: useTheme or StyleSheet */
  stylePattern?: 'useTheme' | 'StyleSheet';
  /** Path to useTheme hook if discovered */
  useThemeHookPath?: string;
  /** Import prefix from tsconfig (e.g., '@app') */
  importPrefix?: string;
}

/**
 * Single generated file
 */
export interface GeneratedFile {
  /** Relative path for the file */
  path: string;
  /** File content */
  content: string;
}

/**
 * Multi-file generation result
 */
export interface MultiFileResult {
  /** Main screen component */
  mainComponent: GeneratedFile;
  /** Extracted sub-components */
  extractedComponents: GeneratedFile[];
  /** Generated tokens file (if no project theme) */
  tokens: GeneratedFile | null;
  /** Tokens that couldn't be mapped */
  unmappedTokens: {
    colors: string[];
    spacing: number[];
    radii: number[];
  };
}

/**
 * Convert string to PascalCase for component names
 */
function toPascalCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
    .replace(/^[a-z]/, (chr) => chr.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '');
}

/**
 * Assemble complete TSX file from parts
 */
function assembleComponent(
  imports: string,
  componentName: string,
  jsx: string,
  styles: string
): string {
  return `${imports}

export function ${componentName}() {
  return (
${jsx}
  );
}

${styles}
`;
}

/**
 * Generate a complete React Native component from ScreenIR
 *
 * @param screen - ScreenIR from transformation pipeline
 * @param mappings - Token mappings from mapping layer
 * @param options - Generation options
 * @returns Generated code and unmapped tokens report
 *
 * @example
 * ```typescript
 * import { transformToScreenIR } from '../pipeline.js';
 * import { extractProjectTokens, matchTokens } from '../mapping/index.js';
 * import { generateComponent } from '../generation/index.js';
 *
 * // Transform Figma node to ScreenIR
 * const screenIR = transformToScreenIR(figmaNode);
 *
 * // Extract project tokens and create mappings
 * const projectTokens = extractProjectTokens(themeFileContent);
 * const mappings = matchTokens(screenIR.stylesBundle.tokens, projectTokens);
 *
 * // Generate component
 * const result = generateComponent(screenIR, mappings);
 * console.log(result.code);
 * ```
 */
export function generateComponent(
  screen: ScreenIR,
  mappings: TokenMappings,
  options?: GenerationOptions
): GenerationResult {
  // 1. Resolve component name and root props
  const componentName = options?.componentName || toPascalCase(screen.name) || 'GeneratedComponent';
  const { props: rootProps } = extractProps(screen.root);
  const rootPropsList = Object.keys(rootProps);
  
  // Generate props interface for the main component
  let rootPropsInterface = '';
  let rootPropsDestructure = '';
  if (rootPropsList.length > 0) {
    const propLines = Object.entries(rootProps).map(([name, config]: [string, any]) => {
      const type = config.type === 'image' ? 'ImageSourcePropType' : 'string';
      return `  /** Default: "${config.defaultValue}" */\n  ${name}: ${type};`;
    });
    const interfaceName = `${componentName}Props`;
    rootPropsInterface = `interface ${interfaceName} {\n${propLines.join('\n')}\n}\n\n`;
    
    // Destructured props with defaults
    const destructureParts = Object.entries(rootProps).map(([name, config]: [string, any]) => {
      const defaultVal = config.defaultValue ? ` = "${config.defaultValue.replace(/"/g, '\\"')}"` : '';
      return `${name}${defaultVal}`;
    });
    rootPropsDestructure = `{ ${destructureParts.join(', ')} }: ${interfaceName}`;
  }

  // 2. Prepare list overrides and extras
  const jsxOverrides = new Map<string, string>();
  const listExtras = {
    imports: new Set<string>(),
    types: [] as string[],
    data: [] as string[],
    renderItems: [] as string[],
    subComponents: [] as string[],
    repeaterContent: [] as string[],
  };

  // 2.6 Process Repeaters (Update tree and collect parts)
  const repeaters = collectRepeaters(screen.root);
  const usedRepeaterNames = new Set<string>();
  for (const repeater of repeaters) {
    const { dataConstant, itemComponent, typeDefinition } = generateRepeaterParts(repeater, mappings, options, usedRepeaterNames);
    listExtras.data.push(dataConstant);
    listExtras.types.push(typeDefinition);
    listExtras.subComponents.push(itemComponent);
  }

  // 7. Collect and generate sub-components
  const components = collectComponents(screen.root);
  let needsImageSourcePropType = false;
  const subComponentsCodeParts: string[] = [];
  
  for (const comp of components) {
    const code = generateSubComponent(comp, mappings, options);
    if (code.includes('ImageSourcePropType')) {
      needsImageSourcePropType = true;
    }
    subComponentsCodeParts.push(code);
  }
  
  const subComponentsCode = subComponentsCodeParts.join('\n\n');

  // 3. Build imports from IR tree
  const extraRNImports: string[] = [];
  if (listExtras.imports.has('FlatList')) extraRNImports.push('FlatList');
  if (needsImageSourcePropType) extraRNImports.push('ImageSourcePropType');
  
  // Check for SVG usage in paths
  if (options?.imagePathMap) {
    for (const path of options.imagePathMap.values()) {
      if (path.toLowerCase().endsWith('.svg')) {
        extraRNImports.push('SvgIcon');
        break;
      }
    }
  }

  // Build ImportConfig from options
  const importConfig: ImportConfig | undefined = options ? {
    importPrefix: options.importPrefix || '@app',
    useThemeHookPath: options.useThemeHookPath,
    themeImportPath: options.themeImportPath,
    stylePattern: options.stylePattern || 'StyleSheet',
    hasProjectTheme: options.hasProjectTheme ?? false,
  } : undefined;

  const imports = buildImports(screen.root, extraRNImports, screen.stylesBundle, importConfig);

  // 4. Build JSX from IR tree (indented for return statement)
  const jsx = buildJSX(screen.root, 2, options?.imagePathMap, jsxOverrides, screen.stylesBundle, mappings);

  // Fix #8: Extract used style names from JSX for tree-shaking
  const usedStyles = new Set<string>();
  const styleRefPattern = /styles\.([a-zA-Z0-9_]+)/g;
  let styleMatch;
  while ((styleMatch = styleRefPattern.exec(jsx)) !== null) {
    usedStyles.add(styleMatch[1]);
  }

  // 5. Build StyleSheet from StylesBundle with mappings
  const { code: stylesCode, unmapped } = buildStyles(
    screen.root,
    screen.stylesBundle,
    mappings,
    { 
      usedStyles,
      suppressTodos: options?.suppressTodos,
      scaleFunction: options?.scaleFunction
    }
  );

  // 6. Theme access is via useTheme() hook - no additional imports needed
  // Token paths are prefixed with 'theme.' (e.g., theme.spacing.md, theme.color.primary)
  let finalImports = imports;
  
  // Add ImageSourcePropType to imports if needed by root props
  if (Object.values(rootProps).some((p: any) => p.type === 'image') && !finalImports.includes('ImageSourcePropType')) {
    if (finalImports.includes('import {')) {
       finalImports = finalImports.replace(/import { ([^}]+) } from 'react-native';/, "import { $1, ImageSourcePropType } from 'react-native';");
    } else {
       finalImports = `import { ImageSourcePropType } from 'react-native';\n${finalImports}`;
    }
  }


  // Combine list sub-components
  // Fix #7: Filter to only include components that are actually referenced in JSX
  const allGeneratedComponents = [
    subComponentsCode,
    ...listExtras.subComponents
  ].filter(Boolean);
  
  // Extract component names used in JSX (matches <ComponentName or <ComponentName>)
  const usedComponentNames = new Set<string>();
  const componentRefPattern = /<([A-Z][a-zA-Z0-9]*)/g;
  let match;
  while ((match = componentRefPattern.exec(jsx)) !== null) {
    usedComponentNames.add(match[1]);
  }
  // Also check in renderItem functions
  for (const fn of listExtras.renderItems) {
    while ((match = componentRefPattern.exec(fn)) !== null) {
      usedComponentNames.add(match[1]);
    }
  }
  
  // Filter sub-components to only include used ones
  const allSubComponents = allGeneratedComponents.filter(code => {
    // Extract function name from "function ComponentName(" or "export function ComponentName("
    const funcMatch = code.match(/(?:export\s+)?function\s+([A-Z][a-zA-Z0-9]*)\s*\(/);
    if (!funcMatch) return true; // Keep if we can't parse the name
    return usedComponentNames.has(funcMatch[1]);
  }).join('\n\n');

  // 8. Assemble final component file in standard order:
  // 1. Imports
  // 2. Interfaces/Types
  // 3. Shared Data (Constants)
  // 4. Utility/Sub-components
  // 5. Main Component
  // 6. Styles
  
  const additionalTypes = listExtras.types.join('\n\n');
  const additionalData = listExtras.data.join('\n\n');
  const renderItems = listExtras.renderItems.map(fn => fn.replace(/^ {2}/, '')).join('\n\n');

  const bodyContent = `  return (\n${jsx}\n  );`;
  const themeHook = jsx.includes('theme.') && options?.hasProjectTheme 
    ? '  const { theme } = useTheme();\n\n' 
    : '';

  let code = `${finalImports}

${rootPropsInterface}
${additionalTypes}

${additionalData}

${allSubComponents}

${renderItems}

export function ${componentName}(${rootPropsDestructure}) {
${themeHook}${bodyContent}
}

${stylesCode}
`;

  // Clean up extra double newlines
  code = code.replace(/\n{3,}/g, '\n\n');

  return {
    code,
    unmappedTokens: unmapped,
  };
}

/**
 * Collect all unique Component nodes from the tree
 */
function collectComponents(root: IRNode): ComponentIR[] {
  const components = new Map<string, ComponentIR>();

  function walk(node: IRNode) {
    if (node.semanticType === 'Component') {
      // Use componentName as key to deduplicate
      if (!components.has(node.componentName)) {
        components.set(node.componentName, node as ComponentIR);
      }
      // Components might have children that are also components (nested instances)
      // But usually we don't want to extract children OF the component instance if they are overrides?
      // For now, let's assume we want to find nested components too.
      // But wait, if we render <Component />, we don't render its children in the parent JSX.
      // The children effectively belong to the Component definition.
      // So we MUST walk inside the component to find *other* components it relies on.
    }
    
    if ('children' in node) {
      for (const child of node.children) {
        walk(child);
      }
    }
  }

  walk(root);
  return Array.from(components.values());
}

/**
 * Collect all Repeater nodes from the tree
 */
function collectRepeaters(root: IRNode): RepeaterIR[] {
  const repeaters: RepeaterIR[] = [];

  function walk(node: IRNode) {
    if (node.semanticType === 'Repeater') {
      repeaters.push(node as RepeaterIR);
    }
    
    if ('children' in node) {
      for (const child of node.children) {
        walk(child);
      }
    }
  }

  walk(root);
  return repeaters;
}

/**
 * Generate all parts for a repeater (Data, Types, Component)
 */
function generateRepeaterParts(
  repeater: RepeaterIR,
  mappings: TokenMappings,
  options?: GenerationOptions,
  usedNames?: Set<string>
) {
  // 0. Ensure unique names to avoid collisions in single-file output
  if (usedNames) {
    const baseItemName = repeater.itemComponentName;
    const baseDataPropName = repeater.dataPropName;
    let counter = 1;
    let currentItemName = baseItemName;
    let currentDataName = baseDataPropName;
    
    while (usedNames.has(currentItemName)) {
      counter++;
      currentItemName = `${baseItemName}${counter}`;
      currentDataName = `${baseDataPropName}${counter}`;
    }
    
    repeater.itemComponentName = currentItemName;
    repeater.dataPropName = currentDataName;
    usedNames.add(currentItemName);
  }

  // Update the dataPropName used in JSX to refer to the local constant
  let dataConstantName = repeater.dataPropName;
  if (!dataConstantName.endsWith('_DATA')) {
    // If it doesn't end with _DATA, it might be a collision-indexed name like MASTERIMAGE_DATA2
    // We want it to be MASTERIMAGE2_DATA or similar
    const cleanBase = dataConstantName.replace(/_DATA\d*$/, '').toUpperCase();
    const match = dataConstantName.match(/\d+$/);
    const suffix = match ? match[0] : '';
    dataConstantName = `${cleanBase}${suffix}_DATA`;
  }
  repeater.dataPropName = dataConstantName;

  // 1. Identify dynamic fields by comparing children (simple version: extract all text/image as props)
  const template = repeater.children[0];
  const { props: templateProps } = extractProps(template);
  
  // 2. Build data array with normalized items (all props from template)
  const dataItems = repeater.children.map(child => {
    const { props: childProps } = extractProps(child);
    const itemData: Record<string, string> = {};
    
    // Ensure every prop from template is present in the data item
    for (const propName of Object.keys(templateProps)) {
      itemData[propName] = childProps[propName]?.value || templateProps[propName]?.defaultValue || '';
    }
    return itemData;
  });

  const dataConstant = `const ${dataConstantName} = ${JSON.stringify(dataItems, null, 2)};`;

  // 3. Generate Item Component
  const itemCompIR: ComponentIR = {
    ...template,
    semanticType: 'Component',
    componentName: repeater.itemComponentName,
    props: templateProps,
  } as any;
  
  const itemComponent = generateSubComponent(itemCompIR, mappings, options);

  // 4. Type definition
  const propLines = Object.entries(templateProps).map(([name, config]: [string, any]) => {
     const type = config.type === 'image' ? 'ImageSourcePropType' : 'string';
     return `  ${name}: ${type};`;
  });
  const typeDefinition = `interface ${repeater.itemComponentName}Props {\n${propLines.join('\n')}\n}`;

  return { dataConstant, itemComponent, typeDefinition };
}

/**
 * Generate code for an internal sub-component
 */
function generateSubComponent(
  component: ComponentIR, 
  mappings?: TokenMappings,
  options?: GenerationOptions
): string {
  // We treat the component root as a Container/View for its internal structure
  // The buildJSX will recurse into its children to build the tree.
  // However, buildJSX expects to render "Component" nodes as <Name />.
  // We need to temporarily "unwrap" the component semantic type for its own definition?
  // NO. The ComponentIR *is* the root of the component.
  // If we pass it to buildJSX, it will return <ComponentName /> which is infinite recursion.
  
  // solution: pass the children to buildJSX wrapped in a View (since Component acts as a View)
  // OR: create a temporary ContainerIR that represents the implementation.
  
  // Optimize: Check if the component wraps a single child with the same name/structure
  // This often happens in Figma (Instance -> Frame with same name)
  let implementationNode: IRNode = {
    ...component,
    semanticType: 'Container',
  } as any;

  if (component.children && component.children.length === 1) {
    const child = component.children[0];
    const isRedundant = 
      child.name === component.name || 
      child.name === component.componentName ||
      (child.boundingBox.width === component.boundingBox.width && child.boundingBox.height === component.boundingBox.height);
      
    if (isRedundant) {
      // Use the child as the root for implementation
      implementationNode = child;
    }
  } 

  // Ensure component has props extracted from its own sub-tree
  // We use extractProps again here to populate component.props and set propName on children
  const { props: extractedProps } = extractProps(implementationNode);
  const componentWithProps = { ...component, props: extractedProps };

  // Generate props interface
  let propsInterface = '';
  let propsType = '';
  let propsDestructure = '';
  
  if (Object.keys(extractedProps).length > 0) {
    const propLines = Object.entries(extractedProps).map(([name, config]: [string, any]) => {
      const type = config.type === 'image' ? 'ImageSourcePropType' : 'string';
      return `  /** Default: "${config.defaultValue}" */\n  ${name}: ${type};`;
    });
    
    const interfaceName = `${component.componentName}Props`;
    propsInterface = `interface ${interfaceName} {\n${propLines.join('\n')}\n}\n\n`;
    propsType = interfaceName;
    
    // Destructured props for the signature
    const destructureParts = Object.entries(extractedProps).map(([name, config]: [string, any]) => {
      const defaultVal = config.defaultValue ? ` = "${config.defaultValue.replace(/"/g, '\\"')}"` : '';
      return `${name}${defaultVal}`;
    });
    propsDestructure = `{ ${destructureParts.join(', ')} }: ${interfaceName}`;
  } else {
    // Fallback if no props extracted
    propsDestructure = '{}'; // Use empty object instead of any
  }

  // We use indent 1 because it's inside a function
  const jsx = buildJSX(implementationNode, 2, options?.imagePathMap, undefined, undefined, mappings);
  
  // Generate function signature based on props
  let funcSignature: string;
  if (component.props && Object.keys(component.props).length > 0) {
    // Destructure props with default values
    const propsWithDefaults = Object.entries(component.props)
      .map(([name, config]: [string, any]) => {
        const defaultVal = config.defaultValue ? ` = "${config.defaultValue.replace(/"/g, '\\"')}"` : '';
        return `${name}${defaultVal}`;
      })
      .join(', ');
    funcSignature = `{ ${propsWithDefaults} }: ${propsType}`;
  } else {
    // No props - use empty signature
    funcSignature = '';
  }

  return `${propsInterface}function ${component.componentName}(${propsDestructure}) {
  return (
${jsx}
  );
}`;
}

/**
 * Find a node by ID in the IR tree
 * Includes cycle detection to prevent infinite recursion
 */
function findNodeById(node: any, id: string, visited: Set<string> = new Set()): any {
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
 * Generate multi-file output with detection hints
 *
 * @param screen - ScreenIR from transformation pipeline
 * @param mappings - Token mappings from mapping layer
 * @param options - Generation options including detection hints
 * @returns Multi-file result with main component, extracted components, and tokens
 *
 * @example
 * ```typescript
 * import { transformToScreenIR } from '../pipeline.js';
 * import { runDetectors } from '../detection/index.js';
 * import { generateComponentMultiFile } from '../generation/index.js';
 *
 * const screenIR = transformToScreenIR(figmaNode);
 * const detectionResult = runDetectors(screenIR.root);
 *
 * const result = generateComponentMultiFile(screenIR, mappings, {
 *   detectionResult,
 *   hasProjectTheme: false,
 * });
 *
 * // Write files
 * for (const file of [result.mainComponent, ...result.extractedComponents]) {
 *   writeFile(file.path, file.content);
 * }
 * ```
 */
export function generateComponentMultiFile(
  screen: ScreenIR,
  mappings: TokenMappings,
  options?: GenerationOptions
): MultiFileResult {
  const componentName = options?.componentName || toPascalCase(screen.name) || 'GeneratedComponent';
  const outputDir = options?.outputDir || 'components';
  const detection = options?.detectionResult;
  const hasProjectTheme = options?.hasProjectTheme ?? true;

  const extractedComponents: GeneratedFile[] = [];

  // Generate extracted components from repetition hints
  if (detection?.components) {
    for (const hint of detection.components) {
      // Find the first instance to use as template
      const templateNode = findNodeById(screen.root, hint.instanceIds[0]);
      if (templateNode) {
        const componentCode = generateExtractedComponent(
          hint,
          templateNode,
          screen.stylesBundle,
          mappings,
          options?.imagePathMap
        );
        extractedComponents.push({
          path: `${outputDir}/${hint.componentName}.tsx`,
          content: componentCode,
        });
      }
    }
  }

  // Generate item components from list hints
  if (detection?.lists) {
    for (const hint of detection.lists) {
      const containerNode = findNodeById(screen.root, hint.containerId);
      if (containerNode && containerNode.children?.length > 0) {
        const templateItem = containerNode.children[0];
        const itemCode = generateItemComponent(
          hint, 
          templateItem, 
          (n, i) => buildJSX(n, i, options?.imagePathMap, undefined, screen.stylesBundle, mappings)
        );
        extractedComponents.push({
          path: `${outputDir}/${hint.itemType}Component.tsx`,
          content: `import React from 'react';\nimport { View, Text, StyleSheet } from 'react-native';\n\n${itemCode}\n\nconst styles = StyleSheet.create({\n  // TODO: Add styles\n});\n`,
        });
      }
    }
  }

  // Generate main component (basic version for now)
  const basicResult = generateComponent(screen, mappings, options);

  // Generate tokens if needed
  let tokens: GeneratedFile | null = null;
  const tokensResult = generateTokensIfNeeded(
    screen.stylesBundle.tokens,
    hasProjectTheme,
    outputDir
  );
  if (tokensResult) {
    tokens = {
      path: tokensResult.path,
      content: tokensResult.content,
    };
  }

  return {
    mainComponent: {
      path: `${outputDir}/${componentName}.tsx`,
      content: basicResult.code,
    },
    extractedComponents,
    tokens,
    unmappedTokens: basicResult.unmappedTokens,
  };
}

/**
 * Generate code for an extracted component
 */
function generateExtractedComponent(
  hint: ComponentHint,
  templateNode: IRNode,
  stylesBundle: StylesBundle,
  mappings: TokenMappings,
  imagePathMap?: Map<string, string>
): string {
  const { componentName, propsVariations } = hint;

  // Generate props interface
  const propsEntries = Object.entries(propsVariations)
    .map(([key]) => `  ${key}?: string;`)
    .join('\n');

  const propsInterface = propsEntries
    ? `interface ${componentName}Props {\n${propsEntries}\n}\n\n`
    : '';

  const propsParam = propsEntries ? `props: ${componentName}Props` : '';

  // Build imports from template node
  const imports = buildImports(templateNode);

  // Build JSX from template node
  const jsx = buildJSX(templateNode, 2, imagePathMap, undefined, stylesBundle, mappings);

  // Build styles from template node
  const { code: stylesCode } = buildStyles(templateNode, stylesBundle, mappings);

  return `${imports}

${propsInterface}export function ${componentName}(${propsParam}) {
  return (
${jsx}
  );
}

${stylesCode}
`;
}
