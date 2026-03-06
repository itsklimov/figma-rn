/**
 * get_screen MCP Tool
 *
 * Exposes the full pipeline: Figma URL → IR transformation → detection → code generation
 * Uses the new clean architecture instead of the legacy one-shot-generator.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { FigmaClient } from '../../api/client.js';
import { retryOnError } from '../../api/errors.js';
import { transformNode } from '../../api/transformers.js';
import { parseFigmaUrl } from '../../api/url.js';
import { transformToScreenIR } from '../../core/pipeline.js';
import { runDetectors } from '../../core/detection/index.js';
import { matchTokens, createEmptyMappings, type TokenMappings } from '../../core/mapping/token-matcher.js';
import { extractProjectTokens } from '../../core/mapping/theme-extractor.js';
import { 
  generateComponent, 
  type MultiFileResult 
} from '../../core/generation/index.js';
import type { ScreenIR } from '../../core/types.js';
import type { DetectionResult } from '../../core/detection/types.js';
import { downloadAssets, type DownloadedAsset } from '../asset-downloader.js';
import { resolveComponentName } from '../name-resolver.js';
import { writeGeneratedFiles, type WriteResult } from '../file-writer.js';
import {
  type FigmaConfig,
  getOrCreateManifest,
  loadAllProjectTokens,
  refreshFigmaConfig,
  getOrCreateFigmaConfig,
  type ManifestCategory,
} from '../../workspace/index.js';
import { join, relative, resolve } from 'path';
import { mkdir, readFile, stat } from 'fs/promises';

/**
 * Tool definition for MCP server
 */
export const getScreenTool: Tool = {
  name: 'get_screen',
  description: `Generate React Native code from a Figma URL using the clean architecture pipeline.

This tool uses the new transformation pipeline:
1. Fetch Figma node data
2. Normalize and filter nodes
3. Detect layout (row/column/stack)
4. Recognize semantics (Container, Text, Button, etc.)
5. Extract styles and tokens
6. Detect patterns (lists, repeated components)
7. Generate production-ready TSX with accessibility props

Features:
• Automatic list detection → FlatList generation
• Component extraction for repeated blocks
• Accessibility props (accessibilityRole, accessibilityLabel, hitSlop)
• Token extraction and mapping to project theme
• Multi-file output support

Returns:
• Generated component code
• Extracted components (if patterns detected)
• Design tokens (if no project theme)
• Unmapped tokens report`,
  inputSchema: {
    type: 'object',
    properties: {
      figmaUrl: {
        type: 'string',
        description: 'Figma URL with node-id (e.g., https://www.figma.com/design/FILE_ID?node-id=123-456)',
      },
      componentName: {
        type: 'string',
        description: 'Name for the generated component (default: derived from Figma node name)',
      },
      themeFilePath: {
        type: 'string',
        description: 'Path to project theme file for token matching (optional)',
      },
      outputDir: {
        type: 'string',
        description: 'Output directory for generated files (default: "components")',
      },
      projectRoot: {
        type: 'string',
        description: 'Project root directory (default: current working directory)',
      },
      category: {
        type: 'string',
        description: 'Category for the component (screens, modals, sheets, components, icons) (default: "screens")',
        enum: ['screens', 'modals', 'sheets', 'components', 'icons'],
      },
      suppressTodos: {
        type: 'boolean',
        description: 'Whether to suppress TODO comments in generated code (default: false)',
      },
      scaleFunction: {
        type: 'string',
        description: 'Responsive scaling function name (e.g., "scale") (default: from figma.config.json)',
      },
    },
    required: ['figmaUrl'],
  },
};

/**
 * Input arguments for get_screen tool
 */
export interface GetScreenArgs {
  figmaUrl: string;
  componentName?: string;
  themeFilePath?: string;
  outputDir?: string;
  projectRoot?: string;
  category?: string;
  suppressTodos?: boolean;
  scaleFunction?: string;
}

/**
 * Result from get_screen tool
 */
export interface GetScreenResult {
  success: boolean;
  screenIR?: ScreenIR;
  detectionResult?: DetectionResult;
  multiFileResult?: MultiFileResult;
  writeResult?: WriteResult;
  analysis?: ToolAnalysis;
  screenshot?: Buffer;
  previousName?: string;
  error?: string;
}

export interface ThemeImportTarget {
  mode: 'named-import' | 'default-import' | 'injected' | 'unresolved';
  importPath?: string;
  sourceFile?: string;
  exportName?: 'theme' | 'default';
  confidence: 'high' | 'low' | 'none';
  scannedFiles: string[];
  warnings: string[];
}

export interface NamedImportTarget {
  importPath?: string;
  sourceFile?: string;
  exportName: string;
  confidence: 'high' | 'none';
  warnings: string[];
}

export interface GeneratedCodeValidation {
  lineCount: number;
  todoCount: number;
  placeholderCount: number;
  relativeAssetImportCount: number;
  selfRecursiveComponents: string[];
  missingReactNativeImports: string[];
  duplicateAssetPaths: string[];
  warnings: string[];
}

export interface PublicApiProp {
  name: string;
  type: string;
  optional: boolean;
}

export interface ToolAnalysis {
  validation: GeneratedCodeValidation;
  integration: {
    theme: ThemeImportTarget;
    assets: {
      strategy: 'relative-to-generated-output';
      files: Array<{
        nodeId: string;
        filename: string;
        relativePath: string;
        category: 'icon' | 'image';
      }>;
    };
    config: {
      stylePattern: string;
      importPrefix: string;
      tokenFileCount: number;
      tokenFiles: string[];
      useThemeHookPath?: string;
      scaleFunction?: string;
      scaleFunctionImportPath?: string;
    };
  };
  publicApi: {
    exportName?: string;
    props: PublicApiProp[];
  };
  fidelity: {
    input: {
      semanticTypes: Record<string, number>;
      textNodes: number;
      imageLikeNodes: number;
      interactiveNodes: number;
      componentNodes: number;
      detectedLists: number;
      detectedRepeatedComponents: number;
      assetsDownloaded: number;
    };
    output: {
      textElements: number;
      imageElements: number;
      svgElements: number;
      touchables: number;
      pressables: number;
      flatLists: number;
      scrollViews: number;
      componentFunctions: number;
      assetRequires: number;
    };
    gaps: string[];
  };
}

function normalizeRelativePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toAliasImportPath(projectRoot: string, filePath: string, importPrefix: string): string | undefined {
  const absolutePath = resolve(projectRoot, filePath);
  const relativePath = normalizeRelativePath(relative(projectRoot, absolutePath));

  if (!relativePath || relativePath.startsWith('..')) {
    return undefined;
  }

  if (!relativePath.startsWith('src/') && !relativePath.startsWith('app/')) {
    return undefined;
  }

  const importPath = relativePath
    .replace(/^(src|app)\//, '')
    .replace(/\.(ts|tsx|js|jsx)$/, '')
    .replace(/\/index$/, '');

  return importPath.length > 0 ? `${importPrefix}/${importPath}` : importPrefix;
}

function detectThemeExport(content: string): 'theme' | 'default' | null {
  if (
    /export\s+(const|let|var)\s+theme\b/.test(content) ||
    /export\s*\{\s*theme\b/.test(content)
  ) {
    return 'theme';
  }

  if (/export\s+default\s+theme\b/.test(content) || /export\s+default\s+{/.test(content)) {
    return 'default';
  }

  return null;
}

function detectNamedExport(content: string, exportName: string): boolean {
  const escapedName = escapeRegExp(exportName);
  const namedDeclaration = new RegExp(`export\\s+(?:const|let|var|function|class)\\s+${escapedName}\\b`);
  const namedReExport = new RegExp(`export\\s*\\{[^}]*\\b${escapedName}\\b[^}]*\\}`);
  return namedDeclaration.test(content) || namedReExport.test(content);
}

function scoreThemeCandidate(filePath: string): number {
  const normalized = normalizeRelativePath(filePath).toLowerCase();
  let score = 0;

  if (normalized.includes('/theme/')) score += 4;
  if (normalized.endsWith('/theme.ts') || normalized.endsWith('/theme.tsx')) score += 4;
  if (normalized.endsWith('/theme/index.ts') || normalized.endsWith('/theme/index.tsx')) score += 5;
  if (normalized.includes('unistyles')) score += 3;
  if (normalized.endsWith('/styles/index.ts') || normalized.endsWith('/styles/index.tsx')) score += 2;
  if (normalized.endsWith('/index.ts') || normalized.endsWith('/index.tsx')) score += 1;

  return score;
}

export async function resolveThemeImportTarget(
  projectRoot: string,
  config: FigmaConfig,
  explicitThemeFilePath?: string
): Promise<ThemeImportTarget> {
  if (config.stylePattern === 'unistyles') {
    return {
      mode: 'injected',
      confidence: 'high',
      scannedFiles: [],
      warnings: [],
    };
  }

  const warnings: string[] = [];
  const candidateFiles = new Set<string>();

  if (explicitThemeFilePath) {
    candidateFiles.add(explicitThemeFilePath);
  }

  for (const tokenFile of config.tokenFiles) {
    candidateFiles.add(tokenFile);
  }

  const orderedCandidates = Array.from(candidateFiles)
    .sort((a, b) => scoreThemeCandidate(b) - scoreThemeCandidate(a));

  const scannedFiles: string[] = [];

  for (const candidate of orderedCandidates) {
    const absolutePath = resolve(projectRoot, candidate);
    const relativePath = normalizeRelativePath(relative(projectRoot, absolutePath));
    scannedFiles.push(relativePath);

    let content: string;
    try {
      content = await readFile(absolutePath, 'utf-8');
    } catch {
      continue;
    }

    const exportName = detectThemeExport(content);
    if (!exportName) {
      continue;
    }

    const importPath = toAliasImportPath(projectRoot, absolutePath, config.importPrefix);
    if (!importPath) {
      warnings.push(`Theme source "${relativePath}" exports theme but is outside src/app alias roots.`);
      continue;
    }

    return {
      mode: exportName === 'default' ? 'default-import' : 'named-import',
      importPath,
      sourceFile: absolutePath,
      exportName,
      confidence: 'high',
      scannedFiles,
      warnings,
    };
  }

  warnings.push('Could not resolve a theme module that explicitly exports "theme" or a default theme object.');
  return {
    mode: 'unresolved',
    confidence: orderedCandidates.length > 0 ? 'low' : 'none',
    scannedFiles,
    warnings,
  };
}

export async function resolveNamedImportTarget(
  projectRoot: string,
  candidateFilePath: string | undefined,
  importPrefix: string,
  exportName: string
): Promise<NamedImportTarget> {
  if (!candidateFilePath) {
    return {
      exportName,
      confidence: 'none',
      warnings: [],
    };
  }

  const absolutePath = resolve(projectRoot, candidateFilePath);
  const relativePath = normalizeRelativePath(relative(projectRoot, absolutePath));
  const warnings: string[] = [];

  let content: string;
  try {
    content = await readFile(absolutePath, 'utf-8');
  } catch {
    warnings.push(`Utility source "${relativePath}" could not be read.`);
    return {
      exportName,
      confidence: 'none',
      warnings,
    };
  }

  if (!detectNamedExport(content, exportName)) {
    warnings.push(`Utility source "${relativePath}" does not export "${exportName}".`);
    return {
      exportName,
      confidence: 'none',
      warnings,
    };
  }

  const importPath = toAliasImportPath(projectRoot, absolutePath, importPrefix);
  if (!importPath) {
    warnings.push(`Utility source "${relativePath}" exports "${exportName}" but is outside src/app alias roots.`);
    return {
      exportName,
      sourceFile: absolutePath,
      confidence: 'none',
      warnings,
    };
  }

  return {
    importPath,
    sourceFile: absolutePath,
    exportName,
    confidence: 'high',
    warnings,
  };
}

function extractPublicApi(code: string): ToolAnalysis['publicApi'] {
  const exportName = code.match(/export function (\w+)\(/)?.[1];
  if (!exportName) {
    return { exportName: undefined, props: [] };
  }

  const interfaceMatch = code.match(new RegExp(`interface\\s+${exportName}Props\\s*\\{([\\s\\S]*?)\\n\\}`, 'm'));
  if (!interfaceMatch) {
    return { exportName, props: [] };
  }

  const props: PublicApiProp[] = [];
  for (const match of interfaceMatch[1].matchAll(/^\s*([A-Za-z0-9_]+)(\?)?:\s*([^;]+);$/gm)) {
    props.push({
      name: match[1],
      optional: match[2] === '?',
      type: match[3].trim(),
    });
  }

  return { exportName, props };
}

function countMatches(code: string, pattern: RegExp): number {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  return [...code.matchAll(new RegExp(pattern.source, flags))].length;
}

export function analyzeInputOutputFidelity(
  screenIR: ScreenIR,
  detectionResult: DetectionResult | undefined,
  code: string,
  assets: DownloadedAsset[] = []
): ToolAnalysis['fidelity'] {
  const semanticTypes = collectSemanticTypeCounts(screenIR.root);
  const input = {
    semanticTypes,
    textNodes: semanticTypes.Text || 0,
    imageLikeNodes: (semanticTypes.Image || 0) + (semanticTypes.Icon || 0),
    interactiveNodes: (semanticTypes.Button || 0) + (semanticTypes.Icon || 0),
    componentNodes: semanticTypes.Component || 0,
    detectedLists: detectionResult?.lists?.length ?? 0,
    detectedRepeatedComponents: detectionResult?.components?.length ?? 0,
    assetsDownloaded: assets.length,
  };

  const output = {
    textElements: countMatches(code, /<Text\b/),
    imageElements: countMatches(code, /<Image\b/),
    svgElements: countMatches(code, /<SvgIcon\b/),
    touchables: countMatches(code, /<TouchableOpacity\b/),
    pressables: countMatches(code, /<Pressable\b/),
    flatLists: countMatches(code, /<FlatList\b/),
    scrollViews: countMatches(code, /<ScrollView\b/),
    componentFunctions: countMatches(code, /(?:export\s+)?function\s+\w+\(/),
    assetRequires: countMatches(code, /require\(['"]\.\/assets\//),
  };

  const gaps: string[] = [];

  if (input.textNodes > 0 && output.textElements === 0) {
    gaps.push('Figma input contains text nodes, but generated output has no <Text> elements.');
  }
  if (input.imageLikeNodes > 0 && output.imageElements + output.svgElements === 0) {
    gaps.push('Figma input contains image/icon nodes, but generated output has no <Image> or <SvgIcon> elements.');
  }
  if (input.interactiveNodes > 0 && output.touchables + output.pressables === 0) {
    gaps.push('Figma input contains interactive nodes, but generated output has no Touchable/Pressable elements.');
  }
  if (input.detectedLists > 0 && output.flatLists === 0) {
    gaps.push('List detection found repeatable content, but generated output has no <FlatList>.');
  }
  if (input.assetsDownloaded > 0 && output.assetRequires === 0) {
    gaps.push('Assets were exported from Figma, but generated output does not require any local assets.');
  }
  if (input.detectedRepeatedComponents > 0 && output.componentFunctions <= 1) {
    gaps.push('Repeated components were detected in Figma input, but generated output did not produce helper component functions.');
  }

  return {
    input,
    output,
    gaps,
  };
}

export function analyzeGeneratedCode(
  code: string,
  assets: DownloadedAsset[] = [],
  themeTarget?: ThemeImportTarget
): GeneratedCodeValidation {
  const lineCount = code.split(/\r?\n/).length;
  const todoCount = (code.match(/\bTODO\b/g) || []).length;
  const placeholderCount = (
    code.match(/via\.placeholder\.com|uri:\s*''/g) || []
  ).length;
  const relativeAssetImportCount = (code.match(/require\(['"]\.\/assets\//g) || []).length;

  const reactNativeImports = new Set<string>();
  for (const match of code.matchAll(/import\s*\{\s*([^}]+)\s*\}\s*from\s*'react-native';/g)) {
    for (const imported of match[1].split(',')) {
      const name = imported.trim();
      if (name) reactNativeImports.add(name);
    }
  }

  const usagePatterns: Record<string, RegExp> = {
    TouchableOpacity: /<TouchableOpacity\b/,
    Image: /<Image\b/,
    Text: /<Text\b/,
    View: /<View\b/,
    Pressable: /<Pressable\b/,
    FlatList: /<FlatList\b/,
    ScrollView: /<ScrollView\b/,
    TextInput: /<TextInput\b/,
    StyleSheet: /\bStyleSheet\.create\(/,
    ImageSourcePropType: /\bImageSourcePropType\b/,
  };

  const missingReactNativeImports = Object.entries(usagePatterns)
    .filter(([name, pattern]) => pattern.test(code) && !reactNativeImports.has(name))
    .map(([name]) => name);

  const functionNames = [...code.matchAll(/function (\w+)\(/g)].map((match) => match[1]);
  const selfRecursiveComponents = functionNames.filter((name) => {
    const body = code.match(new RegExp(`function ${name}\\([^]*?\\n\\}`, 'm'))?.[0];
    return body ? new RegExp(`<${name}\\b`).test(body) : false;
  });

  const duplicateAssetPaths = Array.from(
    assets.reduce((duplicates, asset) => {
      const count = duplicates.get(asset.relativePath) || 0;
      duplicates.set(asset.relativePath, count + 1);
      return duplicates;
    }, new Map<string, number>())
      .entries()
  )
    .filter(([, count]) => count > 1)
    .map(([path]) => path);

  const warnings: string[] = [];
  if (themeTarget?.mode === 'unresolved' && /\btheme\./.test(code)) {
    warnings.push('Generated code references theme tokens but theme import could not be resolved confidently.');
  }
  if (selfRecursiveComponents.length > 0) {
    warnings.push(`Self-recursive components detected: ${selfRecursiveComponents.join(', ')}.`);
  }
  if (missingReactNativeImports.length > 0) {
    warnings.push(`Missing React Native imports detected: ${missingReactNativeImports.join(', ')}.`);
  }
  if (todoCount > 0) {
    warnings.push(`Generated output still contains ${todoCount} TODO marker(s).`);
  }
  if (duplicateAssetPaths.length > 0) {
    warnings.push(`Duplicate asset output paths detected: ${duplicateAssetPaths.join(', ')}.`);
  }
  if (assets.length > 0 && relativeAssetImportCount === 0) {
    warnings.push('Assets were downloaded but the generated code does not reference any relative asset paths.');
  }

  return {
    lineCount,
    todoCount,
    placeholderCount,
    relativeAssetImportCount,
    selfRecursiveComponents,
    missingReactNativeImports,
    duplicateAssetPaths,
    warnings,
  };
}

function collectSemanticTypeCounts(node: ScreenIR['root']): Record<string, number> {
  const counts: Record<string, number> = {};

  function walk(current: ScreenIR['root']): void {
    counts[current.semanticType] = (counts[current.semanticType] || 0) + 1;
    if ('children' in current && current.children) {
      for (const child of current.children) {
        walk(child as ScreenIR['root']);
      }
    }
  }

  walk(node);
  return counts;
}

function buildAnalysis(
  screenIR: ScreenIR,
  detectionResult: DetectionResult | undefined,
  code: string,
  assets: DownloadedAsset[],
  config: FigmaConfig,
  themeTarget: ThemeImportTarget,
  scaleFunction?: string,
  scaleFunctionImportPath?: string
): ToolAnalysis {
  return {
    validation: analyzeGeneratedCode(code, assets, themeTarget),
    integration: {
      theme: themeTarget,
      assets: {
        strategy: 'relative-to-generated-output',
        files: assets.map((asset) => ({
          nodeId: asset.nodeId,
          filename: asset.filename,
          relativePath: asset.relativePath,
          category: asset.category,
        })),
      },
      config: {
        stylePattern: config.stylePattern,
        importPrefix: config.importPrefix,
        tokenFileCount: config.tokenFiles.length,
        tokenFiles: config.tokenFiles,
        useThemeHookPath: config.hooks?.useTheme,
        scaleFunction,
        scaleFunctionImportPath,
      },
    },
    publicApi: extractPublicApi(code),
    fidelity: analyzeInputOutputFidelity(screenIR, detectionResult, code, assets),
  };
}

/**
 * Capture screenshot as buffer (helper function)
 */
async function captureScreenshotAsBuffer(
  client: FigmaClient,
  fileKey: string,
  nodeId: string
): Promise<Buffer | undefined> {
  try {
    const exportResults = await client.exportImages(fileKey, [nodeId], {
      format: 'png',
      scale: 2,
    });

    if (!exportResults[0]?.url) return undefined;

    const response = await fetch(exportResults[0].url);
    if (!response.ok) return undefined;

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error('Failed to capture screenshot:', error);
    return undefined;
  }
}

/**
 * Execute the get_screen tool
 *
 * @param args - Tool arguments
 * @param figmaToken - Figma API token
 * @returns Generation result
 */
export async function executeGetScreen(
  args: GetScreenArgs,
  figmaToken: string
): Promise<GetScreenResult> {
  const { figmaUrl, componentName, themeFilePath, outputDir } = args;
  const effectiveProjectRoot = resolve(args.projectRoot || process.cwd());

  // Validate project root before any generation work
  try {
    const rootStat = await stat(effectiveProjectRoot);
    if (!rootStat.isDirectory()) {
      return {
        success: false,
        error: `Invalid projectRoot: "${effectiveProjectRoot}" is not a directory`,
      };
    }
  } catch {
    return {
      success: false,
      error: `Invalid projectRoot: "${effectiveProjectRoot}" does not exist or is not accessible`,
    };
  }

  // STEP 0: Always refresh config first - this is the foundation for everything else
  // The config contains theme file paths needed for token matching
  try {
    await refreshFigmaConfig(effectiveProjectRoot);
  } catch (error) {
    console.error('Config refresh failed:', error);
  }

  try {
    // 1. Parse Figma URL to get fileKey and nodeId
    const parsed = parseFigmaUrl(figmaUrl);
    if (!parsed?.nodeId) {
      return {
        success: false,
        error: 'Invalid Figma URL format (missing file key or node-id)',
      };
    }

    // 2. Create Figma client and fetch node with retry for rate limits
    const client = new FigmaClient(figmaToken);
    const result = await retryOnError(
      () => client.fetchNodeByUrl(figmaUrl),
      { maxRetries: 3, retryDelay: 2000 }
    );

    // Get the first node from the result
    const nodeIds = Object.keys(result.nodes);
    if (nodeIds.length === 0) {
      return {
        success: false,
        error: 'No nodes found at the specified URL',
      };
    }

    const nodeId = nodeIds[0];
    const nodeData = result.nodes[nodeId];

    if (!nodeData?.document) {
      return {
        success: false,
        error: 'Failed to fetch Figma node document',
      };
    }

    // Transform raw API response to FigmaNode
    const figmaNode = transformNode(nodeData.document);

    // 3. Transform to ScreenIR
    const screenIR = transformToScreenIR(figmaNode);

    // 4. Run detection layer
    const detectionResult = runDetectors(screenIR.root);

    // 5. Load project tokens
    let tokenMappings: TokenMappings = createEmptyMappings();
    let hasProjectTheme = false;
    let projectTokens: any = null;

    if (themeFilePath) {
      try {
        projectTokens = await extractProjectTokens(themeFilePath);
      } catch (error) {
        console.error('Could not load explicit theme file:', error);
      }
    } else {
      // Auto-discovery from refreshed config
      try {
        projectTokens = await loadAllProjectTokens(effectiveProjectRoot);
      } catch (error) {
        console.error('Auto-discovery of tokens failed:', error);
      }
    }

    if (projectTokens) {
      tokenMappings = matchTokens(screenIR.stylesBundle.tokens, projectTokens);
      hasProjectTheme = true;
    }

    // 6. Get manifest and resolve component name
    const manifest = await getOrCreateManifest(effectiveProjectRoot);
    
    // Validate category input
    const validCategories: ManifestCategory[] = ['screens', 'modals', 'sheets', 'components', 'icons'];
    const categoryInput = args.category || 'screens';
    const category: ManifestCategory = validCategories.includes(categoryInput as ManifestCategory) 
      ? (categoryInput as ManifestCategory) 
      : 'screens';

    const resolved = resolveComponentName(
      manifest,
      category,
      nodeId,
      screenIR.name,
      componentName
    );

    console.error(`[DEBUG] get_screen result: "${resolved.name}", isUpdate=${resolved.isUpdate}`);

    // 8. Create element folder path for assets and screenshot
    const elementFolder = join(effectiveProjectRoot, '.figma', category, resolved.name);
    const assetsDir = join(elementFolder, 'assets');

    // 9. Create element folder and assets directory before downloading
    await mkdir(elementFolder, { recursive: true });
    await mkdir(assetsDir, { recursive: true });

    // 10. Download assets and build image path map
    const assetResult = await downloadAssets(client, parsed.fileKey, screenIR.root, assetsDir);

    // 11. Capture screenshot as buffer
    let screenshotBuffer: Buffer | undefined;
    try {
      screenshotBuffer = await captureScreenshotAsBuffer(client, parsed.fileKey, nodeId);
    } catch (error) {
      console.error('Failed to capture screenshot:', error);
      // Continue without screenshot
    }

    // 11.5 Load config to get validated import targets and integration hints
    const config = await getOrCreateFigmaConfig(effectiveProjectRoot);
    const themeTarget = await resolveThemeImportTarget(effectiveProjectRoot, config, themeFilePath);
    const canUseResolvedTheme = themeTarget.mode !== 'unresolved';
    const generationMappings = canUseResolvedTheme ? tokenMappings : createEmptyMappings();
    const generationHasProjectTheme = hasProjectTheme && canUseResolvedTheme;
    const transformedPathMap = new Map(assetResult.pathMap);
    const effectiveScaleFunction = args.scaleFunction || config.utils?.scaleFunctionName;
    const scaleTarget = await resolveNamedImportTarget(
      effectiveProjectRoot,
      config.utils?.scale,
      config.importPrefix,
      effectiveScaleFunction || 'scale'
    );
    const resolvedScaleFunction = scaleTarget.importPath ? effectiveScaleFunction : undefined;

    // 12. Generate monolithic output with imagePathMap
    const generationResult = generateComponent(screenIR, generationMappings, {
      componentName: resolved.name,
      detectionResult,
      hasProjectTheme: generationHasProjectTheme,
      imagePathMap: transformedPathMap,
      themeImportPath: themeTarget.importPath,
      themeImportIsDefault: themeTarget.mode === 'default-import',
      themeImportName: themeTarget.exportName,
      suppressTodos: args.suppressTodos,
      scaleFunction: resolvedScaleFunction,
      scaleFunctionImportPath: scaleTarget.importPath,
      // New: Pass config for import generation
      stylePattern: config.stylePattern,
      useThemeHookPath: config.hooks?.useTheme,
      importPrefix: config.importPrefix,
    });

    const multiFileResult: MultiFileResult = {
      mainComponent: {
        path: `${outputDir || 'components'}/${resolved.name}.tsx`,
        content: generationResult.code,
      },
      extractedComponents: [],
      tokens: null,
      unmappedTokens: generationResult.unmappedTokens,
    };

    const analysis = buildAnalysis(
      screenIR,
      detectionResult,
      generationResult.code,
      assetResult.assets,
      config,
      themeTarget,
      resolvedScaleFunction,
      scaleTarget.importPath
    );

    // 13. Write files
    const writeResult = await writeGeneratedFiles({
      projectRoot: effectiveProjectRoot,
      figmaUrl,
      category,
      componentName: resolved.name,
      multiFileResult,
      assets: assetResult.assets,
      screenshot: screenshotBuffer,
      figmaName: screenIR.name,
      previousName: resolved.previousName,
    });

    if (!writeResult.success) {
      return {
        success: false,
        error: writeResult.error || 'Failed to write generated files',
      };
    }

    // 14. Prepare response
    return {
      success: true,
      screenIR,
      detectionResult,
      multiFileResult,
      writeResult,
      analysis,
      screenshot: screenshotBuffer,
      previousName: resolved.previousName,
    };
  } catch (error) {
    console.error('executeGetScreen failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Format the result for MCP response
 */
export function formatGetScreenResponse(result: GetScreenResult): any[] {
  if (!result.success) {
    return [{ type: 'text', text: `# ❌ Error\n\n${result.error}` }];
  }

  const { screenIR, detectionResult, multiFileResult, writeResult, analysis, screenshot, previousName } = result;
  if (!screenIR || !multiFileResult) {
    return [{ type: 'text', text: '# ❌ Error\n\nNo result generated' }];
  }

  const content: any[] = [];
  const countNodes = (node: ScreenIR['root']): number =>
    1 + ('children' in node && node.children ? node.children.reduce((sum, child) => sum + countNodes(child as ScreenIR['root']), 0) : 0);

  const summary = {
    screenName: screenIR.name,
    replacedName: previousName && previousName !== screenIR.name ? previousName : null,
    output: writeResult?.success
      ? {
          projectRoot: writeResult.projectRoot,
          folder: writeResult.folder,
          indexPath: writeResult.indexPath,
          extractedPaths: writeResult.extractedPaths,
          tokensPath: writeResult.tokensPath ?? null,
          screenshotPath: writeResult.screenshotPath ?? null,
          assetsCount: writeResult.assetsCount,
          isUpdate: writeResult.isUpdate,
        }
      : null,
    structure: {
      nodeCount: countNodes(screenIR.root),
      styleCount: Object.keys(screenIR.stylesBundle.styles).length,
      semanticTypes: collectSemanticTypeCounts(screenIR.root),
      detectedLists: detectionResult?.lists?.length ?? 0,
      detectedRepeatedComponents: detectionResult?.components?.length ?? 0,
    },
    validation: analysis?.validation ?? null,
    integration: analysis?.integration ?? null,
    publicApi: analysis?.publicApi ?? null,
    fidelity: analysis?.fidelity ?? null,
    unmappedTokens: multiFileResult.unmappedTokens,
  };

  let textResponse = `# ✅ Generated: ${screenIR.name}\n\n`;

  if (previousName && previousName !== screenIR.name) {
    textResponse = `# 🔄 Replaced ${previousName} with ${screenIR.name}\n\n`;
  }

  textResponse += `## Artifacts\n\n`;
  if (writeResult?.success) {
    const root = writeResult.projectRoot;
    textResponse += `| File | Absolute Path |\n`;
    textResponse += `|------|---------------|\n`;
    textResponse += `| **Main Component** | \`${join(root, writeResult.indexPath)}\` |\n`;

    for (const extractedPath of writeResult.extractedPaths) {
      textResponse += `| Extracted Part | \`${join(root, extractedPath)}\` |\n`;
    }

    if (writeResult.tokensPath) {
      textResponse += `| Tokens | \`${join(root, writeResult.tokensPath)}\` |\n`;
    }

    if (writeResult.assetsCount > 0) {
      textResponse += `| Assets | ${writeResult.assetsCount} files in \`${join(root, writeResult.folder, 'assets')}\` |\n`;
    }
    textResponse += `\n`;
  }

  textResponse += `## Summary JSON\n\n`;
  textResponse += '```json\n';
  textResponse += `${JSON.stringify(summary, null, 2)}\n`;
  textResponse += '```\n\n';

  textResponse += `## Main Component\n\n`;
  textResponse += '```tsx\n';
  textResponse += `${multiFileResult.mainComponent.content}\n`;
  textResponse += '```\n\n';

  if (multiFileResult.extractedComponents.length > 0) {
    for (const extracted of multiFileResult.extractedComponents) {
      textResponse += `## Extracted Component: ${extracted.path}\n\n`;
      textResponse += '```tsx\n';
      textResponse += `${extracted.content}\n`;
      textResponse += '```\n\n';
    }
  }

  if (multiFileResult.tokens?.content) {
    textResponse += `## Tokens File\n\n`;
    textResponse += '```ts\n';
    textResponse += `${multiFileResult.tokens.content}\n`;
    textResponse += '```\n\n';
  }

  content.push({ type: 'text', text: textResponse });

  // Visual reference for downstream review or comparison.
  if (screenshot) {
    content.push({
      type: 'image',
      data: screenshot.toString('base64'),
      mimeType: 'image/png',
    });
  }

  return content;
}
