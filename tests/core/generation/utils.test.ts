import { describe, it, expect } from 'vitest';
import {
  formatInteger,
  formatSmart,
  formatFloat,
  formatPercent,
  toValidIdentifier,
  sanitizeFilename,
  sanitizeComponentName,
} from '../../../src/core/generation/utils.js';

describe('utils', () => {
  describe('formatInteger', () => {
    it('should round to nearest integer', () => {
      expect(formatInteger(10.4)).toBe('10');
      expect(formatInteger(10.5)).toBe('11');
      expect(formatInteger(10.9)).toBe('11');
    });

    it('should handle already integer values', () => {
      expect(formatInteger(10)).toBe('10');
      expect(formatInteger(0)).toBe('0');
    });
  });

  describe('formatSmart', () => {
    it('should snap to integer when close', () => {
      expect(formatSmart(30.00001)).toBe('30');
      expect(formatSmart(29.9999)).toBe('30');
    });

    it('should preserve meaningful decimals', () => {
      expect(formatSmart(0.5)).toBe('0.5');
      expect(formatSmart(37.406)).toBe('37.41');
    });
  });

  describe('formatFloat', () => {
    it('should format with default 2 decimal precision', () => {
      expect(formatFloat(0.123456)).toBe('0.12');
      expect(formatFloat(0.5)).toBe('0.5');
    });

    it('should respect custom precision', () => {
      expect(formatFloat(0.123456, 4)).toBe('0.1235');
    });
  });

  describe('formatPercent', () => {
    it('should round percentage to 2 decimal places', () => {
      expect(formatPercent(29.23959863596949)).toBe('29.24%');
      expect(formatPercent(97.14286234547906)).toBe('97.14%');
      expect(formatPercent(70.76037176724138)).toBe('70.76%');
      expect(formatPercent(1.4258856515114902)).toBe('1.43%');
    });

    it('should remove trailing zeros', () => {
      expect(formatPercent(50.00)).toBe('50%');
      expect(formatPercent(25.10)).toBe('25.1%');
      expect(formatPercent(100)).toBe('100%');
    });

    it('should handle zero and small values', () => {
      expect(formatPercent(0)).toBe('0%');
      expect(formatPercent(0.005)).toBe('0.01%');
      expect(formatPercent(0.001)).toBe('0%');
    });
  });

  describe('toValidIdentifier', () => {
    it('should preserve camelCase', () => {
      expect(toValidIdentifier('productCard')).toBe('productCard');
    });

    it('should convert spaces to camelCase', () => {
      expect(toValidIdentifier('Product Card')).toBe('productCard');
    });

    it('should prefix names starting with digit', () => {
      expect(toValidIdentifier('123-item')).toBe('style123Item');
    });

    it('should handle empty names', () => {
      expect(toValidIdentifier('')).toBe('element');
    });
  });

  describe('sanitizeFilename', () => {
    it('should convert to lowercase with dashes', () => {
      expect(sanitizeFilename('My Icon')).toBe('my-icon');
    });

    it('should remove path traversal', () => {
      expect(sanitizeFilename('../etc/passwd')).toBe('etc-passwd');
    });

    it('should remove leading dots', () => {
      expect(sanitizeFilename('.hidden')).toBe('hidden');
    });
  });

  describe('sanitizeComponentName', () => {
    it('should convert to PascalCase', () => {
      expect(sanitizeComponentName('home screen')).toBe('HomeScreen');
      expect(sanitizeComponentName('user-profile_card')).toBe('UserProfileCard');
    });

    it('should prefix names starting with digit', () => {
      expect(sanitizeComponentName('123-invalid')).toBe('Component123Invalid');
    });
  });
});
