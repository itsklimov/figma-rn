import { describe, it, expect } from 'vitest';
import { generateTokensFile, generateTokensIfNeeded } from '../../../src/core/generation/tokens-generator.js';
import type { DesignTokens } from '../../../src/core/types.js';

describe('generateTokensFile', () => {
  it('should generate colors section', () => {
    const tokens: DesignTokens = {
      colors: {
        color_0: '#3B82F6',
        color_1: '#FFFFFF',
        color_2: '#1F2937',
      },
      spacing: {},
      radii: {},
      typography: {},
      shadows: {},
    };

    const result = generateTokensFile(tokens);

    expect(result).toContain('export const colors = {');
    expect(result).toContain("'#3B82F6'");
    expect(result).toContain("white: '#FFFFFF'");
    expect(result).toContain('} as const;');
  });

  it('should generate spacing section with semantic names', () => {
    const tokens: DesignTokens = {
      colors: {},
      spacing: {
        spacing_0: 4,
        spacing_1: 8,
        spacing_2: 16,
        spacing_3: 24,
      },
      radii: {},
      typography: {},
      shadows: {},
    };

    const result = generateTokensFile(tokens);

    expect(result).toContain('export const spacing = {');
    expect(result).toContain('xs: 4');
    expect(result).toContain('sm: 8');
    expect(result).toContain('md: 16');
    expect(result).toContain('lg: 24');
  });

  it('should generate radii section', () => {
    const tokens: DesignTokens = {
      colors: {},
      spacing: {},
      radii: {
        radius_0: 4,
        radius_1: 8,
        radius_2: 16,
      },
      typography: {},
      shadows: {},
    };

    const result = generateTokensFile(tokens);

    expect(result).toContain('export const radii = {');
    expect(result).toContain('sm: 4');
    expect(result).toContain('md: 8');
    expect(result).toContain('lg: 16');
  });

  it('should generate typography section', () => {
    const tokens: DesignTokens = {
      colors: {},
      spacing: {},
      radii: {},
      typography: {
        heading: {
          fontFamily: 'Inter',
          fontSize: 24,
          fontWeight: 700,
          lineHeight: 32,
        },
        body: {
          fontFamily: 'Inter',
          fontSize: 16,
          fontWeight: 400,
          lineHeight: 24,
        },
      },
      shadows: {},
    };

    const result = generateTokensFile(tokens);

    expect(result).toContain('export const typography = {');
    expect(result).toContain('heading: {');
    expect(result).toContain("fontFamily: 'Inter'");
    expect(result).toContain('fontSize: 24');
    expect(result).toContain('fontWeight: 700');
    expect(result).toContain('body: {');
  });

  it('should generate shadows section with RN properties', () => {
    const tokens: DesignTokens = {
      colors: {},
      spacing: {},
      radii: {},
      typography: {},
      shadows: {
        shadow_0: {
          color: '#00000033',
          offsetX: 0,
          offsetY: 4,
          blur: 8,
          spread: 0,
        },
      },
    };

    const result = generateTokensFile(tokens);

    expect(result).toContain('export const shadows = {');
    expect(result).toContain('shadow_0: {');
    expect(result).toContain("shadowColor: '#00000033'");
    expect(result).toContain('shadowOffset: { width: 0, height: 4 }');
    expect(result).toContain('shadowRadius: 8');
    expect(result).toContain('elevation: 4'); // ceil(8 / 2)
  });

  it('should generate combined theme export', () => {
    const tokens: DesignTokens = {
      colors: { color_0: '#000' },
      spacing: { spacing_0: 8 },
      radii: { radius_0: 4 },
      typography: {},
      shadows: {},
    };

    const result = generateTokensFile(tokens);

    expect(result).toContain('export const theme = {');
    expect(result).toContain('colors,');
    expect(result).toContain('spacing,');
    expect(result).toContain('radii,');
    expect(result).toContain('export type Theme = typeof theme;');
  });

  it('should include header comment', () => {
    const tokens: DesignTokens = {
      colors: {},
      spacing: {},
      radii: {},
      typography: {},
      shadows: {},
    };

    const result = generateTokensFile(tokens);

    expect(result).toContain('Generated Design Tokens');
    expect(result).toContain('Auto-generated from Figma');
  });

  it('should deduplicate spacing values', () => {
    const tokens: DesignTokens = {
      colors: {},
      spacing: {
        spacing_0: 8,
        spacing_1: 8, // Duplicate
        spacing_2: 16,
      },
      radii: {},
      typography: {},
      shadows: {},
    };

    const result = generateTokensFile(tokens);

    // Should only have one entry for 8
    const matches = result.match(/: 8,/g);
    expect(matches).toHaveLength(1);
  });
});

describe('generateTokensIfNeeded', () => {
  const sampleTokens: DesignTokens = {
    colors: { color_0: '#000' },
    spacing: { spacing_0: 8 },
    radii: {},
    typography: {},
    shadows: {},
  };

  it('should return null when project theme exists', () => {
    const result = generateTokensIfNeeded(sampleTokens, true);
    expect(result).toBeNull();
  });

  it('should generate tokens when no project theme', () => {
    const result = generateTokensIfNeeded(sampleTokens, false);

    expect(result).not.toBeNull();
    expect(result!.path).toBe('generated/tokens.ts');
    expect(result!.content).toContain('export const colors');
  });

  it('should use custom output directory', () => {
    const result = generateTokensIfNeeded(sampleTokens, false, 'src/theme');

    expect(result).not.toBeNull();
    expect(result!.path).toBe('src/theme/tokens.ts');
  });
});
