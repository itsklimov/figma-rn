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
