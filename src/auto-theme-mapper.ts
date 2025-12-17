/**
 * Автоматический маппинг цветов Figma на тему проекта
 * Automatic Figma colors to project theme mapping
 */

import { parseThemeFile } from './theme-parser.js';
import { findClosestThemeColor } from './color-matcher.js';
import { ProjectConfig } from './config-schema.js';

/**
 * Автоматически создает маппинг Figma цветов → тема проекта
 * Automatically creates Figma colors → project theme mapping
 *
 * @param figmaColors - Массив hex цветов из Figma
 * @param config - Конфигурация проекта
 * @returns Маппинг hex → путь к токену темы
 */
export async function autoGenerateColorMappings(
  figmaColors: string[],
  config: ProjectConfig
): Promise<Record<string, string>> {
  if (!config.theme?.location) return {};

  try {
    // Путь уже должен быть абсолютным (передается из index.ts)
    // Path should already be absolute (passed from index.ts)
    const themePath = config.theme.location;

    console.error(`[DEBUG] Theme path: ${themePath}`);

    const tokens = await parseThemeFile(themePath, 'palette');
    console.error(`[DEBUG] Theme tokens parsed. Colors found: ${tokens.colors.size}`);

    const mappings: Record<string, string> = {};

    console.error(`[DEBUG] Attempting to match ${figmaColors.length} Figma colors...`);

    for (const figmaHex of figmaColors) {
      const match = findClosestThemeColor(figmaHex, tokens.colors, 0.85);
      if (match && match.confidence > 0.85) {
        // Высокая уверенность - используем токен темы
        // High confidence - use theme token
        mappings[figmaHex] = match.token.path;
        console.error(`[DEBUG] ✅ Matched ${figmaHex} → ${match.token.path} (${(match.confidence * 100).toFixed(1)}%)`);
      } else if (match) {
        console.error(`[DEBUG] ⚠️ Low confidence for ${figmaHex} → ${match.token.path} (${(match.confidence * 100).toFixed(1)}%)`);
      } else {
        console.error(`[DEBUG] ❌ No match for ${figmaHex}`);
      }
      // Низкая уверенность - оставляем как hex
      // Low confidence - keep as hex
    }

    console.error(`[DEBUG] Generated ${Object.keys(mappings).length} color mappings`);

    return mappings;
  } catch (error) {
    console.error('Error auto-generating color mappings:', error);
    return {};
  }
}

/**
 * Извлекает все уникальные цвета из Figma метаданных
 * Extracts all unique colors from Figma metadata
 *
 * @param metadata - Метаданные Figma узла
 * @returns Массив уникальных hex цветов
 */
export function extractFigmaColors(metadata: any): string[] {
  const colors = new Set<string>();

  function traverse(node: any) {
    // Извлекаем из fills
    // Extract from fills
    if (node.fills && Array.isArray(node.fills)) {
      node.fills.forEach((fill: any) => {
        if (fill.type === 'SOLID' && fill.color) {
          const hex = rgbToHex(fill.color);
          colors.add(hex);
        }
      });
    }

    // Извлекаем из backgroundColor
    // Extract from backgroundColor
    if (node.backgroundColor) {
      const hex = rgbToHex(node.backgroundColor);
      colors.add(hex);
    }

    // Рекурсивно обрабатываем детей
    // Recursively process children
    if (node.children && Array.isArray(node.children)) {
      node.children.forEach(traverse);
    }
  }

  traverse(metadata);
  return Array.from(colors);
}

/**
 * Преобразует Figma RGB в hex
 * Converts Figma RGB to hex
 *
 * @param rgb - Объект цвета Figma (r, g, b в диапазоне 0-1)
 * @returns Hex строка (например, '#7A54FF')
 */
function rgbToHex(rgb: { r: number; g: number; b: number }): string {
  const r = Math.round(rgb.r * 255);
  const g = Math.round(rgb.g * 255);
  const b = Math.round(rgb.b * 255);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
}

/**
 * Интерфейс для токена типографики из темы
 * Interface for typography token from theme
 */
interface ThemeTypographyToken {
  path: string;
  fontSize: number;
  fontWeight: number;
  lineHeight?: number;
  fontFamily?: string;
}

/**
 * Автоматически создает маппинг Figma типографики → тема проекта
 * Automatically creates Figma typography → project theme mapping
 *
 * @param figmaTypography - Массив стилей типографики из Figma
 * @param themePath - Путь к файлу типографики
 * @returns Маппинг figmaKey → путь к токену темы
 */
export async function autoGenerateTypographyMappings(
  figmaTypography: Array<{ key: string; fontSize: number; fontWeight: number; lineHeight?: number }>,
  themePath: string
): Promise<Record<string, string>> {
  try {
    const tokens = await parseThemeFile(themePath, 'typography');
    const mappings: Record<string, string> = {};

    console.error(`[DEBUG] Parsing typography from: ${themePath}`);
    // Используем typography токены (полные стили) вместо fonts
    // Use typography tokens (complete styles) instead of fonts
    console.error(`[DEBUG] Found ${tokens.typography?.size || 0} typography tokens`);

    for (const figmaStyle of figmaTypography) {
      // Ищем ближайший токен типографики по размеру и весу
      // Find closest typography token by size and weight
      const match = findClosestTypographyToken(
        figmaStyle.fontSize,
        figmaStyle.fontWeight,
        tokens.typography || new Map()
      );

      if (match && match.confidence > 0.8) {
        mappings[figmaStyle.key] = match.token.path;
        console.error(`[DEBUG] ✅ Matched ${figmaStyle.key} → ${match.token.path} (${(match.confidence * 100).toFixed(1)}%)`);
      } else if (match) {
        console.error(`[DEBUG] ⚠️ Low confidence for ${figmaStyle.key} → ${match.token.path} (${(match.confidence * 100).toFixed(1)}%)`);
      } else {
        console.error(`[DEBUG] ❌ No match for ${figmaStyle.key}`);
      }
    }

    return mappings;
  } catch (error) {
    console.error('Error auto-generating typography mappings:', error);
    return {};
  }
}

/**
 * Ищет ближайший токен типографики по размеру и весу
 * Finds closest typography token by size and weight
 */
function findClosestTypographyToken(
  fontSize: number,
  fontWeight: number,
  tokens: Map<string, any>
): { token: ThemeTypographyToken; confidence: number } | null {
  let bestMatch: { token: ThemeTypographyToken; confidence: number } | null = null;

  for (const [path, value] of tokens) {
    // Извлекаем размер и вес из значения токена
    // Extract size and weight from token value
    const tokenSize = typeof value === 'object' ? (value.fontSize || value.size) : null;
    const tokenWeight = typeof value === 'object' ? (value.fontWeight || value.weight || 400) : 400;

    if (tokenSize === null) continue;

    // Вычисляем сходство по размеру и весу
    // Calculate similarity by size and weight
    const sizeDiff = Math.abs(tokenSize - fontSize);
    const weightDiff = Math.abs(tokenWeight - fontWeight);

    // Размер в пределах 2px и вес в пределах 100 = хорошее совпадение
    // Size within 2px and weight within 100 = good match
    if (sizeDiff <= 2 && weightDiff <= 100) {
      const confidence = 1 - (sizeDiff / 10) - (weightDiff / 1000);
      if (!bestMatch || confidence > bestMatch.confidence) {
        bestMatch = {
          token: { path, fontSize: tokenSize, fontWeight: tokenWeight },
          confidence
        };
      }
    }
  }

  return bestMatch;
}

/**
 * Интерфейс для токена spacing из темы
 * Interface for spacing token from theme
 */
interface ThemeSpacingToken {
  path: string;
  value: number;
}

/**
 * Автоматически создает маппинг Figma spacing → тема проекта
 * Automatically creates Figma spacing → project theme mapping
 *
 * @param figmaSpacing - Массив значений spacing из Figma
 * @param themePath - Путь к файлу темы
 * @returns Маппинг значение → путь к токену темы
 */
export async function autoGenerateSpacingMappings(
  figmaSpacing: number[],
  themePath: string
): Promise<Record<number, string>> {
  try {
    const tokens = await parseThemeFile(themePath, 'spacing');
    const mappings: Record<number, string> = {};

    console.error(`[DEBUG] Parsing spacing from: ${themePath}`);
    console.error(`[DEBUG] Found ${tokens.spacing?.values?.length || 0} spacing values`);

    // Извлекаем spacing токены из темы
    // Extract spacing tokens from theme
    const spacingTokens = extractSpacingTokens(tokens);
    console.error(`[DEBUG] Extracted ${spacingTokens.length} spacing tokens`);

    for (const figmaValue of figmaSpacing) {
      // Ищем ближайший токен spacing по значению
      // Find closest spacing token by value
      const match = findClosestSpacingToken(figmaValue, spacingTokens);

      if (match && match.confidence > 0.85) {
        mappings[figmaValue] = match.token.path;
        console.error(`[DEBUG] ✅ Matched ${figmaValue} → ${match.token.path} (${(match.confidence * 100).toFixed(1)}%)`);
      } else if (match) {
        console.error(`[DEBUG] ⚠️ Low confidence for ${figmaValue} → ${match.token.path} (${(match.confidence * 100).toFixed(1)}%)`);
      } else {
        console.error(`[DEBUG] ❌ No match for ${figmaValue}`);
      }
    }

    console.error(`[DEBUG] Generated ${Object.keys(mappings).length} spacing mappings`);

    return mappings;
  } catch (error) {
    console.error('Error auto-generating spacing mappings:', error);
    return {};
  }
}

/**
 * Извлекает spacing токены из темы
 * Extracts spacing tokens from theme
 */
function extractSpacingTokens(tokens: any): ThemeSpacingToken[] {
  const spacingTokens: ThemeSpacingToken[] = [];

  // Используем извлеченные значения spacing из parseThemeFile
  // Use extracted spacing values from parseThemeFile
  if (tokens.spacing?.values) {
    // Эти значения уже извлечены из темы
    // These values are already extracted from theme
    return tokens.spacing.values.map((value: number, index: number) => ({
      path: `theme.spacing[${index}]`,
      value
    }));
  }

  return spacingTokens;
}

/**
 * Ищет ближайший токен spacing по значению
 * Finds closest spacing token by value
 */
function findClosestSpacingToken(
  value: number,
  tokens: ThemeSpacingToken[]
): { token: ThemeSpacingToken; confidence: number } | null {
  let bestMatch: { token: ThemeSpacingToken; confidence: number } | null = null;

  for (const token of tokens) {
    const diff = Math.abs(token.value - value);

    // Точное совпадение = 100% уверенность
    // Exact match = 100% confidence
    if (diff === 0) {
      return { token, confidence: 1.0 };
    }

    // В пределах 2px = хорошее совпадение
    // Within 2px = good match
    if (diff <= 2) {
      const confidence = 1 - (diff / 10);
      if (!bestMatch || confidence > bestMatch.confidence) {
        bestMatch = { token, confidence };
      }
    }
  }

  return bestMatch;
}

/**
 * Интерфейс для токена radii из темы
 * Interface for radii token from theme
 */
interface ThemeRadiiToken {
  path: string;
  value: number;
}

/**
 * Автоматически создает маппинг Figma radii → тема проекта
 * Automatically creates Figma radii → project theme mapping
 *
 * @param figmaRadii - Массив значений corner radius из Figma
 * @param themePath - Путь к файлу темы
 * @returns Маппинг значение → путь к токену темы
 */
export async function autoGenerateRadiiMappings(
  figmaRadii: number[],
  themePath: string
): Promise<Record<number, string>> {
  try {
    const tokens = await parseThemeFile(themePath, 'radii');
    const mappings: Record<number, string> = {};

    console.error(`[DEBUG] Parsing radii from: ${themePath}`);

    // Извлекаем radii токены из темы
    // Extract radii tokens from theme
    const radiiTokens = extractRadiiTokens(tokens);
    console.error(`[DEBUG] Extracted ${radiiTokens.length} radii tokens`);

    for (const figmaValue of figmaRadii) {
      // Ищем ближайший токен radii по значению
      // Find closest radii token by value
      const match = findClosestRadiiToken(figmaValue, radiiTokens);

      if (match && match.confidence > 0.85) {
        mappings[figmaValue] = match.token.path;
        console.error(`[DEBUG] ✅ Matched ${figmaValue} → ${match.token.path} (${(match.confidence * 100).toFixed(1)}%)`);
      } else if (match) {
        console.error(`[DEBUG] ⚠️ Low confidence for ${figmaValue} → ${match.token.path} (${(match.confidence * 100).toFixed(1)}%)`);
      } else {
        console.error(`[DEBUG] ❌ No match for ${figmaValue}`);
      }
    }

    console.error(`[DEBUG] Generated ${Object.keys(mappings).length} radii mappings`);

    return mappings;
  } catch (error) {
    console.error('Error auto-generating radii mappings:', error);
    return {};
  }
}

/**
 * Извлекает radii токены из темы (ищет border.radius, borderRadius, radii)
 * Extracts radii tokens from theme (looks for border.radius, borderRadius, radii)
 */
function extractRadiiTokens(tokens: any): ThemeRadiiToken[] {
  const radiiTokens: ThemeRadiiToken[] = [];

  // Используем извлеченные radii из parseThemeFile
  // Use extracted radii from parseThemeFile
  if (tokens.radii && tokens.radii instanceof Map) {
    for (const [path, value] of tokens.radii) {
      if (typeof value === 'number') {
        radiiTokens.push({ path, value });
      }
    }
  }

  return radiiTokens;
}

/**
 * Ищет ближайший токен radii по значению
 * Finds closest radii token by value
 */
function findClosestRadiiToken(
  value: number,
  tokens: ThemeRadiiToken[]
): { token: ThemeRadiiToken; confidence: number } | null {
  let bestMatch: { token: ThemeRadiiToken; confidence: number } | null = null;

  for (const token of tokens) {
    const diff = Math.abs(token.value - value);

    // Точное совпадение = 100% уверенность
    // Exact match = 100% confidence
    if (diff === 0) {
      return { token, confidence: 1.0 };
    }

    // В пределах 2px = хорошее совпадение
    // Within 2px = good match
    if (diff <= 2) {
      const confidence = 1 - (diff / 10);
      if (!bestMatch || confidence > bestMatch.confidence) {
        bestMatch = { token, confidence };
      }
    }
  }

  return bestMatch;
}

/**
 * Интерфейс для токена shadow из темы
 * Interface for shadow token from theme
 */
interface ThemeShadowToken {
  path: string;
  offsetX: number;
  offsetY: number;
  blur: number;
  opacity: number;
  color?: string;
}

/**
 * Интерфейс для Figma shadow
 * Interface for Figma shadow
 */
interface FigmaShadow {
  key: string;
  offset: { x: number; y: number };
  radius: number;
  opacity: number;
  color?: string;
}

/**
 * Автоматически создает маппинг Figma shadows → тема проекта
 * Automatically creates Figma shadows → project theme mapping
 *
 * @param figmaShadows - Массив теней из Figma
 * @param themePath - Путь к файлу темы
 * @returns Маппинг ключ тени → путь к токену темы
 */
export async function autoGenerateShadowMappings(
  figmaShadows: FigmaShadow[],
  themePath: string
): Promise<Record<string, string>> {
  try {
    const tokens = await parseThemeFile(themePath, 'shadows');
    const mappings: Record<string, string> = {};

    console.error(`[DEBUG] Parsing shadows from: ${themePath}`);

    // Извлекаем shadow токены из темы
    // Extract shadow tokens from theme
    const shadowTokens = extractShadowTokens(tokens);
    console.error(`[DEBUG] Extracted ${shadowTokens.length} shadow tokens`);

    for (const figmaShadow of figmaShadows) {
      // Ищем ближайший токен shadow по параметрам
      // Find closest shadow token by parameters
      const match = findClosestShadowToken(figmaShadow, shadowTokens);

      if (match && match.confidence > 0.75) {
        mappings[figmaShadow.key] = match.token.path;
        console.error(`[DEBUG] ✅ Matched ${figmaShadow.key} → ${match.token.path} (${(match.confidence * 100).toFixed(1)}%)`);
      } else if (match) {
        console.error(`[DEBUG] ⚠️ Low confidence for ${figmaShadow.key} → ${match.token.path} (${(match.confidence * 100).toFixed(1)}%)`);
      } else {
        console.error(`[DEBUG] ❌ No match for ${figmaShadow.key}`);
      }
    }

    console.error(`[DEBUG] Generated ${Object.keys(mappings).length} shadow mappings`);

    return mappings;
  } catch (error) {
    console.error('Error auto-generating shadow mappings:', error);
    return {};
  }
}

/**
 * Извлекает shadow токены из темы
 * Extracts shadow tokens from theme
 */
function extractShadowTokens(tokens: any): ThemeShadowToken[] {
  const shadowTokens: ThemeShadowToken[] = [];

  // Используем извлеченные shadows из parseThemeFile
  // Use extracted shadows from parseThemeFile
  if (tokens.shadows && tokens.shadows instanceof Map) {
    for (const [path, value] of tokens.shadows) {
      if (typeof value === 'object' && value !== null) {
        const offset = value.shadowOffset || value.offset || { width: 0, height: 0 };
        const opacity = value.shadowOpacity || value.opacity || 0;
        const blur = value.shadowRadius || value.radius || value.blur || 0;
        const color = value.shadowColor || value.color;

        shadowTokens.push({
          path,
          offsetX: offset.width || offset.x || 0,
          offsetY: offset.height || offset.y || 0,
          blur,
          opacity,
          color
        });
      }
    }
  }

  return shadowTokens;
}

/**
 * Ищет ближайший токен shadow по параметрам
 * Finds closest shadow token by parameters
 */
function findClosestShadowToken(
  shadow: FigmaShadow,
  tokens: ThemeShadowToken[]
): { token: ThemeShadowToken; confidence: number } | null {
  let bestMatch: { token: ThemeShadowToken; confidence: number } | null = null;

  for (const token of tokens) {
    // Вычисляем сходство по каждому параметру
    // Calculate similarity for each parameter
    const offsetXDiff = Math.abs(token.offsetX - shadow.offset.x);
    const offsetYDiff = Math.abs(token.offsetY - shadow.offset.y);
    const blurDiff = Math.abs(token.blur - shadow.radius);
    const opacityDiff = Math.abs(token.opacity - shadow.opacity);

    // Все параметры в разумных пределах = хорошее совпадение
    // All parameters within reasonable limits = good match
    if (offsetXDiff <= 2 && offsetYDiff <= 2 && blurDiff <= 2 && opacityDiff <= 0.1) {
      // Нормализуем разницы для вычисления confidence
      // Normalize differences for confidence calculation
      const offsetScore = 1 - (offsetXDiff + offsetYDiff) / 20;
      const blurScore = 1 - blurDiff / 10;
      const opacityScore = 1 - opacityDiff;

      // Средняя уверенность по всем параметрам
      // Average confidence across all parameters
      const confidence = (offsetScore + blurScore + opacityScore) / 3;

      if (!bestMatch || confidence > bestMatch.confidence) {
        bestMatch = { token, confidence };
      }
    }
  }

  return bestMatch;
}

/**
 * Извлекает все уникальные значения spacing из Figma метаданных
 * Extracts all unique spacing values from Figma metadata
 *
 * @param metadata - Метаданные Figma узла
 * @returns Массив уникальных числовых значений spacing
 */
export function extractFigmaSpacing(metadata: any): number[] {
  const spacingValues = new Set<number>();

  function traverse(node: any) {
    // Извлекаем padding
    // Extract padding
    if (node.paddingLeft !== undefined && node.paddingLeft > 0) spacingValues.add(node.paddingLeft);
    if (node.paddingRight !== undefined && node.paddingRight > 0) spacingValues.add(node.paddingRight);
    if (node.paddingTop !== undefined && node.paddingTop > 0) spacingValues.add(node.paddingTop);
    if (node.paddingBottom !== undefined && node.paddingBottom > 0) spacingValues.add(node.paddingBottom);

    // Извлекаем gap
    // Extract gap
    if (node.itemSpacing !== undefined && node.itemSpacing > 0) spacingValues.add(node.itemSpacing);
    if (node.counterAxisSpacing !== undefined && node.counterAxisSpacing > 0) spacingValues.add(node.counterAxisSpacing);

    // Рекурсивно обрабатываем детей
    // Recursively process children
    if (node.children && Array.isArray(node.children)) {
      node.children.forEach(traverse);
    }
  }

  traverse(metadata);
  return Array.from(spacingValues).sort((a, b) => a - b);
}

/**
 * Извлекает все уникальные значения radii из Figma метаданных
 * Extracts all unique radii values from Figma metadata
 *
 * @param metadata - Метаданные Figma узла
 * @returns Массив уникальных числовых значений radii
 */
export function extractFigmaRadii(metadata: any): number[] {
  const radiiValues = new Set<number>();

  function traverse(node: any) {
    // Извлекаем cornerRadius
    // Extract cornerRadius
    if (node.cornerRadius !== undefined && node.cornerRadius > 0) {
      radiiValues.add(node.cornerRadius);
    }

    // Извлекаем индивидуальные radii
    // Extract individual radii
    if (node.rectangleCornerRadii && Array.isArray(node.rectangleCornerRadii)) {
      node.rectangleCornerRadii.forEach((radius: number) => {
        if (radius > 0) radiiValues.add(radius);
      });
    }

    // Рекурсивно обрабатываем детей
    // Recursively process children
    if (node.children && Array.isArray(node.children)) {
      node.children.forEach(traverse);
    }
  }

  traverse(metadata);
  return Array.from(radiiValues).sort((a, b) => a - b);
}

/**
 * Извлекает все уникальные shadows из Figma метаданных
 * Extracts all unique shadows from Figma metadata
 *
 * @param metadata - Метаданные Figma узла
 * @returns Массив объектов FigmaShadow
 */
export function extractFigmaShadows(metadata: any): FigmaShadow[] {
  const shadowsMap = new Map<string, FigmaShadow>();

  function traverse(node: any) {
    if (node.effects && Array.isArray(node.effects)) {
      const shadow = node.effects.find((e: any) =>
        (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') && e.visible !== false
      );

      if (shadow) {
        const rVal = shadow.color?.r || 0;
        const gVal = shadow.color?.g || 0;
        const bVal = shadow.color?.b || 0;
        const aVal = shadow.color?.a || 0.25;
        const blurRadius = shadow.radius ?? 0;
        const shadowColor = `rgba(${Math.round(rVal * 255)}, ${Math.round(gVal * 255)}, ${Math.round(bVal * 255)}, 1)`;
        const shadowOpacity = aVal;
        const shadowRadius = Math.round(blurRadius / 2);
        const elevation = Math.max(1, Math.round(blurRadius / 2));

        const offset = shadow.offset || { x: 0, y: 0 };

        // Создаем сигнатуру для маппинга
        // Create signature for mapping
        const key = `shadowColor-${shadowColor}-shadowOpacity-${shadowOpacity}-shadowRadius-scale(${shadowRadius})-elevation-${elevation}`;

        if (!shadowsMap.has(key)) {
          shadowsMap.set(key, {
            key,
            offset: { x: offset.x || 0, y: offset.y || 0 },
            radius: shadowRadius,
            opacity: shadowOpacity,
            color: shadowColor
          });
        }
      }
    }

    // Рекурсивно обрабатываем детей
    // Recursively process children
    if (node.children && Array.isArray(node.children)) {
      node.children.forEach(traverse);
    }
  }

  traverse(metadata);
  return Array.from(shadowsMap.values());
}

/**
 * Извлекает все уникальные градиенты из Figma метаданных
 * Extracts all unique gradients from Figma metadata
 *
 * @param metadata - Метаданные Figma узла
 * @returns Массив сигнатур градиентов (строки hex цветов через запятую)
 */
export function extractFigmaGradients(metadata: any): string[] {
  const gradientSignatures = new Set<string>();

  function traverse(node: any) {
    if (node.fills && Array.isArray(node.fills)) {
      const gradientFill = node.fills.find((f: any) =>
        f.type?.startsWith('GRADIENT_') && f.visible !== false
      );

      if (gradientFill && gradientFill.gradientStops) {
        const colors = gradientFill.gradientStops.map((stop: any) => {
          const rVal = stop.color.r;
          const gVal = stop.color.g;
          const bVal = stop.color.b;
          const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
          return `#${toHex(rVal)}${toHex(gVal)}${toHex(bVal)}`.toUpperCase();
        });

        // Сигнатура: "#7A54FF,#AB5CE9"
        // Signature: "#7A54FF,#AB5CE9"
        const signature = colors.join(',');
        gradientSignatures.add(signature);
      }
    }

    // Рекурсивно обрабатываем детей
    // Recursively process children
    if (node.children && Array.isArray(node.children)) {
      node.children.forEach(traverse);
    }
  }

  traverse(metadata);
  return Array.from(gradientSignatures);
}

/**
 * Извлекает все уникальные стили типографики из Figma метаданных
 * Extracts all unique typography styles from Figma metadata
 *
 * @param metadata - Метаданные Figma узла
 * @returns Массив объектов с fontSize, fontWeight, lineHeight и key
 */
export function extractFigmaTypography(metadata: any): Array<{ key: string; fontSize: number; fontWeight: number; lineHeight?: number }> {
  const typographyMap = new Map<string, { key: string; fontSize: number; fontWeight: number; lineHeight?: number }>();

  function traverse(node: any) {
    // Извлекаем типографику из TEXT узлов
    // Extract typography from TEXT nodes
    if (node.type === 'TEXT' && node.style) {
      const fontSize = node.style.fontSize;
      const fontWeight = node.style.fontWeight || 400;
      const lineHeight = node.style.lineHeightPx;
      const fontFamily = node.style.fontFamily || 'SF Pro';

      if (fontSize) {
        // Ключ формата "FontFamily/weight/size" для маппинга
        // Key format "FontFamily/weight/size" for mapping
        const key = `${fontFamily}/${fontWeight}/${fontSize}`;

        if (!typographyMap.has(key)) {
          typographyMap.set(key, {
            key,
            fontSize,
            fontWeight,
            lineHeight,
          });
        }
      }
    }

    // Рекурсивно обрабатываем детей
    // Recursively process children
    if (node.children && Array.isArray(node.children)) {
      node.children.forEach(traverse);
    }
  }

  traverse(metadata);
  return Array.from(typographyMap.values());
}
