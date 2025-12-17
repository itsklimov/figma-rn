/**
 * Пример использования ONE-SHOT генератора
 * Example usage of ONE-SHOT generator
 */

import { generateCompleteScreen, saveGeneratedFiles, generateMultipleScreens } from '../src/one-shot-generator.js';

/**
 * Пример 1: Базовая генерация одного экрана
 * Example 1: Basic single screen generation
 */
async function example1_BasicGeneration() {
  console.log('=== Пример 1: Базовая генерация ===\n');

  const figmaToken = process.env.FIGMA_TOKEN || 'your-token-here';
  const figmaUrl = 'https://www.figma.com/file/ABC123/Project?node-id=1-234';
  const screenName = 'ProductListScreen';

  try {
    const result = await generateCompleteScreen(figmaToken, figmaUrl, screenName);

    console.log(`✓ Название экрана: ${result.screenName}`);
    console.log(`✓ Тип экрана: ${result.summary.screenType}`);
    console.log(`✓ Сгенерировано файлов: ${result.files.length}`);
    console.log(`✓ Уверенность: ${(result.summary.metadata.confidence * 100).toFixed(0)}%`);

    console.log('\nСгенерированные файлы:');
    result.files.forEach(file => {
      console.log(`  - ${file.path} (${file.type})`);
    });

    // Выводим информацию о обнаружениях
    // Display detection info
    if (result.detections.list) {
      console.log(`\nОбнаружен список:`);
      console.log(`  - Тип: ${result.detections.list.type}`);
      console.log(`  - Элементов: ${result.detections.list.itemCount}`);
      console.log(`  - Ориентация: ${result.detections.list.orientation}`);
    }

    if (result.detections.form) {
      console.log(`\nОбнаружена форма:`);
      console.log(`  - Полей: ${result.detections.form.fields.length}`);
      console.log(`  - Кнопка отправки: ${result.detections.form.hasSubmitButton ? 'да' : 'нет'}`);
    }

    if (result.detections.dataModels.length > 0) {
      console.log(`\nМодели данных:`);
      result.detections.dataModels.forEach(model => {
        console.log(`  - ${model.name} (${model.fields.length} полей)`);
      });
    }
  } catch (error) {
    console.error('Ошибка:', error);
  }
}

/**
 * Пример 2: Генерация с расширенными опциями
 * Example 2: Generation with advanced options
 */
async function example2_AdvancedOptions() {
  console.log('\n=== Пример 2: Расширенные опции ===\n');

  const figmaToken = process.env.FIGMA_TOKEN || 'your-token-here';
  const figmaUrl = 'https://www.figma.com/file/XYZ789/App?node-id=5-678';
  const screenName = 'CheckoutFormScreen';

  try {
    const result = await generateCompleteScreen(
      figmaToken,
      figmaUrl,
      screenName,
      {
        generateTypes: true,        // Генерировать TypeScript типы
        generateHooks: true,         // Генерировать React Query хуки
        detectAnimations: true,      // Обнаруживать анимации (медленнее)
        generateExtras: true,        // Генерировать дополнительные файлы
        config: {
          framework: 'react-native',
          codeStyle: {
            stylePattern: 'StyleSheet',
            scaleFunction: 'scale',
            importPrefix: '@/',
          },
          mappings: {
            colors: {
              '#7A54FF': 'palette.primary',
              '#FF5454': 'palette.error',
              '#22C55E': 'palette.success',
            },
          },
        },
      }
    );

    console.log(`✓ Сгенерировано ${result.files.length} файлов`);

    // Проверяем наличие анимаций
    // Check for animations
    if (result.summary.hasAnimations && result.detections.animations) {
      console.log('\nОбнаружены анимации:');
      console.log(`  - Переходов: ${result.detections.animations.transitions.length}`);
      console.log(`  - Областей с жестами: ${result.detections.animations.gestureAreas.length}`);
      console.log(`  - Shared elements: ${result.detections.animations.sharedElements.length}`);
    }

    // Сохраняем файлы
    // Save files
    await saveGeneratedFiles(result, './generated');
    console.log('\n✓ Файлы сохранены в ./generated');
  } catch (error) {
    console.error('Ошибка:', error);
  }
}

/**
 * Пример 3: Пакетная генерация нескольких экранов
 * Example 3: Batch generation of multiple screens
 */
async function example3_BatchGeneration() {
  console.log('\n=== Пример 3: Пакетная генерация ===\n');

  const figmaToken = process.env.FIGMA_TOKEN || 'your-token-here';

  const screens = [
    {
      url: 'https://www.figma.com/file/ABC/Project?node-id=1-1',
      name: 'HomeScreen',
    },
    {
      url: 'https://www.figma.com/file/ABC/Project?node-id=2-2',
      name: 'ProfileScreen',
    },
    {
      url: 'https://www.figma.com/file/ABC/Project?node-id=3-3',
      name: 'SettingsScreen',
    },
  ];

  try {
    console.log(`Генерация ${screens.length} экранов...`);

    const results = await generateMultipleScreens(
      figmaToken,
      screens,
      {
        generateTypes: true,
        generateHooks: true,
        detectAnimations: false, // Отключаем для скорости
      }
    );

    console.log('\n✓ Генерация завершена\n');

    // Выводим сводку по каждому экрану
    // Display summary for each screen
    results.forEach((result, index) => {
      console.log(`${index + 1}. ${result.screenName}`);
      console.log(`   - Тип: ${result.summary.screenType}`);
      console.log(`   - Файлов: ${result.files.length}`);
      console.log(`   - Уверенность: ${(result.summary.metadata.confidence * 100).toFixed(0)}%`);
    });

    // Сохраняем все файлы
    // Save all files
    for (const result of results) {
      await saveGeneratedFiles(result, './generated');
    }

    console.log('\n✓ Все файлы сохранены в ./generated');
  } catch (error) {
    console.error('Ошибка:', error);
  }
}

/**
 * Пример 4: Условная генерация на основе обнаружений
 * Example 4: Conditional generation based on detections
 */
async function example4_ConditionalGeneration() {
  console.log('\n=== Пример 4: Условная генерация ===\n');

  const figmaToken = process.env.FIGMA_TOKEN || 'your-token-here';
  const figmaUrl = 'https://www.figma.com/file/DEF/App?node-id=7-890';
  const screenName = 'DynamicScreen';

  try {
    const result = await generateCompleteScreen(figmaToken, figmaUrl, screenName);

    // Проверяем уверенность обнаружения
    // Check detection confidence
    if (result.summary.metadata.confidence < 0.5) {
      console.warn('⚠ Низкая уверенность обнаружения. Рекомендуется ручная проверка.');
    }

    // Разное поведение в зависимости от типа экрана
    // Different behavior based on screen type
    switch (result.summary.screenType) {
      case 'form':
        console.log('✓ Обнаружена форма');
        console.log(`  - Полей: ${result.detections.form?.fields.length}`);

        // Сохраняем только файлы формы
        // Save only form files
        const formFiles = result.files.filter(
          f => f.type === 'form' || f.type === 'screen'
        );

        for (const file of formFiles) {
          await saveGeneratedFiles({ ...result, files: [file] }, './generated');
        }
        break;

      case 'list':
        console.log('✓ Обнаружен список');
        console.log(`  - Элементов: ${result.detections.list?.itemCount}`);

        // Генерируем дополнительные хуки для пагинации
        // Generate additional hooks for pagination
        console.log('  - Рекомендуется добавить пагинацию');
        break;

      case 'sheet':
      case 'modal':
        console.log('✓ Обнаружен overlay');
        console.log(`  - Тип: ${result.detections.sheet?.type}`);
        console.log(`  - Snap points: ${result.detections.sheet?.snapPoints.join(', ')}`);
        break;

      default:
        console.log('✓ Обычный экран');
    }

    // Проверяем наличие моделей данных
    // Check for data models
    if (result.detections.dataModels.length > 0) {
      console.log('\n✓ Обнаружены модели данных:');
      result.detections.dataModels.forEach(model => {
        console.log(`  - ${model.name}:`);
        model.fields.slice(0, 5).forEach(field => {
          console.log(`    • ${field.name}: ${field.type}`);
        });

        if (model.fields.length > 5) {
          console.log(`    ... и еще ${model.fields.length - 5} полей`);
        }
      });
    }
  } catch (error) {
    console.error('Ошибка:', error);
  }
}

/**
 * Пример 5: Кастомная обработка результатов
 * Example 5: Custom result processing
 */
async function example5_CustomProcessing() {
  console.log('\n=== Пример 5: Кастомная обработка ===\n');

  const figmaToken = process.env.FIGMA_TOKEN || 'your-token-here';
  const figmaUrl = 'https://www.figma.com/file/GHI/Project?node-id=9-012';
  const screenName = 'CustomScreen';

  try {
    const result = await generateCompleteScreen(figmaToken, figmaUrl, screenName);

    // Модифицируем сгенерированные файлы
    // Modify generated files
    const modifiedFiles = result.files.map(file => {
      let content = file.content;

      // Добавляем кастомный импорт
      // Add custom import
      if (file.type === 'screen') {
        content = content.replace(
          "import React from 'react';",
          "import React from 'react';\nimport { useTheme } from '@/hooks/useTheme';"
        );
      }

      // Добавляем кастомные комментарии
      // Add custom comments
      content = `/**\n * Автоматически сгенерировано ONE-SHOT генератором\n * Generated: ${new Date().toISOString()}\n * Source: ${figmaUrl}\n */\n\n${content}`;

      return {
        ...file,
        content,
      };
    });

    // Группируем файлы по типу
    // Group files by type
    const filesByType = modifiedFiles.reduce((acc, file) => {
      if (!acc[file.type]) {
        acc[file.type] = [];
      }
      acc[file.type].push(file);
      return acc;
    }, {} as Record<string, typeof modifiedFiles>);

    console.log('Файлы сгруппированы по типам:');
    Object.entries(filesByType).forEach(([type, files]) => {
      console.log(`  ${type}: ${files.length} файл(ов)`);
    });

    // Создаем index файл для экспорта
    // Create index file for exports
    const indexContent = modifiedFiles
      .filter(f => f.type === 'screen' || f.type === 'types')
      .map(f => {
        const name = f.path.split('/').pop()?.replace(/\.(tsx?|js)$/, '');
        return `export * from './${name}';`;
      })
      .join('\n');

    console.log('\n✓ Создан index файл с экспортами');

    // Сохраняем модифицированные файлы
    // Save modified files
    await saveGeneratedFiles(
      { ...result, files: modifiedFiles },
      './generated'
    );

    console.log('✓ Сохранены модифицированные файлы');
  } catch (error) {
    console.error('Ошибка:', error);
  }
}

/**
 * Запуск всех примеров
 * Run all examples
 */
async function runAllExamples() {
  // await example1_BasicGeneration();
  // await example2_AdvancedOptions();
  // await example3_BatchGeneration();
  // await example4_ConditionalGeneration();
  // await example5_CustomProcessing();

  console.log('\n=== Примеры завершены ===\n');
  console.log('Раскомментируйте нужные примеры для запуска');
  console.log('Uncomment needed examples to run them');
}

// Запуск при выполнении файла напрямую
// Run when file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples().catch(console.error);
}

// Экспорт примеров для использования в других файлах
// Export examples for use in other files
export {
  example1_BasicGeneration,
  example2_AdvancedOptions,
  example3_BatchGeneration,
  example4_ConditionalGeneration,
  example5_CustomProcessing,
};
