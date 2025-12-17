/**
 * Клиент Figma Variables REST API
 * Предоставляет доступ к дизайн-токенам (цвета, числа, строки) с поддержкой режимов
 * Примечание: Variables API требует Enterprise план - корректная обработка в противном случае
 */

import https from 'https';
import { rgbaToHex } from './color-utils.js';

interface FigmaVariable {
  id: string;
  name: string;
  key: string;
  variableCollectionId: string;
  resolvedType: 'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN';
  valuesByMode: {
    [modeId: string]: any;
  };
  remote: boolean;
  description: string;
  hiddenFromPublishing: boolean;
  scopes: string[];
}

interface FigmaVariableCollection {
  id: string;
  name: string;
  key: string;
  modes: Array<{
    modeId: string;
    name: string;
  }>;
  defaultModeId: string;
  remote: boolean;
  hiddenFromPublishing: boolean;
}

interface VariablesResponse {
  status: number;
  error: boolean;
  meta: {
    variables: Record<string, FigmaVariable>;
    variableCollections: Record<string, FigmaVariableCollection>;
  };
}

export interface ColorVariable {
  name: string;
  path: string;
  hex: string;
  rgba: { r: number; g: number; b: number; a: number };
  modes: {
    [modeName: string]: {
      hex: string;
      rgba: { r: number; g: number; b: number; a: number };
    };
  };
}

export interface VariablesResult {
  success: boolean;
  isEnterprise: boolean;
  colors: ColorVariable[];
  collections: Array<{
    name: string;
    modes: string[];
    variableCount: number;
  }>;
  error?: string;
}

/**
 * Получение переменных из Figma API
 * Возвращает null если не Enterprise или API недоступен
 */
export async function fetchVariables(
  token: string,
  fileKey: string
): Promise<VariablesResponse | null> {
  return new Promise((resolve) => {
    const path = `/v1/files/${fileKey}/variables/local`;

    const options = {
      hostname: 'api.figma.com',
      path,
      headers: {
        'X-Figma-Token': token,
      },
    };

    https.get(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const json = JSON.parse(data);

          // Проверка ошибки только для Enterprise
          if (json.status === 403 || json.err) {
            console.error('[VARIABLES] Not available (requires Enterprise plan)');
            resolve(null);
            return;
          }

          resolve(json);
        } catch (error) {
          console.error('[VARIABLES] Parse error:', error);
          resolve(null);
        }
      });
    }).on('error', (err) => {
      console.error('[VARIABLES] Request error:', err);
      resolve(null);
    });
  });
}

/**
 * Обработка ответа API переменных
 */
export function processVariables(response: VariablesResponse): VariablesResult {
  const result: VariablesResult = {
    success: true,
    isEnterprise: true,
    colors: [],
    collections: [],
  };

  const { variables, variableCollections } = response.meta;

  // Обработка коллекций
  for (const collection of Object.values(variableCollections)) {
    result.collections.push({
      name: collection.name,
      modes: collection.modes.map((m) => m.name),
      variableCount: Object.values(variables).filter(
        (v) => v.variableCollectionId === collection.id
      ).length,
    });
  }

  // Обработка цветовых переменных
  for (const variable of Object.values(variables)) {
    if (variable.resolvedType !== 'COLOR') continue;

    const collection = variableCollections[variable.variableCollectionId];
    if (!collection) continue;

    const colorVar: ColorVariable = {
      name: variable.name,
      path: `${collection.name}/${variable.name}`.replace(/\s+/g, '-').toLowerCase(),
      hex: '',
      rgba: { r: 0, g: 0, b: 0, a: 1 },
      modes: {},
    };

    // Обработка каждого режима
    for (const mode of collection.modes) {
      const value = variable.valuesByMode[mode.modeId];
      if (value && typeof value === 'object' && 'r' in value) {
        const rgba = { r: value.r, g: value.g, b: value.b, a: value.a ?? 1 };
        const hex = rgbaToHex(rgba);

        colorVar.modes[mode.name] = { hex, rgba };

        // Использование режима по умолчанию для основных значений
        if (mode.modeId === collection.defaultModeId) {
          colorVar.hex = hex;
          colorVar.rgba = rgba;
        }
      }
    }

    if (colorVar.hex) {
      result.colors.push(colorVar);
    }
  }

  return result;
}

/**
 * Попытка сопоставления цвета узла с переменной
 */
export function matchColorToVariable(
  colorHex: string,
  variables: VariablesResult
): ColorVariable | null {
  const normalizedHex = colorHex.toUpperCase();

  for (const colorVar of variables.colors) {
    // Проверка режима по умолчанию
    if (colorVar.hex === normalizedHex) {
      return colorVar;
    }

    // Проверка всех режимов
    for (const mode of Object.values(colorVar.modes)) {
      if (mode.hex === normalizedHex) {
        return colorVar;
      }
    }
  }

  return null;
}

/**
 * Форматирование переменных для LLM
 */
export function formatVariablesForLLM(result: VariablesResult): string {
  let output = `# Figma Variables (Design Tokens)\n\n`;

  if (!result.success) {
    output += `⚠️ **Variables API unavailable**\n\n`;
    output += `${result.error}\n\n`;
    output += `Falling back to Delta E color matching from theme file.\n`;
    return output;
  }

  if (!result.isEnterprise) {
    output += `⚠️ **Enterprise plan required**\n\n`;
    output += `Variables API is only available on Figma Enterprise plans.\n`;
    output += `Using Delta E color matching as fallback.\n`;
    return output;
  }

  output += `✅ **Enterprise Variables API connected**\n\n`;

  // Сводка по коллекциям
  output += `## Collections\n\n`;
  for (const collection of result.collections) {
    output += `- **${collection.name}**: ${collection.variableCount} variables`;
    if (collection.modes.length > 1) {
      output += ` (modes: ${collection.modes.join(', ')})`;
    }
    output += '\n';
  }
  output += '\n';

  // Цветовые токены
  if (result.colors.length > 0) {
    output += `## Color Tokens (${result.colors.length})\n\n`;
    output += `| Token Path | Default | Modes |\n`;
    output += `|------------|---------|-------|\n`;

    for (const color of result.colors.slice(0, 50)) {
      const modeValues = Object.entries(color.modes)
        .map(([mode, val]) => `${mode}: ${val.hex}`)
        .join(', ');
      output += `| \`${color.path}\` | ${color.hex} | ${modeValues} |\n`;
    }

    if (result.colors.length > 50) {
      output += `\n_...and ${result.colors.length - 50} more colors_\n`;
    }
  }

  return output;
}

/**
 * Главная функция: получение переменных с корректной обработкой fallback
 */
export async function getVariablesWithFallback(
  token: string,
  fileKey: string
): Promise<VariablesResult> {
  console.error('[VARIABLES] Attempting to fetch Figma variables...');

  const response = await fetchVariables(token, fileKey);

  if (!response) {
    return {
      success: false,
      isEnterprise: false,
      colors: [],
      collections: [],
      error: 'Variables API not available (requires Figma Enterprise plan)',
    };
  }

  return processVariables(response);
}
