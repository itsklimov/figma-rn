import { readFile } from 'fs/promises';
import { pathToFileURL } from 'url';
import { pathComplexity } from '../utils/path-utils.js';

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
  return typeof value === 'string' && /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(value);
}

/**
 * Determine category from property path and value
 *
 * Returns null for ambiguous values (e.g., numbers without clear path indicators).
 * This is intentional - better to skip ambiguous values than misclassify them.
 */
function detectCategory(path: string, value: unknown): string | null {
  const lowerPath = path.toLowerCase();

  // 1. Color detection (Hex strings)
  if (isHexColor(value)) return 'colors';

  // 2. Numeric tokens (Spacing, Radii)
  if (typeof value === 'number') {
    if (lowerPath.includes('spacing') || lowerPath.includes('gap') ||
        lowerPath.includes('margin') || lowerPath.includes('padding') ||
        lowerPath.includes('inset')) {
      return 'spacing';
    }
    if (lowerPath.includes('radius') || lowerPath.includes('radii') || lowerPath.includes('corner')) {
      return 'radii';
    }
    return null;
  }

  // 3. Complex tokens (Shadows, Typography)
  if (typeof value === 'object' && value !== null) {
    const v = value as Record<string, unknown>;
    
    // Typography detection
    if (
      ('fontSize' in v || 'fontFamily' in v || 'lineHeight' in v) &&
      (typeof v.fontSize === 'number' || typeof v.fontFamily === 'string')
    ) {
      return 'typography';
    }

    // Shadow detection: has offsetX/offsetY or x/y with blur
    if (
      (('offsetX' in v || 'x' in v) && ('offsetY' in v || 'y' in v)) ||
      ('blur' in v || 'radius' in v && 'color' in v)
    ) {
      if (lowerPath.includes('shadow') || lowerPath.includes('elevation')) {
        return 'shadows';
      }
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

  // Check if this object itself is a token (like a shadow or typography)
  const category = detectCategory(path, obj);
  if (category === 'shadows') {
    if (!tokens.shadows) tokens.shadows = new Map();
    // Use deterministic key for shadows (sorted properties)
    const v = obj as Record<string, unknown>;
    const shadowKey = `${v.offsetX ?? v.x ?? 0},${v.offsetY ?? v.y ?? 0},${v.blur ?? v.radius ?? 0},${v.spread ?? 0}`;
    tokens.shadows.set(shadowKey, path);
    return;
  }

  if (category === 'typography') {
    if (!tokens.typography) tokens.typography = new Map();
    // Use serialized key for typography: fontFamily-fontSize-fontWeight-lineHeight
    const v = obj as Record<string, any>;
    const typoKey = `${v.fontFamily || ''}-${v.fontSize || 0}-${v.fontWeight || 0}-${v.lineHeight || 0}`;
    tokens.typography.set(typoKey, path);
    return;
  }

  // Recurse into object properties
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    // Use bracket notation for keys that aren't valid JS identifiers
    const isValidIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key);
    const newPath = path 
      ? (isValidIdentifier ? `${path}.${key}` : `${path}['${key}']`)
      : key;
    walkObject(value, newPath, tokens);
  }
}

/**
 * Simplify token path by normalizing prefixes
 * - "tokens.color.primary" → "theme.color.primary" (normalize to theme.)
 * - "theme.spacing.md" → "theme.spacing.md" (keep as-is)
 *
 * All paths should start with "theme." for unified access via useTheme hook
 */
function simplifyPath(path: string): string {
  // Normalize 'tokens.' to 'theme.' for consistent access
  let clean = path.replace(/^tokens\./, 'theme.');
  if (!clean.startsWith('theme.')) {
    clean = `theme.${clean}`;
  }

  // Remove common intermediary containers for cleaner access
  // e.g., theme.masterPalette.purple.purple10 -> theme.purple.purple10
  // e.g., theme.tokens.spacing.md -> theme.spacing.md
  clean = clean.replace(/\.(masterPalette|clientPalette|masterColors|clientColors|designTokens|tokens|palette|theme|colorsTheme)\./gi, '.');

  return clean;
}

/**
 * Extract project tokens from theme file using AST parsing (ts-morph)
 */
export async function extractProjectTokens(themePath: string): Promise<ProjectTokens> {
  const { parseThemeFile } = await import('../../theme-parser.js');
  const themeTokens = await parseThemeFile(themePath);
  
  const tokens: ProjectTokens = {
    colors: new Map(),
    typography: new Map(),
    spacing: new Map(),
    radii: new Map(),
    shadows: new Map(),
  };

  // 1. Convert colors
  for (const [val, token] of themeTokens.colors.entries()) {
    tokens.colors.set(val, simplifyPath(token.path));
  }

  // 2. Convert typography - create keys based on path variant (.regular/.bold)
  // This prevents collision when multiple tokens share same fontSize+lineHeight
  if (themeTokens.typography) {
    for (const [path, token] of themeTokens.typography.entries()) {
      const fontSize = token.fontSize || 0;
      const lineHeight = token.lineHeight || 0;
      const explicitWeight = token.fontWeight;
      const simplePath = simplifyPath(path);
      const pathLower = simplePath.toLowerCase();

      // Detect variant from path suffix
      const isBoldPath = pathLower.endsWith('.bold') || pathLower.endsWith('.semibold');
      const isRegularPath = pathLower.endsWith('.regular') || pathLower.endsWith('.medium');

      // Any is needed because we extended TypographyStyleToken with variant fields
      const tokenAny = token as any;
      const fontFamilyRegular = tokenAny.fontFamilyRegular || token.fontFamily || '';
      const fontFamilyBold = tokenAny.fontFamilyBold || token.fontFamily || '';

      if (isBoldPath) {
        // Bold variant: only create 600, 700 weight keys
        tokens.typography.set(`*-${fontSize}-600-${lineHeight}`, simplePath);
        tokens.typography.set(`*-${fontSize}-700-${lineHeight}`, simplePath);
        if (fontFamilyBold) {
          tokens.typography.set(`${fontFamilyBold}-${fontSize}-600-${lineHeight}`, simplePath);
          tokens.typography.set(`${fontFamilyBold}-${fontSize}-700-${lineHeight}`, simplePath);
        }
      } else if (isRegularPath) {
        // Regular variant: only create 400, 500 weight keys
        tokens.typography.set(`*-${fontSize}-400-${lineHeight}`, simplePath);
        tokens.typography.set(`*-${fontSize}-500-${lineHeight}`, simplePath);
        if (fontFamilyRegular) {
          tokens.typography.set(`${fontFamilyRegular}-${fontSize}-400-${lineHeight}`, simplePath);
          tokens.typography.set(`${fontFamilyRegular}-${fontSize}-500-${lineHeight}`, simplePath);
        }
      } else {
        // Unknown variant - use explicit fontWeight or infer from fontFamily name
        let inferredWeight = explicitWeight || 400;
        if (!explicitWeight && token.fontFamily) {
          const familyLower = token.fontFamily.toLowerCase();
          if (familyLower.includes('bold')) inferredWeight = 700;
          else if (familyLower.includes('semibold')) inferredWeight = 600;
          else if (familyLower.includes('medium')) inferredWeight = 500;
        }

        // Create key for inferred weight
        tokens.typography.set(`*-${fontSize}-${inferredWeight}-${lineHeight}`, simplePath);
        if (token.fontFamily) {
          tokens.typography.set(`${token.fontFamily}-${fontSize}-${inferredWeight}-${lineHeight}`, simplePath);
        }

        // Also create adjacent weight for flexibility (±100)
        const adjacentWeight = inferredWeight >= 600 ? inferredWeight - 100 : inferredWeight + 100;
        tokens.typography.set(`*-${fontSize}-${adjacentWeight}-${lineHeight}`, simplePath);
      }
    }
  }

  // 3. Convert spacing - prefer simpler paths when same value exists
  if (themeTokens.spacing) {
    for (const [path, val] of themeTokens.spacing.entries()) {
      const newPath = simplifyPath(path);
      const existingPath = tokens.spacing.get(val);
      if (!existingPath || pathComplexity(newPath) < pathComplexity(existingPath)) {
        tokens.spacing.set(val, newPath);
      }
    }
  }

  // 4. Convert radii - prefer simpler paths when same value exists
  if (themeTokens.radii) {
    for (const [path, val] of themeTokens.radii.entries()) {
      const newPath = simplifyPath(path);
      const existingPath = tokens.radii.get(val);
      if (!existingPath || pathComplexity(newPath) < pathComplexity(existingPath)) {
        tokens.radii.set(val, newPath);
      }
    }
  }

  // 5. Convert shadows - prefer simpler paths when same shadow key exists
  if (themeTokens.shadows) {
    for (const [path, v] of themeTokens.shadows.entries()) {
      const shadowKey = `${v.offsetX ?? v.x ?? 0},${v.offsetY ?? v.y ?? 0},${v.blur ?? v.radius ?? 0},${v.spread ?? 0}`;
      const newPath = simplifyPath(path);
      const existingPath = tokens.shadows.get(shadowKey);
      if (!existingPath || pathComplexity(newPath) < pathComplexity(existingPath)) {
        tokens.shadows.set(shadowKey, newPath);
      }
    }
  }

  return tokens;
}


/**
 * Merge multiple project tokens into one
 * Useful when tokens are split across multiple files (colors.ts, typography.ts, etc.)
 *
 * When the same value exists with different paths, prefers simpler/flatter paths.
 * This ensures flat API paths win over nested ones when both are available.
 */
export function mergeProjectTokens(tokenSets: ProjectTokens[]): ProjectTokens {
  const merged: ProjectTokens = {};

  for (const set of tokenSets) {
    for (const [category, values] of Object.entries(set)) {
      if (!merged[category]) {
        merged[category] = new Map();
      }
      for (const [val, newPath] of values.entries()) {
        const existingPath = merged[category].get(val);

        // If value doesn't exist, add it
        // If value exists, prefer the simpler path
        if (!existingPath || pathComplexity(newPath) < pathComplexity(existingPath)) {
          merged[category].set(val, newPath);
        }
      }
    }
  }

  return merged;
}
