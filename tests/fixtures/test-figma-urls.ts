/**
 * Тестовые Figma URLs для e2e тестов
 *
 * ВАЖНО: Для работы тестов требуется переменная окружения FIGMA_TOKEN
 * Получить токен: https://www.figma.com/developers/api#access-tokens
 */

// Базовый URL тестового файла
export const TEST_FILE_KEY = 'yfQEfmNzTQnQxTIBWG4SxO';
export const TEST_FILE_NAME = 'MARAFET--Copy-';
export const BASE_URL = `https://www.figma.com/design/${TEST_FILE_KEY}/${TEST_FILE_NAME}`;

/**
 * Создаёт полный Figma URL с node-id
 */
export function createFigmaUrl(nodeId: string): string {
  return `${BASE_URL}?node-id=${nodeId}&m=dev`;
}

/**
 * Тестовые URL для различных типов элементов
 * Нужно обновить node-id после исследования Figma файла
 */
export const TEST_URLS = {
  // Основной тестовый экран (от пользователя)
  mainScreen: createFigmaUrl('4212-63544'),

  // Альтернативные узлы для тестов разных паттернов
  // TODO: Добавить после исследования структуры Figma файла
  // listScreen: createFigmaUrl('xxx-xxx'),
  // formScreen: createFigmaUrl('xxx-xxx'),
  // modal: createFigmaUrl('xxx-xxx'),
  // bottomSheet: createFigmaUrl('xxx-xxx'),
  // smallComponent: createFigmaUrl('xxx-xxx'),
};

/**
 * Невалидные URL для тестов ошибок
 */
export const INVALID_URLS = {
  // Отсутствует node-id
  missingNodeId: `https://www.figma.com/design/${TEST_FILE_KEY}`,

  // Неправильный формат
  malformed: 'not-a-valid-url',

  // Несуществующий fileKey
  nonExistentFile: 'https://www.figma.com/design/XXXXXXXXXXXXXXX?node-id=1-1',

  // Несуществующий nodeId
  nonExistentNode: createFigmaUrl('99999-99999'),
};

/**
 * Извлекает nodeId из Figma URL
 */
export function extractNodeId(figmaUrl: string): string | null {
  const match = figmaUrl.match(/node-id=([^&]+)/);
  if (!match) return null;
  return decodeURIComponent(match[1]).replace(/-/g, ':');
}

/**
 * Извлекает fileKey из Figma URL
 */
export function extractFileKey(figmaUrl: string): string | null {
  const match = figmaUrl.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

/**
 * Проверяет, что FIGMA_TOKEN установлен
 */
export function requireFigmaToken(): string {
  const token = process.env.FIGMA_TOKEN;
  if (!token) {
    throw new Error(
      'FIGMA_TOKEN environment variable is required for e2e tests.\n' +
      'Get your token from: https://www.figma.com/developers/api#access-tokens\n' +
      'Run tests with: FIGMA_TOKEN=your_token npm test'
    );
  }
  return token;
}

/**
 * Проверяет валидность Figma URL
 */
export function isValidFigmaUrl(url: string): boolean {
  // Проверяем формат URL
  const urlPattern = /^https:\/\/(www\.)?figma\.com\/(file|design)\/[a-zA-Z0-9]+/;
  if (!urlPattern.test(url)) return false;

  // Проверяем наличие node-id
  if (!url.includes('node-id=')) return false;

  return true;
}
