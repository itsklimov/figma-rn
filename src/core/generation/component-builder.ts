/**
 * Component Builder - Orchestrate generation of complete TSX component
 * Supports both single-file and multi-file output with detection hints
 */

import type { ScreenIR, IRNode, ComponentIR, StylesBundle, RepeaterIR } from '../types.js';
import type { TokenMappings } from '../mapping/token-matcher.js';
import type { DetectionResult, ComponentHint } from '../detection/types.js';
import type {
  ContractDiagnostic,
  ContractProfileSummary,
  ResolvedProjectProfile,
  UnresolvedAssetRef,
} from '../contracts/types.js';
import { toContractProfileSummary } from '../contracts/types.js';
import { buildImports, type ImportConfig } from './imports-builder.js';
import { buildJSX } from './jsx-builder.js';
import { buildStyles } from './styles-builder.js';
import { generateItemComponent } from './list-generator.js';
import { generateTokensIfNeeded } from './tokens-generator.js';
import { extractProps } from './prop-extractor.js';
import { mergePropsVariations, extractVariableProps } from '../detection/repetition-detector.js';
import { detectSemanticState } from '../detection/state-detector.js';

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
  diagnostics: ContractDiagnostic[];
  unresolvedAssets: UnresolvedAssetRef[];
  contractProfileSummary?: ContractProfileSummary;
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
  /** Path to scaling function for import generation */
  scaleFunctionPath?: string;
  /** Style pattern: useTheme, StyleSheet, or unistyles */
  stylePattern?: 'useTheme' | 'StyleSheet' | 'unistyles';
  /** Path to useTheme hook if discovered */
  useThemeHookPath?: string;
  /** Import prefix from tsconfig (e.g., '@app') */
  importPrefix?: string;
  /** Semantic state information for state-based styling (internal use) */
  semanticState?: import('../detection/state-detector.js').SemanticState;
  /** Resolved contract profile */
  contractProfile?: ResolvedProjectProfile;
  /** Strict contracts mode */
  strictContracts?: boolean;
  /** Missing asset policy */
  assetFailurePolicy?: 'fallback' | 'error';
  /** Internal diagnostics collector */
  diagnosticsCollector?: ContractDiagnostic[];
  /** Internal unresolved assets collector */
  unresolvedAssetsCollector?: UnresolvedAssetRef[];
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
  diagnostics?: ContractDiagnostic[];
  unresolvedAssets?: UnresolvedAssetRef[];
  contractProfileSummary?: ContractProfileSummary;
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

function escapeStringLiteral(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/"/g, '\\"');
}

function resolveMainImplementationRoot(root: IRNode, componentName: string): IRNode {
  if (root.semanticType !== 'Component') {
    return root;
  }

  const componentRoot = root as ComponentIR;
  let implementationRoot: IRNode = {
    ...componentRoot,
    semanticType: 'Container',
  } as IRNode;

  if (componentRoot.children && componentRoot.children.length === 1) {
    const child = componentRoot.children[0];
    const shouldUseChildAsRoot =
      child.name === componentRoot.name ||
      child.name === componentRoot.componentName ||
      child.name === componentName ||
      (child.boundingBox.width === componentRoot.boundingBox.width &&
        child.boundingBox.height === componentRoot.boundingBox.height);

    if (shouldUseChildAsRoot) {
      implementationRoot = child;
    }
  }

  return implementationRoot;
}

/**
 * Build a stable signature for a component implementation shape.
 * Used to disambiguate components that share the same display name.
 */
function getComponentSignature(component: ComponentIR): string {
  const propKeys = Object.keys(component.props || {}).sort().join('|');
  const componentId = component.componentId || 'unknown';
  const childCount = component.children?.length || 0;
  return `${componentId}::${propKeys}::${childCount}`;
}

/**
 * Ensure component names are unique across the tree.
 * If two components share the same name but different signatures, suffixes are added.
 */
function ensureUniqueComponentNames(root: IRNode, reservedNames: Set<string> = new Set()): void {
  const usedNames = new Set<string>(reservedNames);
  const signatureByName = new Map<string, string>();
  const path = new Set<string>();

  function walk(node: IRNode): void {
    if (path.has(node.id)) return;
    path.add(node.id);

    if (node.semanticType === 'Component') {
      const comp = node as ComponentIR;
      const baseName = comp.componentName || toPascalCase(comp.name) || 'Component';
      const signature = getComponentSignature(comp);
      const baseSignature = signatureByName.get(baseName);

      if (!usedNames.has(baseName) && !baseSignature) {
        comp.componentName = baseName;
        usedNames.add(baseName);
        signatureByName.set(baseName, signature);
      } else if (baseSignature === signature) {
        comp.componentName = baseName;
      } else {
        let suffix = 2;
        let assigned = false;

        while (!assigned) {
          const candidate = `${baseName}${suffix}`;
          const candidateSignature = signatureByName.get(candidate);
          if (!candidateSignature) {
            comp.componentName = candidate;
            signatureByName.set(candidate, signature);
            usedNames.add(candidate);
            assigned = true;
            continue;
          }
          if (candidateSignature === signature) {
            comp.componentName = candidate;
            assigned = true;
            continue;
          }
          suffix += 1;
        }
      }
    }

    if ('children' in node && node.children) {
      for (const child of node.children) {
        walk(child);
      }
    }

    path.delete(node.id);
  }

  walk(root);
}

function resolveAssetPathFromMap(
  imagePathMap: Map<string, string> | undefined,
  ref: string
): string | undefined {
  if (!imagePathMap) return undefined;
  return imagePathMap.get(ref) || imagePathMap.get(`ref:${ref}`);
}

interface NamedSubComponent {
  name: string;
  code: string;
}

function extractSubComponentName(code: string): string | null {
  const match = code.match(/function\s+([A-Z][A-Za-z0-9_]*)\s*\(/);
  return match ? match[1] : null;
}

function extractReferencedComponentNames(code: string): Set<string> {
  const refs = new Set<string>();
  const regex = /<([A-Z][A-Za-z0-9_]*)\b/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(code)) !== null) {
    refs.add(match[1]);
  }
  return refs;
}

function keepReferencedSubComponents(
  components: NamedSubComponent[],
  entryCode: string
): NamedSubComponent[] {
  const byName = new Map<string, NamedSubComponent>();
  for (const comp of components) {
    byName.set(comp.name, comp);
  }

  const needed = new Set<string>();
  const queue = Array.from(extractReferencedComponentNames(entryCode));

  while (queue.length > 0) {
    const name = queue.shift()!;
    if (needed.has(name)) continue;
    needed.add(name);
    const comp = byName.get(name);
    if (!comp) continue;
    for (const ref of extractReferencedComponentNames(comp.code)) {
      if (!needed.has(ref)) queue.push(ref);
    }
  }

  return components.filter((c) => needed.has(c.name));
}

/**
 * Assemble complete TSX file from parts
 */


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
  const diagnostics = options?.diagnosticsCollector ?? [];
  const unresolvedAssets = options?.unresolvedAssetsCollector ?? [];
  const contractProfile = options?.contractProfile;
  const stylePattern = options?.stylePattern || contractProfile?.stylePattern || 'StyleSheet';
  const importPrefix = options?.importPrefix || contractProfile?.importPrefix || '@app';
  const hasProjectTheme = options?.hasProjectTheme ?? false;
  const themeImportPath = options?.themeImportPath || contractProfile?.themeImportPath;
  const scaleFunction = options?.scaleFunction || contractProfile?.scaleImport?.name;
  const scaleFunctionPath = options?.scaleFunctionPath || contractProfile?.scaleImport?.path;
  const strictContracts = options?.strictContracts ?? contractProfile?.strictValidation.strictContracts ?? true;
  const assetFailurePolicy = options?.assetFailurePolicy || 'fallback';

  // 1. Resolve component name and root props
  const componentName = options?.componentName || toPascalCase(screen.name) || 'GeneratedComponent';
  const renderRoot = resolveMainImplementationRoot(screen.root, componentName);
  ensureUniqueComponentNames(renderRoot, new Set([componentName]));
  const { props: rootProps } = extractProps(renderRoot, screen.stylesBundle);
  const rootPropsList = Object.keys(rootProps);

  // Generate props interface for the main component
  let rootPropsInterface = '';
  let rootPropsDestructure = '';
  if (rootPropsList.length > 0) {
    const propLines = Object.entries(rootProps).map(([name, config]: [string, any]) => {
      if (config.type === 'image') {
        return `  /** Default: "${config.defaultValue}" */\n  ${name}?: ImageSourcePropType;`;
      }
      return `  /** Default: "${config.defaultValue}" */\n  ${name}: string;`;
    });
    const interfaceName = `${componentName}Props`;
    rootPropsInterface = `interface ${interfaceName} {\n${propLines.join('\n')}\n}\n\n`;

    const destructureParts = Object.entries(rootProps).map(([name, config]: [string, any]) => {
      if (config.type === 'image') {
        const hash = config.defaultValue;
        const resolvedPath = resolveAssetPathFromMap(options?.imagePathMap, hash);
        if (resolvedPath) {
          return `${name} = require("${resolvedPath}")`;
        }
        unresolvedAssets.push({
          ref: hash,
          nodeId: renderRoot.id,
          semanticType: 'Image',
          location: `${componentName}Props.${name}`,
        });
        diagnostics.push({
          level: assetFailurePolicy === 'error' ? 'error' : 'warning',
          code: 'ASSET_UNRESOLVED_PROP_DEFAULT',
          message: `Image prop "${name}" default could not be resolved for ref "${hash}".`,
          location: `${componentName}Props`,
        });
        return name;
      }
      const defaultVal = config.defaultValue ? ` = "${escapeStringLiteral(config.defaultValue)}"` : '';
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
    generatedComponentNames: new Set<string>(),
  };

  const subComponentGenerationOptions: GenerationOptions = {
    ...options,
    stylePattern,
    importPrefix,
    hasProjectTheme,
    themeImportPath,
    scaleFunction,
    scaleFunctionPath,
    strictContracts,
    assetFailurePolicy,
    contractProfile,
    diagnosticsCollector: diagnostics,
    unresolvedAssetsCollector: unresolvedAssets,
  };

  // 2.6 Process Repeaters
  const repeaters = collectRepeaters(renderRoot);
  for (const repeater of repeaters) {
    const { dataConstant, itemComponent, typeDefinition, itemComponentName } = generateRepeaterParts(
      repeater,
      screen.stylesBundle,
      mappings,
      subComponentGenerationOptions,
      listExtras.generatedComponentNames
    );
    listExtras.data.push(dataConstant);
    listExtras.types.push(typeDefinition);
    listExtras.subComponents.push(itemComponent);
    listExtras.generatedComponentNames.add(itemComponentName);
  }

  // 3. Collect and generate sub-components
  const components = collectComponents(renderRoot, new Set([componentName]));
  let needsImageSourcePropType = Object.values(rootProps).some((p: any) => p.type === 'image');
  const subComponentsCodeParts: string[] = [];

  for (const comp of components) {
    if (listExtras.generatedComponentNames.has(comp.componentName)) {
      continue;
    }
    const code = generateSubComponent(comp, screen.stylesBundle, mappings, subComponentGenerationOptions);
    if (code.includes('ImageSourcePropType')) {
      needsImageSourcePropType = true;
    }
    subComponentsCodeParts.push(code);
  }

  const jsxOptions: import('./jsx-builder.js').BuildJSXOptions = {
    assetFailurePolicy,
    svgMode: contractProfile?.svgSupport.mode,
    hasSvgIconProvider: !!contractProfile?.svgSupport.svgIconProviderPath,
    diagnostics,
    unresolvedAssets,
  };

  // 4. Build JSX for main tree
  const jsx = buildJSX(
    renderRoot,
    2,
    options?.imagePathMap,
    jsxOverrides,
    screen.stylesBundle,
    mappings,
    jsxOptions
  );

  const additionalTypes = listExtras.types.join('\n\n');
  const additionalData = listExtras.data.join('\n\n');
  const renderItems = listExtras.renderItems.map((fn) => fn.replace(/^ {2}/, '')).join('\n\n');

  // Remove dead subcomponents by reference graph from main entry code.
  const allGeneratedComponents = [...subComponentsCodeParts, ...listExtras.subComponents].filter(Boolean);
  const namedSubComponents: NamedSubComponent[] = [];
  const anonymousSubComponents: string[] = [];
  for (const code of allGeneratedComponents) {
    const name = extractSubComponentName(code);
    if (name) {
      namedSubComponents.push({ name, code });
    } else {
      anonymousSubComponents.push(code);
    }
  }
  const entryCode = [jsx, renderItems].join('\n');
  const reachableNamedSubComponents = keepReferencedSubComponents(namedSubComponents, entryCode);
  const allSubComponents = [...anonymousSubComponents, ...reachableNamedSubComponents.map((c) => c.code)]
    .filter(Boolean)
    .join('\n\n');

  // 5. Extract used style names from effective generated JSX
  const usedStyles = new Set<string>();
  const allGeneratedJSX = [jsx, allSubComponents, renderItems].join('\n');
  const styleRefPattern = /styles\.([a-zA-Z0-9_]+)/g;
  let styleMatch: RegExpExecArray | null;
  while ((styleMatch = styleRefPattern.exec(allGeneratedJSX)) !== null) {
    usedStyles.add(styleMatch[1]);
  }

  // 6. Build StyleSheet from StylesBundle with mappings
  const { code: stylesCode, unmapped } = buildStyles(renderRoot, screen.stylesBundle, mappings, {
    usedStyles,
    suppressTodos: options?.suppressTodos,
    scaleFunction,
    stylePattern,
    hasProjectTheme,
  });

  // 7. Generate selected variant styles for semantic state components
  let finalStylesCode = stylesCode;
  const selectedStylePattern = /styles\.([a-zA-Z0-9_]+)Selected/g;
  const selectedStyles = new Set<string>();
  let selectedMatch: RegExpExecArray | null;
  while ((selectedMatch = selectedStylePattern.exec(allGeneratedJSX)) !== null) {
    selectedStyles.add(selectedMatch[1]);
  }

  if (selectedStyles.size > 0) {
    const variantStylesCode: string[] = [];
    for (const baseStyle of selectedStyles) {
      const isText = baseStyle.includes('text') || baseStyle.includes('Text');
      if (isText) {
        variantStylesCode.push(`  ${baseStyle}Selected: {\n    color: '#ffffff',\n  },`);
      } else {
        variantStylesCode.push(
          `  ${baseStyle}Selected: {\n    backgroundColor: theme.gradients?.primary?.from || '#7a54ff',\n  },`
        );
      }
    }
    if (variantStylesCode.length > 0) {
      finalStylesCode = finalStylesCode.replace(/\n\}\);$/, `\n${variantStylesCode.join('\n')}\n});`);
    }
  }

  // 8. Safe area wrapper based on resolved contract
  const requestedSafeArea = screen.hasSafeAreaLayout === true;
  const safeAreaAvailable = contractProfile ? contractProfile.safeAreaSupport.available : true;
  const useSafeAreaWrapper = requestedSafeArea && safeAreaAvailable;
  const useSafeAreaFallbackWrapper = requestedSafeArea && !safeAreaAvailable;
  if (useSafeAreaFallbackWrapper) {
    diagnostics.push({
      level: strictContracts ? 'error' : 'warning',
      code: 'SAFE_AREA_UNAVAILABLE',
      message:
        'Safe area layout detected, but react-native-safe-area-context was not confirmed by project profile. Falling back to View wrapper.',
      location: componentName,
    });
  }

  if (useSafeAreaWrapper || useSafeAreaFallbackWrapper) {
    const safeAreaBlock = `  safeArea: {\n    flex: 1,\n  },`;
    if (stylePattern === 'unistyles') {
      finalStylesCode = finalStylesCode.replace(
        /const styles = StyleSheet\.create\(theme => \(\{/,
        `const styles = StyleSheet.create(theme => ({\n${safeAreaBlock}`
      );
    } else {
      finalStylesCode = finalStylesCode.replace(
        /const styles = StyleSheet\.create\(\{/,
        `const styles = StyleSheet.create({\n${safeAreaBlock}`
      );
    }
  }

  // 9. Build imports from effective usage and contract rules
  const importScanCode = [allGeneratedJSX, finalStylesCode].join('\n');
  const extraRNImports: string[] = [];
  if (listExtras.imports.has('FlatList')) extraRNImports.push('FlatList');
  if (needsImageSourcePropType) extraRNImports.push('ImageSourcePropType');
  if (useSafeAreaFallbackWrapper) extraRNImports.push('View');

  const rnTagsToImport: Array<[string, string]> = [
    ['View', '<View'],
    ['Text', '<Text'],
    ['Image', '<Image'],
    ['TouchableOpacity', '<TouchableOpacity'],
    ['TextInput', '<TextInput'],
    ['ScrollView', '<ScrollView'],
    ['Pressable', '<Pressable'],
    ['FlatList', '<FlatList'],
  ];
  for (const [rnComponent, tag] of rnTagsToImport) {
    if (importScanCode.includes(tag)) {
      extraRNImports.push(rnComponent);
    }
  }
  if (importScanCode.includes('<SvgIcon')) {
    extraRNImports.push('SvgIcon');
  }

  const includeThemeImport = hasProjectTheme && /(^|[^a-zA-Z0-9_])theme\./.test(importScanCode);
  const importConfig: ImportConfig = {
    importPrefix,
    useThemeHookPath: options?.useThemeHookPath,
    themeImportPath,
    stylePattern,
    hasProjectTheme,
    scaleFunction,
    scaleFunctionPath,
    includeThemeImport,
    svgIconImportPath: contractProfile?.svgSupport.svgIconProviderPath,
    diagnostics,
  };
  const finalImports = buildImports(renderRoot, extraRNImports, screen.stylesBundle, importConfig);

  let safeAreaImport = '';
  if (useSafeAreaWrapper) {
    safeAreaImport = `import { SafeAreaView } from '${contractProfile?.safeAreaSupport.importPath || 'react-native-safe-area-context'}';\n`;
  }

  // 10. Build component body
  let bodyContent: string;
  if (useSafeAreaWrapper) {
    const edges: string[] = [];
    if (screen.safeAreaInsets?.top && screen.safeAreaInsets.top > 0) edges.push("'top'");
    if (screen.safeAreaInsets?.bottom && screen.safeAreaInsets.bottom > 0) edges.push("'bottom'");
    if (screen.safeAreaInsets?.left && screen.safeAreaInsets.left > 0) edges.push("'left'");
    if (screen.safeAreaInsets?.right && screen.safeAreaInsets.right > 0) edges.push("'right'");
    const edgesAttr = edges.length > 0 ? ` edges={[${edges.join(', ')}]}` : '';
    bodyContent = `  return (
    <SafeAreaView style={styles.safeArea}${edgesAttr}>
${jsx}
    </SafeAreaView>
  );`;
  } else if (useSafeAreaFallbackWrapper) {
    bodyContent = `  return (
    <View style={styles.safeArea}>
${jsx}
    </View>
  );`;
  } else {
    bodyContent = `  return (\n${jsx}\n  );`;
  }

  let code = `${finalImports}
${safeAreaImport}
${rootPropsInterface}
${additionalTypes}

${additionalData}

${allSubComponents}

${renderItems}

export function ${componentName}(${rootPropsDestructure}) {
${bodyContent}
}

${finalStylesCode}
`;

  code = code.replace(/\n{3,}/g, '\n\n');

  if (assetFailurePolicy === 'error' && unresolvedAssets.length > 0) {
    const unresolvedRefs = unresolvedAssets.map((asset) => `${asset.semanticType}:${asset.ref}`).join(', ');
    throw new Error(`Asset resolution failed for ${componentName}: ${unresolvedRefs}`);
  }

  return {
    code,
    unmappedTokens: unmapped,
    diagnostics,
    unresolvedAssets,
    contractProfileSummary: contractProfile ? toContractProfileSummary(contractProfile) : undefined,
  };
}

/**
 * Collect all unique Component nodes from the tree
 */
function collectComponents(root: IRNode, reservedNames: Set<string> = new Set()): ComponentIR[] {
  const components = new Map<string, ComponentIR>();
  const path = new Set<string>();

  function walk(node: IRNode) {
    if (path.has(node.id)) return;
    path.add(node.id);

    if (node.semanticType === 'Component') {
      // Use componentName as key to deduplicate
      if (!reservedNames.has(node.componentName) && !components.has(node.componentName)) {
        components.set(node.componentName, node as ComponentIR);
      }
      // Components might have children that are also components (nested instances)
      // But usually we don't want to extract children OF the component instance if they are overrides?
      // For now, let's assume we want to find nested components too.
      // But wait, if we render <Component />, we don't render its children in the parent JSX.
      // The children effectively belong to the Component definition.
      // So we MUST walk inside the component to find *other* components it relies on.
    }

    if ('children' in node && node.children) {
      for (const child of node.children) {
        walk(child);
      }
    }

    path.delete(node.id);
  }

  walk(root);
  return Array.from(components.values());
}

/**
 * Collect all Repeater nodes from the tree
 */
function collectRepeaters(root: IRNode): RepeaterIR[] {
  const repeaters: RepeaterIR[] = [];
  const path = new Set<string>();

  function walk(node: IRNode) {
    if (path.has(node.id)) return;
    path.add(node.id);

    if (node.semanticType === 'Repeater') {
      repeaters.push(node as RepeaterIR);
    }

    if ('children' in node && node.children) {
      for (const child of node.children) {
        walk(child);
      }
    }

    path.delete(node.id);
  }

  walk(root);
  return repeaters;
}

/**
 * Generate all parts for a repeater (Data, Types, Component)
 */
function generateRepeaterParts(
  repeater: RepeaterIR,
  stylesBundle: StylesBundle,
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

  // 1. Identify dynamic fields by comparing children
  const template = repeater.children[0];
  const variations = mergePropsVariations(repeater.children, stylesBundle, mappings);
  
  // 2. Detect semantic state (e.g., 1-of-N = isSelected)
  const stateResult = detectSemanticState(repeater.children, variations, stylesBundle);
  
  // 3. Build data array based on semantic state or raw variations
  let dataItems: Record<string, any>[];
  let semanticPropName: string | undefined;
  
  // Build text props mapping from template for dynamic component generation
  // Maps prop name -> { path: child path, isPrimary: boolean }
  type TextPropInfo = { path: string; isPrimary: boolean; nodeIndex: number[] };
  const textPropsMap = new Map<string, TextPropInfo>();

  if (stateResult.hasSemanticState && stateResult.state) {
    // Semantic state detected! Generate data with state flags, not style values
    semanticPropName = stateResult.state.propName;
    // Note: stateStyles available at stateResult.state.stateStyles if needed for future use

    // First pass: analyze template to build text props mapping
    const templateRawValues = extractVariableProps(template, stylesBundle, mappings);
    const templateTextKeys = Object.keys(templateRawValues)
      .filter(k => k.endsWith('_text') || k === 'text')
      .sort((a, b) => a.split('_').length - b.split('_').length);

    for (const key of templateTextKeys) {
      const value = templateRawValues[key];
      if (!value) continue;

      // Parse the path to get node indices (e.g., "child1_child0_text" -> [1, 0])
      const pathParts = key.replace(/_text$/, '').split('_');
      const nodeIndex = pathParts
        .filter(p => p.startsWith('child'))
        .map(p => parseInt(p.replace('child', ''), 10));

      // Derive semantic prop name from the key path
      let propName: string;
      if (key === 'text' || key === 'child0_text') {
        propName = 'text';
        textPropsMap.set(propName, { path: key, isPrimary: true, nodeIndex });
      } else {
        // Use a more semantic name based on depth and content pattern
        const isBadgePattern = /^[+\-−]?\d/.test(value.trim());
        if (isBadgePattern) {
          propName = 'badge';
        } else {
          const depth = nodeIndex.length;
          propName = depth > 1 ? `text${depth}` : 'secondaryText';
        }
        textPropsMap.set(propName, { path: key, isPrimary: false, nodeIndex });
      }
    }

    // Second pass: extract values for all instances using the mapping
    dataItems = repeater.children.map((child) => {
      const rawValues = extractVariableProps(child, stylesBundle, mappings);
      const itemData: Record<string, any> = {};

      // Add semantic state prop
      itemData[semanticPropName!] = stateResult.state!.instanceStates.get(child.id) ?? false;

      // Extract text props using the mapping
      for (const [propName, info] of textPropsMap.entries()) {
        const value = rawValues[info.path];
        if (value) {
          itemData[propName] = value;
        }
      }

      return itemData;
    });

    // Attach textPropsMap to state for component generation
    (stateResult.state as any).textPropsMap = textPropsMap;
  } else {
    // Fallback: use existing style-based variation extraction
    const { props: templateProps } = extractProps(template, stylesBundle, variations);

    dataItems = repeater.children.map(child => {
      const rawValues = extractVariableProps(child, stylesBundle, mappings);
      const itemData: Record<string, string> = {};
      
      for (const propName of Object.keys(templateProps)) {
        const propConfig = templateProps[propName];
        
        if (propConfig.type === 'style' && propConfig.property) {
          if (rawValues[propConfig.property]) {
            itemData[propName] = rawValues[propConfig.property];
          } else {
            const rawKey = propName.replace(/([A-Z])/g, '_$1').toLowerCase();
            if (rawValues[rawKey]) {
              itemData[propName] = rawValues[rawKey];
            } else {
              itemData[propName] = propConfig.defaultValue || '';
            }
          }
        } else if (propConfig.type === 'string') {
          const rawKey = propName.replace(/([A-Z])/g, '_$1').toLowerCase();
          itemData[propName] = rawValues[rawKey] || rawValues[`child0_text`] || propConfig.defaultValue || '';
        } else {
          itemData[propName] = propConfig.defaultValue || '';
        }
      }
      return itemData;
    });
  }

  const dataConstant = `const ${dataConstantName} = ${JSON.stringify(dataItems, null, 2)};`;

  // 4. Generate Item Component with semantic state support
  const itemCompIR: ComponentIR = {
    ...template,
    semanticType: 'Component',
    componentName: repeater.itemComponentName,
    props: stateResult.hasSemanticState ? {} : extractProps(template, stylesBundle, variations).props,
    propsVariations: variations,
  } as any;
  
  // Pass semantic state info to sub-component generation
  const itemComponent = generateSubComponent(
    itemCompIR, 
    stylesBundle, 
    mappings, 
    { ...options, semanticState: stateResult.hasSemanticState ? stateResult.state : undefined }
  );

  return { dataConstant, itemComponent, typeDefinition: '', itemComponentName: repeater.itemComponentName };
}

/**
 * Generate code for an internal sub-component
 */
function generateSubComponent(
  component: ComponentIR, 
  stylesBundle?: StylesBundle,
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
  const variations = (component as any).propsVariations || 
                    options?.detectionResult?.components.find(c => c.componentName === component.componentName)?.propsVariations;
                    
  const { props: extractedProps } = extractProps(implementationNode, stylesBundle, variations);

  // Generate props interface
  let propsInterface = '';
  let propsDestructure = '';
  
  // Check if we have semantic state (e.g., isSelected pattern)
  const semanticState = options?.semanticState;
  const assetFailurePolicy = options?.assetFailurePolicy || 'fallback';
  const contractProfile = options?.contractProfile;
  const baseJSXOptions: import('./jsx-builder.js').BuildJSXOptions = {
    assetFailurePolicy,
    svgMode: contractProfile?.svgSupport.mode,
    hasSvgIconProvider: !!contractProfile?.svgSupport.svgIconProviderPath,
    diagnostics: options?.diagnosticsCollector,
    unresolvedAssets: options?.unresolvedAssetsCollector,
  };
  
  if (semanticState && semanticState.propType === 'boolean') {
    // Semantic state detected - generate isSelected-style interface
    const statePropName = semanticState.propName; // e.g., "isSelected"
    const interfaceName = `${component.componentName}Props`;

    // Get text props mapping from semantic state (built in generateRepeaterParts)
    const textPropsMap: Map<string, { path: string; isPrimary: boolean; nodeIndex: number[] }> =
      (semanticState as any).textPropsMap || new Map();

    // Helper to find node by index path in the IR tree and set propName
    const findNodeByPath = (indices: number[]): any => {
      let current: any = implementationNode;
      for (const idx of indices) {
        if (!current?.children?.[idx]) return null;
        current = current.children[idx];
      }
      return current;
    };

    // Build prop interface lines dynamically
    const propLines: string[] = [];
    const propNames: string[] = [];

    // Mark text nodes with propName and optional containers with conditionalProp
    for (const [propName, info] of textPropsMap.entries()) {
      // Skip malformed names to avoid invalid destructuring like "{ , isSelected }"
      if (!propName || !/^[A-Za-z_]\w*$/.test(propName)) {
        continue;
      }

      const isOptional = !info.isPrimary;
      const comment = info.isPrimary ? 'Text to display' : `Optional ${propName} text`;
      propLines.push(`  /** ${comment} */\n  ${propName}${isOptional ? '?' : ''}: string;`);
      propNames.push(propName);

      // Set propName on the text node so buildJSX renders {propName}
      const textNode = findNodeByPath(info.nodeIndex);
      if (textNode) {
        textNode.propName = propName;
      }

      // For non-primary (optional) props, set conditionalProp on the container parent
      if (isOptional && info.nodeIndex.length > 1) {
        const containerIndex = info.nodeIndex.slice(0, -1);
        const containerNode = findNodeByPath(containerIndex);
        if (containerNode) {
          containerNode.conditionalProp = propName;
        }
      }
    }

    // Add state and handler props
    propLines.push(`  /** Whether this item is in the ${semanticState.type} state */\n  ${statePropName}?: boolean;`);
    propLines.push(`  /** Called when item is pressed */\n  onPress?: () => void;`);

    propsInterface = `interface ${interfaceName} {\n${propLines.join('\n')}\n}\n\n`;
    const destructureParts = [...propNames, `${statePropName} = false`, 'onPress'];
    propsDestructure = `{ ${destructureParts.join(', ')} }: ${interfaceName}`;

    // Use buildJSX with semantic state options for proper rendering
    // This automatically handles gradients, images, and any other features
    const jsxOptions: import('./jsx-builder.js').BuildJSXOptions = {
      ...baseJSXOptions,
      wrapperOverride: 'Pressable',
      stateProp: statePropName,
      selectedStyleSuffix: 'Selected',
      rootProps: [
        'onPress={onPress}',
        'accessibilityRole="button"',
        `accessibilityState={{ selected: ${statePropName} }}`,
      ],
    };

    const jsx = buildJSX(
      implementationNode,
      2,
      options?.imagePathMap,
      undefined,
      stylesBundle,
      mappings,
      jsxOptions
    );

    return `${propsInterface}function ${component.componentName}(${propsDestructure}) {
  return (
${jsx}
  );
}`;
  }
  
  if (Object.keys(extractedProps).length > 0) {
    const propLines = Object.entries(extractedProps).map(([name, config]: [string, any]) => {
      const type =
        config.type === 'image'
          ? 'ImageSourcePropType'
          : config.type === 'style'
          ? 'string'
          : 'string';
      const typeDoc = config.type === 'style' ? `Visual property: ${config.property}` : `Default: "${config.defaultValue}"`;
      const optional = config.type === 'image' ? '?' : '';
      return `  /** ${typeDoc} */\n  ${name}${optional}: ${type};`;
    });
    
    const interfaceName = `${component.componentName}Props`;
    propsInterface = `interface ${interfaceName} {\n${propLines.join('\n')}\n}\n\n`;

    // Destructured props for the signature
    const destructureParts = Object.entries(extractedProps).map(([name, config]: [string, any]) => {
      if (config.type === 'image') {
        const hash = config.defaultValue;
        const resolvedPath = resolveAssetPathFromMap(options?.imagePathMap, hash);
        if (resolvedPath) {
          return `${name} = require("${resolvedPath}")`;
        }
        options?.unresolvedAssetsCollector?.push({
          ref: hash,
          nodeId: component.id,
          semanticType: 'Image',
          location: `${component.componentName}Props.${name}`,
        });
        options?.diagnosticsCollector?.push({
          level: assetFailurePolicy === 'error' ? 'error' : 'warning',
          code: 'ASSET_UNRESOLVED_SUBCOMPONENT_PROP_DEFAULT',
          message: `Image prop "${name}" default could not be resolved for ref "${hash}".`,
          location: component.componentName,
        });
        return name;
      }
      const defaultVal = config.defaultValue ? ` = "${escapeStringLiteral(config.defaultValue)}"` : '';
      return `${name}${defaultVal}`;
    });
    propsDestructure = `{ ${destructureParts.join(', ')} }: ${interfaceName}`;
  } else {
    // Fallback if no props extracted
    propsDestructure = '{}'; // Use empty object instead of any
  }

  // We use indent 1 because it's inside a function
  const jsx = buildJSX(
    implementationNode,
    2,
    options?.imagePathMap,
    undefined,
    stylesBundle,
    mappings,
    baseJSXOptions
  );
  



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

  if ('children' in node && node.children) {
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
          options?.imagePathMap,
          options
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
          (n, i) =>
            buildJSX(n, i, options?.imagePathMap, undefined, screen.stylesBundle, mappings, {
              assetFailurePolicy: options?.assetFailurePolicy || 'fallback',
              svgMode: options?.contractProfile?.svgSupport.mode,
              hasSvgIconProvider: !!options?.contractProfile?.svgSupport.svgIconProviderPath,
              diagnostics: options?.diagnosticsCollector,
              unresolvedAssets: options?.unresolvedAssetsCollector,
            })
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
    diagnostics: basicResult.diagnostics,
    unresolvedAssets: basicResult.unresolvedAssets,
    contractProfileSummary: basicResult.contractProfileSummary,
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
  imagePathMap?: Map<string, string>,
  options?: GenerationOptions
): string {
  const { componentName, propsVariations } = hint;

  // Extract props with style awareness
  const { props: extractedProps } = extractProps(templateNode, stylesBundle, propsVariations);

  // Generate props interface
  const propLines = Object.entries(extractedProps).map(([name, config]: [string, any]) => {
    const type = (config.type === 'image' || config.type === 'style') ? (config.type === 'image' ? 'ImageSourcePropType' : 'string') : 'string';
    const typeDoc = config.type === 'style' ? `Visual property: ${config.property}` : `Default: "${config.defaultValue}"`;
    return `  /** ${typeDoc} */\n  ${name}?: ${type};`;
  });

  const propsInterface = propLines.length > 0
    ? `interface ${componentName}Props {\n${propLines.join('\n')}\n}\n\n`
    : '';

  const propsDestructure = propLines.length > 0 ? `{ ${Object.keys(extractedProps).join(', ')} }: ${componentName}Props` : '';

  const extractedJSXOptions: import('./jsx-builder.js').BuildJSXOptions = {
    assetFailurePolicy: options?.assetFailurePolicy || 'fallback',
    svgMode: options?.contractProfile?.svgSupport.mode,
    hasSvgIconProvider: !!options?.contractProfile?.svgSupport.svgIconProviderPath,
    diagnostics: options?.diagnosticsCollector,
    unresolvedAssets: options?.unresolvedAssetsCollector,
  };

  // Build JSX from template node
  const jsx = buildJSX(
    templateNode,
    2,
    imagePathMap,
    undefined,
    stylesBundle,
    mappings,
    extractedJSXOptions
  );

  const extraImports = jsx.includes('<SvgIcon') ? ['SvgIcon'] : [];
  const imports = buildImports(templateNode, extraImports, stylesBundle, {
    importPrefix: options?.importPrefix || options?.contractProfile?.importPrefix || '@app',
    stylePattern: options?.stylePattern || options?.contractProfile?.stylePattern || 'StyleSheet',
    hasProjectTheme: options?.hasProjectTheme ?? false,
    includeThemeImport: (options?.hasProjectTheme ?? false) && /(^|[^a-zA-Z0-9_])theme\./.test(jsx),
    themeImportPath: options?.themeImportPath || options?.contractProfile?.themeImportPath,
    scaleFunction: options?.scaleFunction || options?.contractProfile?.scaleImport?.name,
    scaleFunctionPath: options?.scaleFunctionPath || options?.contractProfile?.scaleImport?.path,
    svgIconImportPath: options?.contractProfile?.svgSupport.svgIconProviderPath,
    diagnostics: options?.diagnosticsCollector,
  });

  // Build styles from template node
  const { code: stylesCode } = buildStyles(templateNode, stylesBundle, mappings);

  return `${imports}

${propsInterface}export function ${componentName}(${propsDestructure || '{}'}) {
  return (
${jsx}
  );
}

${stylesCode}
`;
}
