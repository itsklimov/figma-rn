/**
 * Shared utilities for the generation layer
 */

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
  // Remove invalid characters but preserve case
  let result = name.replace(/[^a-zA-Z0-9_]/g, '');

  // If starts with digit, add prefix
  if (/^\d/.test(result)) {
    result = 'style' + result;
  }

  // If empty, use fallback
  if (!result) {
    result = 'element';
  }

  // Ensure first char is lowercase (camelCase convention)
  return result.charAt(0).toLowerCase() + result.slice(1);
}

/**
 * Escape text content for JSX output
 * Handles backslashes, quotes, newlines, and JSX special chars
 */
export function escapeJSXText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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
  return name
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
  const cleaned = figmaName
    .replace(/[^\w\s-]/g, '')
    .trim();
  const words = cleaned.split(/[\s\-_]+/);
  const pascalCase = words
    .map(word => {
      if (!word) return '';
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join('');
  if (!/^[a-zA-Z]/.test(pascalCase)) {
    return 'Component' + pascalCase;
  }
  return pascalCase || 'Component';
}
