import { Project, VariableDeclarationKind, SourceFile } from 'ts-morph';
import * as prettier from 'prettier';
import {
  autoGenerateColorMappings,
  extractFigmaColors,
  autoGenerateSpacingMappings,
  extractFigmaSpacing,
  autoGenerateRadiiMappings,
  extractFigmaRadii,
  autoGenerateShadowMappings,
  extractFigmaShadows,
  autoGenerateTypographyMappings,
  extractFigmaTypography
} from './auto-theme-mapper.js';
import { ProjectConfig } from './config-schema.js';
import { loadProjectConfig } from './config-loader.js';
import { generateSmartStyleName } from './smart-namer.js';
import { normalizeStyleName } from './style-normalizer.js';
import { type ComponentGroupDetection, isGroupParent, isGroupChild } from './interactive-group-detector.js';
import { generateComponentGroupJSX } from './component-group-generators.js';

/**
 * Generator options
 */
export interface GeneratorOptions {
  styleMap?: Map<string, string>;
  /** Detected component groups for smart generation */
  componentGroups?: ComponentGroupDetection[];
}

/**
 * Main React Native component generation function
 * Generates React Native component code using ts-morph for AST-based generation
 */
export async function generateReactNativeComponent(
  metadata: any,
  componentName: string,
  config?: ProjectConfig,
  imageMap?: Map<string, string>, // nodeId -> path to image
  options?: GeneratorOptions
): Promise<string> {
  // Load config if not provided
  if (!config) {
    config = await loadProjectConfig() || getDefaultConfig();
  }

  // Auto-generate mappings on-the-fly every time
  if (config.theme?.location) {
    // Generate color mappings
    const figmaColors = extractFigmaColors(metadata);
    const colorMappings = await autoGenerateColorMappings(figmaColors, config);

    // Path to main theme file (or fallback to colors)
    const mainThemePath = config.theme.mainThemeLocation || config.theme.location;

    // Generate spacing mappings
    const figmaSpacing = extractFigmaSpacing(metadata);
    const spacingMappings = await autoGenerateSpacingMappings(figmaSpacing, mainThemePath);

    // Generate radii mappings
    const figmaRadii = extractFigmaRadii(metadata);
    const radiiMappings = await autoGenerateRadiiMappings(figmaRadii, mainThemePath);

    // Generate shadow mappings
    const figmaShadows = extractFigmaShadows(metadata);
    const shadowMappings = await autoGenerateShadowMappings(figmaShadows, mainThemePath);

    // Generate typography mappings
    const figmaTypography = extractFigmaTypography(metadata);
    const typographyPath = config.theme?.typographyFile
      ? `${config.projectRoot || '.'}/${config.theme.typographyFile}`
      : mainThemePath;
    const typographyMappings = await autoGenerateTypographyMappings(figmaTypography, typographyPath);

    if (!config.mappings) config.mappings = {};
    // Merge: existing (user-provided) mappings take priority over auto-generated.
    // Spread order: auto-generated first, then user config overwrites.
    // This allows users to override specific mappings in .figmarc.json while
    // still getting auto-generated mappings for values they haven't specified.
    config.mappings.colors = { ...colorMappings, ...(config.mappings.colors || {}) };
    config.mappings.spacing = { ...spacingMappings, ...(config.mappings.spacing || {}) };
    config.mappings.radii = { ...radiiMappings, ...(config.mappings.radii || {}) };
    config.mappings.shadows = { ...shadowMappings, ...(config.mappings.shadows || {}) };
    config.mappings.typography = { ...typographyMappings, ...(config.mappings.typography || {}) };

    // DON'T save mappings to file - use in memory only
    // await updateConfigMappings({ colors: colorMappings }); // REMOVED

    console.error('[DEBUG] Generated mappings on-the-fly:');
    console.error('  - Colors:', config.mappings.colors ? Object.keys(config.mappings.colors).length : 0);
    console.error('  - Spacing:', config.mappings.spacing ? Object.keys(config.mappings.spacing).length : 0);
    console.error('  - Radii:', config.mappings.radii ? Object.keys(config.mappings.radii).length : 0);
    console.error('  - Shadows:', config.mappings.shadows ? Object.keys(config.mappings.shadows).length : 0);
    console.error('  - Typography:', config.mappings.typography ? Object.keys(config.mappings.typography).length : 0);
  }

  // Create new TypeScript project
  const project = new Project({
    useInMemoryFileSystem: true,
  });

  // Create source file
  const sourceFile = project.createSourceFile(
    `${componentName}.tsx`,
    '',
    { overwrite: true }
  );

  // Add imports
  addImports(sourceFile, metadata, options?.componentGroups);

  // Generate component
  generateComponent(sourceFile, metadata, componentName, imageMap, options?.styleMap, options?.componentGroups);

  // Generate createStyles
  generateCreateStyles(sourceFile, metadata, config, options);

  // Get generated code
  let code = sourceFile.getFullText();

  // Format with prettier
  code = await prettier.format(code, {
    parser: 'typescript',
    singleQuote: true,
    trailingComma: 'es5',
    tabWidth: 2,
  });

  // Apply theme mappings
  console.error('[DEBUG] About to apply theme mappings. Code length:', code.length);
  console.error('[DEBUG] Code contains rgba() before mapping:', code.includes('rgba('));
  code = applyThemeMappings(code, config.mappings);
  console.error('[DEBUG] After mappings. Contains palette.:', code.includes('palette.'));
  console.error('[DEBUG] Code contains rgba() after mapping:', code.includes('rgba('));

  return code;
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

/**
 * Applies theme mappings to generated code
 */
/**
 * Theme mappings interface
 */
interface ThemeMappings {
  colors?: Record<string, string>;
  typography?: Record<string, string>;
  fonts?: Record<string, string>;
  spacing?: Record<number, string>;    // number → theme path
  radii?: Record<number, string>;      // number → theme path
  shadows?: Record<string, string>;    // shadow signature → theme path
  gradients?: Record<string, string>;  // gradient signature → theme path
}

function applyThemeMappings(
  code: string,
  mappings?: ThemeMappings
): string {
  console.error('[DEBUG] applyThemeMappings called');
  console.error('[DEBUG] Mappings provided:', mappings ? 'YES' : 'NO');

  if (!mappings) {
    console.error('[DEBUG] No mappings, returning original code');
    return code;
  }

  let result = code;

  // Replace colors: 'rgba(122, 84, 255, 1)' → palette.primary
  if (mappings.colors) {
    console.error(`[DEBUG] Applying ${Object.keys(mappings.colors).length} color mappings`);

    for (const [figmaHex, themePath] of Object.entries(mappings.colors)) {
      const rgb = hexToRgb(figmaHex);
      // Include quotes in pattern to replace 'rgba(...)' with palette.token (without quotes)
      const rgbaPattern = `'rgba\\(${rgb.r}, ${rgb.g}, ${rgb.b}, [0-9.]+\\)'`;

      console.error(`[DEBUG] Replacing ${figmaHex} (${rgbaPattern}) → ${themePath}`);

      const regex = new RegExp(rgbaPattern, 'g');
      const matches = result.match(regex);

      if (matches) {
        console.error(`[DEBUG] Found ${matches.length} matches for ${figmaHex}`);
        result = result.replace(regex, themePath);
      } else {
        console.error(`[DEBUG] No matches found for ${figmaHex}`);
      }
    }
  } else {
    console.error('[DEBUG] No color mappings provided');
  }

  // Replace typography: fontSize + fontWeight → ...typography.body
  if (mappings.typography) {
    console.error(`[DEBUG] Applying ${Object.keys(mappings.typography).length} typography mappings`);

    for (const [figmaKey, themePath] of Object.entries(mappings.typography)) {
      // figmaKey format: "SF Pro/590/17" or "fontSize-17-fontWeight-590"
      const parts = figmaKey.split('/');
      if (parts.length >= 3) {
        const weight = parts[1];
        const size = parts[2];

        // Replace fontSize + fontWeight combination with spread
        const pattern = `fontSize:\\s*scale\\(${size}\\),\\s*fontWeight:\\s*['"]?${weight}['"]?`;
        const regex = new RegExp(pattern, 'g');

        console.error(`[DEBUG] Looking for typography pattern: ${pattern}`);
        const matches = result.match(regex);

        if (matches) {
          console.error(`[DEBUG] Found ${matches.length} typography matches for ${figmaKey}`);
          result = result.replace(regex, `...${themePath}`);
        }
      }
    }
  }

  // Replace fonts: 'SF Pro' → commonFonts.primary.semibold
  if (mappings.fonts) {
    console.error(`[DEBUG] Applying ${Object.keys(mappings.fonts).length} font mappings`);

    for (const [figmaFont, themePath] of Object.entries(mappings.fonts)) {
      const regex = new RegExp(`fontFamily: '${figmaFont}'`, 'g');
      const matches = result.match(regex);

      console.error(`[DEBUG] Replacing font '${figmaFont}' → ${themePath}`);

      if (matches) {
        console.error(`[DEBUG] Found ${matches.length} font matches for ${figmaFont}`);
        result = result.replace(regex, `fontFamily: ${themePath}`);
      } else {
        console.error(`[DEBUG] No font matches found for ${figmaFont}`);
      }
    }
  } else {
    console.error('[DEBUG] No font mappings provided');
  }

  // Replace spacing: paddingLeft: scale(16) → paddingLeft: theme.spacing.medium
  if (mappings.spacing) {
    console.error(`[DEBUG] Applying ${Object.keys(mappings.spacing).length} spacing mappings`);

    for (const [figmaValue, themePath] of Object.entries(mappings.spacing)) {
      const value = Number(figmaValue);
      // Pattern for all spacing properties
      const spacingProps = [
        'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom',
        'marginLeft', 'marginRight', 'marginTop', 'marginBottom',
        'gap', 'rowGap'
      ];

      for (const prop of spacingProps) {
        const pattern = `${prop}:\\s*scale\\(${value}\\)`;
        const regex = new RegExp(pattern, 'g');
        const matches = result.match(regex);

        if (matches) {
          console.error(`[DEBUG] Found ${matches.length} spacing matches for ${prop}: scale(${value}) → ${themePath}`);
          result = result.replace(regex, `${prop}: ${themePath}`);
        }
      }
    }
  } else {
    console.error('[DEBUG] No spacing mappings provided');
  }

  // Replace radii: borderRadius: scale(12) → borderRadius: theme.border.radius.small
  if (mappings.radii) {
    console.error(`[DEBUG] Applying ${Object.keys(mappings.radii).length} radii mappings`);

    for (const [figmaValue, themePath] of Object.entries(mappings.radii)) {
      const value = Number(figmaValue);
      // Pattern for all radius properties
      const radiusProps = [
        'borderRadius',
        'borderTopLeftRadius', 'borderTopRightRadius',
        'borderBottomLeftRadius', 'borderBottomRightRadius'
      ];

      for (const prop of radiusProps) {
        const pattern = `${prop}:\\s*scale\\(${value}\\)`;
        const regex = new RegExp(pattern, 'g');
        const matches = result.match(regex);

        if (matches) {
          console.error(`[DEBUG] Found ${matches.length} radii matches for ${prop}: scale(${value}) → ${themePath}`);
          result = result.replace(regex, `${prop}: ${themePath}`);
        }
      }
    }
  } else {
    console.error('[DEBUG] No radii mappings provided');
  }

  // Replace shadows: shadow property groups → ...theme.shadows.card
  if (mappings.shadows) {
    console.error(`[DEBUG] Applying ${Object.keys(mappings.shadows).length} shadow mappings`);

    for (const [shadowSignature, themePath] of Object.entries(mappings.shadows)) {
      // shadowSignature format: "shadowColor-rgba(...)-shadowOpacity-0.1-shadowRadius-scale(8)-elevation-4"

      // Extract components from signature
      const parts = shadowSignature.split('-');
      if (parts.length >= 8) {
        // Find pattern with these specific values
        const shadowColorValue = parts.slice(1, parts.indexOf('shadowOpacity')).join('-');
        const opacityIdx = parts.indexOf('shadowOpacity');
        const radiusIdx = parts.indexOf('shadowRadius');
        const elevationIdx = parts.indexOf('elevation');

        const opacityValue = parts[opacityIdx + 1];
        const radiusValue = parts.slice(radiusIdx + 1, elevationIdx).join('-');
        const elevationValue = parts[elevationIdx + 1];

        // Create pattern to find all shadow properties together
        const pattern = `shadowColor:\\s*${shadowColorValue.replace(/[()]/g, '\\$&')},\\s*shadowOpacity:\\s*${opacityValue},\\s*shadowRadius:\\s*${radiusValue.replace(/[()]/g, '\\$&')},\\s*elevation:\\s*${elevationValue}`;
        const regex = new RegExp(pattern, 'g');
        const matches = result.match(regex);

        if (matches) {
          console.error(`[DEBUG] Found ${matches.length} shadow matches → ${themePath}`);
          result = result.replace(regex, `...${themePath}`);
        }
      }
    }
  } else {
    console.error('[DEBUG] No shadow mappings provided');
  }

  // Replace gradients: colors={['#7A54FF', '#AB5CE9']} → colors={theme.gradients.primary}
  if (mappings.gradients) {
    console.error(`[DEBUG] Applying ${Object.keys(mappings.gradients).length} gradient mappings`);

    for (const [gradientSignature, themePath] of Object.entries(mappings.gradients)) {
      // gradientSignature format: "#7A54FF,#AB5CE9"
      const colors = gradientSignature.split(',');
      const colorPattern = colors.map(c => `'${c}'`).join(',\\s*');

      // Pattern: colors={['#7A54FF', '#AB5CE9']}
      const pattern = `colors=\\{\\[${colorPattern}\\]\\}`;
      const regex = new RegExp(pattern, 'g');
      const matches = result.match(regex);

      if (matches) {
        console.error(`[DEBUG] Found ${matches.length} gradient matches for ${gradientSignature} → ${themePath}`);
        result = result.replace(regex, `colors={${themePath}}`);
      }
    }
  } else {
    console.error('[DEBUG] No gradient mappings provided');
  }

  // Add imports for used tokens
  const needsPaletteImport = result.includes('palette.');
  const needsTypographyImport = result.includes('...typography.');
  const needsThemeImport = result.includes('theme.spacing') ||
                           result.includes('theme.border') ||
                           result.includes('theme.shadows') ||
                           result.includes('theme.gradients');

  if (needsPaletteImport || needsTypographyImport || needsThemeImport) {
    const imports: string[] = [];
    if (needsPaletteImport) imports.push('palette');
    if (needsTypographyImport) imports.push('typography');
    // theme will be available from useTheme hook, no separate import needed

    // Find place for import (after last import)
    const importMatch = result.match(/^(import .+;\n)+/m);
    if (importMatch && imports.length > 0) {
      const lastImportEnd = importMatch.index! + importMatch[0].length;
      const themeImport = `import { ${imports.join(', ')} } from '@app/styles/theme';\n`;
      result = result.slice(0, lastImportEnd) + themeImport + result.slice(lastImportEnd);
      console.error(`[DEBUG] Added theme import: ${themeImport.trim()}`);
    }

    // Note: theme.spacing, theme.border, theme.shadows are used via theme object
    // which is already available from useTheme hook
    if (needsThemeImport) {
      console.error('[DEBUG] Theme tokens (spacing/border/shadows/gradients) will be accessed via theme object from useTheme');
    }
  }

  console.error('[DEBUG] Theme mapping complete');
  return result;
}

/**
 * Converts HEX to RGB
 */
function hexToRgb(hex: string): { r: number, g: number, b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  const rgb = result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };

  console.error(`[DEBUG] hexToRgb: ${hex} → r:${rgb.r}, g:${rgb.g}, b:${rgb.b}`);

  return rgb;
}

/**
 * System components that should not be generated
 */
const SKIP_GENERATION_PATTERNS = [
  'statusbar', 'status bar', 'status-bar', '_statusbar',
  'homeindicator', 'home indicator', 'home-indicator',
  'safeareaview', 'safe area',
  'battery', 'wifi', 'signal', 'cellular',
  'notch', 'dynamic island',
  'time', 'carrier',
  // Battery sub-components
  'outline', 'fill', 'battery end',
  // Keyboard patterns - iOS/Android system keyboards
  'keyboard', 'keys', 'keyslayout', 'keys layout',
  'component key', 'componentkey', 'key row', 'keyrow',
  'alphabetic', 'numeric keyboard', 'numpad', 'cnt'
];

/**
 * Checks if the node should be skipped during generation
 */
function shouldSkipNode(nodeName: string): boolean {
  if (!nodeName) return false;

  const lowerName = nodeName.toLowerCase();
  const shouldSkip = SKIP_GENERATION_PATTERNS.some(pattern => lowerName.includes(pattern));

  if (shouldSkip) {
    console.error(`[DEBUG] Skipping system component: ${nodeName}`);
  }

  return shouldSkip;
}


/**
 * Adds necessary imports
 */
function addImports(sourceFile: SourceFile, metadata: any, componentGroups?: ComponentGroupDetection[]): void {
  // React
  sourceFile.addImportDeclaration({
    moduleSpecifier: 'react',
    defaultImport: 'React',
  });

  // Collect necessary RN components
  const rnComponents = collectRNComponents(metadata, componentGroups);

  // React Native components
  sourceFile.addImportDeclaration({
    moduleSpecifier: 'react-native',
    namedImports: Array.from(rnComponents),
  });

  // scale utility
  sourceFile.addImportDeclaration({
    moduleSpecifier: '@app/utils/responsive',
    namedImports: ['scale'],
  });

  // useTheme hook
  sourceFile.addImportDeclaration({
    moduleSpecifier: '@app/contexts/ThemeContext',
    namedImports: ['useTheme'],
  });

  // ThemeType
  sourceFile.addImportDeclaration({
    moduleSpecifier: '@app/styles/theme',
    namedImports: [{ name: 'ThemeType', isTypeOnly: true }],
  });

  // LinearGradient (if needed)
  if (hasGradientFills(metadata)) {
    sourceFile.addImportDeclaration({
      moduleSpecifier: 'expo-linear-gradient',
      namedImports: ['LinearGradient'],
    });
  }
}

/**
 * Collects all necessary RN components from metadata
 */
function collectRNComponents(node: any, componentGroups?: ComponentGroupDetection[]): Set<string> {
  const components = new Set<string>();

  // Add TouchableOpacity if component groups are present
  if (componentGroups && componentGroups.length > 0) {
    components.add('TouchableOpacity');
  }

  const traverse = (n: any) => {
    // Skip system components
    if (shouldSkipNode(n.name)) {
      return;
    }

    const component = mapToRNComponent(n);
    components.add(component);

    if (n.children && Array.isArray(n.children)) {
      n.children.forEach(traverse);
    }
  };

  traverse(node);
  return components;
}

/**
 * Checks if node or its descendants have gradient fills
 */
function hasGradientFills(node: any): boolean {
  if (node.fills?.some((f: any) => f.type?.startsWith('GRADIENT_') && f.visible !== false)) {
    return true;
  }
  if (node.children && Array.isArray(node.children)) {
    return node.children.some((child: any) => hasGradientFills(child));
  }
  return false;
}

/**
 * Generates props interface properties for component groups
 */
function generateComponentGroupProps(groups: ComponentGroupDetection[]): Array<{name: string, type: string, hasQuestionToken: boolean}> {
  const props: Array<{name: string, type: string, hasQuestionToken: boolean}> = [];

  for (const group of groups) {
    switch (group.pattern) {
      case 'rating':
        props.push({ name: 'rating', type: 'number', hasQuestionToken: true });
        props.push({ name: 'onRatingChange', type: '(value: number) => void', hasQuestionToken: true });
        break;
      case 'tabs':
        props.push({ name: 'activeTab', type: 'number', hasQuestionToken: true });
        props.push({ name: 'onTabChange', type: '(index: number) => void', hasQuestionToken: true });
        break;
      case 'segmented-control':
        props.push({ name: 'selectedSegment', type: 'number', hasQuestionToken: true });
        props.push({ name: 'onSegmentChange', type: '(index: number) => void', hasQuestionToken: true });
        break;
      case 'stepper':
        props.push({ name: 'stepperValue', type: 'number', hasQuestionToken: true });
        props.push({ name: 'onIncrement', type: '() => void', hasQuestionToken: true });
        props.push({ name: 'onDecrement', type: '() => void', hasQuestionToken: true });
        break;
      case 'pagination':
        props.push({ name: 'currentPage', type: 'number', hasQuestionToken: true });
        props.push({ name: 'onPageChange', type: '(index: number) => void', hasQuestionToken: true });
        break;
    }
  }
  return props;
}

/**
 * Generates props destructure statement with default values
 */
function generatePropsDestructure(groups: ComponentGroupDetection[]): string {
  const vars: string[] = [];

  for (const group of groups) {
    switch (group.pattern) {
      case 'rating':
        vars.push('rating = 0', 'onRatingChange');
        break;
      case 'tabs':
        vars.push('activeTab = 0', 'onTabChange');
        break;
      case 'segmented-control':
        vars.push('selectedSegment = 0', 'onSegmentChange');
        break;
      case 'stepper':
        vars.push('stepperValue = 0', 'onIncrement', 'onDecrement');
        break;
      case 'pagination':
        vars.push('currentPage = 0', 'onPageChange');
        break;
    }
  }

  return `const { ${vars.join(', ')} } = props;`;
}

/**
 * Generates functional component
 */
function generateComponent(
  sourceFile: SourceFile,
  metadata: any,
  componentName: string,
  imageMap?: Map<string, string>,
  styleMap?: Map<string, string>,
  componentGroups?: ComponentGroupDetection[]
): void {
  // If component groups exist, generate props interface
  if (componentGroups && componentGroups.length > 0) {
    const propsInterface = generateComponentGroupProps(componentGroups);
    sourceFile.addInterface({
      name: `${componentName}Props`,
      isExported: true,
      properties: propsInterface
    });
  }

  sourceFile.addFunction({
    name: componentName,
    isExported: true,
    returnType: 'JSX.Element',
    parameters: componentGroups?.length ? [{
      name: 'props',
      type: `${componentName}Props`
    }] : [],
    statements: (writer) => {
      // Destructure props for each pattern
      if (componentGroups?.length) {
        const destructure = generatePropsDestructure(componentGroups);
        writer.writeLine(destructure);
        writer.blankLine();
      }

      writer.writeLine('const {styles, theme} = useTheme(createStyles);');
      writer.blankLine();
      writer.write('return (');
      writer.newLine();
      writer.write('  <>');
      writer.newLine();

      // Generate JSX
      const jsx = generateJSXRecursive(metadata, 2, undefined, imageMap, styleMap, componentGroups);
      writer.write(jsx);

      writer.newLine();
      writer.write('  </>');
      writer.newLine();
      writer.write(');');
    },
  });
}

/**
 * Gradient information
 */
interface GradientInfo {
  type: 'linear' | 'radial';
  colors: string[];
  locations: number[];
  start: { x: number; y: number };
  end: { x: number; y: number };
}

/**
 * Extracts gradient information from fills
 */
function extractGradientInfo(fills: any[]): GradientInfo | null {
  if (!fills || !Array.isArray(fills)) return null;

  const gradientFill = fills.find(f =>
    f.type?.startsWith('GRADIENT_') && f.visible !== false
  );

  if (!gradientFill || !gradientFill.gradientStops) return null;

  const colors = gradientFill.gradientStops.map((stop: any) => {
    const { r, g, b } = stop.color;
    const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
  });

  const locations = gradientFill.gradientStops.map((stop: any) => stop.position);

  let start = { x: 0, y: 0.5 };
  let end = { x: 1, y: 0.5 };

  if (gradientFill.gradientHandlePositions?.length >= 2) {
    const [p1, p2] = gradientFill.gradientHandlePositions;
    start = { x: p1.x, y: p1.y };
    end = { x: p2.x, y: p2.y };
  }

  return { type: gradientFill.type === 'GRADIENT_RADIAL' ? 'radial' : 'linear', colors, locations, start, end };
}

/**
 * Generates JSX recursively
 */
function generateJSXRecursive(
  node: any,
  depth: number,
  parentNode?: any,
  imageMap?: Map<string, string>,
  styleMap?: Map<string, string>,
  componentGroups?: ComponentGroupDetection[]
): string {
  // Skip system components
  if (shouldSkipNode(node.name)) {
    return '';
  }

  // Check if this node is a child of a component group (skip - handled by parent)
  if (componentGroups && isGroupChild(node.id, componentGroups)) {
    return '';
  }

  // Check if this node is a component group parent
  const groupParent = componentGroups ? isGroupParent(node.id, componentGroups) : null;
  if (groupParent) {
    const styleName = normalizeStyleName(generateSmartStyleName(
      node.name || 'group',
      'View',
      { parentName: parentNode?.name }
    ));

    return generateComponentGroupJSX({
      group: groupParent,
      node,
      depth,
      styleName,
    });
  }

  const indent = '  '.repeat(depth);
  const component = mapToRNComponent(node);
  // Generate style name and normalize it (transliteration + camelCase)
  const styleName = normalizeStyleName(generateSmartStyleName(
    node.name || 'root',
    node.type || 'View',
    {
      parentName: parentNode?.name,
      content: node.characters
    }
  ));

  // Check if original name should be preserved as comment
  const originalName = node.name || '';
  const nameNeedsComment = originalName &&
    (originalName.includes('/') || originalName.includes('_') || originalName.startsWith('_'));

  // Get style ID if present
  const styleId = node.styles?.fills || node.styles?.fill;
  const resolvedStyleName = styleId && styleMap ? styleMap.get(styleId) : undefined;

  // Form comment text if needed
  let commentText = '';
  // Add componentId for INSTANCE nodes
  const hasComponentId = node.type === 'INSTANCE' && node.componentId;

  // Extract variant props from componentProperties
  let variantStr = '';
  if (node.componentProperties) {
    const variants = Object.entries(node.componentProperties)
      .filter(([_, v]: [string, any]) => v.value !== undefined)
      .map(([k, v]: [string, any]) => `${k}=${v.value}`)
      .slice(0, 3); // Limit to 3
    if (variants.length > 0) {
      variantStr = variants.join(', ');
    }
  }

  if (nameNeedsComment || resolvedStyleName || hasComponentId || variantStr) {
    const comments = [];
    if (nameNeedsComment) comments.push(originalName);
    if (resolvedStyleName) comments.push(resolvedStyleName);  // Use resolved name, not ID
    if (hasComponentId) comments.push(`id:${node.componentId}`);
    if (variantStr) comments.push(`variant: ${variantStr}`);
    commentText = `${indent}{/* ${comments.join(' | ')} */}\n`;
  }

  // Check for gradient
  const gradientInfo = extractGradientInfo(node.fills);

  let jsx = '';

  if (gradientInfo) {
    // Wrap in LinearGradient
    if (commentText) {
      jsx += commentText;
    }
    jsx += `${indent}<LinearGradient\n`;
    jsx += `${indent}  colors={${JSON.stringify(gradientInfo.colors)}}\n`;
    jsx += `${indent}  locations={${JSON.stringify(gradientInfo.locations)}}\n`;
    jsx += `${indent}  start={{x: ${gradientInfo.start.x}, y: ${gradientInfo.start.y}}}\n`;
    jsx += `${indent}  end={{x: ${gradientInfo.end.x}, y: ${gradientInfo.end.y}}}\n`;
    jsx += `${indent}  style={styles.${styleName}}`;

    if (node.children && node.children.length > 0) {
      jsx += '>\n';

      // Filter children and remove empty strings
      const childrenJSX = node.children
        .map((child: any) => generateJSXRecursive(child, depth + 1, node, imageMap, styleMap, componentGroups))
        .filter((childJSX: string) => childJSX.trim() !== '');

      if (childrenJSX.length > 0) {
        childrenJSX.forEach((childJSX: string) => {
          jsx += childJSX + '\n';
        });
      }

      jsx += `${indent}</LinearGradient>`;
    } else {
      jsx += ' />';
    }
  } else {
    // Regular component without gradient
    if (commentText) {
      jsx = commentText;
      jsx += `${indent}<${component} style={styles.${styleName}}`;
    } else {
      jsx = `${indent}<${component} style={styles.${styleName}}`;
    }

    // Add component-specific props
    if (component === 'Text' && node.characters) {
      // Add font hint if fontPostScriptName available
      const fontHint = node.style?.fontPostScriptName ? ` {/* font: ${node.style.fontPostScriptName} */}` : '';
      jsx += `>${fontHint}\n${indent}  {${JSON.stringify(node.characters)}}\n${indent}</${component}>`;
    } else if (component === 'Image' && node.fills?.[0]?.imageRef) {
      // Determine resizeMode from scaleMode
      const scaleMode = node.fills[0].scaleMode;
      const resizeModeMap: Record<string, string> = {
        'FILL': 'cover',
        'FIT': 'contain',
        'STRETCH': 'stretch',
        'TILE': 'repeat',
        'CROP': 'cover',
      };
      const resizeMode = resizeModeMap[scaleMode] || 'cover';

      // Add imageTransform hint if present (as separate comment line)
      let transformHint = '';
      if (node.fills[0].imageTransform) {
        const [[a, c, tx], [b, d, ty]] = node.fills[0].imageTransform;
        // If transform is not identity, add hint
        if (a !== 1 || b !== 0 || c !== 0 || d !== 1 || tx !== 0 || ty !== 0) {
          transformHint = `\n${indent}{/* imageTransform: scale(${a.toFixed(2)},${d.toFixed(2)}) translate(${tx.toFixed(0)},${ty.toFixed(0)}) */}`;
        }
      }

      // Check if image path is available in imageMap
      const imagePath = imageMap?.get(node.id);
      if (imagePath) {
        jsx += ` source={require('${imagePath}')} resizeMode="${resizeMode}" />${transformHint}`;
      } else {
        jsx += ` source={{uri: 'TODO'}} resizeMode="${resizeMode}" />${transformHint}`;
      }
    } else if (node.children && node.children.length > 0) {
      jsx += '>\n';

      // Filter children and remove empty strings
      const childrenJSX = node.children
        .map((child: any) => generateJSXRecursive(child, depth + 1, node, imageMap, styleMap, componentGroups))
        .filter((childJSX: string) => childJSX.trim() !== '');

      if (childrenJSX.length > 0) {
        childrenJSX.forEach((childJSX: string) => {
          jsx += childJSX + '\n';
        });
      }

      jsx += `${indent}</${component}>`;
    } else {
      jsx += ' />';
    }
  }

  return jsx;
}

/**
 * Generates createStyles function
 */
function generateCreateStyles(sourceFile: SourceFile, metadata: any, config: ProjectConfig, options?: GeneratorOptions): void {
  // Collect all styles
  const stylesMap = new Map<string, any>();
  collectStyles(metadata, stylesMap, config, undefined, options?.componentGroups);

  sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: 'createStyles',
        initializer: (writer) => {
          writer.write('({palette, commonFonts}: ThemeType) => ({');
          writer.newLine();

          // Manually write each style
          const styleNames = Array.from(stylesMap.keys());
          styleNames.forEach((styleName, styleIndex) => {
            const styleProps = stylesMap.get(styleName)!;

            writer.write(`  ${styleName}: {`);
            writer.newLine();

            // Write each style property
            const propNames = Object.keys(styleProps);
            propNames.forEach((propName, propIndex) => {
              const value = styleProps[propName];

              writer.write(`    ${propName}: `);

              // Determine if quotes are needed
              if (typeof value === 'string') {
                // Check if value is a function call or theme reference
                if (
                  value.startsWith('scale(') ||
                  value.startsWith('palette.') ||
                  value.startsWith('commonFonts.')
                ) {
                  // No quotes for function calls and theme references
                  writer.write(value);
                } else {
                  // Add quotes for string literals
                  writer.write(`'${value}'`);
                }
              } else if (typeof value === 'number') {
                // Numbers without quotes
                writer.write(String(value));
              } else {
                // For other types use JSON.stringify
                writer.write(JSON.stringify(value));
              }

              // Add comma if not the last property
              if (propIndex < propNames.length - 1) {
                writer.write(',');
              }

              writer.newLine();
            });

            writer.write('  }');

            // Add comma if not the last style
            if (styleIndex < styleNames.length - 1) {
              writer.write(',');
            }

            writer.newLine();
          });

          writer.write('}) as const');
        },
      },
    ],
  });
}

/**
 * Generates component group-specific styles
 */
function generateComponentGroupStyles(
  stylesMap: Map<string, any>,
  containerStyleName: string,
  group: ComponentGroupDetection,
  node: any,
  config: ProjectConfig
): void {
  const scaleFunc = config.codeStyle.scaleFunction;

  // Helper to apply scale function
  const applyScale = (value: number): string | number => {
    return scaleFunc ? `${scaleFunc}(${value})` : value;
  };

  // Helper to find node by ID in tree
  const findNode = (root: any, targetId: string): any | null => {
    if (!root) return null;
    if (root.id === targetId) return root;
    if (root.children) {
      for (const child of root.children) {
        const found = findNode(child, targetId);
        if (found) return found;
      }
    }
    return null;
  };

  // Get first child node using actual nodeId from group
  const firstChildId = group.childNodeIds[0];
  const firstChild = firstChildId ? findNode(node, firstChildId) : node.children?.[0];

  // Extract actual styles from the child node
  const childStyle = firstChild ? generateStyleObject(firstChild, config) : {};

  // Get actual dimensions
  const itemWidth = firstChild?.absoluteBoundingBox?.width || firstChild?.width || 56;
  const itemHeight = firstChild?.absoluteBoundingBox?.height || firstChild?.height || 54;

  switch (group.pattern) {
    case 'rating': {
      // Star touchable area - use actual child dimensions
      stylesMap.set(`${containerStyleName}Star`, {
        width: applyScale(itemWidth),
        height: applyScale(itemHeight),
        justifyContent: 'center',
        alignItems: 'center',
      });
      // Star icon - extract actual fill color from child
      const starIconStyle: Record<string, any> = {
        width: applyScale(itemWidth - 4),
        height: applyScale(itemHeight - 4),
      };
      // Use actual styles from the Figma node
      if (childStyle.backgroundColor) {
        starIconStyle.backgroundColor = childStyle.backgroundColor;
      }
      if (childStyle.borderRadius) {
        starIconStyle.borderRadius = childStyle.borderRadius;
      }
      if (childStyle.borderWidth) {
        starIconStyle.borderWidth = childStyle.borderWidth;
      }
      if (childStyle.borderColor) {
        starIconStyle.borderColor = childStyle.borderColor;
      }
      stylesMap.set(`${containerStyleName}StarIcon`, starIconStyle);
      // Active state - use same base but with opacity change for visual feedback
      const starActiveStyle: Record<string, any> = {
        opacity: 1,
      };
      if (childStyle.backgroundColor) {
        starActiveStyle.backgroundColor = childStyle.backgroundColor;
      }
      stylesMap.set(`${containerStyleName}StarIconActive`, starActiveStyle);
      break;
    }

    case 'tabs': {
      // Tab item - extract actual styles
      const tabStyle: Record<string, any> = {
        paddingHorizontal: childStyle.paddingLeft || childStyle.paddingRight || applyScale(16),
        paddingVertical: childStyle.paddingTop || childStyle.paddingBottom || applyScale(8),
      };
      if (childStyle.backgroundColor) {
        tabStyle.backgroundColor = childStyle.backgroundColor;
      }
      stylesMap.set(`${containerStyleName}Tab`, tabStyle);
      stylesMap.set(`${containerStyleName}TabActive`, {
        borderBottomWidth: applyScale(2),
        borderBottomColor: childStyle.borderColor || childStyle.backgroundColor,
      });
      // Tab text - look for text child
      const textChild = firstChild?.children?.find((c: any) => c.type === 'TEXT');
      const textStyle = textChild ? generateStyleObject(textChild, config) : {};
      stylesMap.set(`${containerStyleName}TabText`, {
        fontSize: textStyle.fontSize || applyScale(14),
        color: textStyle.color,
        fontWeight: textStyle.fontWeight,
      });
      stylesMap.set(`${containerStyleName}TabTextActive`, {
        fontWeight: '600',
      });
      break;
    }

    case 'segmented-control':
      stylesMap.set(`${containerStyleName}Segment`, {
        flex: 1,
        paddingVertical: childStyle.paddingTop || applyScale(8),
        alignItems: 'center',
        backgroundColor: childStyle.backgroundColor,
        borderRadius: childStyle.borderRadius,
      });
      stylesMap.set(`${containerStyleName}SegmentSelected`, {
        opacity: 0.8,
      });
      stylesMap.set(`${containerStyleName}SegmentText`, {
        fontSize: applyScale(14),
      });
      break;

    case 'stepper':
      stylesMap.set(`${containerStyleName}Button`, {
        width: childStyle.width || applyScale(40),
        height: childStyle.height || applyScale(40),
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: childStyle.backgroundColor,
        borderRadius: childStyle.borderRadius || applyScale(8),
      });
      stylesMap.set(`${containerStyleName}ButtonText`, {
        fontSize: applyScale(20),
        fontWeight: '600',
      });
      stylesMap.set(`${containerStyleName}Value`, {
        fontSize: applyScale(16),
        minWidth: applyScale(40),
        textAlign: 'center',
      });
      break;

    case 'pagination':
      stylesMap.set(`${containerStyleName}Dot`, {
        width: childStyle.width || applyScale(8),
        height: childStyle.height || applyScale(8),
        borderRadius: childStyle.borderRadius || applyScale(4),
        backgroundColor: childStyle.backgroundColor,
      });
      stylesMap.set(`${containerStyleName}DotActive`, {
        opacity: 1
      });
      break;
  }
}

/**
 * Collects all styles from metadata tree
 */
function collectStyles(
  node: any,
  stylesMap: Map<string, any>,
  config: ProjectConfig,
  parentNode?: any,
  componentGroups?: ComponentGroupDetection[]
): void {
  // Skip system components
  if (shouldSkipNode(node.name)) {
    return;
  }

  // Check if this node is a child of a component group (skip - handled by parent)
  if (componentGroups && isGroupChild(node.id, componentGroups)) {
    return;
  }

  // Check if this is a component group parent
  const groupParent = componentGroups ? isGroupParent(node.id, componentGroups) : null;
  if (groupParent) {
    // Generate container style
    const containerStyleName = normalizeStyleName(generateSmartStyleName(
      node.name || 'group',
      'View',
      { parentName: parentNode?.name }
    ));

    const containerStyle = generateStyleObject(node, config);
    if (Object.keys(containerStyle).length > 0) {
      stylesMap.set(containerStyleName, containerStyle);
    }

    // Generate pattern-specific item styles
    generateComponentGroupStyles(stylesMap, containerStyleName, groupParent, node, config);

    return; // Don't traverse children - handled as group
  }

  // Generate style name and normalize it (transliteration + camelCase)
  const styleName = normalizeStyleName(generateSmartStyleName(
    node.name || 'root',
    node.type || 'View',
    {
      parentName: parentNode?.name,
      content: node.characters
    }
  ));
  const styleObject = generateStyleObject(node, config);

  // Skip empty style objects
  if (Object.keys(styleObject).length > 0) {
    stylesMap.set(styleName, styleObject);
  }

  if (node.children && Array.isArray(node.children)) {
    node.children.forEach((child: any) => collectStyles(child, stylesMap, config, node, componentGroups));
  }
}

/**
 * Validates and cleans style object
 *
 * @param styles - Style object
 * @param nodeType - Node type (TEXT, FRAME, etc.)
 * @returns Cleaned style object
 */
function validateStyleObject(
  styles: Record<string, any>,
  nodeType: string
): Record<string, any> {
  const validated: Record<string, any> = {};

  for (const [key, value] of Object.entries(styles)) {
    // Rule 1: Text cannot have backgroundColor
    if (nodeType === 'TEXT' && key === 'backgroundColor') {
      continue;  // Skip
    }

    // Rule 2: Skip undefined and null
    if (value === undefined || value === null) {
      continue;
    }

    // Rule 3: Skip empty strings
    if (value === '') {
      continue;
    }

    validated[key] = value;
  }

  return validated;
}

/**
 * Generates style object for node
 */
function generateStyleObject(node: any, config: ProjectConfig): Record<string, any> {
  const styles: Record<string, any> = {};
  const scaleFunc = config.codeStyle.scaleFunction;

  // Helper to apply scale function
  const applyScale = (value: number): string | number => {
    return scaleFunc ? `${scaleFunc}(${value})` : value;
  };

  // Layout properties
  if (node.layoutMode === 'HORIZONTAL') {
    styles.flexDirection = 'row';
  } else if (node.layoutMode === 'VERTICAL') {
    styles.flexDirection = 'column';
  }

  // Gap
  if (node.itemSpacing !== undefined && node.itemSpacing > 0) {
    styles.gap = applyScale(node.itemSpacing);
  }

  // Flex wrap
  if (node.layoutWrap === 'WRAP') {
    styles.flexWrap = 'wrap';
    if (node.counterAxisSpacing !== undefined && node.counterAxisSpacing > 0) {
      styles.rowGap = applyScale(node.counterAxisSpacing);
    }
  }

  // Padding
  if (node.paddingLeft !== undefined) {
    styles.paddingLeft = applyScale(node.paddingLeft);
  }
  if (node.paddingRight !== undefined) {
    styles.paddingRight = applyScale(node.paddingRight);
  }
  if (node.paddingTop !== undefined) {
    styles.paddingTop = applyScale(node.paddingTop);
  }
  if (node.paddingBottom !== undefined) {
    styles.paddingBottom = applyScale(node.paddingBottom);
  }

  // Sizing mode (FILL, HUG, FIXED)
  if (node.layoutSizingHorizontal === 'FILL') {
    styles.flex = 1;
  } else if (node.layoutSizingHorizontal === 'FIXED' && node.absoluteBoundingBox?.width) {
    styles.width = applyScale(node.absoluteBoundingBox.width);
  }
  if (node.layoutSizingVertical === 'FIXED' && node.absoluteBoundingBox?.height) {
    styles.height = applyScale(node.absoluteBoundingBox.height);
  }
  if (node.layoutGrow !== undefined && node.layoutGrow > 0) {
    styles.flexGrow = node.layoutGrow;
  }

  // Opacity
  if (node.opacity !== undefined && node.opacity < 1) {
    styles.opacity = node.opacity;
  }

  // Dimensions
  if (node.width !== undefined && typeof node.width === 'number') {
    styles.width = applyScale(node.width);
  }
  if (node.height !== undefined && typeof node.height === 'number') {
    styles.height = applyScale(node.height);
  }

  // Corner radius - check for individual radii first
  if (node.rectangleCornerRadii && Array.isArray(node.rectangleCornerRadii)) {
    const [tl, tr, br, bl] = node.rectangleCornerRadii;
    if (tl === tr && tr === br && br === bl) {
      if (tl > 0) {
        styles.borderRadius = applyScale(tl);
      }
    } else {
      if (tl > 0) styles.borderTopLeftRadius = applyScale(tl);
      if (tr > 0) styles.borderTopRightRadius = applyScale(tr);
      if (br > 0) styles.borderBottomRightRadius = applyScale(br);
      if (bl > 0) styles.borderBottomLeftRadius = applyScale(bl);
    }
  } else if (node.cornerRadius !== undefined && node.cornerRadius > 0) {
    styles.borderRadius = applyScale(node.cornerRadius);
  }

  // Background color
  if (node.fills && Array.isArray(node.fills) && node.fills.length > 0) {
    const fill = node.fills[0];
    if (fill.type?.startsWith('GRADIENT_')) {
      // Skip - handled by LinearGradient wrapper
    } else if (fill.type === 'SOLID' && fill.color) {
      const { r, g, b } = fill.color;
      const opacity = fill.opacity ?? 1;
      styles.backgroundColor = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${opacity})`;
    }
  }

  // Border (strokes)
  // Only add border if stroke has visible color
  if (node.strokes && Array.isArray(node.strokes) && node.strokes.length > 0) {
    const stroke = node.strokes[0];
    if (stroke.type === 'SOLID' && stroke.color && stroke.visible !== false) {
      const { r, g, b } = stroke.color;
      const opacity = stroke.opacity ?? stroke.color.a ?? 1;
      styles.borderColor = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${opacity})`;

      // Only add borderWidth if we have a visible borderColor
      if (node.strokeWeight !== undefined && node.strokeWeight > 0) {
        styles.borderWidth = applyScale(node.strokeWeight);
      }
    }
  }

  // Shadows (effects)
  if (node.effects && Array.isArray(node.effects)) {
    const shadow = node.effects.find((e: any) =>
      (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') && e.visible !== false
    );
    if (shadow) {
      const { r, g, b, a } = shadow.color || { r: 0, g: 0, b: 0, a: 0.25 };
      const blurRadius = shadow.radius ?? 0;
      styles.shadowColor = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, 1)`;
      styles.shadowOpacity = a;
      styles.shadowRadius = applyScale(blurRadius / 2);

      // Shadow offset
      if (shadow.offset) {
        styles.shadowOffset = { width: shadow.offset.x, height: shadow.offset.y };
      }

      styles.elevation = Math.max(1, Math.round(blurRadius / 2));
    }
  }

  // Typography (for Text components)
  if (node.type === 'TEXT' && node.style) {
    if (node.style.fontFamily) {
      styles.fontFamily = node.style.fontFamily;
    }
    if (node.style.fontSize) {
      styles.fontSize = applyScale(node.style.fontSize);
    }
    if (node.style.fontWeight) {
      styles.fontWeight = String(node.style.fontWeight);
    }
    if (node.style.lineHeightPx) {
      styles.lineHeight = applyScale(node.style.lineHeightPx);
    }
    if (node.style.letterSpacing) {
      styles.letterSpacing = node.style.letterSpacing;
    }

    // Text align
    if (node.style.textAlignHorizontal) {
      const alignMap: Record<string, string> = {
        'LEFT': 'left',
        'CENTER': 'center',
        'RIGHT': 'right',
        'JUSTIFIED': 'justify',
      };
      if (alignMap[node.style.textAlignHorizontal]) {
        styles.textAlign = alignMap[node.style.textAlignHorizontal];
      }
    }

    // Text transform
    if (node.style.textCase) {
      const caseMap: Record<string, string> = {
        'UPPER': 'uppercase',
        'LOWER': 'lowercase',
        'TITLE': 'capitalize',
      };
      if (caseMap[node.style.textCase]) {
        styles.textTransform = caseMap[node.style.textCase];
      }
    }

    // Text color
    if (node.fills && Array.isArray(node.fills) && node.fills.length > 0) {
      const fill = node.fills[0];
      if (fill.type === 'SOLID' && fill.color) {
        const { r, g, b } = fill.color;
        const opacity = fill.opacity ?? 1;
        styles.color = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${opacity})`;
      }
    }
  }

  // Alignment
  if (node.primaryAxisAlignItems) {
    const alignMap: Record<string, string> = {
      'MIN': 'flex-start',
      'CENTER': 'center',
      'MAX': 'flex-end',
      'SPACE_BETWEEN': 'space-between',
    };
    styles.justifyContent = alignMap[node.primaryAxisAlignItems] || 'flex-start';
  }

  if (node.counterAxisAlignItems) {
    const alignMap: Record<string, string> = {
      'MIN': 'flex-start',
      'CENTER': 'center',
      'MAX': 'flex-end',
    };
    styles.alignItems = alignMap[node.counterAxisAlignItems] || 'flex-start';
  }

  // Layout align (child alignment override)
  if (node.layoutAlign === 'STRETCH') {
    styles.alignSelf = 'stretch';
  }

  // Constraints for absolute positioning
  if (node.layoutPositioning === 'ABSOLUTE' && node.constraints) {
    styles.position = 'absolute';

    // Horizontal constraint
    const h = node.constraints.horizontal;
    if (h === 'LEFT' || h === 'MIN') {
      // Need x from parent - use boundingBox if available
      if (node.absoluteBoundingBox?.x !== undefined) {
        // Note: these are absolute coords, need offset from parent
        styles.left = applyScale(0); // Placeholder - parent offset needed
      }
    } else if (h === 'RIGHT' || h === 'MAX') {
      styles.right = applyScale(0);
    } else if (h === 'CENTER') {
      styles.alignSelf = 'center';
    }

    // Vertical constraint
    const v = node.constraints.vertical;
    if (v === 'TOP' || v === 'MIN') {
      styles.top = applyScale(0);
    } else if (v === 'BOTTOM' || v === 'MAX') {
      styles.bottom = applyScale(0);
    } else if (v === 'CENTER') {
      // Vertical centering requires special handling
    }
  }

  // Validate styles before return
  return validateStyleObject(styles, node.type || 'FRAME');
}

/**
 * Maps Figma node types to React Native components
 */
function mapToRNComponent(node: any): string {
  if (!node.type) return 'View';

  switch (node.type) {
    case 'TEXT':
      return 'Text';
    case 'RECTANGLE':
      // If has image
      if (node.fills && node.fills.some((f: any) => f.type === 'IMAGE')) {
        return 'Image';
      }
      return 'View';
    case 'FRAME':
    case 'GROUP':
      // If looks like a button (has handlers or specific name)
      if (node.name && /button|btn/i.test(node.name)) {
        return 'TouchableOpacity';
      }
      return 'View';
    case 'INSTANCE':
    case 'COMPONENT':
      return 'View';
    default:
      return 'View';
  }
}
