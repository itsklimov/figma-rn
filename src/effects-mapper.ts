/**
 * Маппинг эффектов Figma на стили теней React Native
 * Обрабатывает DROP_SHADOW, INNER_SHADOW, LAYER_BLUR, BACKGROUND_BLUR
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
  // iOS свойства тени
  shadowColor?: string;
  shadowOffset?: { width: number; height: number };
  shadowOpacity?: number;
  shadowRadius?: number;

  // Android elevation
  elevation?: number;

  // Дополнительная информация
  hasInnerShadow?: boolean;
  innerShadowNote?: string;

  hasBlur?: boolean;
  blurRadius?: number;
  blurNote?: string;
}

/**
 * Максимальное значение Android elevation согласно Material Design
 */
const MAX_ANDROID_ELEVATION = 24;

/**
 * Вычисление Android elevation на основе свойств тени
 * Elevation примерно: (shadowRadius * 2 + shadowOffset.y) / 3
 */
function calculateElevation(radius: number, offsetY: number): number {
  const rawElevation = (radius * 2 + Math.abs(offsetY)) / 3;
  return Math.min(Math.max(Math.round(rawElevation), 0), MAX_ANDROID_ELEVATION);
}

/**
 * Маппинг массива эффектов Figma на стили тени React Native
 */
export function mapEffectsToRNStyles(effects: FigmaEffect[]): RNShadowStyles {
  const result: RNShadowStyles = {};

  if (!effects || effects.length === 0) {
    return result;
  }

  // Фильтрация видимых эффектов
  const visibleEffects = effects.filter((e) => e.visible !== false);

  // Обработка DROP_SHADOW (основная тень для RN)
  const dropShadow = visibleEffects.find((e) => e.type === 'DROP_SHADOW');
  if (dropShadow) {
    // iOS свойства тени
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
      // Figma radius соответствует iOS shadowRadius (примерно 1:1)
      result.shadowRadius = dropShadow.radius;
    }

    // Вычисление Android elevation
    const offsetY = dropShadow.offset?.y || 0;
    const radius = dropShadow.radius || 0;
    result.elevation = calculateElevation(radius, offsetY);
  }

  // Обработка INNER_SHADOW (не поддерживается нативно в RN)
  const innerShadow = visibleEffects.find((e) => e.type === 'INNER_SHADOW');
  if (innerShadow) {
    result.hasInnerShadow = true;
    result.innerShadowNote =
      'Inner shadows require custom implementation (gradient overlay or SVG)';
  }

  // Обработка LAYER_BLUR и BACKGROUND_BLUR
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
 * Форматирование стилей тени как кода React Native
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
 * Форматирование стилей тени для документации LLM
 */
export function formatShadowStylesForLLM(styles: RNShadowStyles): string {
  let output = '';

  if (!styles.shadowColor && !styles.hasInnerShadow && !styles.hasBlur) {
    return ''; // Нет эффектов
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
 * Рекурсивное извлечение эффектов из узла и сбор всех стилей тени
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
