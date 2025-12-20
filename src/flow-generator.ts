/**
 * Complete app flow generator
 *
 * Generates multiple screens with navigation, shared types, and barrel exports in ONE call
 */

import { fetchFigmaNodes } from './figma-api-client.js';
import { generateReactNativeComponent } from './code-generator-v2.js';
import { loadProjectConfig } from './config-loader.js';
import { ProjectConfig } from './config-schema.js';
import { autoGenerateColorMappings, extractFigmaColors } from './auto-theme-mapper.js';
import { updateConfigMappings } from './config-updater.js';
import {
  analyzeNavigationStructure,
  generateNavigationTypes,
  generateNavigatorCode,
  NavigationStructure,
  FigmaScreen as NavFigmaScreen,
} from './navigation-generator.js';
import {
  generateSharedTypes as generateSharedTypesCode,
  generateBarrelExport,
  ExtractedType,
} from './batch-generator.js';
import {
  inferDataModels,
  generateTypeDefinitions,
  generateReactQueryHooks,
  DataModel,
} from './data-model-generator.js';
import * as prettier from 'prettier';

/**
 * Flow screen interface
 */
export interface FlowScreen {
  figmaUrl: string;

  screenName: string;

  /** Optional output file path */
  outputPath?: string;
}

/**
 * Detection results for screen patterns
 */
export interface DetectionResults {
  /** Detected data models */
  dataModels: DataModel[];

  /** Detected navigation elements */
  navigationElements: string[];

  screenType: string;

  /** Entity name */
  entityName: string;
}

/**
 * Single file generation result
 */
export interface GeneratedFile {
  type: 'component' | 'types' | 'hooks';

  /** File path */
  path: string;

  /** File content */
  content: string;
}

/**
 * Single screen result in flow
 */
export interface FlowScreenResult {
  /** Screen name */
  screenName: string;

  /** Generated files for this screen */
  files: GeneratedFile[];

  /** Detection results */
  detections: DetectionResults;

  /** Generation status */
  status: 'success' | 'error';

  error?: string;
}

/**
 * App navigation structure
 */
export interface FlowNavigationResult {
  /** TypeScript types for navigation */
  types: string;

  /** Navigator code */
  navigator: string;

  /** Navigation structure */
  structure: NavigationStructure;
}

/**
 * Complete flow generation result
 */
export interface FlowResult {
  /** Screen generation results */
  screens: FlowScreenResult[];

  /** Navigation results */
  navigation: FlowNavigationResult;

  /** Shared types for all screens */
  sharedTypes: string;

  /** Index barrel export */
  indexFile: string;

  /** Summary statistics */
  summary: {
    /** Total screens */
    total: number;

    /** Successfully generated */
    successful: number;

    /** Generation errors */
    failed: number;

    /** Screen types and counts */
    screenTypes: Record<string, number>;

    duration: number;
  };
}

/**
 * Flow generation options
 */
export interface FlowGenerationOptions {
  generateNavigation?: boolean;

  generateSharedTypes?: boolean;

  generateIndex?: boolean;

  generateHooks?: boolean;

  generateDataTypes?: boolean;
}

/**
 * Main function for complete app flow generation
 *
 * Generates multiple screens in parallel with navigation, shared types, and all infrastructure
 *
 * @param options - Generation options
 * @returns Complete flow generation result
 */
export async function generateCompleteFlow(
  figmaToken: string,
  screens: FlowScreen[],
  options: FlowGenerationOptions = {}
): Promise<FlowResult> {
  const startTime = Date.now();

  // Set default values for options
  const {
    generateNavigation = true,
    generateSharedTypes = true,
    generateIndex = true,
    generateHooks = true,
    generateDataTypes = true,
  } = options;

  console.error('[FLOW] ═══════════════════════════════════════');
  console.error('[FLOW] ═══════════════════════════════════════');

  // Load project config once for all screens
  const config = (await loadProjectConfig()) || getDefaultConfig();

  // PHASE 1: Parallel Figma nodes fetching

  const fetchResults = await fetchAllFigmaNodes(figmaToken, screens);

  const successfulFetches = fetchResults.filter(
    (r): r is { screen: FlowScreen; node: any; fileKey: string; nodeId: string } =>
      !r.error && !!r.node && !!r.fileKey && !!r.nodeId
  );
  const failedFetches = fetchResults.filter(
    (r): r is { screen: FlowScreen; error: string } => !!r.error
  );

  console.error(`[FLOW] Fetched ${successfulFetches.length} screens, ${failedFetches.length} failed`);
  if (failedFetches.length > 0) {
    failedFetches.forEach((f) => {
      console.error(`[FLOW]   - ${f.screen.screenName}: ${f.error}`);
    });
  }

  // PHASE 2: Generate unified theme mapping for all screens

  const allFigmaColors = new Set<string>();
  successfulFetches.forEach((result) => {
    if (result.node) {
      const colors = extractFigmaColors(result.node);
      colors.forEach((color) => allFigmaColors.add(color));
    }
  });


  if (allFigmaColors.size > 0 && config.theme?.location) {
    const colorMappings = await autoGenerateColorMappings(
      Array.from(allFigmaColors),
      config
    );

    if (!config.mappings) config.mappings = {};
    config.mappings.colors = colorMappings;

    await updateConfigMappings({ colors: colorMappings });

    console.error(`[FLOW] Generated ${Object.keys(colorMappings).length} color mappings`);
  }

  // PHASE 3: Parallel screen code generation with pattern detection

  const screenResults = await generateAllScreens(
    successfulFetches,
    failedFetches,
    config,
    { generateHooks, generateDataTypes }
  );

  const successfulScreens = screenResults.filter((r) => r.status === 'success');
  console.error(`[FLOW] Generated ${successfulScreens.length} successful screens`);

  // PHASE 4: Navigation generation based on screen analysis

  let navigationResult: FlowNavigationResult;

  if (generateNavigation && successfulFetches.length > 0) {
    navigationResult = await generateFlowNavigation(successfulFetches);
  } else {
    navigationResult = {
      types: '',
      navigator: '',
      structure: {
        screens: [],
        rootNavigator: 'stack',
        nestedNavigators: [],
      },
    };
  }

  // PHASE 5: Generate shared types from all data models

  let sharedTypesCode = '';

  if (generateSharedTypes) {
    const allDataModels: DataModel[] = [];
    const allExtractedTypes: ExtractedType[] = [];

    successfulScreens.forEach((screen) => {
      allDataModels.push(...screen.detections.dataModels);
    });

    // Convert data models to ExtractedType format
    allDataModels.forEach((model) => {
      const definition = generateSingleTypeDefinition(model);
      allExtractedTypes.push({
        name: model.name,
        definition,
        frequency: 1,
      });
    });

    sharedTypesCode = generateSharedTypesCode(
      screenResults.map((r) => {
        const componentFile = r.files.find((f) => f.type === 'component');
        return {
          screenName: r.screenName,
          code: componentFile?.content || '',
          outputPath: componentFile?.path || '',
          status: r.status,
        };
      }),
      allExtractedTypes
    );

  } else {
    // Shared types skipped
  }

  // PHASE 6: Generate index.ts barrel export

  let indexFileCode = '';

  if (generateIndex) {
    const successfulScreenNames = successfulScreens.map((s) => s.screenName);
    indexFileCode = generateBarrelExport(successfulScreenNames);
  } else {
    // Index file skipped
  }

  // Calculate statistics
  const screenTypeCounts: Record<string, number> = {};
  successfulScreens.forEach((screen) => {
    const type = screen.detections.screenType;
    screenTypeCounts[type] = (screenTypeCounts[type] || 0) + 1;
  });

  const duration = Date.now() - startTime;

  console.error('[FLOW] ═══════════════════════════════════════');
  Object.entries(screenTypeCounts).forEach(([type, count]) => {
    console.error(`[FLOW]   - ${type}: ${count}`);
  });
  console.error('[FLOW] ═══════════════════════════════════════');

  return {
    screens: screenResults,
    navigation: navigationResult,
    sharedTypes: sharedTypesCode,
    indexFile: indexFileCode,
    summary: {
      total: screens.length,
      successful: successfulScreens.length,
      failed: screenResults.length - successfulScreens.length,
      screenTypes: screenTypeCounts,
      duration,
    },
  };
}

/**
 * Parallel fetching of all Figma nodes
 */
async function fetchAllFigmaNodes(
  figmaToken: string,
  screens: FlowScreen[]
): Promise<
  Array<{
    screen: FlowScreen;
    node?: any;
    fileKey?: string;
    nodeId?: string;
    error?: string;
  }>
> {
  const fetchPromises = screens.map(async (screen) => {
    try {
      const { fileKey, nodeId } = parseFigmaUrl(screen.figmaUrl);
      const response = await fetchFigmaNodes(figmaToken, fileKey, [nodeId]);
      const node = response.nodes[nodeId]?.document;

      if (!node) {
        console.error(`[FLOW] Node not found for screen ${screen.screenName}`);
      }


      return { screen, node, fileKey, nodeId };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return { screen, error: errorMessage };
    }
  });

  return await Promise.all(fetchPromises);
}

/**
 * Parallel generation of all screens
 */
async function generateAllScreens(
  successfulFetches: Array<{
    screen: FlowScreen;
    node: any;
    fileKey: string;
    nodeId: string;
  }>,
  failedFetches: Array<{ screen: FlowScreen; error: string }>,
  config: ProjectConfig,
  options: { generateHooks: boolean; generateDataTypes: boolean }
): Promise<FlowScreenResult[]> {
  const results: FlowScreenResult[] = [];

  // Process successfully fetched screens
  const generatePromises = successfulFetches.map(async (data) => {
    const { screen, node } = data;

    try {
      // Generate component code
      const componentCode = await generateReactNativeComponent(
        node,
        screen.screenName,
        config
      );

      // Detect patterns and data models
      const dataModels = inferDataModels(node, screen.screenName);
      const screenType = detectScreenTypeFromName(screen.screenName);
      const entityName = extractEntityNameFromScreen(screen.screenName);

      const files: GeneratedFile[] = [
        {
          type: 'component',
          path: screen.outputPath || `screens/${screen.screenName}.tsx`,
          content: componentCode,
        },
      ];

      // Generate data types if requested
      if (options.generateDataTypes && dataModels.length > 0) {
        const typesCode = generateTypeDefinitions(dataModels);
        files.push({
          type: 'types',
          path: `types/${screen.screenName}.types.ts`,
          content: typesCode,
        });
      }

      // Generate React Query hooks if requested
      if (options.generateHooks && dataModels.length > 0) {
        const hooksCode = generateReactQueryHooks(dataModels, screen.screenName);
        files.push({
          type: 'hooks',
          path: `hooks/${screen.screenName}.hooks.ts`,
          content: hooksCode,
        });
      }


      return {
        screenName: screen.screenName,
        files,
        detections: {
          dataModels,
          navigationElements: [],
          screenType,
          entityName,
        },
        status: 'success' as const,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return {
        screenName: screen.screenName,
        files: [],
        detections: {
          dataModels: [],
          navigationElements: [],
          screenType: 'unknown',
          entityName: '',
        },
        status: 'error' as const,
        error: errorMessage,
      };
    }
  });

  const successResults = await Promise.all(generatePromises);
  results.push(...successResults);

  // Process failed fetches
  failedFetches.forEach((data) => {
    results.push({
      screenName: data.screen.screenName,
      files: [],
      detections: {
        dataModels: [],
        navigationElements: [],
        screenType: 'unknown',
        entityName: '',
      },
      status: 'error',
      error: data.error,
    });
  });

  return results;
}

/**
 * Generate navigation structure for flow
 */
async function generateFlowNavigation(
  fetchedScreens: Array<{
    screen: FlowScreen;
    node: any;
    fileKey: string;
    nodeId: string;
  }>
): Promise<FlowNavigationResult> {
  // Prepare data for navigation analysis
  const navScreens: NavFigmaScreen[] = fetchedScreens.map((data) => ({
    name: data.screen.screenName,
    node: data.node,
  }));

  // Analyze navigation structure
  const structure = analyzeNavigationStructure(navScreens);

  // Generate navigation types
  const typesCode = generateNavigationTypes(structure);

  // Generate navigator code
  const navigatorCode = generateNavigatorCode(structure);

  return {
    types: typesCode,
    navigator: navigatorCode,
    structure,
  };
}

/**
 * Generates single type definition from data model
 */
function generateSingleTypeDefinition(model: DataModel): string {
  let code = `export interface ${model.name} {\n`;

  model.fields.forEach((field) => {
    const nullable = field.nullable ? ' | null' : '';
    let fieldType: string;

    if (field.type === 'array' && field.arrayItemType) {
      fieldType = `${field.arrayItemType}[]`;
    } else if (field.type === 'object' && field.nestedFields) {
      fieldType = '{\n';
      field.nestedFields.forEach((nested) => {
        const nestedNullable = nested.nullable ? ' | null' : '';
        fieldType += `    ${nested.name}: ${nested.type}${nestedNullable};\n`;
      });
      fieldType += '  }';
    } else {
      fieldType = field.type;
    }

    code += `  ${field.name}: ${fieldType}${nullable};\n`;
  });

  code += `}`;

  return code;
}

/**
 * Determines screen type from its name
 */
function detectScreenTypeFromName(
  screenName: string
): 'list' | 'detail' | 'form' | 'profile' | 'unknown' {
  const normalized = screenName.toLowerCase();

  if (
    normalized.includes('list') ||
    normalized.includes('catalog') ||
    normalized.includes('catalog') ||
    normalized.includes('list')
  ) {
    return 'list';
  }

  if (
    normalized.includes('detail') ||
    normalized.includes('card') ||
    normalized.includes('card')
  ) {
    return 'detail';
  }

  if (
    normalized.includes('form') ||
    normalized.includes('edit') ||
    normalized.includes('create') ||
    normalized.includes('form')
  ) {
    return 'form';
  }

  if (
    normalized.includes('profile') ||
    normalized.includes('profile') ||
    normalized.includes('account')
  ) {
    return 'profile';
  }

  return 'unknown';
}

/**
 * Extracts entity name from screen name
 */
function extractEntityNameFromScreen(screenName: string): string {
  const normalized = screenName
    .replace(/List|Catalog|Details?|Form|Card/gi, '')
    .trim();

  const words = normalized.split(/[\s_-]+/);
  const pascalCase = words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');

  if (pascalCase.endsWith('s') && pascalCase.length > 2) {
    return pascalCase.slice(0, -1);
  }

  return pascalCase || 'Item';
}

/**
 * Parses Figma URL and extracts file key and node ID
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
      importPrefix: '',
    },
  };
}
