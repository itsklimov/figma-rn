import { SourceFile, SyntaxKind } from 'ts-morph';
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

/**
 * Структура темы проекта
 * Project theme structure
 */
export interface ThemeStructure {
  type: 'object-export' | 'styled-components' | 'nativewind' | 'unknown';
  paths: {
    colors?: string;      // Путь к объекту colors
    fonts?: string;       // Путь к объекту fonts/typography
    spacing?: string;     // Путь к объекту spacing
  };
  scaleFunction?: string; // Название функции масштабирования (scale, RFValue и т.д.)
}

/**
 * Определяет структуру темы по исходному файлу
 * Detects theme structure from source file
 *
 * @param sourceFile - Файл темы для анализа
 * @returns Структура темы
 */
export function detectThemeStructure(sourceFile: SourceFile): ThemeStructure {
  const text = sourceFile.getText();
  const structure: ThemeStructure = {
    type: 'object-export',
    paths: {},
  };

  // Определяем тип темы по импортам и ключевым словам
  if (text.includes('styled-components') || text.includes('styled(')) {
    structure.type = 'styled-components';
  } else if (text.includes('nativewind') || text.includes('tailwind')) {
    structure.type = 'nativewind';
  } else if (text.includes('export default') || text.includes('export const')) {
    structure.type = 'object-export';
  } else {
    structure.type = 'unknown';
  }

  // Ищем пути к объектам colors, fonts, spacing
  structure.paths = detectObjectPaths(sourceFile);

  return structure;
}

/**
 * Определяет пути к различным объектам темы
 * Detects paths to various theme objects
 */
function detectObjectPaths(sourceFile: SourceFile): ThemeStructure['paths'] {
  const paths: ThemeStructure['paths'] = {};

  // Получаем все объектные литералы
  const objects = sourceFile.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression);

  for (const obj of objects) {
    const parent = obj.getParent();

    // Получаем имя переменной или свойства
    let name = '';
    if (parent && parent.getKind() === SyntaxKind.PropertyAssignment) {
      name = (parent as any).getName();
    } else if (parent && parent.getKind() === SyntaxKind.VariableDeclaration) {
      name = (parent as any).getName();
    }

    const nameLower = name.toLowerCase();

    // Проверяем на colors/palette
    if (nameLower.includes('color') || nameLower.includes('palette')) {
      paths.colors = name;
    }

    // Проверяем на fonts/typography
    if (nameLower.includes('font') || nameLower.includes('typography')) {
      paths.fonts = name;
    }

    // Проверяем на spacing
    if (nameLower.includes('spacing') || nameLower.includes('space')) {
      paths.spacing = name;
    }
  }

  return paths;
}

/**
 * Определяет функцию масштабирования в проекте
 * Detects scale function in the project
 *
 * Ищет распространенные функции масштабирования:
 * - scale() - react-native-size-matters
 * - RFValue() - react-native-responsive-fontsize
 * - moderateScale() - react-native-size-matters
 * - wp(), hp() - react-native-responsive-screen
 * - scaleFont() - custom
 *
 * @param projectRoot - Корневая директория проекта
 * @returns Название функции или undefined
 */
export async function detectScaleFunction(projectRoot: string): Promise<string | undefined> {
  try {
    // Ищем файлы с возможными импортами
    const patterns = [
      path.join(projectRoot, 'src', '**', '*.{ts,tsx,js,jsx}'),
      path.join(projectRoot, '**', '*.{ts,tsx,js,jsx}'),
    ];

    const scaleFunctions = [
      'scale',
      'RFValue',
      'moderateScale',
      'verticalScale',
      'horizontalScale',
      'wp',
      'hp',
      'scaleFont',
      'scaleSize',
    ];

    const functionCounts = new Map<string, number>();

    for (const pattern of patterns) {
      const files = await glob(pattern, {
        ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
        absolute: true,
      });

      // Ограничиваем поиск первыми 50 файлами для производительности
      const filesToCheck = files.slice(0, 50);

      for (const file of filesToCheck) {
        try {
          const content = fs.readFileSync(file, 'utf-8');

          // Ищем использование функций масштабирования
          for (const func of scaleFunctions) {
            const regex = new RegExp(`\\b${func}\\s*\\(`, 'g');
            const matches = content.match(regex);
            if (matches) {
              const count = functionCounts.get(func) || 0;
              functionCounts.set(func, count + matches.length);
            }
          }
        } catch (error) {
          // Пропускаем файлы с ошибками чтения
          continue;
        }
      }
    }

    // Возвращаем наиболее часто используемую функцию
    if (functionCounts.size > 0) {
      const sorted = Array.from(functionCounts.entries()).sort((a, b) => b[1] - a[1]);
      return sorted[0][0];
    }

    return undefined;
  } catch (error) {
    console.error('Error detecting scale function:', error);
    return undefined;
  }
}

/**
 * Определяет паттерн стилизации в проекте
 * Detects style pattern in the project
 *
 * @param projectRoot - Корневая директория проекта
 * @returns Обнаруженный паттерн
 */
export async function detectStylePattern(projectRoot: string): Promise<string> {
  try {
    const patterns = [
      path.join(projectRoot, 'src', '**', '*.{ts,tsx,js,jsx}'),
      path.join(projectRoot, '**', '*.{ts,tsx,js,jsx}'),
    ];

    const patternCounts = {
      useTheme: 0,
      StyleSheet: 0,
      'styled-components': 0,
      nativewind: 0,
    };

    for (const pattern of patterns) {
      const files = await glob(pattern, {
        ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
        absolute: true,
      });

      // Ограничиваем поиск первыми 30 файлами
      const filesToCheck = files.slice(0, 30);

      for (const file of filesToCheck) {
        try {
          const content = fs.readFileSync(file, 'utf-8');

          // Ищем useTheme hook
          if (/\buseTheme\s*\(/.test(content)) {
            patternCounts.useTheme++;
          }

          // Ищем StyleSheet.create
          if (/StyleSheet\.create/.test(content)) {
            patternCounts.StyleSheet++;
          }

          // Ищем styled-components
          if (/styled\(/.test(content) || /import.*styled.*from.*styled-components/.test(content)) {
            patternCounts['styled-components']++;
          }

          // Ищем className (nativewind/tailwind)
          if (/className=/.test(content)) {
            patternCounts.nativewind++;
          }
        } catch (error) {
          continue;
        }
      }
    }

    // Определяем наиболее популярный паттерн
    const entries = Object.entries(patternCounts).sort((a, b) => b[1] - a[1]);

    // Если есть явный лидер (>= 3 использований), возвращаем его
    if (entries[0][1] >= 3) {
      return entries[0][0];
    }

    // По умолчанию возвращаем StyleSheet (стандарт React Native)
    return 'StyleSheet';
  } catch (error) {
    console.error('Error detecting style pattern:', error);
    return 'StyleSheet';
  }
}

/**
 * Ищет файл с темой в проекте
 * Searches for theme file in the project
 *
 * @param projectRoot - Корневая директория проекта
 * @returns Путь к файлу темы или undefined
 */
export async function findThemeFile(projectRoot: string): Promise<string | undefined> {
  const possibleNames = [
    'theme.ts',
    'theme.tsx',
    'theme.js',
    'theme.jsx',
    'colors.ts',
    'colors.tsx',
    'tokens.ts',
    'design-tokens.ts',
    'theme/index.ts',
    'theme/index.tsx',
    'styles/theme.ts',
  ];

  const possibleDirs = [
    path.join(projectRoot, 'src'),
    path.join(projectRoot, 'app'),
    path.join(projectRoot),
  ];

  // Сначала проверяем стандартные места
  for (const dir of possibleDirs) {
    for (const name of possibleNames) {
      const fullPath = path.join(dir, name);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
  }

  // Если не нашли, ищем через glob
  try {
    const files = await glob('**/theme*.{ts,tsx,js,jsx}', {
      cwd: projectRoot,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
      absolute: true,
    });

    if (files.length > 0) {
      // Возвращаем первый найденный файл
      return files[0];
    }
  } catch (error) {
    console.error('Error searching for theme file:', error);
  }

  return undefined;
}

/**
 * Определяет используемую библиотеку UI компонентов
 * Detects used UI component library
 */
export async function detectUILibrary(projectRoot: string): Promise<string | undefined> {
  try {
    const packageJsonPath = path.join(projectRoot, 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
      return undefined;
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    // Проверяем популярные библиотеки
    const libraries = [
      'react-native-paper',
      'native-base',
      '@ui-kitten/components',
      'react-native-elements',
      '@shopify/restyle',
      'tamagui',
      'dripsy',
    ];

    for (const lib of libraries) {
      if (allDeps[lib]) {
        return lib;
      }
    }

    return undefined;
  } catch (error) {
    console.error('Error detecting UI library:', error);
    return undefined;
  }
}

/**
 * Полный анализ темы проекта
 * Complete project theme analysis
 */
export interface ThemeAnalysis {
  themeFile?: string;               // Путь к файлу темы
  structure?: ThemeStructure;       // Структура темы
  scaleFunction?: string;           // Функция масштабирования
  stylePattern: string;             // Паттерн стилизации
  uiLibrary?: string;              // UI библиотека
}

export async function analyzeProjectTheme(projectRoot: string): Promise<ThemeAnalysis> {
  const analysis: ThemeAnalysis = {
    stylePattern: 'StyleSheet', // default
  };

  // 1. Ищем файл темы
  analysis.themeFile = await findThemeFile(projectRoot);

  // 2. Определяем функцию масштабирования
  analysis.scaleFunction = await detectScaleFunction(projectRoot);

  // 3. Определяем паттерн стилизации
  analysis.stylePattern = await detectStylePattern(projectRoot);

  // 4. Определяем UI библиотеку
  analysis.uiLibrary = await detectUILibrary(projectRoot);

  return analysis;
}

/**
 * Форматирует результаты анализа для вывода
 * Formats analysis results for output
 */
export function formatThemeAnalysis(analysis: ThemeAnalysis): string {
  const lines: string[] = [];

  lines.push('=== Theme Analysis ===');
  lines.push('');

  if (analysis.themeFile) {
    lines.push(`Theme file: ${analysis.themeFile}`);
  } else {
    lines.push('Theme file: Not found');
  }

  if (analysis.scaleFunction) {
    lines.push(`Scale function: ${analysis.scaleFunction}()`);
  }

  lines.push(`Style pattern: ${analysis.stylePattern}`);

  if (analysis.uiLibrary) {
    lines.push(`UI library: ${analysis.uiLibrary}`);
  }

  if (analysis.structure) {
    lines.push('');
    lines.push('Theme structure:');
    lines.push(`  Type: ${analysis.structure.type}`);
    if (analysis.structure.paths.colors) {
      lines.push(`  Colors path: ${analysis.structure.paths.colors}`);
    }
    if (analysis.structure.paths.fonts) {
      lines.push(`  Fonts path: ${analysis.structure.paths.fonts}`);
    }
    if (analysis.structure.paths.spacing) {
      lines.push(`  Spacing path: ${analysis.structure.paths.spacing}`);
    }
  }

  return lines.join('\n');
}
