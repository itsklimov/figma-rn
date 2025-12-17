/**
 * Пакетная генерация нескольких экранов из Figma
 * Batch multi-screen generation from Figma
 *
 * Генерирует множество экранов параллельно, создает shared типы,
 * поддерживает consistent именование и импорты, генерирует barrel exports
 */

import { fetchFigmaNodes } from './figma-api-client.js';
import { generateReactNativeComponent } from './code-generator-v2.js';
import { loadProjectConfig } from './config-loader.js';
import { ProjectConfig } from './config-schema.js';
import { autoGenerateColorMappings, extractFigmaColors } from './auto-theme-mapper.js';
import { updateConfigMappings } from './config-updater.js';
import * as prettier from 'prettier';

/**
 * Входные данные для одного экрана в пакете
 * Input data for a single screen in batch
 */
export interface BatchScreenInput {
  /** Figma URL с node-id (например, https://figma.com/design/FILE?node-id=123-456) */
  figmaUrl: string;

  /** Название экрана (например, HomeScreen, ProfileScreen) */
  screenName: string;

  /** Опциональный путь для вывода файла */
  outputPath?: string;
}

/**
 * Входные данные для пакетной генерации
 * Batch generation input
 */
export interface BatchInput {
  /** Массив экранов для генерации */
  screens: BatchScreenInput[];

  /** Путь к файлу shared типов (например, types/screens.ts) */
  sharedTypesPath?: string;

  /** Генерировать navigation типы */
  generateNavigation?: boolean;

  /** Генерировать index.ts barrel export */
  generateIndex?: boolean;
}

/**
 * Результат генерации одного экрана
 * Single screen generation result
 */
export interface BatchScreenResult {
  /** Название экрана */
  screenName: string;

  /** Сгенерированный код */
  code: string;

  /** Путь для вывода */
  outputPath: string;

  /** Статус генерации */
  status: 'success' | 'error';

  /** Сообщение об ошибке (если status === 'error') */
  error?: string;

  /** Извлеченные типы данных из экрана */
  extractedTypes?: ExtractedType[];
}

/**
 * Результат пакетной генерации
 * Batch generation result
 */
export interface BatchResult {
  /** Результаты генерации экранов */
  screens: BatchScreenResult[];

  /** Shared типы (если запрошено) */
  sharedTypes?: string;

  /** Navigation типы (если запрошено) */
  navigationTypes?: string;

  /** Index barrel export (если запрошено) */
  indexFile?: string;

  /** Сводка по генерации */
  summary: {
    /** Общее количество экранов */
    total: number;

    /** Успешно сгенерировано */
    successful: number;

    /** Ошибки генерации */
    failed: number;

    /** Время выполнения (мс) */
    duration: number;
  };
}

/**
 * Извлеченный тип из экрана
 * Extracted type from screen
 */
export interface ExtractedType {
  /** Название типа */
  name: string;

  /** TypeScript определение типа */
  definition: string;

  /** Частота использования */
  frequency: number;
}

/**
 * Основная функция пакетной генерации
 * Main batch generation function
 *
 * Генерирует множество экранов параллельно с shared типами и маппингами
 * Generates multiple screens in parallel with shared types and mappings
 *
 * @param input - Входные данные для пакетной генерации
 * @param figmaToken - Figma API токен
 * @returns Результат пакетной генерации
 */
export async function generateBatch(
  input: BatchInput,
  figmaToken: string
): Promise<BatchResult> {
  const startTime = Date.now();

  console.error('[BATCH] Начало пакетной генерации...');
  console.error(`[BATCH] Экранов для генерации: ${input.screens.length}`);

  // Загружаем конфигурацию проекта один раз для всех экранов
  // Load project config once for all screens
  const config = await loadProjectConfig() || getDefaultConfig();

  // Результаты генерации
  // Generation results
  const screenResults: BatchScreenResult[] = [];

  // Собираем все цвета из всех экранов для единого маппинга темы
  // Collect all colors from all screens for unified theme mapping
  const allFigmaColors = new Set<string>();

  // Фаза 1: Параллельная загрузка метаданных из Figma
  // Phase 1: Parallel metadata fetching from Figma
  console.error('[BATCH] Фаза 1: Загрузка метаданных из Figma...');

  const fetchPromises = input.screens.map(async (screen) => {
    try {
      const { fileKey, nodeId } = parseFigmaUrl(screen.figmaUrl);
      const response = await fetchFigmaNodes(figmaToken, fileKey, [nodeId]);
      const node = response.nodes[nodeId]?.document;

      if (!node) {
        throw new Error(`Узел ${nodeId} не найден в Figma файле`);
      }

      // Извлекаем цвета из узла
      // Extract colors from node
      const colors = extractFigmaColors(node);
      colors.forEach((color) => allFigmaColors.add(color));

      console.error(`[BATCH] ✅ Загружено: ${screen.screenName} (${colors.length} цветов)`);

      return { screen, node, fileKey, nodeId };
    } catch (error) {
      console.error(`[BATCH] ❌ Ошибка загрузки ${screen.screenName}:`, error);
      return { screen, error: error instanceof Error ? error.message : String(error) };
    }
  });

  const fetchedData = await Promise.all(fetchPromises);

  // Фаза 2: Генерация единого маппинга темы для всех экранов
  // Phase 2: Generate unified theme mapping for all screens
  console.error('[BATCH] Фаза 2: Генерация маппинга темы...');
  console.error(`[BATCH] Всего уникальных цветов: ${allFigmaColors.size}`);

  if (allFigmaColors.size > 0 && config.theme?.location) {
    const colorMappings = await autoGenerateColorMappings(
      Array.from(allFigmaColors),
      config
    );

    if (!config.mappings) config.mappings = {};
    config.mappings.colors = colorMappings;

    // Сохраняем маппинги в .figmarc.json для повторного использования
    // Save mappings to .figmarc.json for reuse
    await updateConfigMappings({ colors: colorMappings });

    console.error(`[BATCH] ✅ Создано ${Object.keys(colorMappings).length} цветовых маппингов`);
  }

  // Фаза 3: Параллельная генерация кода для всех экранов
  // Phase 3: Parallel code generation for all screens
  console.error('[BATCH] Фаза 3: Генерация кода экранов...');

  const generatePromises = fetchedData.map(async (data) => {
    const { screen } = data;

    if ('error' in data) {
      // Ошибка при загрузке метаданных
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

      // Генерируем код экрана с shared конфигом
      // Generate screen code with shared config
      const code = await generateReactNativeComponent(node, screen.screenName, config);

      // Извлекаем типы из сгенерированного кода
      // Extract types from generated code
      const extractedTypes = extractTypesFromCode(code, screen.screenName);

      console.error(`[BATCH] ✅ Сгенерирован: ${screen.screenName} (${extractedTypes.length} типов)`);

      return {
        screenName: screen.screenName,
        code,
        outputPath: screen.outputPath || `${screen.screenName}.tsx`,
        status: 'success' as const,
        extractedTypes,
      };
    } catch (error) {
      console.error(`[BATCH] ❌ Ошибка генерации ${screen.screenName}:`, error);

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

  // Фаза 4: Генерация shared типов (если запрошено)
  // Phase 4: Generate shared types (if requested)
  let sharedTypes: string | undefined;
  if (input.sharedTypesPath) {
    console.error('[BATCH] Фаза 4: Генерация shared типов...');

    const allExtractedTypes = screenResults
      .filter((r) => r.status === 'success' && r.extractedTypes)
      .flatMap((r) => r.extractedTypes!);

    sharedTypes = generateSharedTypes(results, allExtractedTypes);
    console.error(`[BATCH] ✅ Сгенерированы shared типы`);
  }

  // Фаза 5: Генерация navigation типов (если запрошено)
  // Phase 5: Generate navigation types (if requested)
  let navigationTypes: string | undefined;
  if (input.generateNavigation) {
    console.error('[BATCH] Фаза 5: Генерация navigation типов...');

    const screenNames = input.screens.map((s) => s.screenName);
    navigationTypes = generateNavigationTypes(screenNames);
    console.error(`[BATCH] ✅ Сгенерированы navigation типы`);
  }

  // Фаза 6: Генерация barrel export (если запрошено)
  // Phase 6: Generate barrel export (if requested)
  let indexFile: string | undefined;
  if (input.generateIndex) {
    console.error('[BATCH] Фаза 6: Генерация barrel export...');

    const successfulScreens = screenResults
      .filter((r) => r.status === 'success')
      .map((r) => r.screenName);

    indexFile = generateBarrelExport(successfulScreens);
    console.error(`[BATCH] ✅ Сгенерирован barrel export`);
  }

  // Подсчитываем статистику
  // Calculate statistics
  const successful = screenResults.filter((r) => r.status === 'success').length;
  const failed = screenResults.filter((r) => r.status === 'error').length;
  const duration = Date.now() - startTime;

  console.error('[BATCH] ═══════════════════════════════════════');
  console.error(`[BATCH] ✅ Пакетная генерация завершена за ${duration}ms`);
  console.error(`[BATCH] 📊 Успешно: ${successful} | Ошибки: ${failed}`);
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
 * Генерирует shared типы для использования между экранами
 * Generates shared types for use across screens
 *
 * @param screens - Результаты генерации экранов
 * @param models - Извлеченные модели данных
 * @returns Код файла с shared типами
 */
export function generateSharedTypes(
  screens: BatchScreenResult[],
  models: ExtractedType[]
): string {
  // Группируем типы по имени и подсчитываем частоту
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

  // Сортируем типы по частоте использования (самые частые первыми)
  // Sort types by frequency (most frequent first)
  const sortedTypes = Array.from(typeMap.entries())
    .sort((a, b) => b[1].frequency - a[1].frequency);

  let code = `/**\n * Shared типы для экранов\n * Shared types for screens\n * \n * Автоматически сгенерировано batch-generator\n * Auto-generated by batch-generator\n */\n\n`;

  // Общие типы данных
  // Common data types
  sortedTypes.forEach(([name, data]) => {
    code += `${data.definition}\n\n`;
  });

  // Дополнительные utility типы
  // Additional utility types
  code += `// Utility типы / Utility types\n\n`;
  code += `export type ScreenName = ${screens.map((s) => `'${s.screenName}'`).join(' | ')};\n\n`;

  return code;
}

/**
 * Генерирует barrel export (index.ts) для всех экранов
 * Generates barrel export (index.ts) for all screens
 *
 * @param screenNames - Массив названий экранов
 * @returns Код barrel export файла
 */
export function generateBarrelExport(screenNames: string[]): string {
  let code = `/**\n * Barrel export для всех экранов\n * Barrel export for all screens\n * \n * Автоматически сгенерировано batch-generator\n * Auto-generated by batch-generator\n */\n\n`;

  screenNames.forEach((name) => {
    code += `export { default as ${name} } from './${name}';\n`;
  });

  code += `\n// Re-export shared types\nexport * from './types/shared';\n`;

  return code;
}

/**
 * Генерирует navigation типы для React Navigation
 * Generates navigation types for React Navigation
 *
 * @param screenNames - Массив названий экранов
 * @returns Код navigation типов
 */
export function generateNavigationTypes(screenNames: string[]): string {
  let code = `/**\n * Navigation типы для React Navigation\n * Navigation types for React Navigation\n * \n * Автоматически сгенерировано batch-generator\n * Auto-generated by batch-generator\n */\n\n`;

  code += `import type { NavigatorScreenParams } from '@react-navigation/native';\n\n`;

  // Root Stack параметры
  // Root Stack params
  code += `export type RootStackParamList = {\n`;
  screenNames.forEach((name) => {
    // Удаляем "Screen" из имени для route name
    // Remove "Screen" from name for route name
    const routeName = name.replace(/Screen$/, '');
    code += `  ${routeName}: undefined; // TODO: Add params if needed\n`;
  });
  code += `};\n\n`;

  // Типы для navigation prop
  // Types for navigation prop
  code += `// Типы для useNavigation hook\n`;
  code += `// Types for useNavigation hook\n`;
  code += `import type { StackNavigationProp } from '@react-navigation/stack';\n\n`;

  screenNames.forEach((name) => {
    const routeName = name.replace(/Screen$/, '');
    code += `export type ${name}NavigationProp = StackNavigationProp<RootStackParamList, '${routeName}'>;\n`;
  });

  code += `\n// Типы для route prop\n`;
  code += `// Types for route prop\n`;
  code += `import type { RouteProp } from '@react-navigation/native';\n\n`;

  screenNames.forEach((name) => {
    const routeName = name.replace(/Screen$/, '');
    code += `export type ${name}RouteProp = RouteProp<RootStackParamList, '${routeName}'>;\n`;
  });

  return code;
}

/**
 * Извлекает типы данных из сгенерированного кода
 * Extracts data types from generated code
 *
 * Ищет hardcoded данные которые должны стать shared типами:
 * - User (если есть имена, аватары)
 * - Product (если есть цены, названия товаров)
 * - Post (если есть контент, даты)
 *
 * @param code - Сгенерированный код компонента
 * @param screenName - Название экрана
 * @returns Массив извлеченных типов
 */
function extractTypesFromCode(code: string, screenName: string): ExtractedType[] {
  const types: ExtractedType[] = [];

  // Паттерны для определения типов данных
  // Patterns for data type detection

  // User тип - если есть имена людей или аватары
  // User type - if there are people names or avatars
  const hasUserData = /\{['"]([А-ЯЁA-Z][а-яёa-z]+\s+[А-ЯЁA-Z][а-яёa-z]+)['"]\}/.test(code) ||
    code.includes('avatar') || code.includes('Avatar');

  if (hasUserData) {
    types.push({
      name: 'User',
      definition: `export interface User {\n  id: string;\n  name: string;\n  avatar?: string;\n}`,
      frequency: 1,
    });
  }

  // Product тип - если есть цены или названия товаров
  // Product type - if there are prices or product names
  const hasProductData = /\d+\s*₽/.test(code) || /\d+\s*000\s*₽/.test(code);

  if (hasProductData) {
    types.push({
      name: 'Product',
      definition: `export interface Product {\n  id: string;\n  name: string;\n  price: number;\n  image?: string;\n}`,
      frequency: 1,
    });
  }

  // Post/Content тип - если есть текстовый контент
  // Post/Content type - if there is text content
  const hasContentData = code.includes('characters') && code.length > 1000;

  if (hasContentData) {
    types.push({
      name: 'Post',
      definition: `export interface Post {\n  id: string;\n  title: string;\n  content: string;\n  date: string;\n  author: User;\n}`,
      frequency: 1,
    });
  }

  // Badge/Level тип - если есть числовые значения в badge
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
 * Парсит Figma URL и извлекает file key и node ID
 * Parses Figma URL and extracts file key and node ID
 *
 * @param figmaUrl - Figma URL
 * @returns Object с fileKey и nodeId
 * @throws Error если URL невалидный
 */
function parseFigmaUrl(figmaUrl: string): { fileKey: string; nodeId: string } {
  const urlMatch = figmaUrl.match(/figma\.com\/(?:file|design)\/([^/?]+)/);
  if (!urlMatch) {
    throw new Error(`Невалидный Figma URL: ${figmaUrl}`);
  }
  const fileKey = urlMatch[1];

  const nodeMatch = figmaUrl.match(/node-id=([^&]+)/);
  if (!nodeMatch) {
    throw new Error(`node-id не найден в URL: ${figmaUrl}`);
  }
  const nodeId = nodeMatch[1].replace(/-/g, ':');

  return { fileKey, nodeId };
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
