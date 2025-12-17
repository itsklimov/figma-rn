/**
 * Генератор полных потоков приложения (Flow Generator)
 * Complete app flow generator
 *
 * Генерирует множество экранов с навигацией, shared типами и barrel exports за один вызов
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
 * Интерфейс для определения экрана в потоке
 * Flow screen interface
 */
export interface FlowScreen {
  /** Figma URL с node-id (например, https://figma.com/design/FILE?node-id=123-456) */
  figmaUrl: string;

  /** Название экрана (например, HomeScreen, ProfileScreen) */
  screenName: string;

  /** Опциональный путь для вывода файла */
  outputPath?: string;
}

/**
 * Результат обнаружения паттернов на экране
 * Detection results for screen patterns
 */
export interface DetectionResults {
  /** Обнаруженные модели данных */
  dataModels: DataModel[];

  /** Обнаруженные элементы навигации */
  navigationElements: string[];

  /** Тип экрана (list, detail, form, profile, unknown) */
  screenType: string;

  /** Название сущности */
  entityName: string;
}

/**
 * Результат генерации одного файла
 * Single file generation result
 */
export interface GeneratedFile {
  /** Тип файла (component, types, hooks) */
  type: 'component' | 'types' | 'hooks';

  /** Путь к файлу */
  path: string;

  /** Содержимое файла */
  content: string;
}

/**
 * Результат генерации одного экрана в потоке
 * Single screen result in flow
 */
export interface FlowScreenResult {
  /** Название экрана */
  screenName: string;

  /** Сгенерированные файлы для этого экрана */
  files: GeneratedFile[];

  /** Результаты обнаружения */
  detections: DetectionResults;

  /** Статус генерации */
  status: 'success' | 'error';

  /** Сообщение об ошибке (если status === 'error') */
  error?: string;
}

/**
 * Структура навигации приложения
 * App navigation structure
 */
export interface FlowNavigationResult {
  /** TypeScript типы для навигации */
  types: string;

  /** Код навигатора */
  navigator: string;

  /** Структура навигации */
  structure: NavigationStructure;
}

/**
 * Полный результат генерации потока
 * Complete flow generation result
 */
export interface FlowResult {
  /** Результаты генерации экранов */
  screens: FlowScreenResult[];

  /** Результаты навигации */
  navigation: FlowNavigationResult;

  /** Shared типы для всех экранов */
  sharedTypes: string;

  /** Index barrel export */
  indexFile: string;

  /** Сводная статистика */
  summary: {
    /** Общее количество экранов */
    total: number;

    /** Успешно сгенерировано */
    successful: number;

    /** Ошибки генерации */
    failed: number;

    /** Типы экранов и их количество */
    screenTypes: Record<string, number>;

    /** Время выполнения (мс) */
    duration: number;
  };
}

/**
 * Опции генерации потока
 * Flow generation options
 */
export interface FlowGenerationOptions {
  /** Генерировать навигацию (по умолчанию true) */
  generateNavigation?: boolean;

  /** Генерировать shared типы (по умолчанию true) */
  generateSharedTypes?: boolean;

  /** Генерировать index.ts (по умолчанию true) */
  generateIndex?: boolean;

  /** Генерировать React Query хуки (по умолчанию true) */
  generateHooks?: boolean;

  /** Генерировать типы данных (по умолчанию true) */
  generateDataTypes?: boolean;
}

/**
 * Главная функция генерации полного потока приложения
 * Main function for complete app flow generation
 *
 * Генерирует множество экранов параллельно с навигацией, shared типами и всей инфраструктурой
 * Generates multiple screens in parallel with navigation, shared types, and all infrastructure
 *
 * @param figmaToken - Figma API токен
 * @param screens - Массив экранов для генерации
 * @param options - Опции генерации
 * @returns Полный результат генерации потока
 */
export async function generateCompleteFlow(
  figmaToken: string,
  screens: FlowScreen[],
  options: FlowGenerationOptions = {}
): Promise<FlowResult> {
  const startTime = Date.now();

  // Установка значений по умолчанию для опций
  // Set default values for options
  const {
    generateNavigation = true,
    generateSharedTypes = true,
    generateIndex = true,
    generateHooks = true,
    generateDataTypes = true,
  } = options;

  console.error('[FLOW] ═══════════════════════════════════════');
  console.error('[FLOW] Начало генерации полного потока...');
  console.error(`[FLOW] Экранов для генерации: ${screens.length}`);
  console.error('[FLOW] ═══════════════════════════════════════');

  // Загружаем конфигурацию проекта один раз для всех экранов
  // Load project config once for all screens
  const config = (await loadProjectConfig()) || getDefaultConfig();

  // ФАЗА 1: Параллельная загрузка всех Figma узлов
  // PHASE 1: Parallel Figma nodes fetching
  console.error('[FLOW] Фаза 1/6: Загрузка Figma узлов...');

  const fetchResults = await fetchAllFigmaNodes(figmaToken, screens);

  const successfulFetches = fetchResults.filter(
    (r): r is { screen: FlowScreen; node: any; fileKey: string; nodeId: string } =>
      !r.error && !!r.node && !!r.fileKey && !!r.nodeId
  );
  const failedFetches = fetchResults.filter(
    (r): r is { screen: FlowScreen; error: string } => !!r.error
  );

  console.error(
    `[FLOW] ✅ Загружено узлов: ${successfulFetches.length} / ${screens.length}`
  );
  if (failedFetches.length > 0) {
    console.error(`[FLOW] ❌ Ошибки загрузки: ${failedFetches.length}`);
    failedFetches.forEach((f) => {
      console.error(`[FLOW]   - ${f.screen.screenName}: ${f.error}`);
    });
  }

  // ФАЗА 2: Генерация единого маппинга темы для всех экранов
  // PHASE 2: Generate unified theme mapping for all screens
  console.error('[FLOW] Фаза 2/6: Генерация единого маппинга темы...');

  const allFigmaColors = new Set<string>();
  successfulFetches.forEach((result) => {
    if (result.node) {
      const colors = extractFigmaColors(result.node);
      colors.forEach((color) => allFigmaColors.add(color));
    }
  });

  console.error(`[FLOW] Найдено уникальных цветов: ${allFigmaColors.size}`);

  if (allFigmaColors.size > 0 && config.theme?.location) {
    const colorMappings = await autoGenerateColorMappings(
      Array.from(allFigmaColors),
      config
    );

    if (!config.mappings) config.mappings = {};
    config.mappings.colors = colorMappings;

    await updateConfigMappings({ colors: colorMappings });

    console.error(
      `[FLOW] ✅ Создано цветовых маппингов: ${Object.keys(colorMappings).length}`
    );
  }

  // ФАЗА 3: Параллельная генерация кода экранов с обнаружением паттернов
  // PHASE 3: Parallel screen code generation with pattern detection
  console.error('[FLOW] Фаза 3/6: Генерация кода экранов и обнаружение паттернов...');

  const screenResults = await generateAllScreens(
    successfulFetches,
    failedFetches,
    config,
    { generateHooks, generateDataTypes }
  );

  const successfulScreens = screenResults.filter((r) => r.status === 'success');
  console.error(
    `[FLOW] ✅ Успешно сгенерировано экранов: ${successfulScreens.length} / ${screens.length}`
  );

  // ФАЗА 4: Генерация навигации на основе анализа экранов
  // PHASE 4: Navigation generation based on screen analysis
  console.error('[FLOW] Фаза 4/6: Генерация навигации...');

  let navigationResult: FlowNavigationResult;

  if (generateNavigation && successfulFetches.length > 0) {
    navigationResult = await generateFlowNavigation(successfulFetches);
    console.error('[FLOW] ✅ Навигация сгенерирована');
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
    console.error('[FLOW] ⊘ Генерация навигации пропущена');
  }

  // ФАЗА 5: Генерация shared типов из всех моделей данных
  // PHASE 5: Generate shared types from all data models
  console.error('[FLOW] Фаза 5/6: Генерация shared типов...');

  let sharedTypesCode = '';

  if (generateSharedTypes) {
    const allDataModels: DataModel[] = [];
    const allExtractedTypes: ExtractedType[] = [];

    successfulScreens.forEach((screen) => {
      allDataModels.push(...screen.detections.dataModels);
    });

    // Преобразуем модели данных в ExtractedType формат
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

    console.error('[FLOW] ✅ Shared типы сгенерированы');
  } else {
    console.error('[FLOW] ⊘ Генерация shared типов пропущена');
  }

  // ФАЗА 6: Генерация index.ts barrel export
  // PHASE 6: Generate index.ts barrel export
  console.error('[FLOW] Фаза 6/6: Генерация barrel export...');

  let indexFileCode = '';

  if (generateIndex) {
    const successfulScreenNames = successfulScreens.map((s) => s.screenName);
    indexFileCode = generateBarrelExport(successfulScreenNames);
    console.error('[FLOW] ✅ Index файл сгенерирован');
  } else {
    console.error('[FLOW] ⊘ Генерация index файла пропущена');
  }

  // Подсчет статистики
  // Calculate statistics
  const screenTypeCounts: Record<string, number> = {};
  successfulScreens.forEach((screen) => {
    const type = screen.detections.screenType;
    screenTypeCounts[type] = (screenTypeCounts[type] || 0) + 1;
  });

  const duration = Date.now() - startTime;

  console.error('[FLOW] ═══════════════════════════════════════');
  console.error(`[FLOW] ✅ Генерация потока завершена за ${duration}ms`);
  console.error(`[FLOW] 📊 Успешно: ${successfulScreens.length} | Ошибки: ${screenResults.length - successfulScreens.length}`);
  console.error('[FLOW] Типы экранов:');
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
 * Параллельная загрузка всех Figma узлов
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
        throw new Error(`Узел ${nodeId} не найден в Figma файле`);
      }

      console.error(`[FLOW] ✓ Загружен: ${screen.screenName}`);

      return { screen, node, fileKey, nodeId };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`[FLOW] ✗ Ошибка загрузки ${screen.screenName}:`, errorMessage);
      return { screen, error: errorMessage };
    }
  });

  return await Promise.all(fetchPromises);
}

/**
 * Параллельная генерация всех экранов
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

  // Обработка успешно загруженных экранов
  // Process successfully fetched screens
  const generatePromises = successfulFetches.map(async (data) => {
    const { screen, node } = data;

    try {
      // Генерируем код компонента
      // Generate component code
      const componentCode = await generateReactNativeComponent(
        node,
        screen.screenName,
        config
      );

      // Обнаруживаем паттерны и модели данных
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

      // Генерируем типы данных если запрошено
      // Generate data types if requested
      if (options.generateDataTypes && dataModels.length > 0) {
        const typesCode = generateTypeDefinitions(dataModels);
        files.push({
          type: 'types',
          path: `types/${screen.screenName}.types.ts`,
          content: typesCode,
        });
      }

      // Генерируем React Query хуки если запрошено
      // Generate React Query hooks if requested
      if (options.generateHooks && dataModels.length > 0) {
        const hooksCode = generateReactQueryHooks(dataModels, screen.screenName);
        files.push({
          type: 'hooks',
          path: `hooks/${screen.screenName}.hooks.ts`,
          content: hooksCode,
        });
      }

      console.error(`[FLOW] ✓ Сгенерирован: ${screen.screenName} (${files.length} файлов)`);

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
      console.error(`[FLOW] ✗ Ошибка генерации ${screen.screenName}:`, errorMessage);

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

  // Обработка неудачных загрузок
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
 * Генерация навигационной структуры для потока
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
  // Подготовка данных для анализа навигации
  // Prepare data for navigation analysis
  const navScreens: NavFigmaScreen[] = fetchedScreens.map((data) => ({
    name: data.screen.screenName,
    node: data.node,
  }));

  // Анализируем структуру навигации
  // Analyze navigation structure
  const structure = analyzeNavigationStructure(navScreens);

  // Генерируем типы навигации
  // Generate navigation types
  const typesCode = generateNavigationTypes(structure);

  // Генерируем код навигатора
  // Generate navigator code
  const navigatorCode = generateNavigatorCode(structure);

  return {
    types: typesCode,
    navigator: navigatorCode,
    structure,
  };
}

/**
 * Генерирует определение одного типа из модели данных
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
 * Определяет тип экрана из его названия
 * Determines screen type from its name
 */
function detectScreenTypeFromName(
  screenName: string
): 'list' | 'detail' | 'form' | 'profile' | 'unknown' {
  const normalized = screenName.toLowerCase();

  if (
    normalized.includes('list') ||
    normalized.includes('catalog') ||
    normalized.includes('каталог') ||
    normalized.includes('список')
  ) {
    return 'list';
  }

  if (
    normalized.includes('detail') ||
    normalized.includes('card') ||
    normalized.includes('карточка')
  ) {
    return 'detail';
  }

  if (
    normalized.includes('form') ||
    normalized.includes('edit') ||
    normalized.includes('create') ||
    normalized.includes('форма')
  ) {
    return 'form';
  }

  if (
    normalized.includes('profile') ||
    normalized.includes('профиль') ||
    normalized.includes('account')
  ) {
    return 'profile';
  }

  return 'unknown';
}

/**
 * Извлекает название сущности из имени экрана
 * Extracts entity name from screen name
 */
function extractEntityNameFromScreen(screenName: string): string {
  const normalized = screenName
    .replace(/Screen|Page|View|Экран|Страница/gi, '')
    .replace(/List|Catalog|Details?|Form|Card/gi, '')
    .replace(/Список|Каталог|Карточка|Форма/gi, '')
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
 * Парсит Figma URL и извлекает file key и node ID
 * Parses Figma URL and extracts file key and node ID
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
      importPrefix: '',
    },
  };
}
