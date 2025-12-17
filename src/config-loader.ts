/**
 * Загрузчик конфигурации проекта
 * Использует cosmiconfig для поиска конфигурации в различных форматах
 */

import { cosmiconfig } from 'cosmiconfig';
import Ajv from 'ajv';
import {
  ProjectConfig,
  projectConfigSchema,
  DEFAULT_CONFIG
} from './config-schema.js';

/**
 * Имя модуля для cosmiconfig
 */
const MODULE_NAME = 'figma';

/**
 * Места поиска конфигурации (в порядке приоритета)
 */
const SEARCH_PLACES = [
  '.figmarc.json',
  '.figmarc.js',
  'figma.config.js',
  '.config/figma.json',
  'package.json'
];

/**
 * AJV валидатор для схемы конфигурации
 */
const ajv = new Ajv({ allErrors: true, verbose: true });
const validateConfig = ajv.compile(projectConfigSchema);

/**
 * Ошибка валидации конфигурации
 */
export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public errors: Array<{ path: string; message: string }>
  ) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

/**
 * Загружает конфигурацию проекта из файловой системы
 *
 * @param searchFrom - Директория, с которой начинать поиск (по умолчанию - текущая)
 * @returns Найденная конфигурация или null, если не найдена
 * @throws {ConfigValidationError} Если конфигурация невалидна
 */
export async function loadProjectConfig(
  searchFrom?: string
): Promise<ProjectConfig | null> {
  try {
    // Создаем explorer для поиска конфигурации
    const explorer = cosmiconfig(MODULE_NAME, {
      searchPlaces: SEARCH_PLACES,
      stopDir: undefined, // Ищем до корня файловой системы
    });

    // Ищем конфигурацию
    const result = await explorer.search(searchFrom);

    // Если не найдена - возвращаем null
    if (!result || !result.config) {
      return null;
    }

    // Валидируем и возвращаем конфигурацию
    return validateAndNormalizeConfig(result.config, result.filepath);
  } catch (error) {
    // Если это уже наша ошибка валидации - пробрасываем
    if (error instanceof ConfigValidationError) {
      throw error;
    }

    // Иначе - оборачиваем в общую ошибку
    console.error('Ошибка загрузки конфигурации:', error);
    return null;
  }
}

/**
 * Загружает конфигурацию или возвращает дефолтную
 *
 * @param searchFrom - Директория для поиска
 * @returns Найденная конфигурация или DEFAULT_CONFIG
 */
export async function loadProjectConfigOrDefault(
  searchFrom?: string
): Promise<ProjectConfig> {
  const config = await loadProjectConfig(searchFrom);
  return config || DEFAULT_CONFIG;
}

/**
 * Валидирует конфигурацию с помощью AJV и нормализует её
 *
 * @param config - Сырая конфигурация из файла
 * @param filepath - Путь к файлу конфигурации (для ошибок)
 * @returns Валидированная и нормализованная конфигурация
 * @throws {ConfigValidationError} Если конфигурация невалидна
 */
function validateAndNormalizeConfig(
  config: any,
  filepath: string
): ProjectConfig {
  // Если конфигурация из package.json - берем только поле 'figma'
  if (filepath.endsWith('package.json') && config.figma) {
    config = config.figma;
  }

  // Валидируем с помощью AJV
  const isValid = validateConfig(config);

  if (!isValid) {
    // Собираем ошибки валидации
    const errors = (validateConfig.errors || []).map(err => ({
      path: err.instancePath || '(root)',
      message: err.message || 'Неизвестная ошибка'
    }));

    throw new ConfigValidationError(
      `Невалидная конфигурация в ${filepath}`,
      errors
    );
  }

  // Возвращаем типизированную конфигурацию
  return config as ProjectConfig;
}

/**
 * Очищает кеш cosmiconfig (полезно для тестов)
 */
export function clearConfigCache(): void {
  const explorer = cosmiconfig(MODULE_NAME, {
    searchPlaces: SEARCH_PLACES
  });
  explorer.clearCaches();
}

/**
 * Форматирует ошибки валидации для вывода пользователю
 *
 * @param error - Ошибка валидации
 * @returns Читаемое сообщение об ошибке
 */
export function formatValidationErrors(error: ConfigValidationError): string {
  const errorList = error.errors
    .map(err => `  - ${err.path}: ${err.message}`)
    .join('\n');

  return `${error.message}\n\nОшибки:\n${errorList}`;
}
