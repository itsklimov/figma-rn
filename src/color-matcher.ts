import chroma from 'chroma-js';
import { ColorToken } from './theme-parser.js';

/**
 * Результат сопоставления цвета
 * Color matching result
 */
export interface ColorMatch {
  token: ColorToken;      // Найденный токен темы
  confidence: number;     // Уверенность совпадения (0-1)
  deltaE: number;         // Delta E расстояние (чем меньше, тем лучше)
}

/**
 * Находит ближайший цвет темы к заданному Figma цвету
 * Finds the closest theme color to a given Figma color
 *
 * Использует Delta E (CIE2000) в LAB цветовом пространстве для
 * перцептивного сопоставления цветов
 *
 * @param figmaHex - Hex цвет из Figma (например, '#FF5733')
 * @param themeColors - Map цветов темы (hex -> ColorToken)
 * @param minConfidence - Минимальная уверенность для совпадения (0-1)
 * @returns Лучшее совпадение или null
 */
export function findClosestThemeColor(
  figmaHex: string,
  themeColors: Map<string, ColorToken>,
  minConfidence: number = 0.8
): ColorMatch | null {
  try {
    // 1. Конвертируем Figma цвет в LAB пространство
    const figmaLab = chroma(figmaHex).lab();

    let bestMatch: ColorMatch | null = null;

    // 2. Вычисляем Delta E для каждого цвета темы
    for (const [hex, token] of themeColors) {
      try {
        const themeLab = chroma(hex).lab();

        // Вычисляем Delta E (Евклидово расстояние в LAB пространстве)
        // Более точный Delta E 2000 требует сложных вычислений,
        // но простое расстояние в LAB уже дает хорошее перцептивное совпадение
        const deltaE = calculateDeltaE(figmaLab, themeLab);

        // Конвертируем Delta E в уверенность (0-1)
        // Delta E < 2.3 - незаметная разница
        // Delta E < 5 - небольшая разница
        // Delta E < 10 - заметная разница
        // Delta E > 50 - совершенно разные цвета
        const confidence = deltaEToConfidence(deltaE);

        // Обновляем лучшее совпадение
        if (confidence >= minConfidence && (!bestMatch || confidence > bestMatch.confidence)) {
          bestMatch = { token, confidence, deltaE };
        }
      } catch (error) {
        // Пропускаем некорректные цвета
        console.warn(`Invalid color in theme: ${hex}`, error);
        continue;
      }
    }

    return bestMatch;
  } catch (error) {
    console.error(`Error finding closest color for ${figmaHex}:`, error);
    return null;
  }
}

/**
 * Вычисляет Delta E между двумя цветами в LAB пространстве
 * Calculates Delta E between two colors in LAB space
 *
 * Использует упрощенную формулу (Евклидово расстояние),
 * которая дает хорошее приближение для большинства случаев
 *
 * @param lab1 - Первый цвет в LAB [L, a, b]
 * @param lab2 - Второй цвет в LAB [L, a, b]
 * @returns Delta E значение
 */
function calculateDeltaE(lab1: number[], lab2: number[]): number {
  // Простая формула Delta E (CIE76)
  const deltaL = lab1[0] - lab2[0];
  const deltaA = lab1[1] - lab2[1];
  const deltaB = lab1[2] - lab2[2];

  return Math.sqrt(deltaL * deltaL + deltaA * deltaA + deltaB * deltaB);
}

/**
 * Конвертирует Delta E в уверенность (0-1)
 * Converts Delta E to confidence (0-1)
 *
 * @param deltaE - Delta E значение
 * @returns Уверенность от 0 до 1
 */
function deltaEToConfidence(deltaE: number): number {
  // Используем экспоненциальную функцию для плавного падения уверенности
  // deltaE = 0 → confidence = 1.0 (идеальное совпадение)
  // deltaE = 2.3 → confidence ≈ 0.9 (незаметная разница)
  // deltaE = 5 → confidence ≈ 0.8 (небольшая разница)
  // deltaE = 10 → confidence ≈ 0.6 (заметная разница)
  // deltaE = 50 → confidence ≈ 0.1 (очень разные цвета)
  // deltaE = 100 → confidence ≈ 0.0 (совершенно разные)

  const confidence = Math.exp(-deltaE / 20);
  return Math.max(0, Math.min(1, confidence));
}

/**
 * Сопоставляет все Figma цвета с цветами темы
 * Matches all Figma colors with theme colors
 *
 * @param figmaColors - Массив hex цветов из Figma
 * @param themeColors - Map цветов темы
 * @param minConfidence - Минимальная уверенность (по умолчанию 0.7)
 * @returns Map: figmaHex -> ColorMatch
 */
export function matchAllColors(
  figmaColors: string[],
  themeColors: Map<string, ColorToken>,
  minConfidence: number = 0.7
): Map<string, ColorMatch> {
  const matches = new Map<string, ColorMatch>();

  // Уникальные цвета (убираем дубликаты)
  const uniqueColors = Array.from(new Set(figmaColors));

  for (const figmaHex of uniqueColors) {
    const match = findClosestThemeColor(figmaHex, themeColors, minConfidence);
    if (match) {
      matches.set(figmaHex.toUpperCase(), match);
    }
  }

  return matches;
}

/**
 * Группирует цвета по схожести
 * Groups colors by similarity
 *
 * Полезно для обнаружения цветовых палитр в дизайне
 *
 * @param colors - Массив hex цветов
 * @param threshold - Порог Delta E для группировки (по умолчанию 5)
 * @returns Массив групп схожих цветов
 */
export function groupSimilarColors(
  colors: string[],
  threshold: number = 5
): string[][] {
  const groups: string[][] = [];
  const processed = new Set<string>();

  for (const color of colors) {
    if (processed.has(color)) continue;

    const group: string[] = [color];
    processed.add(color);

    try {
      const colorLab = chroma(color).lab();

      // Ищем похожие цвета
      for (const otherColor of colors) {
        if (processed.has(otherColor)) continue;

        try {
          const otherLab = chroma(otherColor).lab();
          const deltaE = calculateDeltaE(colorLab, otherLab);

          if (deltaE <= threshold) {
            group.push(otherColor);
            processed.add(otherColor);
          }
        } catch (error) {
          // Пропускаем некорректные цвета
          continue;
        }
      }

      groups.push(group);
    } catch (error) {
      // Пропускаем некорректные цвета
      continue;
    }
  }

  return groups;
}

/**
 * Анализирует цветовую палитру и возвращает статистику
 * Analyzes color palette and returns statistics
 */
export interface ColorPaletteStats {
  totalColors: number;           // Всего уникальных цветов
  matchedColors: number;          // Сопоставленных с темой
  unmatchedColors: number;        // Не сопоставленных
  averageConfidence: number;      // Средняя уверенность
  colorGroups: number;            // Количество цветовых групп
}

export function analyzeColorPalette(
  figmaColors: string[],
  themeColors: Map<string, ColorToken>,
  minConfidence: number = 0.7
): ColorPaletteStats {
  const uniqueColors = Array.from(new Set(figmaColors));
  const matches = matchAllColors(uniqueColors, themeColors, minConfidence);
  const groups = groupSimilarColors(uniqueColors);

  let totalConfidence = 0;
  for (const match of matches.values()) {
    totalConfidence += match.confidence;
  }

  return {
    totalColors: uniqueColors.length,
    matchedColors: matches.size,
    unmatchedColors: uniqueColors.length - matches.size,
    averageConfidence: matches.size > 0 ? totalConfidence / matches.size : 0,
    colorGroups: groups.length,
  };
}

/**
 * Форматирует ColorMatch для отображения
 * Formats ColorMatch for display
 */
export function formatColorMatch(match: ColorMatch): string {
  const percent = (match.confidence * 100).toFixed(1);
  const deltaE = match.deltaE.toFixed(2);
  return `${match.token.path} (confidence: ${percent}%, ΔE: ${deltaE})`;
}

/**
 * Рекомендует использовать ли токен темы или хардкод цвета
 * Recommends whether to use theme token or hardcoded color
 *
 * @param match - Результат сопоставления
 * @returns true если рекомендуется использовать токен темы
 */
export function shouldUseThemeToken(match: ColorMatch | null): boolean {
  if (!match) return false;

  // Если уверенность > 85% и Delta E < 5 - используем токен
  // Это означает что цвета практически идентичны
  return match.confidence >= 0.85 && match.deltaE < 5;
}
