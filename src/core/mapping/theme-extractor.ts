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

  // 2. Convert typography - create keys for ALL font weight variants
  if (themeTokens.typography) {
    for (const [path, token] of themeTokens.typography.entries()) {
       const fontSize = token.fontSize || 0;
      const lineHeight = token.lineHeight || 0;
      const explicitWeight = token.fontWeight; // Capture explicit weight if present
      // Any is needed because we extended TypographyStyleToken with variant fields
      const tokenAny = token as any;
      
      // Get font family variants if available
      const fontFamilyRegular = tokenAny.fontFamilyRegular || token.fontFamily || '';
      const fontFamilyBold = tokenAny.fontFamilyBold || token.fontFamily || '';
      
      // Create key for regular weight (400)
      // Match by fontSize primarily (font families differ between Figma and theme)
      const regularKey = `*-${fontSize}-400-${lineHeight}`;
      const simplePath = simplifyPath(path);
      tokens.typography.set(regularKey, simplePath);
      
      // Also create with explicit fontFamily for exact match
      if (fontFamilyRegular) {
        const regularKeyWithFamily = `${fontFamilyRegular}-${fontSize}-400-${lineHeight}`;
        tokens.typography.set(regularKeyWithFamily, simplePath);
      }
      
      // Create key for bold weight (600)
      const boldKey = `*-${fontSize}-600-${lineHeight}`;
      tokens.typography.set(boldKey, simplePath);
      
      // Also create with explicit fontFamily for exact match
      if (fontFamilyBold) {
        const boldKeyWithFamily = `${fontFamilyBold}-${fontSize}-600-${lineHeight}`;
        tokens.typography.set(boldKeyWithFamily, simplePath);
      }
      
      // Create key for weight 500 (maps to regular) and 700 (maps to bold)
      tokens.typography.set(`*-${fontSize}-500-${lineHeight}`, simplePath);
      tokens.typography.set(`*-${fontSize}-700-${lineHeight}`, simplePath);

      // Handle explicit weight if present (e.g. 700, 300, etc.)
      if (explicitWeight) {
         tokens.typography.set(`*-${fontSize}-${explicitWeight}-${lineHeight}`, simplePath);
         if (token.fontFamily) {
            tokens.typography.set(`${token.fontFamily}-${fontSize}-${explicitWeight}-${lineHeight}`, simplePath);
         }
      }
    }
  }

  // 3. Convert spacing
  if (themeTokens.spacing) {
    for (const [path, val] of themeTokens.spacing.entries()) {
      tokens.spacing.set(val, simplifyPath(path));
    }
  }

  // 4. Convert radii
  if (themeTokens.radii) {
    for (const [path, val] of themeTokens.radii.entries()) {
      tokens.radii.set(val, simplifyPath(path));
    }
  }

  // 5. Convert shadows
  if (themeTokens.shadows) {
    for (const [path, v] of themeTokens.shadows.entries()) {
      const shadowKey = `${v.offsetX ?? v.x ?? 0},${v.offsetY ?? v.y ?? 0},${v.blur ?? v.radius ?? 0},${v.spread ?? 0}`;
      tokens.shadows.set(shadowKey, simplifyPath(path));
    }
  }

  return tokens;
}

/**
 * Merge multiple project tokens into one
 * Useful when tokens are split across multiple files (colors.ts, typography.ts, etc.)
 */
export function mergeProjectTokens(tokenSets: ProjectTokens[]): ProjectTokens {
  const merged: ProjectTokens = {};

  for (const set of tokenSets) {
    for (const [category, values] of Object.entries(set)) {
      if (!merged[category]) {
        merged[category] = new Map();
      }
      for (const [val, path] of values.entries()) {
        merged[category].set(val, path);
      }
    }
  }

  return merged;
}
