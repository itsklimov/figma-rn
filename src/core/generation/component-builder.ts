/**
 * Component Builder - Orchestrate generation of complete TSX component
 * Supports both single-file and multi-file output with detection hints
 */

import type { ScreenIR, DesignTokens } from '../types.js';
import type { TokenMappings } from '../mapping/token-matcher.js';
import type { DetectionResult, ComponentHint, ListHint } from '../detection/types.js';
import { buildImports } from './imports-builder.js';
import { buildJSX } from './jsx-builder.js';
import { buildStyles } from './styles-builder.js';
import { generateFlatList, generateItemComponent } from './list-generator.js';
import { generateTokensIfNeeded } from './tokens-generator.js';

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
  // 1. Derive component name
  const componentName = options?.componentName || toPascalCase(screen.name) || 'GeneratedComponent';

  // 2. Build imports from IR tree
  const imports = buildImports(screen.root);

  // 3. Build JSX from IR tree (indented for return statement)
  const jsx = buildJSX(screen.root, 2);

  // 4. Build StyleSheet from StylesBundle with mappings
  const { code: stylesCode, unmapped } = buildStyles(
    screen.root,
    screen.stylesBundle,
    mappings
  );

  // 5. Assemble final component file
  const code = assembleComponent(imports, componentName, jsx, stylesCode);

  return {
    code,
    unmappedTokens: unmapped,
  };
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
        const componentCode = generateExtractedComponent(hint, templateNode);
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
        const itemCode = generateItemComponent(hint, templateItem);
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
 * Note: templateNode is reserved for future full implementation (currently generates placeholder)
 */
function generateExtractedComponent(hint: ComponentHint, _templateNode: any): string {
  const { componentName, propsVariations } = hint;

  // Generate props interface
  const propsEntries = Object.entries(propsVariations)
    .map(([key]) => `  ${key}?: string;`)
    .join('\n');

  const propsInterface = propsEntries
    ? `interface ${componentName}Props {\n${propsEntries}\n}\n\n`
    : '';

  const propsParam = propsEntries ? `props: ${componentName}Props` : '';

  return `import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

${propsInterface}export function ${componentName}(${propsParam}) {
  return (
    <View style={styles.container}>
      {/* TODO: Implement ${componentName} */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // TODO: Add styles from original node
  },
});
`;
}
