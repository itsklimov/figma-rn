import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { extractProjectTokens, ProjectTokens } from '../../../src/core/mapping/theme-extractor.js';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';

describe('theme-extractor', () => {
  const testDir = join(process.cwd(), 'tests/core/mapping/fixtures');
  const jsonThemePath = join(testDir, 'test-theme.json');

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
  });

  afterAll(async () => {
    try { await unlink(jsonThemePath); } catch {}
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
});
