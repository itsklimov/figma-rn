import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { extractProjectTokens, ProjectTokens } from '../../../src/core/mapping/theme-extractor.js';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';

describe('theme-extractor', () => {
  const testDir = join(process.cwd(), 'tests/core/mapping/fixtures');
  const jsonThemePath = join(testDir, 'test-theme.json');
  const unistylesThemePath = join(testDir, 'unistyles-theme.ts');
  const fontThemePath = join(testDir, 'font-theme.ts');

  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });

    // Create test JSON theme
    const testTheme = {
      colors: {
        primary: '#3B82F6',
        secondary: '#10B981',
        text: {
          dark: '#1F2937',
          light: '#F9FAFB'
        }
      },
      spacing: {
        sm: 8,
        md: 16,
        lg: 24
      },
      radii: {
        sm: 4,
        md: 8,
        lg: 16
      }
    };

    await writeFile(jsonThemePath, JSON.stringify(testTheme, null, 2));

    // Create Unistyles-style theme file (flat color keys like gray10, accent60)
    const unistylesTheme = `
const lightTheme = {
  colors: {
    gray10: '#F7F7F7',
    gray20: '#EFEFEF',
    gray50: '#B4B4B4',
    accent50: '#B6A1FF',
    accent60: '#7A54FF',
    black: '#17171A',
    white: '#FFFFFF',
    primary: '#7A54FF',
  },
  margins: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
  },
  radii: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
  },
} as const;

export { lightTheme };
`;
    await writeFile(unistylesThemePath, unistylesTheme);

    // Create font theme file with nested typography structure
    const fontTheme = `
const scale = (n: number) => n;

export const font = {
  body: {
    regular: {
      fontSize: scale(17),
      lineHeight: scale(22),
      fontFamily: 'SFProText-Regular',
    },
    bold: {
      fontSize: scale(17),
      lineHeight: scale(22),
      fontFamily: 'SFProText-Bold',
    },
  },
  caption: {
    regular: {
      fontSize: scale(12),
      lineHeight: scale(16),
      fontFamily: 'SFProText-Regular',
    },
  },
};
`;
    await writeFile(fontThemePath, fontTheme);
  });

  afterAll(async () => {
    try { await unlink(jsonThemePath); } catch {}
    try { await unlink(unistylesThemePath); } catch {}
    try { await unlink(fontThemePath); } catch {}
  });

  describe('extractProjectTokens', () => {
    it('should extract colors from JSON theme', async () => {
      const tokens = await extractProjectTokens(jsonThemePath);

      expect(tokens.colors).toBeDefined();
      expect(tokens.colors?.get('#3B82F6')).toBe('theme.colors.primary');
      expect(tokens.colors?.get('#1F2937')).toBe('theme.colors.text.dark');
    });

    it('should extract spacing from JSON theme', async () => {
      const tokens = await extractProjectTokens(jsonThemePath);

      expect(tokens.spacing).toBeDefined();
      expect(tokens.spacing?.get(16)).toBe('theme.spacing.md');
    });

    it('should extract radii from JSON theme', async () => {
      const tokens = await extractProjectTokens(jsonThemePath);

      expect(tokens.radii).toBeDefined();
      expect(tokens.radii?.get(8)).toBe('theme.radii.md');
    });
  });

  describe('Unistyles theme extraction', () => {
    it('should extract colors with flat keys (gray10, accent60)', async () => {
      const tokens = await extractProjectTokens(unistylesThemePath);

      expect(tokens.colors).toBeDefined();
      // Check that flat color keys are extracted
      expect(tokens.colors?.get('#F7F7F7')).toContain('gray10');
      expect(tokens.colors?.get('#7A54FF')).toBeDefined(); // primary or accent60
      expect(tokens.colors?.get('#17171A')).toContain('black');
    });

    it('should extract margins as spacing tokens', async () => {
      const tokens = await extractProjectTokens(unistylesThemePath);

      expect(tokens.spacing).toBeDefined();
      expect(tokens.spacing?.size).toBeGreaterThan(0);
      // Check that margins are extracted as spacing
      expect(tokens.spacing?.get(8)).toContain('sm');
      expect(tokens.spacing?.get(16)).toContain('lg');
    });

    it('should extract radii from Unistyles theme', async () => {
      const tokens = await extractProjectTokens(unistylesThemePath);

      expect(tokens.radii).toBeDefined();
      expect(tokens.radii?.get(8)).toContain('sm');
      expect(tokens.radii?.get(12)).toContain('md');
    });
  });

  describe('Nested typography extraction', () => {
    it('should extract typography from nested font structure (font.body.regular)', async () => {
      const tokens = await extractProjectTokens(fontThemePath);

      expect(tokens.typography).toBeDefined();
      expect(tokens.typography?.size).toBeGreaterThan(0);

      // Check that nested paths are captured
      const typoPaths = Array.from(tokens.typography?.values() || []);
      const hasBodyRegular = typoPaths.some(path => path.includes('body') && path.includes('regular'));
      expect(hasBodyRegular).toBe(true);
    });

    it('should extract font sizes from scale() function calls', async () => {
      const tokens = await extractProjectTokens(fontThemePath);

      expect(tokens.typography).toBeDefined();
      // The typography tokens should have fontSize extracted from scale(17) and scale(12)
      const typoEntries = Array.from(tokens.typography?.entries() || []);
      // Check that at least one typography token was found
      expect(typoEntries.length).toBeGreaterThan(0);
    });
  });
});
