/**
 * Theme parser AST resolver surface.
 * Canonical AST traversal currently lives in theme-parser/internal.
 */

export { parseThemeFile as resolveThemeTokensFromAst } from './internal.js';
