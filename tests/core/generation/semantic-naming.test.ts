import { describe, it, expect } from 'vitest';
import {
  detectContentPattern,
  isGenericFigmaName,
} from '../../../src/core/generation/semantic-naming.js';

describe('semantic-naming', () => {
  describe('detectContentPattern', () => {
    describe('edge cases', () => {
      it('should return null for empty string', () => {
        expect(detectContentPattern('')).toBeNull();
      });

      it('should return null for whitespace only', () => {
        expect(detectContentPattern('   ')).toBeNull();
        expect(detectContentPattern('\t\n')).toBeNull();
      });

      it('should return null for null/undefined', () => {
        expect(detectContentPattern(null as unknown as string)).toBeNull();
        expect(detectContentPattern(undefined as unknown as string)).toBeNull();
      });

      it('should return null for non-string values', () => {
        expect(detectContentPattern(123 as unknown as string)).toBeNull();
        expect(detectContentPattern({} as unknown as string)).toBeNull();
      });

      it('should return null for plain text without patterns', () => {
        expect(detectContentPattern('Hello World')).toBeNull();
        expect(detectContentPattern('Some description text')).toBeNull();
      });
    });

    describe('price pattern', () => {
      it('should detect prices with ruble symbol', () => {
        expect(detectContentPattern('1 000 ₽')).toBe('price');
        expect(detectContentPattern('₽500')).toBe('price');
        expect(detectContentPattern('99.99₽')).toBe('price');
      });

      it('should detect prices with dollar symbol', () => {
        expect(detectContentPattern('$100')).toBe('price');
        expect(detectContentPattern('$1,000.00')).toBe('price');
        expect(detectContentPattern('100$')).toBe('price');
      });

      it('should detect prices with euro symbol', () => {
        expect(detectContentPattern('100€')).toBe('price');
        expect(detectContentPattern('€50.00')).toBe('price');
      });

      it('should detect prices with other currency symbols', () => {
        expect(detectContentPattern('£99')).toBe('price');
        expect(detectContentPattern('¥1000')).toBe('price');
        expect(detectContentPattern('₴500')).toBe('price');
        expect(detectContentPattern('₸1000')).toBe('price');
        expect(detectContentPattern('₿0.5')).toBe('price');
      });

      it('should not detect currency symbol without number', () => {
        expect(detectContentPattern('$')).toBeNull();
        expect(detectContentPattern('₽')).toBeNull();
      });
    });

    describe('amount pattern (signed numbers)', () => {
      it('should detect positive amounts', () => {
        expect(detectContentPattern('+30')).toBe('amount');
        expect(detectContentPattern('+1 300')).toBe('amount');
        expect(detectContentPattern('+ 500')).toBe('amount');
      });

      it('should detect negative amounts', () => {
        expect(detectContentPattern('-30')).toBe('amount');
        expect(detectContentPattern('- 3 000')).toBe('amount');
        expect(detectContentPattern('-100')).toBe('amount');
      });

      it('should detect amounts with unicode minus', () => {
        expect(detectContentPattern('−500')).toBe('amount');
        expect(detectContentPattern('− 1 000')).toBe('amount');
      });

      it('should detect amounts with non-breaking spaces', () => {
        expect(detectContentPattern('+1\u00A0000')).toBe('amount');
      });
    });

    describe('cardBrand pattern', () => {
      it('should detect Visa variations', () => {
        expect(detectContentPattern('Visa')).toBe('cardBrand');
        expect(detectContentPattern('VISA')).toBe('cardBrand');
      });

      it('should detect MasterCard variations', () => {
        expect(detectContentPattern('MasterCard')).toBe('cardBrand');
        expect(detectContentPattern('Mastercard')).toBe('cardBrand');
        expect(detectContentPattern('MASTERCARD')).toBe('cardBrand');
      });

      it('should detect Cyrillic payment brands', () => {
        expect(detectContentPattern('МИР')).toBe('cardBrand');
        expect(detectContentPattern('СБП')).toBe('cardBrand');
      });

      it('should detect other payment brands', () => {
        expect(detectContentPattern('Maestro')).toBe('cardBrand');
        expect(detectContentPattern('UnionPay')).toBe('cardBrand');
        expect(detectContentPattern('AmEx')).toBe('cardBrand');
        expect(detectContentPattern('American Express')).toBe('cardBrand');
        expect(detectContentPattern('JCB')).toBe('cardBrand');
      });

      it('should not detect partial brand matches', () => {
        expect(detectContentPattern('Visa Card')).toBeNull();
        expect(detectContentPattern('My Visa')).toBeNull();
      });
    });

    describe('cardLastDigits pattern', () => {
      it('should detect masked card numbers with bullets', () => {
        expect(detectContentPattern('••••1234')).toBe('cardLastDigits');
        expect(detectContentPattern('•••• 5678')).toBe('cardLastDigits');
      });

      it('should detect masked card numbers with dots', () => {
        expect(detectContentPattern('····1234')).toBe('cardLastDigits');
      });

      it('should detect masked card numbers with asterisks', () => {
        expect(detectContentPattern('****1234')).toBe('cardLastDigits');
        expect(detectContentPattern('**** 5678')).toBe('cardLastDigits');
      });

      it('should detect just 4 digits', () => {
        expect(detectContentPattern('1234')).toBe('cardLastDigits');
        expect(detectContentPattern('9999')).toBe('cardLastDigits');
      });

      it('should not detect more or less than 4 digits', () => {
        expect(detectContentPattern('123')).toBeNull();
        expect(detectContentPattern('12345')).toBeNull();
      });
    });

    describe('date pattern (Cyrillic)', () => {
      it('should detect dates with Cyrillic months', () => {
        expect(detectContentPattern('15 января')).toBe('date');
        expect(detectContentPattern('1 февраля 2024')).toBe('date');
        expect(detectContentPattern('31 декабря')).toBe('date');
      });

      it('should detect dates with various Cyrillic month forms', () => {
        expect(detectContentPattern('5 марта')).toBe('date');
        expect(detectContentPattern('20 апреля')).toBe('date');
        expect(detectContentPattern('10 мая')).toBe('date');
        expect(detectContentPattern('15 июня')).toBe('date');
        expect(detectContentPattern('1 июля')).toBe('date');
        expect(detectContentPattern('25 августа')).toBe('date');
        expect(detectContentPattern('30 сентября')).toBe('date');
        expect(detectContentPattern('12 октября')).toBe('date');
        expect(detectContentPattern('7 ноября')).toBe('date');
      });
    });

    describe('date pattern (Latin)', () => {
      it('should detect dates with full month names', () => {
        expect(detectContentPattern('January 15')).toBe('date');
        expect(detectContentPattern('15 February 2024')).toBe('date');
        expect(detectContentPattern('December 31')).toBe('date');
      });

      it('should detect dates with abbreviated month names', () => {
        expect(detectContentPattern('Jan 15')).toBe('date');
        expect(detectContentPattern('15 Feb')).toBe('date');
        expect(detectContentPattern('Mar 1, 2024')).toBe('date');
        expect(detectContentPattern('Sept 30')).toBe('date');
      });

      it('should be case insensitive', () => {
        expect(detectContentPattern('JANUARY 1')).toBe('date');
        expect(detectContentPattern('january 1')).toBe('date');
      });
    });

    describe('phone pattern', () => {
      it('should detect international phone numbers', () => {
        expect(detectContentPattern('+1 234 567 8901')).toBe('phone');
        expect(detectContentPattern('+7 (999) 123-45-67')).toBe('phone');
        expect(detectContentPattern('+380 50 123 4567')).toBe('phone');
      });

      it('should detect phone numbers with various formats', () => {
        expect(detectContentPattern('+1-234-567-8901')).toBe('phone');
        expect(detectContentPattern('+7 999 123 45 67')).toBe('phone');
        expect(detectContentPattern('+44 20 7946 0958')).toBe('phone');
      });

      it('should not detect numbers without + prefix', () => {
        expect(detectContentPattern('1234567890')).toBeNull();
        expect(detectContentPattern('(999) 123-4567')).toBeNull();
      });

      it('should not detect too short phone numbers', () => {
        expect(detectContentPattern('+12345')).toBeNull();
      });
    });

    describe('percentage pattern', () => {
      it('should detect simple percentages', () => {
        expect(detectContentPattern('50%')).toBe('percentage');
        expect(detectContentPattern('100%')).toBe('percentage');
        expect(detectContentPattern('0%')).toBe('percentage');
      });

      it('should detect decimal percentages', () => {
        expect(detectContentPattern('99.9%')).toBe('percentage');
        expect(detectContentPattern('0.5%')).toBe('percentage');
        expect(detectContentPattern('12,5%')).toBe('percentage');
      });

      it('should detect percentages with spaces', () => {
        expect(detectContentPattern('1 000%')).toBe('percentage');
      });

      it('should not detect percent sign without number', () => {
        expect(detectContentPattern('%')).toBeNull();
      });
    });

    describe('pattern priority', () => {
      it('should prioritize price over percentage when currency present', () => {
        expect(detectContentPattern('$50%')).toBe('price');
      });

      it('should match first applicable pattern', () => {
        // +100 matches amount pattern
        expect(detectContentPattern('+100')).toBe('amount');
      });
    });
  });

  describe('isGenericFigmaName', () => {
    describe('generic Figma names', () => {
      it('should detect Frame names', () => {
        expect(isGenericFigmaName('Frame')).toBe(true);
        expect(isGenericFigmaName('Frame 1')).toBe(true);
        expect(isGenericFigmaName('Frame 123')).toBe(true);
        expect(isGenericFigmaName('frame')).toBe(true);
        expect(isGenericFigmaName('FRAME 5')).toBe(true);
      });

      it('should detect Rectangle names', () => {
        expect(isGenericFigmaName('Rectangle')).toBe(true);
        expect(isGenericFigmaName('Rectangle 1')).toBe(true);
        expect(isGenericFigmaName('rectangle 99')).toBe(true);
      });

      it('should detect other shape names', () => {
        expect(isGenericFigmaName('Ellipse')).toBe(true);
        expect(isGenericFigmaName('Ellipse 2')).toBe(true);
        expect(isGenericFigmaName('Polygon 1')).toBe(true);
        expect(isGenericFigmaName('Star 3')).toBe(true);
        expect(isGenericFigmaName('Line 1')).toBe(true);
      });

      it('should detect Group names', () => {
        expect(isGenericFigmaName('Group')).toBe(true);
        expect(isGenericFigmaName('Group 1')).toBe(true);
      });

      it('should detect Vector names', () => {
        expect(isGenericFigmaName('Vector')).toBe(true);
        expect(isGenericFigmaName('Vector 5')).toBe(true);
      });

      it('should detect Text names', () => {
        expect(isGenericFigmaName('Text')).toBe(true);
        expect(isGenericFigmaName('Text 1')).toBe(true);
      });

      it('should detect Component and Instance names', () => {
        expect(isGenericFigmaName('Component')).toBe(true);
        expect(isGenericFigmaName('Component 1')).toBe(true);
        expect(isGenericFigmaName('Instance')).toBe(true);
        expect(isGenericFigmaName('Instance 2')).toBe(true);
      });

      it('should detect boolean operation names', () => {
        expect(isGenericFigmaName('Union')).toBe(true);
        expect(isGenericFigmaName('Subtract 1')).toBe(true);
        expect(isGenericFigmaName('Intersect')).toBe(true);
        expect(isGenericFigmaName('Exclude 2')).toBe(true);
      });

      it('should detect other generic names', () => {
        expect(isGenericFigmaName('Slice 1')).toBe(true);
        expect(isGenericFigmaName('Image')).toBe(true);
        expect(isGenericFigmaName('Shape 3')).toBe(true);
        expect(isGenericFigmaName('Layer 1')).toBe(true);
      });
    });

    describe('non-generic names', () => {
      it('should not flag semantic names', () => {
        expect(isGenericFigmaName('Header')).toBe(false);
        expect(isGenericFigmaName('ProductCard')).toBe(false);
        expect(isGenericFigmaName('LoginButton')).toBe(false);
        expect(isGenericFigmaName('UserAvatar')).toBe(false);
      });

      it('should not flag names with Frame as part of word', () => {
        expect(isGenericFigmaName('FrameLayout')).toBe(false);
        expect(isGenericFigmaName('MainFrame')).toBe(false);
        expect(isGenericFigmaName('ImageFrame')).toBe(false);
      });

      it('should not flag descriptive layer names', () => {
        expect(isGenericFigmaName('price-label')).toBe(false);
        expect(isGenericFigmaName('nav-icon')).toBe(false);
        expect(isGenericFigmaName('card_container')).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should return true for empty string', () => {
        expect(isGenericFigmaName('')).toBe(true);
      });

      it('should return true for whitespace only', () => {
        expect(isGenericFigmaName('   ')).toBe(true);
      });

      it('should return true for null/undefined', () => {
        expect(isGenericFigmaName(null as unknown as string)).toBe(true);
        expect(isGenericFigmaName(undefined as unknown as string)).toBe(true);
      });

      it('should handle names with extra whitespace', () => {
        expect(isGenericFigmaName('  Frame 1  ')).toBe(true);
        expect(isGenericFigmaName('  Header  ')).toBe(false);
      });
    });
  });
});
