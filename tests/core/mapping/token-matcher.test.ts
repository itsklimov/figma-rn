import { describe, it, expect } from 'vitest';
import { matchTokens, TokenMappings } from '../../../src/core/mapping/token-matcher.js';
import type { DesignTokens } from '../../../src/core/types.js';
import type { ProjectTokens } from '../../../src/core/mapping/theme-extractor.js';

describe('token-matcher', () => {
  describe('matchTokens', () => {
    it('should match colors with exact match', () => {
      const extracted: DesignTokens = {
        colors: { color_0: '#3B82F6' },
        spacing: {},
        radii: {},
        typography: {},
        shadows: {},
      };

      const project: ProjectTokens = {
        colors: new Map([['#3B82F6', 'theme.colors.primary']]),
      };

      const result = matchTokens(extracted, project);

      expect(result.colors.color_0).toBe('theme.colors.primary');
    });

    it('should match colors case-insensitively', () => {
      const extracted: DesignTokens = {
        colors: { color_0: '#3b82f6' },
        spacing: {},
        radii: {},
        typography: {},
        shadows: {},
      };

      const project: ProjectTokens = {
        colors: new Map([['#3B82F6', 'theme.colors.primary']]),
      };

      const result = matchTokens(extracted, project);

      expect(result.colors.color_0).toBe('theme.colors.primary');
    });

    it('should match colors with fuzzy matching within threshold', () => {
      const extracted: DesignTokens = {
        colors: { color_0: '#3B83F7' }, // Very similar blue
        spacing: {},
        radii: {},
        typography: {},
        shadows: {},
      };

      const project: ProjectTokens = {
        colors: new Map([['#3B82F6', 'theme.colors.primary']]),
      };

      const result = matchTokens(extracted, project, 5);

      expect(result.colors.color_0).toBe('theme.colors.primary');
    });

    it('should keep original color when no match within threshold', () => {
      const extracted: DesignTokens = {
        colors: { color_0: '#FF0000' }, // Red
        spacing: {},
        radii: {},
        typography: {},
        shadows: {},
      };

      const project: ProjectTokens = {
        colors: new Map([['#0000FF', 'theme.colors.blue']]), // Blue
      };

      const result = matchTokens(extracted, project, 5);

      expect(result.colors.color_0).toBe('#FF0000');
    });

    it('should match spacing with exact match', () => {
      const extracted: DesignTokens = {
        colors: {},
        spacing: { spacing_0: 16 },
        radii: {},
        typography: {},
        shadows: {},
      };

      const project: ProjectTokens = {
        spacing: new Map([[16, 'theme.spacing.md']]),
      };

      const result = matchTokens(extracted, project);

      expect(result.spacing.spacing_0).toBe('theme.spacing.md');
    });

    it('should keep original spacing when no match', () => {
      const extracted: DesignTokens = {
        colors: {},
        spacing: { spacing_0: 18 },
        radii: {},
        typography: {},
        shadows: {},
      };

      const project: ProjectTokens = {
        spacing: new Map([[16, 'theme.spacing.md']]),
      };

      const result = matchTokens(extracted, project);

      expect(result.spacing.spacing_0).toBe('18');
    });

    it('should match radii with exact match', () => {
      const extracted: DesignTokens = {
        colors: {},
        spacing: {},
        radii: { radius_0: 8 },
        typography: {},
        shadows: {},
      };

      const project: ProjectTokens = {
        radii: new Map([[8, 'theme.radii.md']]),
      };

      const result = matchTokens(extracted, project);

      expect(result.radii.radius_0).toBe('theme.radii.md');
    });

    it('should handle empty project tokens', () => {
      const extracted: DesignTokens = {
        colors: { color_0: '#3B82F6' },
        spacing: { spacing_0: 16 },
        radii: { radius_0: 8 },
        typography: {},
        shadows: {},
      };

      const project: ProjectTokens = {};

      const result = matchTokens(extracted, project);

      expect(result.colors.color_0).toBe('#3B82F6');
      expect(result.spacing.spacing_0).toBe('16');
      expect(result.radii.radius_0).toBe('8');
    });

    it('should match multiple tokens of same category', () => {
      const extracted: DesignTokens = {
        colors: {
          color_0: '#3B82F6',
          color_1: '#10B981',
          color_2: '#FF0000',
        },
        spacing: {},
        radii: {},
        typography: {},
        shadows: {},
      };

      const project: ProjectTokens = {
        colors: new Map([
          ['#3B82F6', 'theme.colors.primary'],
          ['#10B981', 'theme.colors.success'],
        ]),
      };

      const result = matchTokens(extracted, project);

      expect(result.colors.color_0).toBe('theme.colors.primary');
      expect(result.colors.color_1).toBe('theme.colors.success');
      expect(result.colors.color_2).toBe('#FF0000'); // No match
    });
  });
});
