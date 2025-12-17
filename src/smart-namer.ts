/**
 * Smart style naming algorithm
 * Generates semantic names based on node context
 */

export interface NamingContext {
  parentName?: string;
  content?: string;
  index?: number;
}

/**
 * Improved style naming algorithm
 *
 * @param nodeName - Node name from Figma
 * @param nodeType - Node type (Text, Frame, etc.)
 * @param context - Additional context for improving name
 * @returns Semantic style name in camelCase
 */
export function generateSmartStyleName(
  nodeName: string,
  nodeType: string,
  context?: NamingContext
): string {
  // 1. Handle time formats (19:41, 18:00)
  if (/^\d{1,2}:\d{2}$/.test(nodeName)) {
    return context?.parentName ? `${toCamelCase(context.parentName)}Time` : 'timeText';
  }

  // 2. Handle prices (5000 ₽, 15 000 ₽)
  if (/^\d+\s*000?\s*₽/.test(nodeName) || /^\d+\s*₽/.test(nodeName)) {
    return 'priceText';
  }

  // 3. Handle numbers (+3, 75/200, 4.6, (254))
  if (/^[\d+\/.()]+$/.test(nodeName)) {
    if (context?.parentName?.toLowerCase().includes('badge')) return 'badgeCount';
    if (context?.parentName?.toLowerCase().includes('karma')) return 'karmaScore';
    if (context?.parentName?.toLowerCase().includes('rating')) return 'ratingValue';
    return 'numberText';
  }

  // 4. Handle generic framework names
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

  // 5. Default: clean camelCase with numeric prefix handling
  return toCamelCase(nodeName);
}

/**
 * Converts string to camelCase, handles Cyrillic and Latin
 *
 * @param str - Source string
 * @returns String in camelCase format
 */
export function toCamelCase(str: string): string {
  let result = str
    .replace(/[^a-zA-Zа-яА-Я0-9]+(.)/g, (_, chr) => chr.toUpperCase())
    .replace(/^[A-Z]/, (chr) => chr.toLowerCase())
    .replace(/[^a-zA-Zа-яА-Я0-9]/g, '');

  // Add underscore prefix if starts with digit
  if (/^\d/.test(result)) {
    result = '_' + result;
  }

  // Fallback if empty string
  if (!result) {
    result = 'element';
  }

  return result;
}

/**
 * Capitalizes first character
 *
 * @param str - Source string
 * @returns String with capitalized first letter
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Checks if name is a numeric value
 *
 * @param name - Name to check
 * @returns true if it's a number, time or price
 */
export function isNumericValue(name: string): boolean {
  return (
    /^\d{1,2}:\d{2}$/.test(name) || // time
    /^\d+\s*000?\s*₽/.test(name) || // price
    /^\d+\s*₽/.test(name) || // price
    /^[\d+\/.()]+$/.test(name) // numbers
  );
}

/**
 * Checks if name is generic
 *
 * @param name - Name to check
 * @returns true if it's a generic name
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
