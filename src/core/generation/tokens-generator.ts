/**
 * Tokens Generator - Generate fallback tokens file from DesignTokens
 * Used when no project theme file exists
 */

import type { DesignTokens } from '../types.js';
import { normalizeHex } from '../utils/path-utils.js';

/**
 * Convert a color hex to a readable name
 * Uses uppercase hex for consistent comparison
 */
function colorToName(hex: string, index: number): string {
  // Normalize to uppercase for consistent comparison
  const upper = normalizeHex(hex);

  // Common color mappings
  if (upper === '#FFFFFF' || upper === '#FFF') return 'white';
  if (upper === '#000000' || upper === '#000') return 'black';
  if (upper.startsWith('#F') && upper.length === 7) {
    const r = parseInt(upper.slice(1, 3), 16);
    const g = parseInt(upper.slice(3, 5), 16);
    const b = parseInt(upper.slice(5, 7), 16);
    if (r > 200 && g > 200 && b > 200) return `gray${index}Light`;
    if (r > 200 && g < 100 && b < 100) return `red${index}`;
    if (r < 100 && g > 200 && b < 100) return `green${index}`;
    if (r < 100 && g < 100 && b > 200) return `blue${index}`;
  }

  // Default to indexed name
  return `color${index}`;
}

/**
 * Convert spacing value to name
 */
function spacingToName(value: number): string {
  if (value === 0) return 'none';
  if (value <= 4) return 'xs';
  if (value <= 8) return 'sm';
  if (value <= 16) return 'md';
  if (value <= 24) return 'lg';
  if (value <= 32) return 'xl';
  if (value <= 48) return 'xxl';
  return `space${value}`;
}

/**
 * Convert radius value to name
 */
function radiusToName(value: number): string {
  if (value === 0) return 'none';
  if (value <= 4) return 'sm';
  if (value <= 8) return 'md';
  if (value <= 16) return 'lg';
  if (value <= 24) return 'xl';
  if (value >= 9999) return 'full';
  return `radius${value}`;
}

/**
 * Generate TypeScript tokens file content
 */
export function generateTokensFile(tokens: DesignTokens): string {
  const lines: string[] = [
    '/**',
    ' * Generated Design Tokens',
    ' * Auto-generated from Figma design - customize as needed',
    ' */',
    '',
  ];

  // Generate colors
  if (Object.keys(tokens.colors).length > 0) {
    lines.push('export const colors = {');
    const colorEntries = Object.entries(tokens.colors);
    colorEntries.forEach(([_key, value], index) => {
      const name = colorToName(value, index);
      lines.push(`  ${name}: '${value}',`);
    });
    lines.push('} as const;');
    lines.push('');
  }

  // Generate spacing
  if (Object.keys(tokens.spacing).length > 0) {
    lines.push('export const spacing = {');
    const spacingValues = new Set<number>();
    Object.values(tokens.spacing).forEach(v => spacingValues.add(v));
    const sortedSpacing = Array.from(spacingValues).sort((a, b) => a - b);
    sortedSpacing.forEach(value => {
      const name = spacingToName(value);
      lines.push(`  ${name}: ${value},`);
    });
    lines.push('} as const;');
    lines.push('');
  }

  // Generate radii
  if (Object.keys(tokens.radii).length > 0) {
    lines.push('export const radii = {');
    const radiiValues = new Set<number>();
    Object.values(tokens.radii).forEach(v => radiiValues.add(v));
    const sortedRadii = Array.from(radiiValues).sort((a, b) => a - b);
    sortedRadii.forEach(value => {
      const name = radiusToName(value);
      lines.push(`  ${name}: ${value},`);
    });
    lines.push('} as const;');
    lines.push('');
  }

  // Generate typography
  if (Object.keys(tokens.typography).length > 0) {
    lines.push('export const typography = {');
    Object.entries(tokens.typography).forEach(([key, value]) => {
      lines.push(`  ${key}: {`);
      lines.push(`    fontFamily: '${value.fontFamily}',`);
      lines.push(`    fontSize: ${value.fontSize},`);
      lines.push(`    fontWeight: ${value.fontWeight},`);
      lines.push(`    lineHeight: ${value.lineHeight},`);
      lines.push('  },');
    });
    lines.push('} as const;');
    lines.push('');
  }

  // Generate shadows
  if (Object.keys(tokens.shadows).length > 0) {
    lines.push('export const shadows = {');
    Object.entries(tokens.shadows).forEach(([key, value]) => {
      lines.push(`  ${key}: {`);
      lines.push(`    shadowColor: '${value.color}',`);
      lines.push(`    shadowOffset: { width: ${value.offsetX}, height: ${value.offsetY} },`);
      lines.push(`    shadowOpacity: 1,`);
      lines.push(`    shadowRadius: ${value.blur},`);
      lines.push(`    elevation: ${Math.ceil(value.blur / 2)},`);
      lines.push('  },');
    });
    lines.push('} as const;');
    lines.push('');
  }

  // Generate combined theme export
  lines.push('export const theme = {');
  if (Object.keys(tokens.colors).length > 0) lines.push('  colors,');
  if (Object.keys(tokens.spacing).length > 0) lines.push('  spacing,');
  if (Object.keys(tokens.radii).length > 0) lines.push('  radii,');
  if (Object.keys(tokens.typography).length > 0) lines.push('  typography,');
  if (Object.keys(tokens.shadows).length > 0) lines.push('  shadows,');
  lines.push('} as const;');
  lines.push('');
  lines.push('export type Theme = typeof theme;');
  lines.push('');

  return lines.join('\n');
}

/**
 * Result of token generation
 */
export interface TokensGenerationResult {
  /** Path for the generated file */
  path: string;
  /** Generated file content */
  content: string;
}

/**
 * Generate tokens file if no project theme exists
 *
 * @param tokens - Extracted design tokens from Figma
 * @param hasProjectTheme - Whether a project theme file exists
 * @param outputDir - Directory for generated files (default: 'generated')
 * @returns Generated file info, or null if project theme exists
 */
export function generateTokensIfNeeded(
  tokens: DesignTokens,
  hasProjectTheme: boolean,
  outputDir: string = 'generated'
): TokensGenerationResult | null {
  if (hasProjectTheme) {
    return null;
  }

  return {
    path: `${outputDir}/tokens.ts`,
    content: generateTokensFile(tokens),
  };
}
