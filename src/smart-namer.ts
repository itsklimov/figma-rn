/**
 * Умный алгоритм именования стилей
 * Smart style naming algorithm
 * Генерирует семантические имена на основе контекста узла
 * Generates semantic names based on node context
 */

export interface NamingContext {
  parentName?: string;
  content?: string;
  index?: number;
}

/**
 * Улучшенный алгоритм именования стилей
 * Improved style naming algorithm
 *
 * @param nodeName - Имя узла из Figma
 * @param nodeType - Тип узла (Text, Frame, etc.)
 * @param context - Дополнительный контекст для улучшения имени
 * @returns Семантическое имя стиля в camelCase
 */
export function generateSmartStyleName(
  nodeName: string,
  nodeType: string,
  context?: NamingContext
): string {
  // 1. Обработка формата времени (19:41, 18:00)
  // Handle time formats
  if (/^\d{1,2}:\d{2}$/.test(nodeName)) {
    return context?.parentName ? `${toCamelCase(context.parentName)}Time` : 'timeText';
  }

  // 2. Обработка цен (5000 ₽, 15 000 ₽)
  // Handle prices
  if (/^\d+\s*000?\s*₽/.test(nodeName) || /^\d+\s*₽/.test(nodeName)) {
    return 'priceText';
  }

  // 3. Обработка чисел (+3, 75/200, 4.6, (254))
  // Handle numbers
  if (/^[\d+\/.()]+$/.test(nodeName)) {
    if (context?.parentName?.toLowerCase().includes('badge')) return 'badgeCount';
    if (context?.parentName?.toLowerCase().includes('karma')) return 'karmaScore';
    if (context?.parentName?.toLowerCase().includes('rating')) return 'ratingValue';
    return 'numberText';
  }

  // 4. Обработка общих имен фреймворка
  // Handle generic framework names
  const genericNames = [
    'label',
    'content',
    'frame',
    'group',
    'rectangle',
    'ellipse',
    'vector',
    'element',
  ];
  const isGeneric = genericNames.some((g) => nodeName.toLowerCase().startsWith(g));

  if (isGeneric && context?.content) {
    // Используем реальный текстовый контент для именования (первые 20 символов)
    // Use actual text content for naming (first 20 chars)
    const cleanContent = context.content
      .replace(/[^а-яА-Яa-zA-Z0-9\s]/g, '')
      .trim()
      .slice(0, 20);
    if (cleanContent) {
      return toCamelCase(cleanContent);
    }
  }

  if (isGeneric && context?.parentName) {
    return `${toCamelCase(context.parentName)}${capitalize(nodeType)}`;
  }

  // 5. По умолчанию: чистый camelCase с обработкой числовых префиксов
  // Default: clean camelCase with numeric prefix handling
  return toCamelCase(nodeName);
}

/**
 * Преобразует строку в camelCase
 * Обрабатывает кириллицу и латиницу
 * Converts string to camelCase, handles Cyrillic and Latin
 *
 * @param str - Исходная строка
 * @returns Строка в формате camelCase
 */
export function toCamelCase(str: string): string {
  let result = str
    .replace(/[^a-zA-Zа-яА-Я0-9]+(.)/g, (_, chr) => chr.toUpperCase())
    .replace(/^[A-Z]/, (chr) => chr.toLowerCase())
    .replace(/[^a-zA-Zа-яА-Я0-9]/g, '');

  // Добавляем underscore если начинается с цифры
  // Add underscore prefix if starts with digit
  if (/^\d/.test(result)) {
    result = '_' + result;
  }

  // Fallback если строка пустая
  // Fallback if empty string
  if (!result) {
    result = 'element';
  }

  return result;
}

/**
 * Делает первый символ заглавным
 * Capitalizes first character
 *
 * @param str - Исходная строка
 * @returns Строка с заглавной первой буквой
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Проверяет является ли имя числовым значением
 * Checks if name is a numeric value
 *
 * @param name - Имя для проверки
 * @returns true если это число, время или цена
 */
export function isNumericValue(name: string): boolean {
  return (
    /^\d{1,2}:\d{2}$/.test(name) || // время / time
    /^\d+\s*000?\s*₽/.test(name) || // цена / price
    /^\d+\s*₽/.test(name) || // цена / price
    /^[\d+\/.()]+$/.test(name) // числа / numbers
  );
}

/**
 * Проверяет является ли имя общим (generic)
 * Checks if name is generic
 *
 * @param name - Имя для проверки
 * @returns true если это общее имя
 */
export function isGenericName(name: string): boolean {
  const genericNames = [
    'label',
    'content',
    'frame',
    'group',
    'rectangle',
    'ellipse',
    'vector',
    'element',
  ];
  return genericNames.some((g) => name.toLowerCase().startsWith(g));
}
