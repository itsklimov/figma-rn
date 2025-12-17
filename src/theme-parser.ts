import { Project, SourceFile, SyntaxKind, Node, ObjectLiteralExpression, PropertyAssignment } from 'ts-morph';
import { existsSync } from 'fs';
import { resolve, join } from 'path';

/**
 * Токен цвета из темы
 * Color token from theme
 */
export interface ColorToken {
  value: string;      // Hex значение цвета (например, '#FF0000')
  path: string;       // Полный путь к токену (например, 'theme.colors.primary')
  name: string;       // Короткое имя (например, 'primary')
}

/**
 * Токен шрифта из темы
 * Font token from theme
 */
export interface FontToken {
  family: string;     // Название семейства шрифта
  weight?: number;    // Вес шрифта (100-900)
  path: string;       // Полный путь к токену
  name: string;       // Короткое имя
}

/**
 * Токен стиля типографики (полный)
 * Typography style token (complete)
 */
export interface TypographyStyleToken {
  path: string;       // Полный путь, например "typography.body.regular"
  fontSize: number;   // Размер шрифта
  lineHeight?: number; // Высота строки
  fontWeight: number; // Вес шрифта
  fontFamily?: string; // Семейство шрифта
  letterSpacing?: number; // Межбуквенное расстояние
}

/**
 * Информация о spacing системе
 * Spacing system information
 */
export interface SpacingInfo {
  function?: string;  // Название функции масштабирования (например, 'scale')
  values?: number[];  // Обнаруженные значения spacing
}

/**
 * Все извлеченные токены темы
 * All extracted theme tokens
 */
export interface ThemeTokens {
  colors: Map<string, ColorToken>;
  fonts: Map<string, FontToken>;
  typography?: Map<string, TypographyStyleToken>;  // Полные стили типографики
  spacing?: SpacingInfo;
  radii?: Map<string, number>;
  shadows?: Map<string, any>;
}

/**
 * Парсит файл темы и извлекает токены дизайна
 * Parses theme file and extracts design tokens
 *
 * @param filePath - Абсолютный путь к файлу темы
 * @param basePath - Базовый путь для токенов (по умолчанию 'theme')
 * @returns Извлеченные токены темы
 */
export async function parseThemeFile(
  filePath: string,
  basePath: string = 'theme'
): Promise<ThemeTokens> {
  try {
    // Резолвим абсолютный путь к файлу
    // Resolve absolute file path
    const absolutePath = resolve(filePath);

    // Проверяем существование файла
    if (!existsSync(absolutePath)) {
      throw new Error(`File not found: ${absolutePath}`);
    }

    // Создаем проект ts-morph (без in-memory FS для чтения файлов)
    // Create ts-morph project (without in-memory FS to read files)
    const project = new Project({
      compilerOptions: {
        allowJs: true,
        jsx: 1, // React
      },
    });

    const sourceFile = project.addSourceFileAtPath(absolutePath);

    // Ищем узел с темой
    const themeNode = findThemeNode(sourceFile);

    if (!themeNode) {
      throw new Error(`Could not find theme object in file: ${filePath}`);
    }

    // Извлекаем токены рекурсивно
    const tokens = extractTokensRecursive(themeNode, basePath);

    return tokens;
  } catch (error) {
    console.error(`Error parsing theme file ${filePath}:`, error);
    throw error;
  }
}

/**
 * Ищет узел с объектом темы в файле
 * Finds theme object node in the file
 *
 * Стратегии поиска:
 * 1. Default export
 * 2. Named export 'theme', 'colors', 'palette'
 * 3. Variable declaration с именем похожим на тему
 */
function findThemeNode(sourceFile: SourceFile): ObjectLiteralExpression | null {
  // Стратегия 1: Ищем default export
  const defaultExport = sourceFile.getDefaultExportSymbol();
  if (defaultExport) {
    const declarations = defaultExport.getDeclarations();
    for (const decl of declarations) {
      const objLiteral = findObjectLiteralInNode(decl);
      if (objLiteral) return objLiteral;
    }
  }

  // Стратегия 2: Ищем named exports с известными именами
  const themeNames = ['theme', 'colors', 'palette', 'tokens', 'designTokens', 'typography'];
  for (const name of themeNames) {
    const exportedDecl = sourceFile.getExportedDeclarations().get(name);
    if (exportedDecl && exportedDecl.length > 0) {
      const objLiteral = findObjectLiteralInNode(exportedDecl[0]);
      if (objLiteral) return objLiteral;
    }
  }

  // Стратегия 3: Ищем переменные с подходящими именами
  const variableStatements = sourceFile.getVariableStatements();
  for (const varStatement of variableStatements) {
    const declarations = varStatement.getDeclarations();
    for (const decl of declarations) {
      const name = decl.getName().toLowerCase();
      if (themeNames.some(themeName => name.includes(themeName))) {
        const objLiteral = findObjectLiteralInNode(decl);
        if (objLiteral) return objLiteral;
      }
    }
  }

  // Стратегия 4: Если ничего не нашли, берем первый большой объект
  const allObjectLiterals = sourceFile.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression);
  if (allObjectLiterals.length > 0) {
    // Сортируем по размеру (количество свойств) и берем самый большой
    const sorted = allObjectLiterals.sort((a, b) =>
      b.getProperties().length - a.getProperties().length
    );
    return sorted[0];
  }

  return null;
}

/**
 * Ищет ObjectLiteralExpression в узле или его потомках
 * Finds ObjectLiteralExpression in node or its descendants
 */
function findObjectLiteralInNode(node: Node): ObjectLiteralExpression | null {
  // Проверяем сам узел
  if (Node.isObjectLiteralExpression(node)) {
    return node;
  }

  // Проверяем инициализатор (для переменных)
  if (Node.isVariableDeclaration(node)) {
    const initializer = node.getInitializer();
    if (initializer && Node.isObjectLiteralExpression(initializer)) {
      return initializer;
    }
  }

  // Ищем в потомках
  const objLiteral = node.getFirstDescendantByKind(SyntaxKind.ObjectLiteralExpression);
  return objLiteral || null;
}

/**
 * Рекурсивно извлекает токены из узла объекта
 * Recursively extracts tokens from object node
 *
 * @param node - Узел для анализа
 * @param currentPath - Текущий путь (например, 'theme.colors')
 * @param tokens - Аккумулятор токенов
 * @returns Токены темы
 */
function extractTokensRecursive(
  node: ObjectLiteralExpression,
  currentPath: string,
  tokens: ThemeTokens = { colors: new Map(), fonts: new Map(), typography: new Map(), radii: new Map(), shadows: new Map() }
): ThemeTokens {
  const properties = node.getProperties();

  for (const prop of properties) {
    if (!Node.isPropertyAssignment(prop)) continue;

    const propName = prop.getName();
    const propPath = `${currentPath}.${propName}`;
    const initializer = prop.getInitializer();

    if (!initializer) continue;

    // Если это вложенный объект - проверяем, это typography style или обычный объект
    // If nested object - check if it's a typography style or regular object
    if (Node.isObjectLiteralExpression(initializer)) {
      // Проверяем, является ли это typography style (содержит fontSize)
      // Check if this is a typography style (contains fontSize)
      const typoStyle = extractTypographyStyle(initializer, propPath);
      if (typoStyle) {
        if (!tokens.typography) tokens.typography = new Map();
        tokens.typography.set(propPath, typoStyle);
      } else {
        // Иначе рекурсия / Otherwise recurse
        extractTokensRecursive(initializer, propPath, tokens);
      }
      continue;
    }

    // Получаем текстовое значение
    const valueText = initializer.getText().replace(/['"]/g, '');

    // Проверяем на цвет (hex, rgb, rgba)
    if (isColorValue(valueText)) {
      const colorToken: ColorToken = {
        value: normalizeColorValue(valueText),
        path: propPath,
        name: propName,
      };
      // Используем нормализованное значение как ключ
      tokens.colors.set(colorToken.value, colorToken);
    }

    // Проверяем на шрифт
    const fontToken = extractFontToken(propName, valueText, propPath);
    if (fontToken) {
      const key = `${fontToken.family}-${fontToken.weight || 400}`;
      tokens.fonts.set(key, fontToken);
    }

    // Проверяем на spacing значения
    if (isSpacingValue(propName)) {
      if (!tokens.spacing) {
        tokens.spacing = { values: [] };
      }
      const numValue = parseFloat(valueText);
      if (!isNaN(numValue) && tokens.spacing.values) {
        tokens.spacing.values.push(numValue);
      }
    }

    // Проверяем на radii значения - проверяем и имя свойства, и путь
    // Check for radii values - check both property name and path
    if (isRadiiValue(propName) || isRadiiValue(currentPath)) {
      // Извлекаем число из valueText (может быть "12", "scale(12)", etc.)
      // Extract number from valueText (could be "12", "scale(12)", etc.)
      const numValue = extractNumberFromValue(valueText);
      if (numValue !== null) {
        if (!tokens.radii) {
          tokens.radii = new Map();
        }
        tokens.radii.set(propPath, numValue);
      }
    }

    // Проверяем на shadow объекты
    // Check for shadow objects
    if (Node.isObjectLiteralExpression(initializer) && isShadowValue(propName)) {
      const shadowObj = extractShadowObject(initializer);
      if (shadowObj) {
        if (!tokens.shadows) {
          tokens.shadows = new Map();
        }
        tokens.shadows.set(propPath, shadowObj);
      }
    }
  }

  return tokens;
}

/**
 * Проверяет, является ли значение цветом
 * Checks if value is a color
 */
function isColorValue(value: string): boolean {
  // Hex цвет
  if (/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/.test(value)) return true;

  // RGB/RGBA
  if (/^rgba?\(/.test(value)) return true;

  // HSL/HSLA
  if (/^hsla?\(/.test(value)) return true;

  return false;
}

/**
 * Нормализует цвет к hex формату
 * Normalizes color to hex format
 */
function normalizeColorValue(value: string): string {
  // Если уже hex - возвращаем как есть (в верхнем регистре)
  if (value.startsWith('#')) {
    return value.toUpperCase();
  }

  // Для rgb/rgba/hsl/hsla можем вернуть как есть
  // или конвертировать в hex (требует дополнительной библиотеки)
  // Пока просто возвращаем как есть
  return value;
}

/**
 * Извлекает токен шрифта из свойства
 * Extracts font token from property
 */
function extractFontToken(
  propName: string,
  value: string,
  propPath: string
): FontToken | null {
  const nameLower = propName.toLowerCase();

  // Проверяем на fontFamily
  if (nameLower.includes('font') && nameLower.includes('family')) {
    return {
      family: value,
      path: propPath,
      name: propName,
    };
  }

  // Проверяем на fontWeight
  if (nameLower.includes('font') && nameLower.includes('weight')) {
    const weight = parseInt(value);
    if (!isNaN(weight)) {
      return {
        family: 'unknown', // Вес без семейства
        weight,
        path: propPath,
        name: propName,
      };
    }
  }

  // Проверяем на комбинированное свойство font
  if (nameLower === 'font' && typeof value === 'string') {
    // Простая эвристика для парсинга font shorthand
    const parts = value.split(' ');
    let family = parts[parts.length - 1];
    let weight: number | undefined;

    for (const part of parts) {
      const num = parseInt(part);
      if (!isNaN(num) && num >= 100 && num <= 900) {
        weight = num;
      }
    }

    if (family) {
      return {
        family,
        weight,
        path: propPath,
        name: propName,
      };
    }
  }

  return null;
}

/**
 * Извлекает стиль типографики из объекта (если содержит fontSize)
 * Extracts typography style from object (if contains fontSize)
 */
function extractTypographyStyle(
  node: ObjectLiteralExpression,
  path: string
): TypographyStyleToken | null {
  const properties = node.getProperties();

  let fontSize: number | null = null;
  let lineHeight: number | undefined;
  let fontWeight: number = 400;
  let fontFamily: string | undefined;
  let letterSpacing: number | undefined;

  for (const prop of properties) {
    if (!Node.isPropertyAssignment(prop)) continue;

    const propName = prop.getName().toLowerCase();
    const initializer = prop.getInitializer();
    if (!initializer) continue;

    const valueText = initializer.getText().replace(/['"]/g, '');
    const numValue = extractNumberFromValue(valueText);

    if (propName === 'fontsize' || propName === 'size') {
      fontSize = numValue;
    } else if (propName === 'lineheight' || propName === 'lineheightpx') {
      lineHeight = numValue ?? undefined;
    } else if (propName === 'fontweight' || propName === 'weight') {
      fontWeight = numValue ?? 400;
    } else if (propName === 'fontfamily' || propName === 'family') {
      // Извлекаем вес из имени семейства / Extract weight from family name
      fontFamily = valueText;
      const nameLower = valueText.toLowerCase();
      if (nameLower.includes('bold')) {
        fontWeight = 700;
      } else if (nameLower.includes('semibold') || nameLower.includes('semi-bold')) {
        fontWeight = 590;
      } else if (nameLower.includes('medium')) {
        fontWeight = 500;
      }
    } else if (propName === 'letterspacing') {
      letterSpacing = numValue ?? undefined;
    }
  }

  // Если нашли fontSize - это typography style
  // If found fontSize - it's a typography style
  if (fontSize !== null) {
    return {
      path,
      fontSize,
      lineHeight,
      fontWeight,
      fontFamily,
      letterSpacing,
    };
  }

  return null;
}

/**
 * Извлекает число из значения (может быть "12", "scale(12)", "moderateScale(12)", etc.)
 * Extracts number from value (could be "12", "scale(12)", "moderateScale(12)", etc.)
 */
function extractNumberFromValue(valueText: string): number | null {
  // Прямое число
  // Direct number
  const directNum = parseFloat(valueText);
  if (!isNaN(directNum)) {
    return directNum;
  }

  // Функция с числовым аргументом: scale(12), moderateScale(16), RFValue(20)
  // Function with numeric argument
  const funcMatch = valueText.match(/\w+\s*\(\s*(\d+(?:\.\d+)?)\s*(?:,|\))/);
  if (funcMatch) {
    return parseFloat(funcMatch[1]);
  }

  return null;
}

/**
 * Проверяет, является ли свойство spacing значением
 * Checks if property is a spacing value
 */
function isSpacingValue(propName: string): boolean {
  const nameLower = propName.toLowerCase();
  const spacingKeywords = [
    'spacing',
    'margin',
    'padding',
    'gap',
    'gutter',
    'offset',
  ];

  return spacingKeywords.some(keyword => nameLower.includes(keyword));
}

/**
 * Проверяет, является ли свойство radii значением
 * Checks if property is a radii value
 */
function isRadiiValue(propName: string): boolean {
  const nameLower = propName.toLowerCase();
  const radiiKeywords = [
    'radius',
    'radii',
    'borderradius',
    'cornerradius',
  ];

  return radiiKeywords.some(keyword => nameLower.includes(keyword));
}

/**
 * Проверяет, является ли свойство shadow объектом
 * Checks if property is a shadow object
 */
function isShadowValue(propName: string): boolean {
  const nameLower = propName.toLowerCase();
  const shadowKeywords = [
    'shadow',
    'elevation',
    'boxshadow',
  ];

  return shadowKeywords.some(keyword => nameLower.includes(keyword));
}

/**
 * Извлекает объект тени из ObjectLiteralExpression
 * Extracts shadow object from ObjectLiteralExpression
 */
function extractShadowObject(node: ObjectLiteralExpression): any {
  const shadowObj: any = {};
  const properties = node.getProperties();

  for (const prop of properties) {
    if (!Node.isPropertyAssignment(prop)) continue;

    const propName = prop.getName();
    const initializer = prop.getInitializer();
    if (!initializer) continue;

    const nameLower = propName.toLowerCase();

    // Извлекаем различные форматы shadow свойств
    // Extract various shadow property formats
    if (nameLower.includes('offset')) {
      // Может быть объект { x: 0, y: 4 } или { width: 0, height: 4 }
      if (Node.isObjectLiteralExpression(initializer)) {
        const offsetProps = initializer.getProperties();
        const offsetObj: any = {};
        for (const offsetProp of offsetProps) {
          if (Node.isPropertyAssignment(offsetProp)) {
            const offsetName = offsetProp.getName();
            const offsetInit = offsetProp.getInitializer();
            if (offsetInit) {
              const offsetValue = parseFloat(offsetInit.getText());
              if (!isNaN(offsetValue)) {
                offsetObj[offsetName] = offsetValue;
              }
            }
          }
        }
        shadowObj.offset = offsetObj;
      }
    } else if (nameLower.includes('opacity')) {
      const value = parseFloat(initializer.getText());
      if (!isNaN(value)) {
        shadowObj.opacity = value;
      }
    } else if (nameLower.includes('radius') || nameLower.includes('blur')) {
      const value = parseFloat(initializer.getText());
      if (!isNaN(value)) {
        shadowObj.radius = value;
      }
    } else if (nameLower.includes('color')) {
      shadowObj.color = initializer.getText().replace(/['"]/g, '');
    }
  }

  // Проверяем, что получили хотя бы базовые свойства тени
  // Check if we got at least basic shadow properties
  if (shadowObj.offset || shadowObj.opacity !== undefined || shadowObj.radius !== undefined) {
    return shadowObj;
  }

  return null;
}

/**
 * Поиск всех файлов темы в директории проекта
 * Search for all theme files in project directory
 */
export async function findThemeFiles(projectRoot: string): Promise<string[]> {
  const themeFiles: string[] = [];
  const possibleNames = [
    'theme.ts',
    'theme.tsx',
    'theme.js',
    'theme.jsx',
    'colors.ts',
    'colors.tsx',
    'colors.js',
    'tokens.ts',
    'design-tokens.ts',
  ];

  const possibleDirs = [
    join(projectRoot, 'src', 'styles', 'theme'),
    join(projectRoot, 'src', 'theme'),
    join(projectRoot, 'src', 'styles'),
    join(projectRoot, 'theme'),
    join(projectRoot, 'styles'),
    join(projectRoot, 'src'),
    projectRoot,
  ];

  for (const dir of possibleDirs) {
    if (!existsSync(dir)) continue;

    for (const name of possibleNames) {
      const fullPath = join(dir, name);
      if (existsSync(fullPath)) {
        themeFiles.push(fullPath);
      }
    }
  }

  return themeFiles;
}
