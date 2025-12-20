/**
 * Batch multi-screen generation from Figma
 *
 * Generates multiple screens in parallel, creates shared types,
 * supports consistent naming and imports, generates barrel exports
 */

import { fetchFigmaNodes } from './figma-api-client.js';
import { generateReactNativeComponent } from './code-generator-v2.js';
import { loadProjectConfig } from './config-loader.js';
import { ProjectConfig } from './config-schema.js';
import { autoGenerateColorMappings, extractFigmaColors } from './auto-theme-mapper.js';
import { updateConfigMappings } from './config-updater.js';
import * as prettier from 'prettier';

/**
 * Input data for a single screen in batch
 */
export interface BatchScreenInput {
  figmaUrl: string;

  screenName: string;

  /** Optional output file path */
  outputPath?: string;
}

/**
 * Batch generation input
 */
export interface BatchInput {
  /** Screens array for generation */
  screens: BatchScreenInput[];

  sharedTypesPath?: string;

  /** Generate navigation types */
  generateNavigation?: boolean;

  /** Generate index.ts barrel export */
  generateIndex?: boolean;
}

/**
 * Single screen generation result
 */
export interface BatchScreenResult {
  /** Screen name */
  screenName: string;

  /** Generated code */
  code: string;

  /** Output path */
  outputPath: string;

  /** Generation status */
  status: 'success' | 'error';

  error?: string;

  /** Extracted data types from screen */
  extractedTypes?: ExtractedType[];
}

/**
 * Batch generation result
 */
export interface BatchResult {
  /** Screen generation results */
  screens: BatchScreenResult[];

  sharedTypes?: string;

  navigationTypes?: string;

  indexFile?: string;

  /** Generation summary */
  summary: {
    /** Total screens */
    total: number;

    /** Successfully generated */
    successful: number;

    /** Generation errors */
    failed: number;

    duration: number;
  };
}

/**
 * Extracted type from screen
 */
export interface ExtractedType {
  /** Type name */
  name: string;

  /** TypeScript type definition */
  definition: string;

  /** Usage frequency */
  frequency: number;
}

/**
 * Main batch generation function
 *
 * Generates multiple screens in parallel with shared types and mappings
 *
 */
export async function generateBatch(
  input: BatchInput,
  figmaToken: string
): Promise<BatchResult> {
  const startTime = Date.now();


  // Load project config once for all screens
  const config = await loadProjectConfig() || getDefaultConfig();

  // Generation results
  const screenResults: BatchScreenResult[] = [];

  // Collect all colors from all screens for unified theme mapping
  const allFigmaColors = new Set<string>();

  // Phase 1: Parallel metadata fetching from Figma

  const fetchPromises = input.screens.map(async (screen) => {
    try {
      const { fileKey, nodeId } = parseFigmaUrl(screen.figmaUrl);
      const response = await fetchFigmaNodes(figmaToken, fileKey, [nodeId]);
      const node = response.nodes[nodeId]?.document;

      if (!node) {
        throw new Error(`Node ${nodeId} not found in file ${fileKey}`);
      }

      // Extract colors from node
      const colors = extractFigmaColors(node);
      colors.forEach((color) => allFigmaColors.add(color));


      return { screen, node, fileKey, nodeId };
    } catch (error) {
      return { screen, error: error instanceof Error ? error.message : String(error) };
    }
  });

  const fetchedData = await Promise.all(fetchPromises);

  // Phase 2: Generate unified theme mapping for all screens

  if (allFigmaColors.size > 0 && config.theme?.location) {
    const colorMappings = await autoGenerateColorMappings(
      Array.from(allFigmaColors),
      config
    );

    if (!config.mappings) config.mappings = {};
    config.mappings.colors = colorMappings;

    // Save mappings to .figmarc.json for reuse
    await updateConfigMappings({ colors: colorMappings });

  }

  // Phase 3: Parallel code generation for all screens

  const generatePromises = fetchedData.map(async (data) => {
    const { screen } = data;

    if ('error' in data) {
      // Metadata fetch error
      return {
        screenName: screen.screenName,
        code: '',
        outputPath: screen.outputPath || `${screen.screenName}.tsx`,
        status: 'error' as const,
        error: data.error,
      };
    }

    try {
      const { node } = data;

      // Generate screen code with shared config
      const code = await generateReactNativeComponent(node, screen.screenName, config);

      // Extract types from generated code
      const extractedTypes = extractTypesFromCode(code, screen.screenName);


      return {
        screenName: screen.screenName,
        code,
        outputPath: screen.outputPath || `${screen.screenName}.tsx`,
        status: 'success' as const,
        extractedTypes,
      };
    } catch (error) {

      return {
        screenName: screen.screenName,
        code: '',
        outputPath: screen.outputPath || `${screen.screenName}.tsx`,
        status: 'error' as const,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  const results = await Promise.all(generatePromises);
  screenResults.push(...results);

  // Phase 4: Generate shared types (if requested)
  let sharedTypes: string | undefined;
  if (input.sharedTypesPath) {

    const allExtractedTypes = screenResults
      .filter((r) => r.status === 'success' && r.extractedTypes)
      .flatMap((r) => r.extractedTypes!);

    sharedTypes = generateSharedTypes(results, allExtractedTypes);
  }

  // Phase 5: Generate navigation types (if requested)
  let navigationTypes: string | undefined;
  if (input.generateNavigation) {

    const screenNames = input.screens.map((s) => s.screenName);
    navigationTypes = generateNavigationTypes(screenNames);
  }

  // Phase 6: Generate barrel export (if requested)
  let indexFile: string | undefined;
  if (input.generateIndex) {

    const successfulScreens = screenResults
      .filter((r) => r.status === 'success')
      .map((r) => r.screenName);

    indexFile = generateBarrelExport(successfulScreens);
  }

  // Calculate statistics
  const successful = screenResults.filter((r) => r.status === 'success').length;
  const failed = screenResults.filter((r) => r.status === 'error').length;
  const duration = Date.now() - startTime;

  console.error('[BATCH] ═══════════════════════════════════════');
  console.error('[BATCH] ═══════════════════════════════════════');

  return {
    screens: screenResults,
    sharedTypes,
    navigationTypes,
    indexFile,
    summary: {
      total: input.screens.length,
      successful,
      failed,
      duration,
    },
  };
}

/**
 * Generates shared types for use across screens
 *
 * @returns Shared types file code
 */
export function generateSharedTypes(
  screens: BatchScreenResult[],
  models: ExtractedType[]
): string {
  let code = '';
  // Group types by name and count frequency
  const typeMap = new Map<string, { definition: string; frequency: number }>();

  models.forEach((model) => {
    const existing = typeMap.get(model.name);
    if (existing) {
      existing.frequency += model.frequency;
    } else {
      typeMap.set(model.name, {
        definition: model.definition,
        frequency: model.frequency,
      });
    }
  });

  // Sort types by frequency (most frequent first)
  const sortedTypes = Array.from(typeMap.entries())
    .sort((a, b) => b[1].frequency - a[1].frequency);


  // Common data types
  sortedTypes.forEach(([name, data]) => {
    code += `${data.definition}\n\n`;
  });

  // Additional utility types
  code += `export type ScreenName = ${screens.map((s) => `'${s.screenName}'`).join(' | ')};\n\n`;

  return code;
}

/**
 * Generates barrel export (index.ts) for all screens
 *
 * @returns Barrel export file code
 */
export function generateBarrelExport(screenNames: string[]): string {
  let code = '';
  screenNames.forEach((name) => {
    code += `export { default as ${name} } from './${name}';\n`;
  });

  code += `\n// Re-export shared types\nexport * from './types/shared';\n`;

  return code;
}

/**
 * Generates navigation types for React Navigation
 *
 * @returns Navigation types code
 */
export function generateNavigationTypes(screenNames: string[]): string {
  let code = '';
  code += `import type { NavigatorScreenParams } from '@react-navigation/native';\n\n`;

  // Root Stack params
  code += `export type RootStackParamList = {\n`;
  screenNames.forEach((name) => {
    // Remove "Screen" from name for route name
    const routeName = name.replace(/Screen$/, '');
    code += `  ${routeName}: undefined; // TODO: Add params if needed\n`;
  });
  code += `};\n\n`;

  // Types for navigation prop
  code += `// Types for useNavigation hook\n`;
  code += `import type { StackNavigationProp } from '@react-navigation/stack';\n\n`;

  screenNames.forEach((name) => {
    const routeName = name.replace(/Screen$/, '');
    code += `export type ${name}NavigationProp = StackNavigationProp<RootStackParamList, '${routeName}'>;\n`;
  });

  code += `// Types for route prop\n`;
  code += `import type { RouteProp } from '@react-navigation/native';\n\n`;

  screenNames.forEach((name) => {
    const routeName = name.replace(/Screen$/, '');
    code += `export type ${name}RouteProp = RouteProp<RootStackParamList, '${routeName}'>;\n`;
  });

  return code;
}

/**
 * Extracts data types from generated code
 *
 *
 * @param code - Generated component code
 * @returns Extracted types array
 */
function extractTypesFromCode(code: string, screenName: string): ExtractedType[] {
  const types: ExtractedType[] = [];

  // Patterns for data type detection

  // User type - if there are people names or avatars
  const hasUserData = code.includes('avatar') || code.includes('Avatar');

  if (hasUserData) {
    types.push({
      name: 'User',
      definition: `export interface User {\n  id: string;\n  name: string;\n  avatar?: string;\n}`,
      frequency: 1,
    });
  }

  // Product type - if there are prices or product names
  const hasProductData = /\d+\s*₽/.test(code) || /\d+\s*000\s*₽/.test(code);

  if (hasProductData) {
    types.push({
      name: 'Product',
      definition: `export interface Product {\n  id: string;\n  name: string;\n  price: number;\n  image?: string;\n}`,
      frequency: 1,
    });
  }

  // Post/Content type - if there is text content
  const hasContentData = code.includes('characters') && code.length > 1000;

  if (hasContentData) {
    types.push({
      name: 'Post',
      definition: `export interface Post {\n  id: string;\n  title: string;\n  content: string;\n  date: string;\n  author: User;\n}`,
      frequency: 1,
    });
  }

  // Badge/Level type - if there are numeric values in badges
  const hasBadgeData = code.includes('badge') && /\{\d+\}/.test(code);

  if (hasBadgeData) {
    types.push({
      name: 'Badge',
      definition: `export interface Badge {\n  id: string;\n  level: number;\n  label: string;\n}`,
      frequency: 1,
    });
  }

  return types;
}

/**
 * Parses Figma URL and extracts file key and node ID
 *
 * @param figmaUrl - Figma URL
 */
function parseFigmaUrl(figmaUrl: string): { fileKey: string; nodeId: string } {
  const urlMatch = figmaUrl.match(/figma\.com\/(?:file|design)\/([^/?]+)/);
  if (!urlMatch) {
    throw new Error(`Invalid Figma URL: ${figmaUrl}`);
  }
  const fileKey = urlMatch[1];

  const nodeMatch = figmaUrl.match(/node-id=([^&]+)/);
  if (!nodeMatch) {
    throw new Error(`Invalid Node ID in Figma URL: ${figmaUrl}`);
  }
  const nodeId = nodeMatch[1].replace(/-/g, ':');

  return { fileKey, nodeId };
}

/**
 * Returns default configuration
 */
function getDefaultConfig(): ProjectConfig {
  return {
    framework: 'react-native',
    codeStyle: {
      stylePattern: 'StyleSheet',
      scaleFunction: 'scale',
      importPrefix: ''
    }
  };
}
