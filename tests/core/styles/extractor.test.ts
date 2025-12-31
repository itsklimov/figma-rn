/**
 * Unit tests for the styles extractor module
 */

import { describe, it, expect } from 'vitest';
import {
  fillsToBackground,
  strokesToBorder,
  effectsToShadow,
  cornerRadiusToStyle,
  typographyToStyle,
  extractStyleFromProps,
  extractTokens,
  createEmptyStylesBundle,
} from '../../../src/core/styles/extractor.js';
import type { Fill, Stroke, Effect, TypographyInfo, ExtractedStyle } from '../../../src/core/types.js';

describe('fillsToBackground', () => {
  it('should extract solid color background', () => {
    const fills: Fill[] = [
      { type: 'solid', color: { hex: '#3b82f6', rgba: { r: 59, g: 130, b: 246, a: 1 } }, opacity: 1 },
    ];
    const result = fillsToBackground(fills);

    expect(result.backgroundColor).toBe('#3B82F6');
    expect(result.backgroundGradient).toBeUndefined();
  });

  it('should extract gradient background', () => {
    const fills: Fill[] = [
      {
        type: 'gradient',
        gradient: {
          type: 'linear',
          stops: [
            { position: 0, color: { hex: '#ff0000', rgba: { r: 255, g: 0, b: 0, a: 1 } } },
            { position: 1, color: { hex: '#0000ff', rgba: { r: 0, g: 0, b: 255, a: 1 } } },
          ],
          angle: 45,
        },
        opacity: 1,
      },
    ];
    const result = fillsToBackground(fills);

    expect(result.backgroundColor).toBeUndefined();
    expect(result.backgroundGradient).toBeDefined();
    expect(result.backgroundGradient?.type).toBe('linear');
    expect(result.backgroundGradient?.colors).toEqual(['#FF0000', '#0000FF']);
    expect(result.backgroundGradient?.positions).toEqual([0, 1]);
    expect(result.backgroundGradient?.angle).toBe(45);
  });

  it('should return empty for no fills', () => {
    const result = fillsToBackground(undefined);
    expect(result).toEqual({});
  });

  it('should skip fills with zero opacity', () => {
    const fills: Fill[] = [
      { type: 'solid', color: { hex: '#3b82f6', rgba: { r: 59, g: 130, b: 246, a: 1 } }, opacity: 0 },
    ];
    const result = fillsToBackground(fills);
    expect(result).toEqual({});
  });
});

describe('strokesToBorder', () => {
  it('should extract border from stroke', () => {
    const strokes: Stroke[] = [
      { color: { hex: '#e5e7eb', rgba: { r: 229, g: 231, b: 235, a: 1 } }, weight: 1, align: 'inside' },
    ];
    const result = strokesToBorder(strokes);

    expect(result.borderColor).toBe('#E5E7EB');
    expect(result.borderWidth).toBe(1);
  });

  it('should return empty for no strokes', () => {
    const result = strokesToBorder(undefined);
    expect(result).toEqual({});
  });
});

describe('effectsToShadow', () => {
  it('should extract drop shadow', () => {
    const effects: Effect[] = [
      {
        type: 'drop-shadow',
        color: { hex: '#00000033', rgba: { r: 0, g: 0, b: 0, a: 0.2 } },
        offset: { x: 0, y: 4 },
        radius: 8,
        spread: 0,
      },
    ];
    const result = effectsToShadow(effects);

    expect(result).toBeDefined();
    expect(result?.color).toBe('#00000033'); // Note: shadow color includes alpha, stays as input hex
    expect(result?.offsetX).toBe(0);
    expect(result?.offsetY).toBe(4);
    expect(result?.blur).toBe(8);
    expect(result?.spread).toBe(0);
  });

  it('should return undefined for no effects', () => {
    const result = effectsToShadow(undefined);
    expect(result).toBeUndefined();
  });

  it('should return undefined for non-shadow effects', () => {
    const effects: Effect[] = [
      { type: 'layer-blur', radius: 4 },
    ];
    const result = effectsToShadow(effects);
    expect(result).toBeUndefined();
  });
});

describe('cornerRadiusToStyle', () => {
  it('should return number for uniform radius', () => {
    const result = cornerRadiusToStyle(8);
    expect(result).toBe(8);
  });

  it('should return object for per-corner radius', () => {
    const result = cornerRadiusToStyle({
      topLeft: 8,
      topRight: 8,
      bottomRight: 0,
      bottomLeft: 0,
    });
    expect(result).toEqual({
      topLeft: 8,
      topRight: 8,
      bottomRight: 0,
      bottomLeft: 0,
    });
  });

  it('should return undefined for zero radius', () => {
    const result = cornerRadiusToStyle(0);
    expect(result).toBeUndefined();
  });

  it('should return undefined when undefined', () => {
    const result = cornerRadiusToStyle(undefined);
    expect(result).toBeUndefined();
  });
});

describe('typographyToStyle', () => {
  it('should extract typography style', () => {
    const typography: TypographyInfo = {
      fontFamily: 'Inter',
      fontSize: 16,
      fontWeight: 500,
      lineHeight: 24,
      letterSpacing: 0,
      textAlign: 'left',
    };
    const fills: Fill[] = [
      { type: 'solid', color: { hex: '#1f2937', rgba: { r: 31, g: 41, b: 55, a: 1 } }, opacity: 1 },
    ];
    const result = typographyToStyle(typography, fills);

    expect(result).toBeDefined();
    expect(result?.fontFamily).toBe('Inter');
    expect(result?.fontSize).toBe(16);
    expect(result?.fontWeight).toBe(500);
    expect(result?.lineHeight).toBe(24);
    expect(result?.letterSpacing).toBe(0);
    expect(result?.textAlign).toBe('left');
    expect(result?.color).toBe('#1F2937');
  });

  it('should use default color if no fills', () => {
    const typography: TypographyInfo = {
      fontFamily: 'Inter',
      fontSize: 16,
      fontWeight: 400,
      lineHeight: 24,
      letterSpacing: 0,
      textAlign: 'left',
    };
    const result = typographyToStyle(typography, undefined);

    expect(result?.color).toBe('#000000');
  });

  it('should return undefined for no typography', () => {
    const result = typographyToStyle(undefined, undefined);
    expect(result).toBeUndefined();
  });
});

describe('extractStyleFromProps', () => {
  it('should extract all style properties', () => {
    const result = extractStyleFromProps('style_1', {
      fills: [{ type: 'solid', color: { hex: '#ffffff', rgba: { r: 255, g: 255, b: 255, a: 1 } }, opacity: 1 }],
      strokes: [{ color: { hex: '#e5e7eb', rgba: { r: 229, g: 231, b: 235, a: 1 } }, weight: 1, align: 'inside' }],
      effects: [{ type: 'drop-shadow', color: { hex: '#000000', rgba: { r: 0, g: 0, b: 0, a: 0.1 } }, offset: { x: 0, y: 2 }, radius: 4, spread: 0 }],
      cornerRadius: 8,
      opacity: 0.9,
      width: 200,
      height: 100,
    });

    expect(result.id).toBe('style_1');
    expect(result.backgroundColor).toBe('#FFFFFF');
    expect(result.borderColor).toBe('#E5E7EB');
    expect(result.borderWidth).toBe(1);
    expect(result.borderRadius).toBe(8);
    expect(result.shadow).toBeDefined();
    expect(result.opacity).toBe(0.9);
    expect(result.width).toBe(200);
    expect(result.height).toBe(100);
  });

  it('should not include opacity if 1', () => {
    const result = extractStyleFromProps('style_1', {
      opacity: 1,
      width: 100,
      height: 100,
    });

    expect(result.opacity).toBeUndefined();
  });
});

describe('extractTokens', () => {
  it('should collect all unique colors', () => {
    const styles: Record<string, ExtractedStyle> = {
      s1: { id: 's1', backgroundColor: '#ff0000' },
      s2: { id: 's2', backgroundColor: '#00ff00' },
      s3: { id: 's3', backgroundColor: '#ff0000' }, // Duplicate
      s4: { id: 's4', borderColor: '#0000ff' },
    };
    const tokens = extractTokens(styles);

    expect(Object.values(tokens.colors)).toContain('#ff0000');
    expect(Object.values(tokens.colors)).toContain('#00ff00');
    expect(Object.values(tokens.colors)).toContain('#0000ff');
    // Should have 3 unique colors
    expect(Object.keys(tokens.colors)).toHaveLength(3);
  });

  it('should collect all unique radii', () => {
    const styles: Record<string, ExtractedStyle> = {
      s1: { id: 's1', borderRadius: 4 },
      s2: { id: 's2', borderRadius: 8 },
      s3: { id: 's3', borderRadius: 8 }, // Duplicate
      s4: { id: 's4', borderRadius: { topLeft: 16, topRight: 16, bottomRight: 0, bottomLeft: 0 } },
    };
    const tokens = extractTokens(styles);

    expect(Object.values(tokens.radii)).toContain(4);
    expect(Object.values(tokens.radii)).toContain(8);
    expect(Object.values(tokens.radii)).toContain(16);
  });

  it('should collect all unique typography', () => {
    const styles: Record<string, ExtractedStyle> = {
      s1: { id: 's1', typography: { fontFamily: 'Inter', fontSize: 14, fontWeight: 400, lineHeight: 20, letterSpacing: 0, textAlign: 'left', color: '#000' } },
      s2: { id: 's2', typography: { fontFamily: 'Inter', fontSize: 16, fontWeight: 500, lineHeight: 24, letterSpacing: 0, textAlign: 'left', color: '#000' } },
      s3: { id: 's3', typography: { fontFamily: 'Inter', fontSize: 14, fontWeight: 400, lineHeight: 20, letterSpacing: 0, textAlign: 'center', color: '#000' } }, // Same font spec as s1
    };
    const tokens = extractTokens(styles);

    // Should have 2 unique typography (s1 and s3 share same font spec)
    expect(Object.keys(tokens.typography)).toHaveLength(2);
  });
});

describe('createEmptyStylesBundle', () => {
  it('should create empty bundle', () => {
    const bundle = createEmptyStylesBundle();

    expect(bundle.styles).toEqual({});
    expect(bundle.tokens.colors).toEqual({});
    expect(bundle.tokens.spacing).toEqual({});
    expect(bundle.tokens.radii).toEqual({});
    expect(bundle.tokens.typography).toEqual({});
    expect(bundle.tokens.shadows).toEqual({});
  });
});
