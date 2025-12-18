import { readFile } from 'fs/promises';
import { pathToFileURL } from 'url';

/**
 * Project tokens extracted from theme file
 * Key: token category (colors, spacing, radii, shadows, etc.)
 * Value: Map of value → theme path
 */
export interface ProjectTokens {
  [category: string]: Map<string | number, string>;
}

/**
 * Check if string is a hex color
 */
function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/.test(value);
}

/**
 * Determine category from property path and value
 *
 * Returns null for ambiguous values (e.g., numbers without clear path indicators).
 * This is intentional - better to skip ambiguous values than misclassify them.
 */
function detectCategory(path: string, value: unknown): string | null {
  const lowerPath = path.toLowerCase();

  if (isHexColor(value)) return 'colors';

  if (typeof value === 'number') {
    if (lowerPath.includes('spacing') || lowerPath.includes('gap') ||
        lowerPath.includes('margin') || lowerPath.includes('padding')) {
      return 'spacing';
    }
    if (lowerPath.includes('radius') || lowerPath.includes('radii')) {
      return 'radii';
    }
    // Skip ambiguous numeric values - let user configure explicit mappings
    return null;
  }

  if (typeof value === 'object' && value !== null) {
    // Shadow detection: has offsetX/offsetY or x/y with blur
    const v = value as Record<string, unknown>;
    if (('offsetX' in v || 'x' in v) && ('blur' in v || 'radius' in v)) {
      return 'shadows';
    }
  }

  return null;
}

/**
 * Recursively walk object and extract tokens
 */
function walkObject(
  obj: unknown,
  path: string,
  tokens: ProjectTokens
): void {
  if (obj === null || obj === undefined) return;

  if (typeof obj !== 'object') {
    // Leaf value - try to categorize
    const category = detectCategory(path, obj);
    if (category) {
      if (!tokens[category]) {
        tokens[category] = new Map();
      }
      tokens[category].set(obj as string | number, path);
    }
    return;
  }

  // Check if this object itself is a token (like a shadow)
  const category = detectCategory(path, obj);
  if (category === 'shadows') {
    if (!tokens.shadows) tokens.shadows = new Map();
    // Use deterministic key for shadows (sorted properties)
    const v = obj as Record<string, unknown>;
    const shadowKey = `${v.offsetX ?? v.x ?? 0},${v.offsetY ?? v.y ?? 0},${v.blur ?? v.radius ?? 0},${v.spread ?? 0}`;
    tokens.shadows.set(shadowKey, path);
    return;
  }

  // Recurse into object properties
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const newPath = path ? `${path}.${key}` : key;
    walkObject(value, newPath, tokens);
  }
}

/**
 * Extract project tokens from theme file
 * Supports .ts, .js, .json files
 */
export async function extractProjectTokens(themePath: string): Promise<ProjectTokens> {
  const tokens: ProjectTokens = {};
  let themeObject: unknown;

  if (themePath.endsWith('.json')) {
    const content = await readFile(themePath, 'utf-8');
    themeObject = JSON.parse(content);
  } else {
    // Use dynamic import for .ts/.js files
    const fileUrl = pathToFileURL(themePath).href;
    const module = await import(fileUrl);
    // Try default export first, then named exports
    themeObject = module.default || module.theme || module.colors || module;
  }

  // Walk the theme object and extract tokens
  walkObject(themeObject, 'theme', tokens);

  return tokens;
}
