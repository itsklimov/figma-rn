/**
 * Map Figma effects to React Native shadow styles
 * Handles DROP_SHADOW, INNER_SHADOW, LAYER_BLUR, BACKGROUND_BLUR
 */

import { rgbaToHex } from './color-utils.js';

interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface FigmaEffect {
  type: string;
  visible?: boolean;
  color?: FigmaColor;
  offset?: { x: number; y: number };
  radius?: number;
  spread?: number;
  blendMode?: string;
}

export interface RNShadowStyles {
  // iOS shadow properties
  shadowColor?: string;
  shadowOffset?: { width: number; height: number };
  shadowOpacity?: number;
  shadowRadius?: number;

  // Android elevation
  elevation?: number;

  // Additional information
  hasInnerShadow?: boolean;
  innerShadowNote?: string;

  hasBlur?: boolean;
  blurRadius?: number;
  blurNote?: string;
}

/**
 * Maximum Android elevation value according to Material Design
 */
const MAX_ANDROID_ELEVATION = 24;

/**
 * Calculate Android elevation based on shadow properties
 * Elevation approximately: (shadowRadius * 2 + shadowOffset.y) / 3
 */
function calculateElevation(radius: number, offsetY: number): number {
  const rawElevation = (radius * 2 + Math.abs(offsetY)) / 3;
  return Math.min(Math.max(Math.round(rawElevation), 0), MAX_ANDROID_ELEVATION);
}

/**
 * Map Figma effects array to React Native shadow styles
 */
export function mapEffectsToRNStyles(effects: FigmaEffect[]): RNShadowStyles {
  const result: RNShadowStyles = {};

  if (!effects || effects.length === 0) {
    return result;
  }

  // Filter visible effects
  const visibleEffects = effects.filter((e) => e.visible !== false);

  // Process DROP_SHADOW (main shadow for RN)
  const dropShadow = visibleEffects.find((e) => e.type === 'DROP_SHADOW');
  if (dropShadow) {
    // iOS shadow properties
    if (dropShadow.color) {
      result.shadowColor = rgbaToHex(dropShadow.color);
      result.shadowOpacity = dropShadow.color.a;
    }

    if (dropShadow.offset) {
      result.shadowOffset = {
        width: dropShadow.offset.x,
        height: dropShadow.offset.y,
      };
    }

    if (dropShadow.radius !== undefined) {
      // Figma radius corresponds to iOS shadowRadius (approximately 1:1)
      result.shadowRadius = dropShadow.radius;
    }

    // Calculate Android elevation
    const offsetY = dropShadow.offset?.y || 0;
    const radius = dropShadow.radius || 0;
    result.elevation = calculateElevation(radius, offsetY);
  }

  // Process INNER_SHADOW (not natively supported in RN)
  const innerShadow = visibleEffects.find((e) => e.type === 'INNER_SHADOW');
  if (innerShadow) {
    result.hasInnerShadow = true;
    result.innerShadowNote =
      'Inner shadows require custom implementation (gradient overlay or SVG)';
  }

  // Process LAYER_BLUR and BACKGROUND_BLUR
  const blur = visibleEffects.find(
    (e) => e.type === 'LAYER_BLUR' || e.type === 'BACKGROUND_BLUR'
  );
  if (blur) {
    result.hasBlur = true;
    result.blurRadius = blur.radius;
    result.blurNote =
      blur.type === 'BACKGROUND_BLUR'
        ? 'Use react-native-blur or expo-blur for background blur'
        : 'Layer blur requires react-native-blur or custom implementation';
  }

  return result;
}

/**
 * Format shadow styles as React Native code
 */
export function formatShadowStylesAsCode(styles: RNShadowStyles): string {
  const lines: string[] = [];

  if (styles.shadowColor) {
    lines.push(`shadowColor: '${styles.shadowColor}',`);
  }

  if (styles.shadowOffset) {
    lines.push(
      `shadowOffset: { width: ${styles.shadowOffset.width}, height: ${styles.shadowOffset.height} },`
    );
  }

  if (styles.shadowOpacity !== undefined) {
    lines.push(`shadowOpacity: ${styles.shadowOpacity.toFixed(2)},`);
  }

  if (styles.shadowRadius !== undefined) {
    lines.push(`shadowRadius: ${styles.shadowRadius},`);
  }

  if (styles.elevation !== undefined) {
    lines.push(`elevation: ${styles.elevation}, // Android`);
  }

  return lines.join('\n');
}

/**
 * Format shadow styles for LLM documentation
 */
export function formatShadowStylesForLLM(styles: RNShadowStyles): string {
  let output = '';

  if (!styles.shadowColor && !styles.hasInnerShadow && !styles.hasBlur) {
    return ''; // No effects
  }

  output += '## Shadow Effects\n\n';

  if (styles.shadowColor) {
    output += '### Drop Shadow (iOS + Android)\n\n';
    output += '```typescript\n';
    output += formatShadowStylesAsCode(styles);
    output += '\n```\n\n';
  }

  if (styles.hasInnerShadow) {
    output += '### ⚠️ Inner Shadow\n\n';
    output += `${styles.innerShadowNote}\n\n`;
  }

  if (styles.hasBlur) {
    output += '### ⚠️ Blur Effect\n\n';
    output += `Blur radius: ${styles.blurRadius}px\n`;
    output += `${styles.blurNote}\n\n`;
  }

  return output;
}

/**
 * Recursively extract effects from node and collect all shadow styles
 */
export function extractAllEffects(node: any): Map<string, RNShadowStyles> {
  const effectsMap = new Map<string, RNShadowStyles>();

  function traverse(n: any) {
    if (n.effects && n.effects.length > 0) {
      const styles = mapEffectsToRNStyles(n.effects);
      if (Object.keys(styles).length > 0) {
        effectsMap.set(n.name || n.id, styles);
      }
    }

    if (n.children) {
      for (const child of n.children) {
        traverse(child);
      }
    }
  }

  traverse(node);
  return effectsMap;
}
