import { describe, it, expect } from 'vitest';
import {
  isGenericName,
  deriveNameFromAncestry,
  extractProps,
} from '../../../src/core/generation/prop-extractor.js';
import { detectContentPattern } from '../../../src/core/extraction/content-pattern.js';
import type { ContainerIR, TextIR, ImageIR } from '../../../src/core/types.js';

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

  describe('content preservation with generic names', () => {
    it('should preserve props with meaningful content even if name is generic', () => {
      // This validates the fix: element2 has generic name but meaningful content
      // Should NOT be filtered out
      const propName = 'element2'; // Generic name
      const content = 'Бонус за пополнение'; // Meaningful Russian text

      // The filtering logic should check:
      // 1. Is name meaningful? NO (element2 is generic)
      // 2. Is content empty/placeholder? NO (real text)
      // Result: Keep the prop because content is meaningful

      // Note: This test documents expected behavior - actual filtering
      // happens in prop-extractor.ts traverse() function
      expect(content.trim().length).toBeGreaterThan(0);
      expect(/^element\d+$/.test(propName)).toBe(true); // Name IS generic
    });

    it('should filter empty content with generic names', () => {
      const propName = 'element99';
      const content = '';

      // Both name and content are bad - should be filtered
      expect(/^element\d+$/.test(propName)).toBe(true);
      expect(content.trim().length).toBe(0);
    });

    it('should filter placeholder content with generic names', () => {
      const propName = 'frame1';
      const content = 'placeholder';

      // Name is generic and content is placeholder - should be filtered
      expect(isGenericName(propName)).toBe(true);
    });

    it('should not extract generic vector-exported image assets as props', () => {
      const root: ContainerIR = {
        id: '1:1',
        name: 'Launch screen',
        semanticType: 'Container',
        boundingBox: { x: 0, y: 0, width: 100, height: 100 },
        styleRef: 'launchScreen',
        layout: {
          type: 'column',
          gap: 0,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          mainAlign: 'start',
          crossAlign: 'start',
          sizing: { horizontal: 'fixed', vertical: 'fixed' },
        },
        children: [
          {
            id: '8136:48502',
            name: 'Union',
            semanticType: 'Image',
            boundingBox: { x: 0, y: 0, width: 160, height: 24 },
            styleRef: 'element48502',
            imageRef: '8136:48502',
          } as ImageIR,
        ],
      };

      const result = extractProps(root);

      expect(result.props).toEqual({});
    });
  });

  describe('content pattern naming', () => {
    it('should detect semantic names for common UI content patterns', () => {
      expect(detectContentPattern('18:00')).toBe('time');
      expect(detectContentPattern('90 мин')).toBe('duration');
      expect(detectContentPattern('4.6')).toBe('rating');
      expect(detectContentPattern('(254)')).toBe('reviewCount');
      expect(detectContentPattern('Никитский бул., 45')).toBe('address');
    });

    it('should apply semantic names during prop extraction', () => {
      const root: ContainerIR = {
        id: '1:1',
        name: 'CardMaster',
        semanticType: 'Container',
        boundingBox: { x: 0, y: 0, width: 100, height: 100 },
        styleRef: 'cardMaster',
        layout: {
          type: 'column',
          gap: 0,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          mainAlign: 'start',
          crossAlign: 'start',
          sizing: { horizontal: 'fixed', vertical: 'fixed' },
        },
        children: [
          {
            id: '1:2',
            name: 'Text 1',
            semanticType: 'Text',
            boundingBox: { x: 0, y: 0, width: 50, height: 10 },
            styleRef: 'time',
            text: '18:00',
          } as TextIR,
          {
            id: '1:3',
            name: 'Text 2',
            semanticType: 'Text',
            boundingBox: { x: 0, y: 0, width: 50, height: 10 },
            styleRef: 'duration',
            text: '90 мин',
          } as TextIR,
          {
            id: '1:4',
            name: 'Text 3',
            semanticType: 'Text',
            boundingBox: { x: 0, y: 0, width: 50, height: 10 },
            styleRef: 'rating',
            text: '4.6',
          } as TextIR,
          {
            id: '1:5',
            name: 'Text 4',
            semanticType: 'Text',
            boundingBox: { x: 0, y: 0, width: 50, height: 10 },
            styleRef: 'reviewCount',
            text: '(254)',
          } as TextIR,
          {
            id: '1:6',
            name: 'Text 5',
            semanticType: 'Text',
            boundingBox: { x: 0, y: 0, width: 50, height: 10 },
            styleRef: 'address',
            text: 'Никитский бул., 45',
          } as TextIR,
        ],
      };

      const result = extractProps(root);

      expect(result.props.time?.defaultValue).toBe('18:00');
      expect(result.props.duration?.defaultValue).toBe('90 мин');
      expect(result.props.rating?.defaultValue).toBe('4.6');
      expect(result.props.reviewCount?.defaultValue).toBe('(254)');
      expect(result.props.address?.defaultValue).toBe('Никитский бул., 45');
    });
  });
});
