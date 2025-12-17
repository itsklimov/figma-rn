/**
 * Style Name Normalizer - style name normalization
 * Converts any names (including Cyrillic) to English camelCase
 */

/**
 * Cyrillic transliteration table
 * Cyrillic transliteration table
 */
const CYRILLIC_TO_LATIN: Record<string, string> = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
  'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
  'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
  'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
  'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
  // Uppercase
  'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo',
  'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M',
  'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U',
  'Ф': 'F', 'Х': 'H', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Sch',
  'Ъ': '', 'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya'
};

/**
 * Transliterates string from Cyrillic to Latin
 * Transliterates string from Cyrillic to Latin
 */
export function transliterate(text: string): string {
  return text.split('').map(char => CYRILLIC_TO_LATIN[char] ?? char).join('');
}

/**
 * Converts string to camelCase
 * Converts string to camelCase
 */
export function toCamelCase(text: string): string {
  // Remove special characters, split by spaces/separators
  const words = text
    .replace(/[^a-zA-Z0-9\s_-]/g, '')
    .split(/[\s_-]+/)
    .filter(word => word.length > 0);

  if (words.length === 0) return 'unnamed';

  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index === 0) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');
}

/**
 * Normalizes style name: transliteration + camelCase
 * Normalizes style name: transliteration + camelCase
 *
 * @example
 * normalizeStyleName("Payment Pending") // => "paymentPending"
 * normalizeStyleName("Button Main") // => "buttonMain"
 * normalizeStyleName("_StatusBar-time") // => "statusBarTime"
 * normalizeStyleName("2") // => "style2" (prefixed to avoid invalid JS)
 */
export function normalizeStyleName(name: string): string {
  // 1. Transliterate non-ASCII
  const transliterated = transliterate(name);

  // 2. Convert to camelCase
  let result = toCamelCase(transliterated);

  // 3. If starts with digit, add "style" prefix (JS property names can't start with numbers)
  if (/^\d/.test(result)) {
    result = 'style' + result;
  }

  return result;
}

/**
 * Normalizes style object, replacing all keys
 * Normalizes style object, replacing all keys
 */
export function normalizeStyleObject(styles: Record<string, any>): Record<string, any> {
  const normalized: Record<string, any> = {};

  for (const [key, value] of Object.entries(styles)) {
    const normalizedKey = normalizeStyleName(key);
    normalized[normalizedKey] = value;
  }

  return normalized;
}
