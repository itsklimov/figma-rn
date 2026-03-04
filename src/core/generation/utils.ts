/**
 * Shared utilities for the generation layer
 */

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a', А: 'A',
  б: 'b', Б: 'B',
  в: 'v', В: 'V',
  г: 'g', Г: 'G',
  д: 'd', Д: 'D',
  е: 'e', Е: 'E',
  ё: 'yo', Ё: 'Yo',
  ж: 'zh', Ж: 'Zh',
  з: 'z', З: 'Z',
  и: 'i', И: 'I',
  й: 'y', Й: 'Y',
  к: 'k', К: 'K',
  л: 'l', Л: 'L',
  м: 'm', М: 'M',
  н: 'n', Н: 'N',
  о: 'o', О: 'O',
  п: 'p', П: 'P',
  р: 'r', Р: 'R',
  с: 's', С: 'S',
  т: 't', Т: 'T',
  у: 'u', У: 'U',
  ф: 'f', Ф: 'F',
  х: 'kh', Х: 'Kh',
  ц: 'ts', Ц: 'Ts',
  ч: 'ch', Ч: 'Ch',
  ш: 'sh', Ш: 'Sh',
  щ: 'shch', Щ: 'Shch',
  ъ: '', Ъ: '',
  ы: 'y', Ы: 'Y',
  ь: '', Ь: '',
  э: 'e', Э: 'E',
  ю: 'yu', Ю: 'Yu',
  я: 'ya', Я: 'Ya',
};

function transliterateToAscii(input: string): string {
  return input
    .split('')
    .map((char) => CYRILLIC_TO_LATIN[char] ?? char)
    .join('')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Convert name to valid JS identifier, preserving camelCase
 *
 * @example
 * toValidIdentifier('productCard') // => 'productCard'
 * toValidIdentifier('Product Card') // => 'productCard'
 * toValidIdentifier('123-item') // => 'style123Item'
 * toValidIdentifier('') // => 'element'
 */
export function toValidIdentifier(name: string): string {
  const transliterated = transliterateToAscii(name);

  // Split into words, handling spaces AND camelCase transitions
  // e.g. "productCard" -> "product Card" -> ["product", "Card"]
  // e.g. "Product Card" -> "Product Card" -> ["Product", "Card"]
  const words = transliterated
    .replace(/([a-z])([A-Z])/g, '$1 $2') // Split camelCase
    .replace(/[^a-zA-Z0-9]/g, ' ')       // Replace special chars with space
    .split(/\s+/)
    .filter(w => w.length > 0);

  if (words.length === 0) {
    return 'element';
  }

  const camelCase = words
    .map((word, index) => {
      // First word lowercase, others title case
      if (index === 0) {
        return word.toLowerCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join('');

  // If starts with digit, add prefix
  if (/^\d/.test(camelCase)) {
    return 'style' + camelCase;
  }

  return camelCase;
}

/**
 * Escape text content for JSX output
 * Handles backslashes, quotes, newlines, and JSX special chars
 */
export function escapeJSXText(text: string): string {
  return text
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '{"\\n"}');
}

/**
 * Sanitize filename for filesystem compatibility
 * Converts to lowercase with dashes
 * Includes path traversal and hidden file protection
 *
 * @example
 * sanitizeFilename('My Icon') // => 'my-icon'
 * sanitizeFilename('User--Profile__Card') // => 'user-profile-card'
 * sanitizeFilename('../etc/passwd') // => 'etc-passwd'
 * sanitizeFilename('.hidden') // => 'hidden'
 */
export function sanitizeFilename(name: string): string {
  const transliterated = transliterateToAscii(name);

  return transliterated
    .toLowerCase()
    .replace(/\.\./g, '')      // Remove .. sequences
    .replace(/^\.+/, '')       // Remove leading dots (hidden files)
    .replace(/^\/+/, '')       // Remove leading slashes (absolute paths)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

/**
 * Sanitize component name to PascalCase
 *
 * @example
 * sanitizeComponentName('home screen') // => 'HomeScreen'
 * sanitizeComponentName('user-profile_card') // => 'UserProfileCard'
 * sanitizeComponentName('123-invalid') // => 'Component123Invalid'
 */
export function sanitizeComponentName(figmaName: string): string {
  const transliterated = transliterateToAscii(figmaName);
  const cleaned = transliterated
    .replace(/[^a-zA-Z0-9\s\-_]/g, ' ')
    .trim();
  
  // Split by spaces, hyphens, underscores OR camelCase transitions
  const words = cleaned
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[\s\-_]+/)
    .filter(Boolean);
    
  const pascalCase = words
    .map(word => {
      // Preserve all-caps tokens and numeric-uppercase tokens (e.g., E2E, 868A)
      if (/^[A-Z0-9]+$/.test(word)) {
        return word;
      }
      // Keep existing inner casing for mixed-case tokens, only uppercase the first char
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join('');
  if (!/^[a-zA-Z]/.test(pascalCase)) {
    return 'Component' + pascalCase;
  }
  return pascalCase || 'Component';
}

/**
 * Valid PascalCase converter (alias for component names)
 */
export const toPascalCase = sanitizeComponentName;

/**
 * Format number as strict integer
 * Used for macroscopic layout properties (width, height, gap, fontSize)
 */
export function formatInteger(value: number): string {
  return String(Math.round(value));
}

/**
 * Format number with smart rounding
 * - Removes noise (e.g. 30.00001 -> 30)
 * - Preserves precision for small values (e.g. 0.5)
 * - Limits decimals for irregular values (e.g. 37.406 -> 37.41)
 * Used for microscopic details (borders, shadows, radii)
 */
export function formatSmart(value: number): string {
  // If extremely close to integer, snap to it
  if (Math.abs(value - Math.round(value)) < 0.01) {
    return String(Math.round(value));
  }
  
  // If small (likely deliberate fractional), keep up to 2 decimals
  // Or if it's a deliberate non-integer value
  return parseFloat(value.toFixed(2)).toString();
}

/**
 * Format number as float with precision
 * Used for naturally fractional properties (opacity)
 */
export function formatFloat(value: number, precision: number = 2): string {
  return parseFloat(value.toFixed(precision)).toString();
}

/**
 * Format a percentage value (0-100 scale) as a percentage string
 * Rounds to 2 decimal places, removes trailing zeros
 * Used for SCALE constraints in constraint-mapper
 */
export function formatPercent(value: number): string {
  const rounded = parseFloat(value.toFixed(2));
  return `${rounded}%`;
}
