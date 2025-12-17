/**
 * Automatic Figma colors to project theme mapping
 * Automatic Figma colors to project theme mapping
 */

import { parseThemeFile } from './theme-parser.js';
import { findClosestThemeColor } from './color-matcher.js';
import { ProjectConfig } from './config-schema.js';

/**
 * Automatically creates Figma colors → project theme mapping
 * Automatically creates Figma colors → project theme mapping
 *
 * @param figmaColors - Array of hex colors from Figma
 * @param config - Project configuration
 * @returns Mapping hex → path to theme token
 */
export async function autoGenerateColorMappings(
  figmaColors: string[],
  config: ProjectConfig
): Promise<Record<string, string>> {
  if (!config.theme?.location) return {};

  try {
    // Path should already be absolute (passed from index.ts)
    // Path should already be absolute (passed from index.ts)
    const themePath = config.theme.location;

    console.error(`[DEBUG] Theme path: ${themePath}`);

    const tokens = await parseThemeFile(themePath, 'palette');
    console.error(`[DEBUG] Theme tokens parsed. Colors found: ${tokens.colors.size}`);

    const mappings: Record<string, string> = {};

    console.error(`[DEBUG] Attempting to match ${figmaColors.length} Figma colors...`);

    for (const figmaHex of figmaColors) {
      const match = findClosestThemeColor(figmaHex, tokens.colors, 0.85);
      if (match && match.confidence > 0.85) {
        // High confidence - use theme token
        // High confidence - use theme token
        mappings[figmaHex] = match.token.path;
        console.error(`[DEBUG] ✅ Matched ${figmaHex} → ${match.token.path} (${(match.confidence * 100).toFixed(1)}%)`);
      } else if (match) {
        console.error(`[DEBUG] ⚠️ Low confidence for ${figmaHex} → ${match.token.path} (${(match.confidence * 100).toFixed(1)}%)`);
      } else {
        console.error(`[DEBUG] ❌ No match for ${figmaHex}`);
      }
      // Low confidence - keep as hex
      // Low confidence - keep as hex
    }

    console.error(`[DEBUG] Generated ${Object.keys(mappings).length} color mappings`);

    return mappings;
  } catch (error) {
    console.error('Error auto-generating color mappings:', error);
    return {};
  }
}

/**
 * Extracts all unique colors from Figma metadata
 * Extracts all unique colors from Figma metadata
 *
 * @param metadata - Figma node metadata
 * @returns Array of unique hex colors
 */
export function extractFigmaColors(metadata: any): string[] {
  const colors = new Set<string>();

  function traverse(node: any) {
    // Extract from fills
    // Extract from fills
    if (node.fills && Array.isArray(node.fills)) {
      node.fills.forEach((fill: any) => {
        if (fill.type === 'SOLID' && fill.color) {
          const hex = rgbToHex(fill.color);
          colors.add(hex);
        }
      });
    }

    // Extract from backgroundColor
    // Extract from backgroundColor
    if (node.backgroundColor) {
      const hex = rgbToHex(node.backgroundColor);
      colors.add(hex);
    }

    // Recursively process children
    // Recursively process children
    if (node.children && Array.isArray(node.children)) {
      node.children.forEach(traverse);
    }
  }

  traverse(metadata);
  return Array.from(colors);
}

/**
 * Converts Figma RGB to hex
 * Converts Figma RGB to hex
 *
 * @param rgb - Figma color object (r, g, b in range 0-1)
 * @returns Hex string (e.g., '#7A54FF')
 */
function rgbToHex(rgb: { r: number; g: number; b: number }): string {
  const r = Math.round(rgb.r * 255);
  const g = Math.round(rgb.g * 255);
  const b = Math.round(rgb.b * 255);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
}

/**
 * Interface for typography token from theme
 * Interface for typography token from theme
 */
interface ThemeTypographyToken {
  path: string;
  fontSize: number;
  fontWeight: number;
  lineHeight?: number;
  fontFamily?: string;
}

/**
 * Automatically creates Figma typography → project theme mapping
 * Automatically creates Figma typography → project theme mapping
 *
 * @param figmaTypography - Array of typography styles from Figma
 * @param themePath - Path to typography file
 * @returns Mapping figmaKey → path to theme token
 */
export async function autoGenerateTypographyMappings(
  figmaTypography: Array<{ key: string; fontSize: number; fontWeight: number; lineHeight?: number }>,
  themePath: string
): Promise<Record<string, string>> {
  try {
    const tokens = await parseThemeFile(themePath, 'typography');
    const mappings: Record<string, string> = {};

    console.error(`[DEBUG] Parsing typography from: ${themePath}`);
    // Use typography tokens (complete styles) instead of fonts
    // Use typography tokens (complete styles) instead of fonts
    console.error(`[DEBUG] Found ${tokens.typography?.size || 0} typography tokens`);

    for (const figmaStyle of figmaTypography) {
      // Find closest typography token by size and weight
      // Find closest typography token by size and weight
      const match = findClosestTypographyToken(
        figmaStyle.fontSize,
        figmaStyle.fontWeight,
        tokens.typography || new Map()
      );

      if (match && match.confidence > 0.8) {
        mappings[figmaStyle.key] = match.token.path;
        console.error(`[DEBUG] ✅ Matched ${figmaStyle.key} → ${match.token.path} (${(match.confidence * 100).toFixed(1)}%)`);
      } else if (match) {
        console.error(`[DEBUG] ⚠️ Low confidence for ${figmaStyle.key} → ${match.token.path} (${(match.confidence * 100).toFixed(1)}%)`);
      } else {
        console.error(`[DEBUG] ❌ No match for ${figmaStyle.key}`);
      }
    }

    return mappings;
  } catch (error) {
    console.error('Error auto-generating typography mappings:', error);
    return {};
  }
}

/**
 * Finds closest typography token by size and weight
 * Finds closest typography token by size and weight
 */
function findClosestTypographyToken(
  fontSize: number,
  fontWeight: number,
  tokens: Map<string, any>
): { token: ThemeTypographyToken; confidence: number } | null {
  let bestMatch: { token: ThemeTypographyToken; confidence: number } | null = null;

  for (const [path, value] of tokens) {
    // Extract size and weight from token value
    // Extract size and weight from token value
    const tokenSize = typeof value === 'object' ? (value.fontSize || value.size) : null;
    const tokenWeight = typeof value === 'object' ? (value.fontWeight || value.weight || 400) : 400;

    if (tokenSize === null) continue;

    // Calculate similarity by size and weight
    // Calculate similarity by size and weight
    const sizeDiff = Math.abs(tokenSize - fontSize);
    const weightDiff = Math.abs(tokenWeight - fontWeight);

    // Size within 2px and weight within 100 = good match
    // Size within 2px and weight within 100 = good match
    if (sizeDiff <= 2 && weightDiff <= 100) {
      const confidence = 1 - (sizeDiff / 10) - (weightDiff / 1000);
      if (!bestMatch || confidence > bestMatch.confidence) {
        bestMatch = {
          token: { path, fontSize: tokenSize, fontWeight: tokenWeight },
          confidence
        };
      }
    }
  }

  return bestMatch;
}

/**
 * Interface for spacing token from theme
 * Interface for spacing token from theme
 */
interface ThemeSpacingToken {
  path: string;
  value: number;
}

/**
 * Automatically creates Figma spacing → project theme mapping
 * Automatically creates Figma spacing → project theme mapping
 *
 * @param figmaSpacing - Array of spacing values from Figma
 * @param themePath - Path to theme file
 * @returns Mapping value → path to theme token
 */
export async function autoGenerateSpacingMappings(
  figmaSpacing: number[],
  themePath: string
): Promise<Record<number, string>> {
  try {
    const tokens = await parseThemeFile(themePath, 'spacing');
    const mappings: Record<number, string> = {};

    console.error(`[DEBUG] Parsing spacing from: ${themePath}`);
    console.error(`[DEBUG] Found ${tokens.spacing?.values?.length || 0} spacing values`);

    // Extract spacing tokens from theme
    // Extract spacing tokens from theme
    const spacingTokens = extractSpacingTokens(tokens);
    console.error(`[DEBUG] Extracted ${spacingTokens.length} spacing tokens`);

    for (const figmaValue of figmaSpacing) {
      // Find closest spacing token by value
      // Find closest spacing token by value
      const match = findClosestSpacingToken(figmaValue, spacingTokens);

      if (match && match.confidence > 0.85) {
        mappings[figmaValue] = match.token.path;
        console.error(`[DEBUG] ✅ Matched ${figmaValue} → ${match.token.path} (${(match.confidence * 100).toFixed(1)}%)`);
      } else if (match) {
        console.error(`[DEBUG] ⚠️ Low confidence for ${figmaValue} → ${match.token.path} (${(match.confidence * 100).toFixed(1)}%)`);
      } else {
        console.error(`[DEBUG] ❌ No match for ${figmaValue}`);
      }
    }

    console.error(`[DEBUG] Generated ${Object.keys(mappings).length} spacing mappings`);

    return mappings;
  } catch (error) {
    console.error('Error auto-generating spacing mappings:', error);
    return {};
  }
}

/**
 * Extracts spacing tokens from theme
 * Extracts spacing tokens from theme
 */
function extractSpacingTokens(tokens: any): ThemeSpacingToken[] {
  const spacingTokens: ThemeSpacingToken[] = [];

  // Use extracted spacing values from parseThemeFile
  // Use extracted spacing values from parseThemeFile
  if (tokens.spacing?.values) {
    // These values are already extracted from theme
    // These values are already extracted from theme
    return tokens.spacing.values.map((value: number, index: number) => ({
      path: `theme.spacing[${index}]`,
      value
    }));
  }

  return spacingTokens;
}

/**
 * Finds closest spacing token by value
 * Finds closest spacing token by value
 */
function findClosestSpacingToken(
  value: number,
  tokens: ThemeSpacingToken[]
): { token: ThemeSpacingToken; confidence: number } | null {
  let bestMatch: { token: ThemeSpacingToken; confidence: number } | null = null;

  for (const token of tokens) {
    const diff = Math.abs(token.value - value);

    // Exact match = 100% confidence
    // Exact match = 100% confidence
    if (diff === 0) {
      return { token, confidence: 1.0 };
    }

    // Within 2px = good match
    // Within 2px = good match
    if (diff <= 2) {
      const confidence = 1 - (diff / 10);
      if (!bestMatch || confidence > bestMatch.confidence) {
        bestMatch = { token, confidence };
      }
    }
  }

  return bestMatch;
}

/**
 * Interface for radii token from theme
 * Interface for radii token from theme
 */
interface ThemeRadiiToken {
  path: string;
  value: number;
}

/**
 * Automatically creates Figma radii → project theme mapping
 * Automatically creates Figma radii → project theme mapping
 *
 * @param figmaRadii - Array of corner radius values from Figma
 * @param themePath - Path to theme file
 * @returns Mapping value → path to theme token
 */
export async function autoGenerateRadiiMappings(
  figmaRadii: number[],
  themePath: string
): Promise<Record<number, string>> {
  try {
    const tokens = await parseThemeFile(themePath, 'radii');
    const mappings: Record<number, string> = {};

    console.error(`[DEBUG] Parsing radii from: ${themePath}`);

    // Extract radii tokens from theme
    // Extract radii tokens from theme
    const radiiTokens = extractRadiiTokens(tokens);
    console.error(`[DEBUG] Extracted ${radiiTokens.length} radii tokens`);

    for (const figmaValue of figmaRadii) {
      // Find closest radii token by value
      // Find closest radii token by value
      const match = findClosestRadiiToken(figmaValue, radiiTokens);

      if (match && match.confidence > 0.85) {
        mappings[figmaValue] = match.token.path;
        console.error(`[DEBUG] ✅ Matched ${figmaValue} → ${match.token.path} (${(match.confidence * 100).toFixed(1)}%)`);
      } else if (match) {
        console.error(`[DEBUG] ⚠️ Low confidence for ${figmaValue} → ${match.token.path} (${(match.confidence * 100).toFixed(1)}%)`);
      } else {
        console.error(`[DEBUG] ❌ No match for ${figmaValue}`);
      }
    }

    console.error(`[DEBUG] Generated ${Object.keys(mappings).length} radii mappings`);

    return mappings;
  } catch (error) {
    console.error('Error auto-generating radii mappings:', error);
    return {};
  }
}

/**
 * Extracts radii tokens from theme (looks for border.radius, borderRadius, radii)
 * Extracts radii tokens from theme (looks for border.radius, borderRadius, radii)
 */
function extractRadiiTokens(tokens: any): ThemeRadiiToken[] {
  const radiiTokens: ThemeRadiiToken[] = [];

  // Use extracted radii from parseThemeFile
  // Use extracted radii from parseThemeFile
  if (tokens.radii && tokens.radii instanceof Map) {
    for (const [path, value] of tokens.radii) {
      if (typeof value === 'number') {
        radiiTokens.push({ path, value });
      }
    }
  }

  return radiiTokens;
}

/**
 * Finds closest radii token by value
 * Finds closest radii token by value
 */
function findClosestRadiiToken(
  value: number,
  tokens: ThemeRadiiToken[]
): { token: ThemeRadiiToken; confidence: number } | null {
  let bestMatch: { token: ThemeRadiiToken; confidence: number } | null = null;

  for (const token of tokens) {
    const diff = Math.abs(token.value - value);

    // Exact match = 100% confidence
    // Exact match = 100% confidence
    if (diff === 0) {
      return { token, confidence: 1.0 };
    }

    // Within 2px = good match
    // Within 2px = good match
    if (diff <= 2) {
      const confidence = 1 - (diff / 10);
      if (!bestMatch || confidence > bestMatch.confidence) {
        bestMatch = { token, confidence };
      }
    }
  }

  return bestMatch;
}

/**
 * Interface for shadow token from theme
 * Interface for shadow token from theme
 */
interface ThemeShadowToken {
  path: string;
  offsetX: number;
  offsetY: number;
  blur: number;
  opacity: number;
  color?: string;
}

/**
 * Interface for Figma shadow
 * Interface for Figma shadow
 */
interface FigmaShadow {
  key: string;
  offset: { x: number; y: number };
  radius: number;
  opacity: number;
  color?: string;
}

/**
 * Automatically creates Figma shadows → project theme mapping
 * Automatically creates Figma shadows → project theme mapping
 *
 * @param figmaShadows - Array of shadows from Figma
 * @param themePath - Path to theme file
 * @returns Mapping shadow key → path to theme token
 */
export async function autoGenerateShadowMappings(
  figmaShadows: FigmaShadow[],
  themePath: string
): Promise<Record<string, string>> {
  try {
    const tokens = await parseThemeFile(themePath, 'shadows');
    const mappings: Record<string, string> = {};

    console.error(`[DEBUG] Parsing shadows from: ${themePath}`);

    // Extract shadow tokens from theme
    // Extract shadow tokens from theme
    const shadowTokens = extractShadowTokens(tokens);
    console.error(`[DEBUG] Extracted ${shadowTokens.length} shadow tokens`);

    for (const figmaShadow of figmaShadows) {
      // Find closest shadow token by parameters
      // Find closest shadow token by parameters
      const match = findClosestShadowToken(figmaShadow, shadowTokens);

      if (match && match.confidence > 0.75) {
        mappings[figmaShadow.key] = match.token.path;
        console.error(`[DEBUG] ✅ Matched ${figmaShadow.key} → ${match.token.path} (${(match.confidence * 100).toFixed(1)}%)`);
      } else if (match) {
        console.error(`[DEBUG] ⚠️ Low confidence for ${figmaShadow.key} → ${match.token.path} (${(match.confidence * 100).toFixed(1)}%)`);
      } else {
        console.error(`[DEBUG] ❌ No match for ${figmaShadow.key}`);
      }
    }

    console.error(`[DEBUG] Generated ${Object.keys(mappings).length} shadow mappings`);

    return mappings;
  } catch (error) {
    console.error('Error auto-generating shadow mappings:', error);
    return {};
  }
}

/**
 * Extracts shadow tokens from theme
 * Extracts shadow tokens from theme
 */
function extractShadowTokens(tokens: any): ThemeShadowToken[] {
  const shadowTokens: ThemeShadowToken[] = [];

  // Use extracted shadows from parseThemeFile
  // Use extracted shadows from parseThemeFile
  if (tokens.shadows && tokens.shadows instanceof Map) {
    for (const [path, value] of tokens.shadows) {
      if (typeof value === 'object' && value !== null) {
        const offset = value.shadowOffset || value.offset || { width: 0, height: 0 };
        const opacity = value.shadowOpacity || value.opacity || 0;
        const blur = value.shadowRadius || value.radius || value.blur || 0;
        const color = value.shadowColor || value.color;

        shadowTokens.push({
          path,
          offsetX: offset.width || offset.x || 0,
          offsetY: offset.height || offset.y || 0,
          blur,
          opacity,
          color
        });
      }
    }
  }

  return shadowTokens;
}

/**
 * Finds closest shadow token by parameters
 * Finds closest shadow token by parameters
 */
function findClosestShadowToken(
  shadow: FigmaShadow,
  tokens: ThemeShadowToken[]
): { token: ThemeShadowToken; confidence: number } | null {
  let bestMatch: { token: ThemeShadowToken; confidence: number } | null = null;

  for (const token of tokens) {
    // Calculate similarity for each parameter
    // Calculate similarity for each parameter
    const offsetXDiff = Math.abs(token.offsetX - shadow.offset.x);
    const offsetYDiff = Math.abs(token.offsetY - shadow.offset.y);
    const blurDiff = Math.abs(token.blur - shadow.radius);
    const opacityDiff = Math.abs(token.opacity - shadow.opacity);

    // All parameters within reasonable limits = good match
    // All parameters within reasonable limits = good match
    if (offsetXDiff <= 2 && offsetYDiff <= 2 && blurDiff <= 2 && opacityDiff <= 0.1) {
      // Normalize differences for confidence calculation
      // Normalize differences for confidence calculation
      const offsetScore = 1 - (offsetXDiff + offsetYDiff) / 20;
      const blurScore = 1 - blurDiff / 10;
      const opacityScore = 1 - opacityDiff;

      // Average confidence across all parameters
      // Average confidence across all parameters
      const confidence = (offsetScore + blurScore + opacityScore) / 3;

      if (!bestMatch || confidence > bestMatch.confidence) {
        bestMatch = { token, confidence };
      }
    }
  }

  return bestMatch;
}

/**
 * Extracts all unique spacing values from Figma metadata
 * Extracts all unique spacing values from Figma metadata
 *
 * @param metadata - Figma node metadata
 * @returns Array of unique numeric spacing values
 */
export function extractFigmaSpacing(metadata: any): number[] {
  const spacingValues = new Set<number>();

  function traverse(node: any) {
    // Extract padding
    // Extract padding
    if (node.paddingLeft !== undefined && node.paddingLeft > 0) spacingValues.add(node.paddingLeft);
    if (node.paddingRight !== undefined && node.paddingRight > 0) spacingValues.add(node.paddingRight);
    if (node.paddingTop !== undefined && node.paddingTop > 0) spacingValues.add(node.paddingTop);
    if (node.paddingBottom !== undefined && node.paddingBottom > 0) spacingValues.add(node.paddingBottom);

    // Extract gap
    // Extract gap
    if (node.itemSpacing !== undefined && node.itemSpacing > 0) spacingValues.add(node.itemSpacing);
    if (node.counterAxisSpacing !== undefined && node.counterAxisSpacing > 0) spacingValues.add(node.counterAxisSpacing);

    // Recursively process children
    // Recursively process children
    if (node.children && Array.isArray(node.children)) {
      node.children.forEach(traverse);
    }
  }

  traverse(metadata);
  return Array.from(spacingValues).sort((a, b) => a - b);
}

/**
 * Extracts all unique radii values from Figma metadata
 * Extracts all unique radii values from Figma metadata
 *
 * @param metadata - Figma node metadata
 * @returns Array of unique numeric radii values
 */
export function extractFigmaRadii(metadata: any): number[] {
  const radiiValues = new Set<number>();

  function traverse(node: any) {
    // Extract cornerRadius
    // Extract cornerRadius
    if (node.cornerRadius !== undefined && node.cornerRadius > 0) {
      radiiValues.add(node.cornerRadius);
    }

    // Extract individual radii
    // Extract individual radii
    if (node.rectangleCornerRadii && Array.isArray(node.rectangleCornerRadii)) {
      node.rectangleCornerRadii.forEach((radius: number) => {
        if (radius > 0) radiiValues.add(radius);
      });
    }

    // Recursively process children
    // Recursively process children
    if (node.children && Array.isArray(node.children)) {
      node.children.forEach(traverse);
    }
  }

  traverse(metadata);
  return Array.from(radiiValues).sort((a, b) => a - b);
}

/**
 * Extracts all unique shadows from Figma metadata
 * Extracts all unique shadows from Figma metadata
 *
 * @param metadata - Figma node metadata
 * @returns Array of FigmaShadow objects
 */
export function extractFigmaShadows(metadata: any): FigmaShadow[] {
  const shadowsMap = new Map<string, FigmaShadow>();

  function traverse(node: any) {
    if (node.effects && Array.isArray(node.effects)) {
      const shadow = node.effects.find((e: any) =>
        (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') && e.visible !== false
      );

      if (shadow) {
        const rVal = shadow.color?.r || 0;
        const gVal = shadow.color?.g || 0;
        const bVal = shadow.color?.b || 0;
        const aVal = shadow.color?.a || 0.25;
        const blurRadius = shadow.radius ?? 0;
        const shadowColor = `rgba(${Math.round(rVal * 255)}, ${Math.round(gVal * 255)}, ${Math.round(bVal * 255)}, 1)`;
        const shadowOpacity = aVal;
        const shadowRadius = Math.round(blurRadius / 2);
        const elevation = Math.max(1, Math.round(blurRadius / 2));

        const offset = shadow.offset || { x: 0, y: 0 };

        // Create signature for mapping
        // Create signature for mapping
        const key = `shadowColor-${shadowColor}-shadowOpacity-${shadowOpacity}-shadowRadius-scale(${shadowRadius})-elevation-${elevation}`;

        if (!shadowsMap.has(key)) {
          shadowsMap.set(key, {
            key,
            offset: { x: offset.x || 0, y: offset.y || 0 },
            radius: shadowRadius,
            opacity: shadowOpacity,
            color: shadowColor
          });
        }
      }
    }

    // Recursively process children
    // Recursively process children
    if (node.children && Array.isArray(node.children)) {
      node.children.forEach(traverse);
    }
  }

  traverse(metadata);
  return Array.from(shadowsMap.values());
}

/**
 * Extracts all unique gradients from Figma metadata
 * Extracts all unique gradients from Figma metadata
 *
 * @param metadata - Figma node metadata
 * @returns Array of gradient signatures (comma-separated hex color strings)
 */
export function extractFigmaGradients(metadata: any): string[] {
  const gradientSignatures = new Set<string>();

  function traverse(node: any) {
    if (node.fills && Array.isArray(node.fills)) {
      const gradientFill = node.fills.find((f: any) =>
        f.type?.startsWith('GRADIENT_') && f.visible !== false
      );

      if (gradientFill && gradientFill.gradientStops) {
        const colors = gradientFill.gradientStops.map((stop: any) => {
          const rVal = stop.color.r;
          const gVal = stop.color.g;
          const bVal = stop.color.b;
          const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
          return `#${toHex(rVal)}${toHex(gVal)}${toHex(bVal)}`.toUpperCase();
        });

        // Signature: "#7A54FF,#AB5CE9"
        // Signature: "#7A54FF,#AB5CE9"
        const signature = colors.join(',');
        gradientSignatures.add(signature);
      }
    }

    // Recursively process children
    // Recursively process children
    if (node.children && Array.isArray(node.children)) {
      node.children.forEach(traverse);
    }
  }

  traverse(metadata);
  return Array.from(gradientSignatures);
}

/**
 * Extracts all unique typography styles from Figma metadata
 * Extracts all unique typography styles from Figma metadata
 *
 * @param metadata - Figma node metadata
 * @returns Array of objects with fontSize, fontWeight, lineHeight and key
 */
export function extractFigmaTypography(metadata: any): Array<{ key: string; fontSize: number; fontWeight: number; lineHeight?: number }> {
  const typographyMap = new Map<string, { key: string; fontSize: number; fontWeight: number; lineHeight?: number }>();

  function traverse(node: any) {
    // Extract typography from TEXT nodes
    // Extract typography from TEXT nodes
    if (node.type === 'TEXT' && node.style) {
      const fontSize = node.style.fontSize;
      const fontWeight = node.style.fontWeight || 400;
      const lineHeight = node.style.lineHeightPx;
      const fontFamily = node.style.fontFamily || 'SF Pro';

      if (fontSize) {
        // Key format "FontFamily/weight/size" for mapping
        // Key format "FontFamily/weight/size" for mapping
        const key = `${fontFamily}/${fontWeight}/${fontSize}`;

        if (!typographyMap.has(key)) {
          typographyMap.set(key, {
            key,
            fontSize,
            fontWeight,
            lineHeight,
          });
        }
      }
    }

    // Recursively process children
    // Recursively process children
    if (node.children && Array.isArray(node.children)) {
      node.children.forEach(traverse);
    }
  }

  traverse(metadata);
  return Array.from(typographyMap.values());
}
