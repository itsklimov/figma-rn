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

/**
 * Опции генератора
 * Generator options
 */
export interface GeneratorOptions {
  styleMap?: Map<string, string>;
}

/**
 * Основная функция генерации React Native компонента
 * Generates React Native component code using ts-morph for AST-based generation
 */
export async function generateReactNativeComponent(
  metadata: any,
  componentName: string,
  config?: ProjectConfig,
  imageMap?: Map<string, string>, // nodeId -> путь к изображению / path to image
  options?: GeneratorOptions
): Promise<string> {
  // Загружаем конфиг, если не предоставлен
  // Load config if not provided
  if (!config) {
    config = await loadProjectConfig() || getDefaultConfig();
  }

  // Автоматически генерируем маппинги on-the-fly каждый раз
  // Auto-generate mappings on-the-fly every time
  if (config.theme?.location) {
    // Генерируем маппинги цветов / Generate color mappings
    const figmaColors = extractFigmaColors(metadata);
    const colorMappings = await autoGenerateColorMappings(figmaColors, config);

    // Путь к основному файлу темы (или fallback на colors) / Path to main theme file (or fallback to colors)
    const mainThemePath = config.theme.mainThemeLocation || config.theme.location;

    // Генерируем маппинги spacing / Generate spacing mappings
    const figmaSpacing = extractFigmaSpacing(metadata);
    const spacingMappings = await autoGenerateSpacingMappings(figmaSpacing, mainThemePath);

    // Генерируем маппинги radii / Generate radii mappings
    const figmaRadii = extractFigmaRadii(metadata);
    const radiiMappings = await autoGenerateRadiiMappings(figmaRadii, mainThemePath);

    // Генерируем маппинги shadows / Generate shadow mappings
    const figmaShadows = extractFigmaShadows(metadata);
    const shadowMappings = await autoGenerateShadowMappings(figmaShadows, mainThemePath);

    // Генерируем маппинги typography / Generate typography mappings
    const figmaTypography = extractFigmaTypography(metadata);
    const typographyPath = config.theme?.typographyFile
      ? `${config.projectRoot || '.'}/${config.theme.typographyFile}`
      : mainThemePath;
    const typographyMappings = await autoGenerateTypographyMappings(figmaTypography, typographyPath);

    if (!config.mappings) config.mappings = {};
    config.mappings.colors = colorMappings;
    config.mappings.spacing = spacingMappings;
    config.mappings.radii = radiiMappings;
    config.mappings.shadows = shadowMappings;
    config.mappings.typography = typographyMappings;

    // НЕ сохраняем маппинги в файл - используем только в памяти
    // DON'T save mappings to file - use in memory only
    // await updateConfigMappings({ colors: colorMappings }); // REMOVED

    console.error('[DEBUG] Generated mappings on-the-fly:');
    console.error('  - Colors:', config.mappings.colors ? Object.keys(config.mappings.colors).length : 0);
    console.error('  - Spacing:', config.mappings.spacing ? Object.keys(config.mappings.spacing).length : 0);
    console.error('  - Radii:', config.mappings.radii ? Object.keys(config.mappings.radii).length : 0);
    console.error('  - Shadows:', config.mappings.shadows ? Object.keys(config.mappings.shadows).length : 0);
    console.error('  - Typography:', config.mappings.typography ? Object.keys(config.mappings.typography).length : 0);
  }

  // Создаем новый TypeScript проект
  const project = new Project({
    useInMemoryFileSystem: true,
  });

  // Создаем source file
  const sourceFile = project.createSourceFile(
    `${componentName}.tsx`,
    '',
    { overwrite: true }
  );

  // Добавляем импорты
  addImports(sourceFile, metadata);

  // Генерируем компонент
  generateComponent(sourceFile, metadata, componentName, imageMap, options?.styleMap);

  // Генерируем createStyles
  generateCreateStyles(sourceFile, metadata, config);

  // Получаем сгенерированный код
  let code = sourceFile.getFullText();

  // Форматируем с помощью prettier
  code = await prettier.format(code, {
    parser: 'typescript',
    singleQuote: true,
    trailingComma: 'es5',
    tabWidth: 2,
  });

  // Применяем маппинги темы
  // Apply theme mappings
  console.error('[DEBUG] About to apply theme mappings. Code length:', code.length);
  console.error('[DEBUG] Code contains rgba() before mapping:', code.includes('rgba('));
  code = applyThemeMappings(code, config.mappings);
  console.error('[DEBUG] After mappings. Contains palette.:', code.includes('palette.'));
  console.error('[DEBUG] Code contains rgba() after mapping:', code.includes('rgba('));

  return code;
}

/**
 * Возвращает конфигурацию по умолчанию
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
 * Применяет маппинги темы к сгенерированному коду
 * Applies theme mappings to generated code
 */
/**
 * Интерфейс маппингов темы
 * Theme mappings interface
 */
interface ThemeMappings {
  colors?: Record<string, string>;
  typography?: Record<string, string>;
  fonts?: Record<string, string>;
  spacing?: Record<number, string>;    // NEW: number → theme path
  radii?: Record<number, string>;      // NEW: number → theme path
  shadows?: Record<string, string>;    // NEW: shadow signature → theme path
  gradients?: Record<string, string>;  // NEW: gradient signature → theme path
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

  // Заменяем цвета: 'rgba(122, 84, 255, 1)' → palette.primary
  // Replace colors: 'rgba(122, 84, 255, 1)' → palette.primary
  if (mappings.colors) {
    console.error(`[DEBUG] Applying ${Object.keys(mappings.colors).length} color mappings`);

    for (const [figmaHex, themePath] of Object.entries(mappings.colors)) {
      const rgb = hexToRgb(figmaHex);
      // Включаем кавычки в паттерн, чтобы заменить 'rgba(...)' на palette.token (без кавычек)
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

  // Заменяем типографику: fontSize + fontWeight → ...typography.body
  // Replace typography: fontSize + fontWeight → ...typography.body
  if (mappings.typography) {
    console.error(`[DEBUG] Applying ${Object.keys(mappings.typography).length} typography mappings`);

    for (const [figmaKey, themePath] of Object.entries(mappings.typography)) {
      // figmaKey формат: "SF Pro/590/17" или "fontSize-17-fontWeight-590"
      // figmaKey format: "SF Pro/590/17" or "fontSize-17-fontWeight-590"
      const parts = figmaKey.split('/');
      if (parts.length >= 3) {
        const weight = parts[1];
        const size = parts[2];

        // Заменяем комбинацию fontSize + fontWeight на spread
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

  // Заменяем шрифты: 'SF Pro' → commonFonts.primary.semibold
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

  // Заменяем spacing: paddingLeft: scale(16) → paddingLeft: theme.spacing.medium
  // Replace spacing: paddingLeft: scale(16) → paddingLeft: theme.spacing.medium
  if (mappings.spacing) {
    console.error(`[DEBUG] Applying ${Object.keys(mappings.spacing).length} spacing mappings`);

    for (const [figmaValue, themePath] of Object.entries(mappings.spacing)) {
      const value = Number(figmaValue);
      // Паттерн для всех spacing свойств
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

  // Заменяем radii: borderRadius: scale(12) → borderRadius: theme.border.radius.small
  // Replace radii: borderRadius: scale(12) → borderRadius: theme.border.radius.small
  if (mappings.radii) {
    console.error(`[DEBUG] Applying ${Object.keys(mappings.radii).length} radii mappings`);

    for (const [figmaValue, themePath] of Object.entries(mappings.radii)) {
      const value = Number(figmaValue);
      // Паттерн для всех radius свойств
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

  // Заменяем shadows: группы shadow свойств → ...theme.shadows.card
  // Replace shadows: shadow property groups → ...theme.shadows.card
  if (mappings.shadows) {
    console.error(`[DEBUG] Applying ${Object.keys(mappings.shadows).length} shadow mappings`);

    for (const [shadowSignature, themePath] of Object.entries(mappings.shadows)) {
      // shadowSignature формат: "shadowColor-rgba(...)-shadowOpacity-0.1-shadowRadius-scale(8)-elevation-4"
      // shadowSignature format: "shadowColor-rgba(...)-shadowOpacity-0.1-shadowRadius-scale(8)-elevation-4"

      // Извлекаем компоненты из сигнатуры
      // Extract components from signature
      const parts = shadowSignature.split('-');
      if (parts.length >= 8) {
        // Ищем паттерн с этими конкретными значениями
        // Find pattern with these specific values
        const shadowColorValue = parts.slice(1, parts.indexOf('shadowOpacity')).join('-');
        const opacityIdx = parts.indexOf('shadowOpacity');
        const radiusIdx = parts.indexOf('shadowRadius');
        const elevationIdx = parts.indexOf('elevation');

        const opacityValue = parts[opacityIdx + 1];
        const radiusValue = parts.slice(radiusIdx + 1, elevationIdx).join('-');
        const elevationValue = parts[elevationIdx + 1];

        // Создаем паттерн для поиска всех shadow свойств вместе
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

  // Заменяем gradients: colors={['#7A54FF', '#AB5CE9']} → colors={theme.gradients.primary}
  // Replace gradients: colors={['#7A54FF', '#AB5CE9']} → colors={theme.gradients.primary}
  if (mappings.gradients) {
    console.error(`[DEBUG] Applying ${Object.keys(mappings.gradients).length} gradient mappings`);

    for (const [gradientSignature, themePath] of Object.entries(mappings.gradients)) {
      // gradientSignature формат: "#7A54FF,#AB5CE9"
      // gradientSignature format: "#7A54FF,#AB5CE9"
      const colors = gradientSignature.split(',');
      const colorPattern = colors.map(c => `'${c}'`).join(',\\s*');

      // Паттерн: colors={['#7A54FF', '#AB5CE9']}
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

  // Добавляем импорты для использованных токенов / Add imports for used tokens
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
    // theme будет доступен из useTheme hook, не нужен отдельный импорт
    // theme will be available from useTheme hook, no separate import needed

    // Ищем место для импорта (после последнего import) / Find place for import (after last import)
    const importMatch = result.match(/^(import .+;\n)+/m);
    if (importMatch && imports.length > 0) {
      const lastImportEnd = importMatch.index! + importMatch[0].length;
      const themeImport = `import { ${imports.join(', ')} } from '@app/styles/theme';\n`;
      result = result.slice(0, lastImportEnd) + themeImport + result.slice(lastImportEnd);
      console.error(`[DEBUG] Added theme import: ${themeImport.trim()}`);
    }

    // Примечание: theme.spacing, theme.border, theme.shadows используются через объект theme
    // Note: theme.spacing, theme.border, theme.shadows are used via theme object
    // который уже доступен из useTheme hook
    // which is already available from useTheme hook
    if (needsThemeImport) {
      console.error('[DEBUG] Theme tokens (spacing/border/shadows/gradients) will be accessed via theme object from useTheme');
    }
  }

  console.error('[DEBUG] Theme mapping complete');
  return result;
}

/**
 * Конвертирует HEX в RGB
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
 * Системные компоненты, которые не нужно генерировать
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
 * Проверяет, нужно ли пропускать узел при генерации
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
 * Проверяет наличие StatusBar в дереве компонентов
 * Checks if StatusBar exists in component tree
 */
function hasStatusBar(node: any): boolean {
  if (!node) return false;

  if (node.name && node.name.toLowerCase().includes('statusbar')) {
    return true;
  }

  if (node.children && Array.isArray(node.children)) {
    return node.children.some((child: any) => hasStatusBar(child));
  }

  return false;
}

/**
 * Добавляет необходимые импорты
 */
function addImports(sourceFile: SourceFile, metadata: any): void {
  // React
  sourceFile.addImportDeclaration({
    moduleSpecifier: 'react',
    defaultImport: 'React',
  });

  // Собираем необходимые RN компоненты
  const rnComponents = collectRNComponents(metadata);

  // Добавляем StatusBar если обнаружен в дизайне
  // Add StatusBar if detected in design
  if (hasStatusBar(metadata)) {
    rnComponents.add('StatusBar');
  }

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

  // LinearGradient (если нужен)
  // LinearGradient (if needed)
  if (hasGradientFills(metadata)) {
    sourceFile.addImportDeclaration({
      moduleSpecifier: 'expo-linear-gradient',
      namedImports: ['LinearGradient'],
    });
  }
}

/**
 * Собирает все необходимые RN компоненты из метаданных
 */
function collectRNComponents(node: any): Set<string> {
  const components = new Set<string>();

  const traverse = (n: any) => {
    // Пропускаем системные компоненты
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
 * Проверяет наличие градиентных заливок в узле или его потомках
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
 * Генерирует функциональный компонент
 */
function generateComponent(
  sourceFile: SourceFile,
  metadata: any,
  componentName: string,
  imageMap?: Map<string, string>,
  styleMap?: Map<string, string>
): void {
  const includeStatusBar = hasStatusBar(metadata);

  sourceFile.addFunction({
    name: componentName,
    isExported: true,
    returnType: 'JSX.Element',
    statements: (writer) => {
      writer.writeLine('const {styles, theme} = useTheme(createStyles);');
      writer.blankLine();
      writer.write('return (');
      writer.newLine();
      writer.write('  <>');
      writer.newLine();

      // Добавляем StatusBar если обнаружен в дизайне
      // Add StatusBar if detected in design
      if (includeStatusBar) {
        writer.write('    <StatusBar barStyle="dark-content" />');
        writer.newLine();
      }

      // Генерируем JSX
      const jsx = generateJSXRecursive(metadata, 2, undefined, imageMap, styleMap);
      writer.write(jsx);

      writer.newLine();
      writer.write('  </>');
      writer.newLine();
      writer.write(');');
    },
  });
}

/**
 * Информация о градиенте
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
 * Извлекает информацию о градиенте из fills
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
 * Генерирует JSX рекурсивно
 */
function generateJSXRecursive(
  node: any,
  depth: number,
  parentNode?: any,
  imageMap?: Map<string, string>,
  styleMap?: Map<string, string>
): string {
  // Пропускаем системные компоненты
  // Skip system components
  if (shouldSkipNode(node.name)) {
    return '';
  }

  const indent = '  '.repeat(depth);
  const component = mapToRNComponent(node);
  // Генерируем имя стиля и нормализуем его (транслитерация + camelCase)
  // Generate style name and normalize it (transliteration + camelCase)
  const styleName = normalizeStyleName(generateSmartStyleName(
    node.name || 'root',
    node.type || 'View',
    {
      parentName: parentNode?.name,
      content: node.characters
    }
  ));

  // Проверяем, нужно ли сохранить оригинальное имя в комментарии
  // Check if original name should be preserved as comment
  const originalName = node.name || '';
  const nameNeedsComment = originalName &&
    (originalName.includes('/') || originalName.includes('_') || originalName.startsWith('_'));

  // Получаем ID стиля, если есть
  // Get style ID if present
  const styleId = node.styles?.fills || node.styles?.fill;
  const resolvedStyleName = styleId && styleMap ? styleMap.get(styleId) : undefined;

  // Формируем текст комментария, если нужно
  // Form comment text if needed
  let commentText = '';
  // Добавляем componentId для INSTANCE узлов
  // Add componentId for INSTANCE nodes
  const hasComponentId = node.type === 'INSTANCE' && node.componentId;

  // Извлекаем variant props из componentProperties
  // Extract variant props from componentProperties
  let variantStr = '';
  if (node.componentProperties) {
    const variants = Object.entries(node.componentProperties)
      .filter(([_, v]: [string, any]) => v.value !== undefined)
      .map(([k, v]: [string, any]) => `${k}=${v.value}`)
      .slice(0, 3); // Ограничиваем до 3 / Limit to 3
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

  // Проверяем наличие градиента
  // Check for gradient
  const gradientInfo = extractGradientInfo(node.fills);

  let jsx = '';

  if (gradientInfo) {
    // Оборачиваем в LinearGradient
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

      // Фильтруем дочерние элементы и убираем пустые строки
      // Filter children and remove empty strings
      const childrenJSX = node.children
        .map((child: any) => generateJSXRecursive(child, depth + 1, node, imageMap, styleMap))
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
    // Обычный компонент без градиента
    // Regular component without gradient
    if (commentText) {
      jsx = commentText;
      jsx += `${indent}<${component} style={styles.${styleName}}`;
    } else {
      jsx = `${indent}<${component} style={styles.${styleName}}`;
    }

    // Добавляем специфичные props для компонентов
    if (component === 'Text' && node.characters) {
      // Добавляем hint для шрифта если есть fontPostScriptName
      // Add font hint if fontPostScriptName available
      const fontHint = node.style?.fontPostScriptName ? ` {/* font: ${node.style.fontPostScriptName} */}` : '';
      jsx += `>${fontHint}\n${indent}  {${JSON.stringify(node.characters)}}\n${indent}</${component}>`;
    } else if (component === 'Image' && node.fills?.[0]?.imageRef) {
      // Определяем resizeMode из scaleMode
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

      // Добавляем hint для imageTransform если есть (как отдельную строку комментария)
      // Add imageTransform hint if present (as separate comment line)
      let transformHint = '';
      if (node.fills[0].imageTransform) {
        const [[a, c, tx], [b, d, ty]] = node.fills[0].imageTransform;
        // Если трансформация не identity (1,0,0 / 0,1,0), добавляем hint
        // If transform is not identity, add hint
        if (a !== 1 || b !== 0 || c !== 0 || d !== 1 || tx !== 0 || ty !== 0) {
          transformHint = `\n${indent}{/* imageTransform: scale(${a.toFixed(2)},${d.toFixed(2)}) translate(${tx.toFixed(0)},${ty.toFixed(0)}) */}`;
        }
      }

      // Проверяем, есть ли путь к изображению в imageMap
      // Check if image path is available in imageMap
      const imagePath = imageMap?.get(node.id);
      if (imagePath) {
        jsx += ` source={require('${imagePath}')} resizeMode="${resizeMode}" />${transformHint}`;
      } else {
        jsx += ` source={{uri: 'TODO'}} resizeMode="${resizeMode}" />${transformHint}`;
      }
    } else if (node.children && node.children.length > 0) {
      jsx += '>\n';

      // Фильтруем дочерние элементы и убираем пустые строки
      // Filter children and remove empty strings
      const childrenJSX = node.children
        .map((child: any) => generateJSXRecursive(child, depth + 1, node, imageMap, styleMap))
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
 * Генерирует createStyles функцию
 */
function generateCreateStyles(sourceFile: SourceFile, metadata: any, config: ProjectConfig): void {
  // Собираем все стили
  const stylesMap = new Map<string, any>();
  collectStyles(metadata, stylesMap, config);

  sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: 'createStyles',
        initializer: (writer) => {
          writer.write('({palette, commonFonts}: ThemeType) => ({');
          writer.newLine();

          // Вручную пишем каждый стиль
          // Manually write each style
          const styleNames = Array.from(stylesMap.keys());
          styleNames.forEach((styleName, styleIndex) => {
            const styleProps = stylesMap.get(styleName)!;

            writer.write(`  ${styleName}: {`);
            writer.newLine();

            // Пишем каждое свойство стиля
            // Write each style property
            const propNames = Object.keys(styleProps);
            propNames.forEach((propName, propIndex) => {
              const value = styleProps[propName];

              writer.write(`    ${propName}: `);

              // Определяем, нужны ли кавычки
              // Determine if quotes are needed
              if (typeof value === 'string') {
                // Проверяем, является ли значение вызовом функции или ссылкой на тему
                // Check if value is a function call or theme reference
                if (
                  value.startsWith('scale(') ||
                  value.startsWith('palette.') ||
                  value.startsWith('commonFonts.')
                ) {
                  // Не добавляем кавычки для вызовов функций и ссылок на тему
                  // No quotes for function calls and theme references
                  writer.write(value);
                } else {
                  // Добавляем кавычки для строковых литералов
                  // Add quotes for string literals
                  writer.write(`'${value}'`);
                }
              } else if (typeof value === 'number') {
                // Числа без кавычек
                // Numbers without quotes
                writer.write(String(value));
              } else {
                // Для других типов используем JSON.stringify
                // For other types use JSON.stringify
                writer.write(JSON.stringify(value));
              }

              // Добавляем запятую, если это не последнее свойство
              // Add comma if not the last property
              if (propIndex < propNames.length - 1) {
                writer.write(',');
              }

              writer.newLine();
            });

            writer.write('  }');

            // Добавляем запятую, если это не последний стиль
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
 * Собирает все стили из дерева метаданных
 */
function collectStyles(node: any, stylesMap: Map<string, any>, config: ProjectConfig, parentNode?: any): void {
  // Пропускаем системные компоненты
  // Skip system components
  if (shouldSkipNode(node.name)) {
    return;
  }

  // Генерируем имя стиля и нормализуем его (транслитерация + camelCase)
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

  // Пропускаем пустые объекты стилей
  // Skip empty style objects
  if (Object.keys(styleObject).length > 0) {
    stylesMap.set(styleName, styleObject);
  }

  if (node.children && Array.isArray(node.children)) {
    node.children.forEach((child: any) => collectStyles(child, stylesMap, config, node));
  }
}

/**
 * Валидирует и очищает объект стилей
 * Validates and cleans style object
 *
 * @param styles - Объект стилей
 * @param nodeType - Тип узла (TEXT, FRAME, etc.)
 * @returns Очищенный объект стилей
 */
function validateStyleObject(
  styles: Record<string, any>,
  nodeType: string
): Record<string, any> {
  const validated: Record<string, any> = {};

  for (const [key, value] of Object.entries(styles)) {
    // Правило 1: Text не может иметь backgroundColor
    // Rule 1: Text cannot have backgroundColor
    if (nodeType === 'TEXT' && key === 'backgroundColor') {
      continue;  // Skip
    }

    // Правило 2: Пропускаем undefined и null
    // Rule 2: Skip undefined and null
    if (value === undefined || value === null) {
      continue;
    }

    // Правило 3: Пропускаем пустые строки
    // Rule 3: Skip empty strings
    if (value === '') {
      continue;
    }

    validated[key] = value;
  }

  return validated;
}

/**
 * Генерирует объект стилей для узла
 */
function generateStyleObject(node: any, config: ProjectConfig): Record<string, any> {
  const styles: Record<string, any> = {};
  const scaleFunc = config.codeStyle.scaleFunction;

  // Helper для применения scale функции
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
      // Пропускаем - обрабатывается LinearGradient
      // Skip - handled by LinearGradient wrapper
    } else if (fill.type === 'SOLID' && fill.color) {
      const { r, g, b } = fill.color;
      const opacity = fill.opacity ?? 1;
      styles.backgroundColor = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${opacity})`;
    }
  }

  // Border (strokes)
  if (node.strokes && Array.isArray(node.strokes) && node.strokes.length > 0) {
    const stroke = node.strokes[0];
    if (stroke.type === 'SOLID' && stroke.color && stroke.visible !== false) {
      const { r, g, b } = stroke.color;
      const opacity = stroke.opacity ?? stroke.color.a ?? 1;
      styles.borderColor = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${opacity})`;
    }
  }
  if (node.strokeWeight !== undefined && node.strokeWeight > 0) {
    styles.borderWidth = applyScale(node.strokeWeight);
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

  // Typography (для Text компонентов)
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
  // Выравнивание дочернего элемента (переопределение выравнивания родителя)
  if (node.layoutAlign === 'STRETCH') {
    styles.alignSelf = 'stretch';
  }

  // Ограничения для абсолютного позиционирования
  // Constraints for absolute positioning
  if (node.layoutPositioning === 'ABSOLUTE' && node.constraints) {
    styles.position = 'absolute';

    // Горизонтальное ограничение
    // Horizontal constraint
    const h = node.constraints.horizontal;
    if (h === 'LEFT' || h === 'MIN') {
      // Нужен x от родителя - используем boundingBox если есть
      // Need x from parent - use boundingBox if available
      if (node.absoluteBoundingBox?.x !== undefined) {
        // Примечание: это абсолютные координаты, нужен offset от родителя
        // Note: these are absolute coords, need offset from parent
        styles.left = applyScale(0); // Placeholder - parent offset needed
      }
    } else if (h === 'RIGHT' || h === 'MAX') {
      styles.right = applyScale(0);
    } else if (h === 'CENTER') {
      styles.alignSelf = 'center';
    }

    // Вертикальное ограничение
    // Vertical constraint
    const v = node.constraints.vertical;
    if (v === 'TOP' || v === 'MIN') {
      styles.top = applyScale(0);
    } else if (v === 'BOTTOM' || v === 'MAX') {
      styles.bottom = applyScale(0);
    } else if (v === 'CENTER') {
      // Центрирование по вертикали требует особой обработки
      // Vertical centering requires special handling
    }
  }

  // Валидируем стили перед возвратом
  // Validate styles before return
  return validateStyleObject(styles, node.type || 'FRAME');
}

/**
 * Маппинг типов Figma узлов в React Native компоненты
 */
function mapToRNComponent(node: any): string {
  if (!node.type) return 'View';

  switch (node.type) {
    case 'TEXT':
      return 'Text';
    case 'RECTANGLE':
      // Если есть изображение
      if (node.fills && node.fills.some((f: any) => f.type === 'IMAGE')) {
        return 'Image';
      }
      return 'View';
    case 'FRAME':
    case 'GROUP':
      // Если похоже на кнопку (имеет обработчики или специфичное имя)
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

/**
 * Конвертирует строку в camelCase
 * Если результат начинается с цифры, добавляет префикс _
 *
 * ПРИМЕЧАНИЕ: Эта функция сохранена как fallback и используется внутри smart-namer.ts
 * NOTE: This function is kept as a fallback and is used internally by smart-namer.ts
 */
function toCamelCase(str: string): string {
  let result = str
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
    .replace(/^[A-Z]/, (chr) => chr.toLowerCase())
    .replace(/[^a-zA-Z0-9]/g, '');

  // Если начинается с цифры, добавляем префикс
  // If starts with digit, add underscore prefix
  if (/^\d/.test(result)) {
    result = '_' + result;
  }

  // Если пустая строка, возвращаем fallback
  // If empty string, return fallback
  if (!result) {
    result = 'element';
  }

  return result;
}
