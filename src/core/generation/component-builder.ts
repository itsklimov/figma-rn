/**
 * Component Builder - Orchestrate generation of complete TSX component
 */

import type { ScreenIR } from '../types.js';
import type { TokenMappings } from '../mapping/token-matcher.js';
import { buildImports } from './imports-builder.js';
import { buildJSX } from './jsx-builder.js';
import { buildStyles } from './styles-builder.js';

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
