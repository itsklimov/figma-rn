/**
 * Персистентность автоматически сгенерированных маппингов в .figmarc.json
 * Persistence of auto-generated mappings to .figmarc.json
 */

import { readFile, writeFile } from 'fs/promises';
import { cosmiconfig } from 'cosmiconfig';
import { ProjectConfig } from './config-schema.js';

/**
 * Обновляет .figmarc.json с новыми маппингами
 * Updates .figmarc.json with new mappings
 *
 * @param newMappings - Новые маппинги цветов и шрифтов
 * @returns Путь к обновленному файлу конфигурации или null если не удалось
 */
export async function updateConfigMappings(
  newMappings: {
    colors?: Record<string, string>;
    fonts?: Record<string, string>;
  }
): Promise<string | null> {

  // 1. Используем cosmiconfig для поиска конфигурации
  // Use cosmiconfig to find configuration
  const explorer = cosmiconfig('figma', {
    searchPlaces: [
      '.figmarc.json',
      '.figmarc.js',
      'figma.config.js',
      '.config/figma.json'
    ]
  });

  const result = await explorer.search();

  if (!result) {
    console.error('⚠️  No .figmarc.json found, cannot update mappings');
    return null;
  }

  // 2. Только .json файлы можем обновлять (не .js)
  // Only .json files can be updated (not .js)
  if (!result.filepath.endsWith('.json')) {
    console.error('⚠️  Config file is not JSON, cannot auto-update:', result.filepath);
    console.error('💡 Manually add mappings to your config file:');
    console.error(JSON.stringify({ mappings: newMappings }, null, 2));
    return null;
  }

  // 3. Загружаем текущую конфигурацию
  // Load current configuration
  const config: ProjectConfig = result.config;

  // 4. Подсчитываем количество новых маппингов
  // Count number of new mappings
  let newColorsCount = 0;
  let newFontsCount = 0;

  // 5. Объединяем маппинги (не перезаписываем существующие)
  // Merge mappings (don't overwrite existing)
  if (!config.mappings) config.mappings = {};

  if (newMappings.colors) {
    if (!config.mappings.colors) config.mappings.colors = {};

    for (const [key, value] of Object.entries(newMappings.colors)) {
      if (!config.mappings.colors[key]) {
        config.mappings.colors[key] = value;
        newColorsCount++;
      }
    }
  }

  if (newMappings.fonts) {
    if (!config.mappings.fonts) config.mappings.fonts = {};

    for (const [key, value] of Object.entries(newMappings.fonts)) {
      if (!config.mappings.fonts[key]) {
        config.mappings.fonts[key] = value;
        newFontsCount++;
      }
    }
  }

  // 6. Если нет новых маппингов, пропускаем запись
  // Skip writing if no new mappings
  if (newColorsCount === 0 && newFontsCount === 0) {
    console.error('ℹ️  No new mappings to add (all already exist)');
    return result.filepath;
  }

  // 7. Сохраняем обратно в файл
  // Save back to file
  await writeFile(result.filepath, JSON.stringify(config, null, 2), 'utf-8');

  console.error(`✅ Updated mappings in ${result.filepath}`);
  if (newColorsCount > 0) {
    console.error(`   Colors: +${newColorsCount} new mappings`);
  }
  if (newFontsCount > 0) {
    console.error(`   Fonts: +${newFontsCount} new mappings`);
  }

  return result.filepath;
}

/**
 * Проверяет существует ли конфигурация с маппингами
 * Checks if configuration with mappings exists
 *
 * @returns true если есть конфигурация с маппингами цветов
 */
export async function hasMappings(): Promise<boolean> {
  const explorer = cosmiconfig('figma', {
    searchPlaces: [
      '.figmarc.json',
      '.figmarc.js',
      'figma.config.js',
      '.config/figma.json'
    ]
  });

  const result = await explorer.search();

  if (!result) return false;

  const config: ProjectConfig = result.config;
  return !!(config.mappings?.colors && Object.keys(config.mappings.colors).length > 0);
}

/**
 * Получает текущие маппинги из конфигурации
 * Gets current mappings from configuration
 *
 * @returns Объект с маппингами или undefined если не найдены
 */
export async function getCurrentMappings(): Promise<{
  colors?: Record<string, string>;
  fonts?: Record<string, string>;
} | undefined> {
  const explorer = cosmiconfig('figma', {
    searchPlaces: [
      '.figmarc.json',
      '.figmarc.js',
      'figma.config.js',
      '.config/figma.json'
    ]
  });

  const result = await explorer.search();

  if (!result) return undefined;

  const config: ProjectConfig = result.config;
  return config.mappings;
}
