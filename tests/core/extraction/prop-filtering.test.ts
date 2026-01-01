/**
 * Unit tests for prop filtering functions
 */

import { describe, it, expect } from 'vitest';
import {
  isMeaningfulPropName,
  shouldCreateProp,
  type PropCreationResult,
} from '../../../src/core/extraction/text-props-extractor.js';

describe('isMeaningfulPropName', () => {
  describe('generic names filtered', () => {
    it('should filter "text"', () => {
      expect(isMeaningfulPropName('text')).toBe(false);
    });

    it('should filter "element"', () => {
      expect(isMeaningfulPropName('element')).toBe(false);
    });

    it('should filter "label"', () => {
      expect(isMeaningfulPropName('label')).toBe(false);
    });

    it('should filter "frame"', () => {
      expect(isMeaningfulPropName('frame')).toBe(false);
    });

    it('should filter "group"', () => {
      expect(isMeaningfulPropName('group')).toBe(false);
    });

    it('should filter "container"', () => {
      expect(isMeaningfulPropName('container')).toBe(false);
    });

    it('should filter "view"', () => {
      expect(isMeaningfulPropName('view')).toBe(false);
    });

    it('should filter "box"', () => {
      expect(isMeaningfulPropName('box')).toBe(false);
    });

    it('should filter "wrapper"', () => {
      expect(isMeaningfulPropName('wrapper')).toBe(false);
    });

    it('should filter "row"', () => {
      expect(isMeaningfulPropName('row')).toBe(false);
    });

    it('should filter "column"', () => {
      expect(isMeaningfulPropName('column')).toBe(false);
    });

    it('should filter generic names case-insensitively', () => {
      expect(isMeaningfulPropName('TEXT')).toBe(false);
      expect(isMeaningfulPropName('Frame')).toBe(false);
      expect(isMeaningfulPropName('CONTAINER')).toBe(false);
    });
  });

  describe('auto-generated numbered variants filtered', () => {
    it('should filter "text_12345"', () => {
      expect(isMeaningfulPropName('text_12345')).toBe(false);
    });

    it('should filter "element_67890"', () => {
      expect(isMeaningfulPropName('element_67890')).toBe(false);
    });

    it('should filter "container1"', () => {
      expect(isMeaningfulPropName('container1')).toBe(false);
    });

    it('should filter "frame_1"', () => {
      expect(isMeaningfulPropName('frame_1')).toBe(false);
    });

    it('should filter "view123"', () => {
      expect(isMeaningfulPropName('view123')).toBe(false);
    });

    it('should filter "container51275"', () => {
      expect(isMeaningfulPropName('container51275')).toBe(false);
    });
  });

  describe('Figma auto-names filtered', () => {
    it('should filter "Frame 1234"', () => {
      expect(isMeaningfulPropName('Frame 1234')).toBe(false);
    });

    it('should filter "Vector 56"', () => {
      expect(isMeaningfulPropName('Vector 56')).toBe(false);
    });

    it('should filter "Rectangle 78"', () => {
      expect(isMeaningfulPropName('Rectangle 78')).toBe(false);
    });

    it('should filter "Ellipse 123"', () => {
      expect(isMeaningfulPropName('Ellipse 123')).toBe(false);
    });

    it('should filter "Line 1"', () => {
      expect(isMeaningfulPropName('Line 1')).toBe(false);
    });

    it('should filter "Star 99"', () => {
      expect(isMeaningfulPropName('Star 99')).toBe(false);
    });

    it('should filter "Instance 42"', () => {
      expect(isMeaningfulPropName('Instance 42')).toBe(false);
    });

    it('should filter "Polygon 7"', () => {
      expect(isMeaningfulPropName('Polygon 7')).toBe(false);
    });

    it('should filter "Boolean 3"', () => {
      expect(isMeaningfulPropName('Boolean 3')).toBe(false);
    });

    it('should filter "Component 5"', () => {
      expect(isMeaningfulPropName('Component 5')).toBe(false);
    });

    it('should filter "Group 88"', () => {
      expect(isMeaningfulPropName('Group 88')).toBe(false);
    });

    it('should filter Figma auto-names without space', () => {
      expect(isMeaningfulPropName('Frame1234')).toBe(false);
      expect(isMeaningfulPropName('Vector56')).toBe(false);
    });
  });

  describe('path/shape names filtered', () => {
    it('should filter "path102"', () => {
      expect(isMeaningfulPropName('path102')).toBe(false);
    });

    it('should filter "ellipse2460"', () => {
      expect(isMeaningfulPropName('ellipse2460')).toBe(false);
    });

    it('should filter "union"', () => {
      expect(isMeaningfulPropName('union')).toBe(false);
    });

    it('should filter "union1"', () => {
      expect(isMeaningfulPropName('union1')).toBe(false);
    });

    it('should filter "subtract"', () => {
      expect(isMeaningfulPropName('subtract')).toBe(false);
    });

    it('should filter "intersect"', () => {
      expect(isMeaningfulPropName('intersect')).toBe(false);
    });

    it('should filter "vector39"', () => {
      expect(isMeaningfulPropName('vector39')).toBe(false);
    });

    it('should filter "rectangle123"', () => {
      expect(isMeaningfulPropName('rectangle123')).toBe(false);
    });

    it('should filter "line45"', () => {
      expect(isMeaningfulPropName('line45')).toBe(false);
    });

    it('should filter "polygon12"', () => {
      expect(isMeaningfulPropName('polygon12')).toBe(false);
    });

    it('should filter "star8"', () => {
      expect(isMeaningfulPropName('star8')).toBe(false);
    });
  });

  describe('vector layer names filtered', () => {
    it('should filter "vector39Stroke"', () => {
      expect(isMeaningfulPropName('vector39Stroke')).toBe(false);
    });

    it('should filter "vector39Fill"', () => {
      expect(isMeaningfulPropName('vector39Fill')).toBe(false);
    });

    it('should filter "vector1stroke"', () => {
      expect(isMeaningfulPropName('vector1stroke')).toBe(false);
    });
  });

  describe('style-prefixed numbers filtered', () => {
    it('should filter "style3000"', () => {
      expect(isMeaningfulPropName('style3000')).toBe(false);
    });

    it('should filter "style2345"', () => {
      expect(isMeaningfulPropName('style2345')).toBe(false);
    });

    it('should filter "style1"', () => {
      expect(isMeaningfulPropName('style1')).toBe(false);
    });
  });

  describe('single letters filtered', () => {
    it('should filter "a"', () => {
      expect(isMeaningfulPropName('a')).toBe(false);
    });

    it('should filter "b"', () => {
      expect(isMeaningfulPropName('b')).toBe(false);
    });

    it('should filter "Z"', () => {
      expect(isMeaningfulPropName('Z')).toBe(false);
    });
  });

  describe('pure numbers filtered', () => {
    it('should filter "123"', () => {
      expect(isMeaningfulPropName('123')).toBe(false);
    });

    it('should filter "456"', () => {
      expect(isMeaningfulPropName('456')).toBe(false);
    });

    it('should filter "0"', () => {
      expect(isMeaningfulPropName('0')).toBe(false);
    });
  });

  describe('generic numbered elements filtered', () => {
    it('should filter "element1"', () => {
      expect(isMeaningfulPropName('element1')).toBe(false);
    });

    it('should filter "item2"', () => {
      expect(isMeaningfulPropName('item2')).toBe(false);
    });

    it('should filter "child3"', () => {
      expect(isMeaningfulPropName('child3')).toBe(false);
    });

    it('should filter "node99"', () => {
      expect(isMeaningfulPropName('node99')).toBe(false);
    });
  });

  describe('empty and null values filtered', () => {
    it('should filter empty string', () => {
      expect(isMeaningfulPropName('')).toBe(false);
    });

    it('should filter null-ish values', () => {
      expect(isMeaningfulPropName(null as unknown as string)).toBe(false);
      expect(isMeaningfulPropName(undefined as unknown as string)).toBe(false);
    });
  });

  describe('meaningful names kept', () => {
    it('should keep "userName"', () => {
      expect(isMeaningfulPropName('userName')).toBe(true);
    });

    it('should keep "email"', () => {
      expect(isMeaningfulPropName('email')).toBe(true);
    });

    it('should keep "submitButton"', () => {
      expect(isMeaningfulPropName('submitButton')).toBe(true);
    });

    it('should keep "headerTitle"', () => {
      expect(isMeaningfulPropName('headerTitle')).toBe(true);
    });

    it('should keep "productName"', () => {
      expect(isMeaningfulPropName('productName')).toBe(true);
    });

    it('should keep "price"', () => {
      expect(isMeaningfulPropName('price')).toBe(true);
    });

    it('should keep "description"', () => {
      expect(isMeaningfulPropName('description')).toBe(true);
    });

    it('should keep "avatar"', () => {
      expect(isMeaningfulPropName('avatar')).toBe(true);
    });

    it('should keep "profileImage"', () => {
      expect(isMeaningfulPropName('profileImage')).toBe(true);
    });

    it('should keep "CardHeader"', () => {
      expect(isMeaningfulPropName('CardHeader')).toBe(true);
    });

    it('should keep "user1Name" (meaningful context with number)', () => {
      expect(isMeaningfulPropName('user1Name')).toBe(true);
    });

    it('should keep "step2Title"', () => {
      expect(isMeaningfulPropName('step2Title')).toBe(true);
    });

    it('should keep "ab" (two letters are okay)', () => {
      expect(isMeaningfulPropName('ab')).toBe(true);
    });
  });
});

describe('shouldCreateProp', () => {
  describe('meaningless name filtering', () => {
    it('should not create prop for generic name', () => {
      const result = shouldCreateProp(
        { name: 'text', semanticType: 'Text', text: 'Hello' },
        new Map()
      );
      expect(result.create).toBe(false);
      expect(result.reason).toContain('not meaningful');
    });

    it('should not create prop for auto-generated name', () => {
      const result = shouldCreateProp(
        { name: 'Frame 123', semanticType: 'View', text: undefined },
        new Map()
      );
      expect(result.create).toBe(false);
      expect(result.reason).toContain('not meaningful');
    });
  });

  describe('duplicate detection', () => {
    it('should detect duplicate text content', () => {
      const existingProps = new Map<string, string>();
      existingProps.set('text:Hello World', 'greeting');

      const result = shouldCreateProp(
        { name: 'anotherGreeting', semanticType: 'Text', text: 'Hello World' },
        existingProps
      );

      expect(result.create).toBe(false);
      expect(result.reason).toBe('Duplicate text content');
      expect(result.existingPropName).toBe('greeting');
    });

    it('should allow unique text content', () => {
      const existingProps = new Map<string, string>();
      existingProps.set('text:Hello World', 'greeting');

      const result = shouldCreateProp(
        { name: 'farewell', semanticType: 'Text', text: 'Goodbye' },
        existingProps
      );

      expect(result.create).toBe(true);
    });
  });

  describe('structural node filtering', () => {
    it('should not create prop for structural node without text', () => {
      const result = shouldCreateProp(
        { name: 'cardContainer', semanticType: 'View', text: undefined },
        new Map()
      );
      expect(result.create).toBe(false);
      expect(result.reason).toBe('Structural node has no text content');
    });

    it('should allow Image nodes without text', () => {
      const result = shouldCreateProp(
        { name: 'profileAvatar', semanticType: 'Image', text: undefined },
        new Map()
      );
      expect(result.create).toBe(true);
    });

    it('should allow Text nodes with text', () => {
      const result = shouldCreateProp(
        { name: 'userName', semanticType: 'Text', text: 'John Doe' },
        new Map()
      );
      expect(result.create).toBe(true);
    });
  });

  describe('valid prop creation', () => {
    it('should create prop for meaningful Text node with unique content', () => {
      const result = shouldCreateProp(
        { name: 'productTitle', semanticType: 'Text', text: 'Premium Widget' },
        new Map()
      );
      expect(result.create).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should create prop for meaningful Image node', () => {
      const result = shouldCreateProp(
        { name: 'heroImage', semanticType: 'Image', text: undefined },
        new Map()
      );
      expect(result.create).toBe(true);
    });
  });
});
