import { describe, it, expect } from 'vitest';
import { hexToLab, labDistance, findClosestColor } from '../../../src/core/mapping/color-matcher.js';

describe('color-matcher', () => {
  describe('hexToLab', () => {
    it('should convert black to LAB [0, 0, 0]', () => {
      const lab = hexToLab('#000000');
      expect(lab[0]).toBeCloseTo(0, 0);
      expect(lab[1]).toBeCloseTo(0, 0);
      expect(lab[2]).toBeCloseTo(0, 0);
    });

    it('should convert white to LAB [100, 0, 0]', () => {
      const lab = hexToLab('#FFFFFF');
      expect(lab[0]).toBeCloseTo(100, 0);
      expect(lab[1]).toBeCloseTo(0, 0);
      expect(lab[2]).toBeCloseTo(0, 0);
    });

    it('should handle hex colors without # prefix', () => {
      const lab1 = hexToLab('#FF0000');
      const lab2 = hexToLab('FF0000');
      expect(lab1[0]).toBe(lab2[0]);
      expect(lab1[1]).toBe(lab2[1]);
      expect(lab1[2]).toBe(lab2[2]);
    });
  });

  describe('labDistance', () => {
    it('should return 0 for identical colors', () => {
      const lab: [number, number, number] = [50, 20, -30];
      expect(labDistance(lab, lab)).toBe(0);
    });

    it('should return positive distance for different colors', () => {
      const lab1: [number, number, number] = [50, 20, -30];
      const lab2: [number, number, number] = [60, 25, -35];
      expect(labDistance(lab1, lab2)).toBeGreaterThan(0);
    });

    it('should be symmetric', () => {
      const lab1: [number, number, number] = [50, 20, -30];
      const lab2: [number, number, number] = [60, 25, -35];
      expect(labDistance(lab1, lab2)).toBe(labDistance(lab2, lab1));
    });
  });

  describe('findClosestColor', () => {
    it('should return exact match immediately', () => {
      const themeColors = new Map([['#3B82F6', 'theme.colors.primary']]);
      expect(findClosestColor('#3B82F6', themeColors)).toBe('theme.colors.primary');
    });

    it('should return exact match case-insensitively', () => {
      const themeColors = new Map([['#3B82F6', 'theme.colors.primary']]);
      expect(findClosestColor('#3b82f6', themeColors)).toBe('theme.colors.primary');
    });

    it('should return null when no match within threshold', () => {
      const themeColors = new Map([['#FF0000', 'theme.colors.red']]);
      expect(findClosestColor('#0000FF', themeColors, 5)).toBeNull();
    });

    it('should find closest color within threshold', () => {
      const themeColors = new Map([['#3B82F6', 'theme.colors.primary']]);
      // Very similar blue
      expect(findClosestColor('#3B83F7', themeColors, 5)).toBe('theme.colors.primary');
    });

    it('should return null for empty theme colors', () => {
      const themeColors = new Map<string, string>();
      expect(findClosestColor('#3B82F6', themeColors)).toBeNull();
    });

    it('should return closest match when multiple colors are within threshold', () => {
      const themeColors = new Map([
        ['#3B82F6', 'theme.colors.primary'],
        ['#3B83F7', 'theme.colors.secondary'],
      ]);
      // Should return the closest one
      const result = findClosestColor('#3B82F6', themeColors);
      expect(result).toBe('theme.colors.primary');
    });
  });
});
