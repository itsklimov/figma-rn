import { describe, it, expect } from 'vitest';
import {
  isGenericName,
  deriveNameFromAncestry,
} from '../../../src/core/generation/prop-extractor.js';

describe('prop-extractor hierarchy', () => {
  describe('isGenericName', () => {
    it('should return true for empty or short names', () => {
      expect(isGenericName('')).toBe(true);
      expect(isGenericName('a')).toBe(true);
      expect(isGenericName('ab')).toBe(true);
    });

    it('should return true for numeric-only names', () => {
      expect(isGenericName('123')).toBe(true);
      expect(isGenericName('456789')).toBe(true);
    });

    it('should return true for Figma generic layer names', () => {
      expect(isGenericName('Frame')).toBe(true);
      expect(isGenericName('Frame 1')).toBe(true);
      expect(isGenericName('Frame 123')).toBe(true);
      expect(isGenericName('Group')).toBe(true);
      expect(isGenericName('Group 5')).toBe(true);
      expect(isGenericName('Rectangle')).toBe(true);
      expect(isGenericName('Rectangle 42')).toBe(true);
      expect(isGenericName('Vector')).toBe(true);
      expect(isGenericName('Instance')).toBe(true);
      expect(isGenericName('Component')).toBe(true);
      expect(isGenericName('Ellipse')).toBe(true);
      expect(isGenericName('Line')).toBe(true);
      expect(isGenericName('Star')).toBe(true);
      expect(isGenericName('Polygon')).toBe(true);
      expect(isGenericName('Boolean')).toBe(true);
    });

    it('should return false for meaningful names', () => {
      expect(isGenericName('ProductCard')).toBe(false);
      expect(isGenericName('Header Title')).toBe(false);
      expect(isGenericName('userAvatar')).toBe(false);
      expect(isGenericName('Price Label')).toBe(false);
      expect(isGenericName('Navigation Bar')).toBe(false);
    });

    it('should be case insensitive for generic names', () => {
      expect(isGenericName('FRAME')).toBe(true);
      expect(isGenericName('frame')).toBe(true);
      expect(isGenericName('GROUP 1')).toBe(true);
    });
  });

  describe('deriveNameFromAncestry', () => {
    it('should return null for meaningful node names', () => {
      const result = deriveNameFromAncestry('ProductTitle', 'Text', ['Frame 1', 'Card']);
      expect(result).toBe(null);
    });

    it('should derive name from meaningful parent for generic node name', () => {
      const result = deriveNameFromAncestry('Frame 1', 'Text', ['Root', 'ProductCard']);
      expect(result).toBe('productCardText');
    });

    it('should skip generic ancestors to find meaningful parent', () => {
      const result = deriveNameFromAncestry('Rectangle', 'Text', [
        'AppContainer',
        'Frame 1',
        'Group 2',
        'Frame 3',
      ]);
      expect(result).toBe('appContainerText');
    });

    it('should return null when all ancestors are generic', () => {
      const result = deriveNameFromAncestry('Frame', 'Text', [
        'Frame 1',
        'Group 2',
        'Rectangle 3',
      ]);
      expect(result).toBe(null);
    });

    it('should avoid redundancy when parent name ends with type', () => {
      const result = deriveNameFromAncestry('Frame 1', 'Text', ['Container', 'TitleText']);
      expect(result).toBe('titleText');
    });

    it('should work with deep nesting', () => {
      const result = deriveNameFromAncestry('Vector', 'Image', [
        'Screen',
        'Header',
        'Frame 1',
        'Frame 2',
        'Frame 3',
        'UserProfile',
        'Frame 4',
      ]);
      expect(result).toBe('userProfileImage');
    });

    it('should handle various semantic types', () => {
      expect(deriveNameFromAncestry('Frame', 'Container', ['Card'])).toBe('cardContainer');
      expect(deriveNameFromAncestry('Group', 'Image', ['Avatar'])).toBe('avatarImage');
      expect(deriveNameFromAncestry('Rectangle', 'Button', ['Submit'])).toBe('submitButton');
      expect(deriveNameFromAncestry('Vector', 'Icon', ['Settings'])).toBe('settingsIcon');
    });

    it('should handle empty ancestry', () => {
      const result = deriveNameFromAncestry('Frame 1', 'Text', []);
      expect(result).toBe(null);
    });
  });
});
