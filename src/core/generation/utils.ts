/**
 * Generation-layer utility surface.
 * Cross-layer helpers live in core/shared and are re-exported for compatibility.
 */

export {
  toValidIdentifier,
  sanitizeFilename,
  sanitizeComponentName,
  toPascalCase,
} from '../shared/naming.js';

export {
  formatInteger,
  formatSmart,
  formatFloat,
  formatPercent,
} from '../shared/number-format.js';

/**
 * Escape text content for JSX output.
 * Handles braces, tags, and newlines.
 */
export function escapeJSXText(text: string): string {
  return text
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '{"\\n"}');
}
