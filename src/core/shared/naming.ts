/**
 * Cross-layer naming utilities.
 */

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ы: 'y',
  э: 'e',
  ю: 'yu',
  я: 'ya',
  ъ: '',
  ь: '',
};

function transliterateToAscii(value: string): string {
  return Array.from(value.normalize('NFKD'))
    .map((char) => {
      if (/[\u0300-\u036f]/.test(char)) {
        return '';
      }

      const mapped = CYRILLIC_TO_LATIN[char.toLowerCase()];
      if (!mapped) {
        return char;
      }

      const isUppercase = char !== char.toLowerCase();
      if (!isUppercase || mapped.length === 0) {
        return mapped;
      }

      return mapped.charAt(0).toUpperCase() + mapped.slice(1);
    })
    .join('');
}

/**
 * Convert name to valid JS identifier, preserving camelCase.
 */
export function toValidIdentifier(name: string): string {
  const words = transliterateToAscii(name)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);

  if (words.length === 0) {
    return 'element';
  }

  const camelCase = words
    .map((word, index) => {
      if (index === 0) {
        return word.toLowerCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join('');

  if (/^\d/.test(camelCase)) {
    return 'style' + camelCase;
  }

  return camelCase;
}

/**
 * Sanitize filename for filesystem compatibility.
 */
export function sanitizeFilename(name: string): string {
  return transliterateToAscii(name)
    .toLowerCase()
    .replace(/\.\./g, '')
    .replace(/^\.+/, '')
    .replace(/^\/+/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

/**
 * Sanitize component name to PascalCase.
 */
export function sanitizeComponentName(figmaName: string): string {
  const cleaned = transliterateToAscii(figmaName).replace(/[^\w\s-]/g, '').trim();

  const words = cleaned
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[\s\-_]+/);

  const pascalCase = words
    .map((word) => {
      if (!word) return '';
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join('');

  if (!/^[a-zA-Z]/.test(pascalCase)) {
    return 'Component' + pascalCase;
  }

  return pascalCase || 'Component';
}

/**
 * Valid PascalCase converter (alias for component names).
 */
export const toPascalCase = sanitizeComponentName;
