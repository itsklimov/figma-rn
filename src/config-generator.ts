/**
 * Генератор конфигурации проекта
 * Анализирует проект и создает конфигурационный файл
 */

import { writeFile, readFile, access } from 'fs/promises';
import { join, dirname, relative } from 'path';
import { glob } from 'glob';
import { ProjectConfig, ProjectConfigInput, DEFAULT_CONFIG } from './config-schema.js';
import { findThemeFiles } from './theme-parser.js';

/**
 * Результат генерации конфигурации
 */
export interface GeneratedConfig {
  /** Сгенерированная конфигурация */
  config: ProjectConfig;

  /** Путь к созданному файлу */
  filePath: string;

  /** Обнаруженные паттерны */
  detectedPatterns: {
    stylePattern?: string;
    scaleFunction?: string;
    importPrefix?: string;
    themeType?: string;
  };
}

/**
 * Генерирует конфигурацию проекта на основе анализа кодовой базы
 *
 * @param input - Входные данные для генерации
 * @returns Сгенерированная конфигурация и путь к файлу
 */
export async function generateProjectConfig(
  input: ProjectConfigInput
): Promise<GeneratedConfig> {
  const detectedPatterns: GeneratedConfig['detectedPatterns'] = {};

  // Определяем фреймворк
  const framework = (input.framework as ProjectConfig['framework']) ||
    await detectFramework(input.projectRoot);

  // Создаем базовую конфигурацию
  const config: ProjectConfig = {
    framework,
    codeStyle: {
      stylePattern: 'StyleSheet' // По умолчанию
    }
  };

  // Определяем паттерн стилизации
  const stylePattern = (input.styleApproach as ProjectConfig['codeStyle']['stylePattern']) ||
    await detectStylePattern(input.projectRoot);
  config.codeStyle.stylePattern = stylePattern;
  detectedPatterns.stylePattern = stylePattern;

  // Определяем функцию масштабирования
  const scaleFunction = await detectScaleFunction(input.projectRoot);
  if (scaleFunction) {
    config.codeStyle.scaleFunction = scaleFunction;
    detectedPatterns.scaleFunction = scaleFunction;
  }

  // Определяем префикс импортов
  const importPrefix = await detectImportPrefix(input.projectRoot);
  if (importPrefix) {
    config.codeStyle.importPrefix = importPrefix;
    detectedPatterns.importPrefix = importPrefix;
  }

  // Добавляем конфигурацию темы
  if (input.themePath) {
    // Пользователь указал путь - используем его
    const themeType = await detectThemeType(join(input.projectRoot, input.themePath));
    config.theme = {
      location: input.themePath,
      type: themeType
    };
    detectedPatterns.themeType = themeType;
  } else {
    // Автоопределение файлов темы
    const foundThemes = await findThemeFiles(input.projectRoot);
    if (foundThemes.length > 0) {
      // Используем первый найденный файл темы
      const absolutePath = foundThemes[0];
      const relativePath = relative(input.projectRoot, absolutePath);
      const themeType = await detectThemeType(absolutePath);

      config.theme = {
        location: relativePath,
        type: themeType
      };
      detectedPatterns.themeType = themeType;
    }
  }

  // Добавляем конфигурацию компонентов, если указан путь
  if (input.componentsPath) {
    config.components = {
      location: input.componentsPath,
      pattern: '**/*.tsx'
    };
  }

  // Записываем конфигурацию в файл
  const filePath = join(input.projectRoot, '.figmarc.json');
  await writeFile(filePath, JSON.stringify(config, null, 2), 'utf-8');

  return { config, filePath, detectedPatterns };
}

/**
 * Определяет тип фреймворка на основе package.json
 *
 * @param projectRoot - Корневая директория проекта
 * @returns Обнаруженный фреймворк
 */
async function detectFramework(
  projectRoot: string
): Promise<ProjectConfig['framework']> {
  try {
    const packageJsonPath = join(projectRoot, 'package.json');
    const packageJson = JSON.parse(
      await readFile(packageJsonPath, 'utf-8')
    );

    const deps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    };

    // Проверяем наличие специфичных для фреймворка пакетов
    if (deps['ignite-cli'] || deps['@thecodingmachine/ignite-cli']) {
      return 'ignite';
    }
    if (deps['expo']) {
      return 'expo';
    }

    return 'react-native';
  } catch {
    // По умолчанию - react-native
    return 'react-native';
  }
}

/**
 * Определяет паттерн стилизации на основе анализа кода
 *
 * @param projectRoot - Корневая директория проекта
 * @returns Обнаруженный паттерн стилизации
 */
async function detectStylePattern(
  projectRoot: string
): Promise<ProjectConfig['codeStyle']['stylePattern']> {
  try {
    // Ищем TypeScript/JavaScript файлы
    const files = await glob('**/*.{ts,tsx,js,jsx}', {
      cwd: projectRoot,
      ignore: ['node_modules/**', 'dist/**', 'build/**'],
      absolute: true,
      nodir: true
    });

    // Считаем упоминания различных паттернов
    const patterns = {
      useTheme: 0,
      StyleSheet: 0,
      'styled-components': 0,
      nativewind: 0
    };

    // Проверяем первые 50 файлов (для производительности)
    const filesToCheck = files.slice(0, 50);

    for (const file of filesToCheck) {
      try {
        const content = await readFile(file, 'utf-8');

        if (content.includes('useTheme')) patterns.useTheme++;
        if (content.includes('StyleSheet.create')) patterns.StyleSheet++;
        if (content.includes('styled-components') || content.includes('styled.')) {
          patterns['styled-components']++;
        }
        if (content.includes('className=') && content.includes('tw`')) {
          patterns.nativewind++;
        }
      } catch {
        // Игнорируем ошибки чтения отдельных файлов
        continue;
      }
    }

    // Возвращаем самый частый паттерн
    const maxPattern = Object.entries(patterns).reduce((max, [key, val]) =>
      val > max[1] ? [key, val] : max
    , ['StyleSheet', 0])[0] as ProjectConfig['codeStyle']['stylePattern'];

    return maxPattern;
  } catch {
    // По умолчанию - StyleSheet
    return 'StyleSheet';
  }
}

/**
 * Определяет функцию масштабирования на основе анализа импортов
 *
 * @param projectRoot - Корневая директория проекта
 * @returns Обнаруженная функция масштабирования или undefined
 */
async function detectScaleFunction(
  projectRoot: string
): Promise<string | undefined> {
  try {
    const files = await glob('**/*.{ts,tsx,js,jsx}', {
      cwd: projectRoot,
      ignore: ['node_modules/**', 'dist/**', 'build/**'],
      absolute: true,
      nodir: true
    });

    // Ищем импорты функций масштабирования
    const scaleFunctions = ['scale', 'RFValue', 'moderateScale', 'verticalScale', 'horizontalScale'];

    for (const file of files.slice(0, 30)) {
      try {
        const content = await readFile(file, 'utf-8');

        for (const func of scaleFunctions) {
          // Проверяем импорт или определение функции
          if (
            content.includes(`import { ${func}`) ||
            content.includes(`import ${func}`) ||
            content.includes(`export const ${func}`) ||
            content.includes(`export function ${func}`)
          ) {
            return func;
          }
        }
      } catch {
        continue;
      }
    }

    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Определяет префикс импортов из tsconfig.json или babel.config
 *
 * @param projectRoot - Корневая директория проекта
 * @returns Обнаруженный префикс импортов или undefined
 */
async function detectImportPrefix(
  projectRoot: string
): Promise<string | undefined> {
  try {
    // Проверяем tsconfig.json
    const tsconfigPath = join(projectRoot, 'tsconfig.json');
    try {
      await access(tsconfigPath);
      const tsconfig = JSON.parse(
        await readFile(tsconfigPath, 'utf-8')
      );

      const paths = tsconfig?.compilerOptions?.paths;
      if (paths) {
        // Ищем общие префиксы
        const commonPrefixes = ['@app/*', '@components/*', '@/*', '~/*'];
        for (const prefix of commonPrefixes) {
          if (paths[prefix]) {
            return prefix.replace('/*', '');
          }
        }

        // Берем первый найденный префикс
        const firstPath = Object.keys(paths)[0];
        if (firstPath && firstPath.includes('*')) {
          return firstPath.replace('/*', '');
        }
      }
    } catch {
      // tsconfig.json не найден или невалиден
    }

    // Проверяем babel.config.js
    const babelConfigPath = join(projectRoot, 'babel.config.js');
    try {
      await access(babelConfigPath);
      const babelConfig = await readFile(babelConfigPath, 'utf-8');

      // Ищем module-resolver plugin
      if (babelConfig.includes('module-resolver')) {
        const aliasMatch = babelConfig.match(/['"]@app['"]/);
        if (aliasMatch) return '@app';

        const componentMatch = babelConfig.match(/['"]@components['"]/);
        if (componentMatch) return '@components';

        const atMatch = babelConfig.match(/['"]@['"]/);
        if (atMatch) return '@';

        const tildeMatch = babelConfig.match(/['"]~['"]/);
        if (tildeMatch) return '~';
      }
    } catch {
      // babel.config.js не найден
    }

    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Определяет тип системы темизации на основе содержимого файла темы
 *
 * @param themePath - Абсолютный путь к файлу темы
 * @returns Обнаруженный тип темы
 */
async function detectThemeType(
  themePath: string
): Promise<ProjectConfig['theme']['type']> {
  try {
    const content = await readFile(themePath, 'utf-8');

    // Проверяем на styled-components
    if (
      content.includes('styled-components') ||
      content.includes('ThemeProvider')
    ) {
      return 'styled-components';
    }

    // Проверяем на NativeWind
    if (
      content.includes('nativewind') ||
      content.includes('tailwind')
    ) {
      return 'nativewind';
    }

    // Проверяем на Tamagui
    if (
      content.includes('tamagui') ||
      content.includes('createTamagui')
    ) {
      return 'tamagui';
    }

    // По умолчанию - object-export
    return 'object-export';
  } catch {
    // По умолчанию - object-export
    return 'object-export';
  }
}

/**
 * Проверяет существование конфигурационного файла
 *
 * @param projectRoot - Корневая директория проекта
 * @returns true, если файл существует
 */
export async function configExists(projectRoot: string): Promise<boolean> {
  const possiblePaths = [
    '.figmarc.json',
    '.figmarc.js',
    'figma.config.js',
    '.config/figma.json'
  ];

  for (const path of possiblePaths) {
    try {
      await access(join(projectRoot, path));
      return true;
    } catch {
      continue;
    }
  }

  return false;
}
