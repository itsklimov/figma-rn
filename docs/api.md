# Internal API Reference

> **Note:** This document describes the internal TypeScript API for direct programmatic usage.
> For MCP tool usage via Claude, see the [README](../README.md).

The ONE-SHOT generator combines all pattern detection and code generation steps into a single function call.

## Основные возможности

- ✅ **Один вызов API Figma** - все данные загружаются один раз
- ✅ **Параллельное обнаружение** - все детекторы работают одновременно
- ✅ **Автоматическое определение типа экрана** - форма, список, sheet, modal или обычный экран
- ✅ **Полный набор файлов** - компоненты, типы, хуки, схемы, анимации
- ✅ **Поддержка русских комментариев** - все комментарии на русском языке

## Быстрый старт

### Базовое использование

```typescript
import { generateCompleteScreen } from './one-shot-generator.js';

const result = await generateCompleteScreen(
  'your-figma-token',
  'https://www.figma.com/file/ABC123/Project?node-id=1-234',
  'ProductListScreen'
);

console.log(`Сгенерировано файлов: ${result.files.length}`);
console.log(`Тип экрана: ${result.summary.screenType}`);
console.log(`Уверенность: ${result.summary.metadata.confidence}`);
```

### С расширенными опциями

```typescript
const result = await generateCompleteScreen(
  'your-figma-token',
  figmaUrl,
  'CheckoutFormScreen',
  {
    generateTypes: true,       // Генерировать TypeScript типы
    generateHooks: true,        // Генерировать React Query хуки
    detectAnimations: true,     // Обнаруживать анимации (медленнее)
    generateExtras: true,       // Генерировать дополнительные файлы
    config: customConfig,       // Пользовательская конфигурация
  }
);
```

### Сохранение файлов на диск

```typescript
import { generateCompleteScreen, saveGeneratedFiles } from './one-shot-generator.js';

const result = await generateCompleteScreen(token, url, 'MyScreen');

// Сохраняем все файлы в текущую директорию
await saveGeneratedFiles(result);

// Или в конкретную директорию
await saveGeneratedFiles(result, '/path/to/project');
```

### Пакетная генерация нескольких экранов

```typescript
import { generateMultipleScreens, saveGeneratedFiles } from './one-shot-generator.js';

const screens = [
  { url: 'https://figma.com/file/.../node-id=1-1', name: 'HomeScreen' },
  { url: 'https://figma.com/file/.../node-id=2-2', name: 'ProfileScreen' },
  { url: 'https://figma.com/file/.../node-id=3-3', name: 'SettingsScreen' },
];

const results = await generateMultipleScreens(token, screens, {
  generateTypes: true,
  generateHooks: true,
});

// Сохраняем файлы всех экранов
for (const result of results) {
  await saveGeneratedFiles(result);
}
```

## Структура результата

### OneShotResult

```typescript
interface OneShotResult {
  screenName: string;              // Название экрана
  files: GeneratedFile[];          // Сгенерированные файлы
  detections: DetectionResults;    // Результаты обнаружения
  summary: GenerationSummary;      // Резюме генерации
}
```

### GeneratedFile

```typescript
interface GeneratedFile {
  path: string;     // Путь к файлу (например, 'src/screens/HomeScreen.tsx')
  content: string;  // Содержимое файла
  type: 'screen' | 'types' | 'hooks' | 'form' | 'styles' | 'animations' | 'gestures';
}
```

### DetectionResults

```typescript
interface DetectionResults {
  list: ListPatternDetection | null;      // Обнаружение списка
  form: FormDetection | null;              // Обнаружение формы
  sheet: SheetDetection | null;            // Обнаружение sheet/modal
  variants: VariantDetection | null;       // Обнаружение вариантов
  animations: AnimationHint | null;        // Подсказки по анимациям
  dataModels: DataModel[];                 // Модели данных
}
```

### GenerationSummary

```typescript
interface GenerationSummary {
  screenType: 'list' | 'form' | 'sheet' | 'modal' | 'action-sheet' | 'regular';
  hasAnimations: boolean;
  hasDataModels: boolean;
  componentMatches: string[];
  metadata: {
    formFieldsCount?: number;
    listItemsCount?: number;
    confidence: number;  // 0-1
  };
}
```

## Примеры использования по типам экранов

### Списочный экран (List)

```typescript
const result = await generateCompleteScreen(
  token,
  'https://figma.com/file/.../node-id=products-list',
  'ProductListScreen'
);

// Сгенерированные файлы:
// - src/screens/ProductListScreen.tsx (FlatList компонент)
// - src/types/ProductListScreenTypes.ts (Product интерфейс)
// - src/hooks/useProductListScreenData.ts (useProducts хук)

console.log(result.summary.screenType);  // 'list'
console.log(result.detections.list?.itemCount);  // количество элементов
console.log(result.detections.list?.orientation);  // 'vertical' | 'horizontal'
```

### Экран формы (Form)

```typescript
const result = await generateCompleteScreen(
  token,
  'https://figma.com/file/.../node-id=checkout-form',
  'CheckoutFormScreen'
);

// Сгенерированные файлы:
// - src/screens/CheckoutFormScreen.tsx (форма с react-hook-form)
// - src/schemas/CheckoutFormScreenSchema.ts (Zod схема валидации)
// - src/hooks/useCheckoutFormScreen.ts (хук управления формой)
// - src/types/CheckoutFormScreenTypes.ts (типы данных)

console.log(result.summary.screenType);  // 'form'
console.log(result.detections.form?.fields.length);  // количество полей
console.log(result.detections.form?.hasSubmitButton);  // true/false
```

### Bottom Sheet / Modal

```typescript
const result = await generateCompleteScreen(
  token,
  'https://figma.com/file/.../node-id=filter-sheet',
  'FilterBottomSheet'
);

// Сгенерированные файлы:
// - src/components/FilterBottomSheet.tsx (@gorhom/bottom-sheet)

console.log(result.summary.screenType);  // 'sheet' | 'modal'
console.log(result.detections.sheet?.snapPoints);  // ['25%', '50%', '90%']
console.log(result.detections.sheet?.hasDragHandle);  // true/false
```

### Action Sheet

```typescript
const result = await generateCompleteScreen(
  token,
  'https://figma.com/file/.../node-id=actions-menu',
  'ActionsMenu'
);

// Сгенерированные файлы:
// - src/components/ActionsMenu.tsx (action sheet с кнопками)

console.log(result.summary.screenType);  // 'action-sheet'
```

## Интеграция с существующим кодом

### Использование в MCP Server

```typescript
import { generateCompleteScreen } from './one-shot-generator.js';

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'generate-screen') {
    const { figmaUrl, screenName } = request.params.arguments;

    const result = await generateCompleteScreen(
      process.env.FIGMA_TOKEN!,
      figmaUrl,
      screenName,
      {
        generateTypes: true,
        generateHooks: true,
        detectAnimations: false,  // отключаем для скорости
      }
    );

    return {
      content: [
        {
          type: 'text',
          text: `Сгенерировано ${result.files.length} файлов для ${screenName}`,
        },
        {
          type: 'resource',
          resource: {
            uri: `file:///${result.files[0].path}`,
            text: result.files[0].content,
          },
        },
      ],
    };
  }
});
```

### CLI скрипт

```typescript
#!/usr/bin/env node

import { generateCompleteScreen, saveGeneratedFiles } from './one-shot-generator.js';

const [figmaUrl, screenName] = process.argv.slice(2);

if (!figmaUrl || !screenName) {
  console.error('Usage: generate-screen <figma-url> <screen-name>');
  process.exit(1);
}

const token = process.env.FIGMA_TOKEN;
if (!token) {
  console.error('FIGMA_TOKEN environment variable required');
  process.exit(1);
}

console.log(`Генерация ${screenName}...`);

const result = await generateCompleteScreen(token, figmaUrl, screenName);

await saveGeneratedFiles(result);

console.log(`✓ Сгенерировано ${result.files.length} файлов`);
console.log(`✓ Тип экрана: ${result.summary.screenType}`);
console.log(`✓ Уверенность: ${(result.summary.metadata.confidence * 100).toFixed(0)}%`);
```

## Расширенные возможности

### Кастомная конфигурация

```typescript
import { ProjectConfig } from './config-schema.js';

const customConfig: ProjectConfig = {
  framework: 'react-native',
  codeStyle: {
    stylePattern: 'StyleSheet',
    scaleFunction: 'scale',
    importPrefix: '@/',
  },
  theme: {
    location: './theme/index.ts',
  },
  mappings: {
    colors: {
      '#7A54FF': 'palette.primary',
      '#FF5454': 'palette.error',
    },
    fonts: {
      'SF Pro': 'commonFonts.primary.regular',
    },
  },
};

const result = await generateCompleteScreen(
  token,
  figmaUrl,
  screenName,
  { config: customConfig }
);
```

### Фильтрация файлов

```typescript
const result = await generateCompleteScreen(token, figmaUrl, screenName);

// Только экранные компоненты
const screenFiles = result.files.filter(f => f.type === 'screen');

// Только хуки
const hookFiles = result.files.filter(f => f.type === 'hooks');

// Сохранить только типы
const typeFiles = result.files.filter(f => f.type === 'types');
for (const file of typeFiles) {
  await fs.writeFile(file.path, file.content);
}
```

### Проверка обнаружений перед генерацией

```typescript
const result = await generateCompleteScreen(token, figmaUrl, screenName);

// Проверяем уверенность
if (result.summary.metadata.confidence < 0.5) {
  console.warn('Низкая уверенность обнаружения. Проверьте результат вручную.');
}

// Проверяем наличие специфичных паттернов
if (result.detections.form) {
  console.log(`Обнаружена форма с ${result.detections.form.fields.length} полями`);
  result.detections.form.fields.forEach(field => {
    console.log(`  - ${field.name}: ${field.type} (required: ${field.required})`);
  });
}

if (result.detections.list) {
  console.log(`Обнаружен список: ${result.detections.list.type}`);
  console.log(`  Элементов: ${result.detections.list.itemCount}`);
  console.log(`  Ориентация: ${result.detections.list.orientation}`);
}
```

## Производительность

- **Без анимаций**: ~2-5 секунд на экран
- **С анимациями**: ~5-10 секунд на экран
- **Пакетная генерация**: параллельная обработка всех экранов

```typescript
// Быстрая генерация (без анимаций)
const quickResult = await generateCompleteScreen(token, url, name, {
  detectAnimations: false,
});

// Полная генерация (с анимациями)
const fullResult = await generateCompleteScreen(token, url, name, {
  detectAnimations: true,
  generateExtras: true,
});
```

## Troubleshooting

### Ошибка: "Узел не найден"

Проверьте формат URL. Поддерживаемые форматы:
- `https://www.figma.com/file/{fileKey}/...?node-id={nodeId}`
- `https://www.figma.com/design/{fileKey}/...?node-id={nodeId}`

### Низкая уверенность обнаружения

- Убедитесь, что дизайн в Figma использует Auto Layout
- Проверьте, что элементы имеют понятные имена
- Используйте компонентные наборы (Component Sets) для вариантов

### Отсутствуют некоторые файлы

Проверьте опции генерации:
```typescript
{
  generateTypes: true,      // для types файлов
  generateHooks: true,       // для hooks файлов
  generateExtras: true,      // для form/animation файлов
}
```

## Лучшие практики

1. **Именование в Figma**: Используйте понятные имена для узлов (например, "Email Input", "Submit Button")
2. **Структура**: Используйте Auto Layout для списков и форм
3. **Компоненты**: Используйте Component Sets для вариантов состояний
4. **Аннотации**: Добавляйте Dev Mode аннотации для дополнительной информации
5. **Проверка результата**: Всегда проверяйте `summary.metadata.confidence` перед использованием кода

## Ограничения

- Анимации обнаруживаются только если есть прототипные связи в Figma
- Формы требуют явных элементов input/button
- Списки требуют минимум 3 повторяющихся элемента
- Детекторы работают на основе эвристик, результат может требовать ручной доработки
