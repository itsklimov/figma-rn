# Flow Generator - Usage Guide

## Overview

Flow Generator - это модуль для генерации полных потоков приложения из множества Figma экранов **за один вызов**.

Flow Generator is a module for generating complete app flows from multiple Figma screens **in ONE call**.

## Features

✅ **Parallel Generation** - Загружает все Figma узлы параллельно
✅ **Unified Theme Mapping** - Единый маппинг темы для всех экранов
✅ **Navigation Auto-generation** - Автоматическая генерация React Navigation типов и навигаторов
✅ **Shared Types** - Генерация общих типов данных для всех экранов
✅ **Data Models** - Обнаружение моделей данных и генерация TypeScript интерфейсов
✅ **React Query Hooks** - Генерация хуков для загрузки данных
✅ **Barrel Exports** - Генерация index.ts для удобного импорта

## Basic Usage

```typescript
import { generateCompleteFlow } from './flow-generator.js';

const result = await generateCompleteFlow(
  figmaToken,
  [
    {
      figmaUrl: 'https://www.figma.com/design/FILE?node-id=123-456',
      screenName: 'HomeScreen',
    },
    {
      figmaUrl: 'https://www.figma.com/design/FILE?node-id=123-457',
      screenName: 'ProfileScreen',
    },
    {
      figmaUrl: 'https://www.figma.com/design/FILE?node-id=123-458',
      screenName: 'SettingsScreen',
    },
  ],
  {
    generateNavigation: true,
    generateSharedTypes: true,
    generateIndex: true,
    generateHooks: true,
    generateDataTypes: true,
  }
);

console.log(`✅ Генерировано ${result.summary.successful} экранов`);
console.log(`❌ Ошибок: ${result.summary.failed}`);
console.log(`⏱️ Время: ${result.summary.duration}ms`);
```

## Result Structure

```typescript
interface FlowResult {
  // Результаты генерации каждого экрана
  screens: FlowScreenResult[];

  // Навигация
  navigation: {
    types: string;        // TypeScript типы для React Navigation
    navigator: string;    // Код навигатора
    structure: NavigationStructure;
  };

  // Общие типы для всех экранов
  sharedTypes: string;

  // Barrel export (index.ts)
  indexFile: string;

  // Статистика
  summary: {
    total: number;
    successful: number;
    failed: number;
    screenTypes: Record<string, number>;  // { list: 2, detail: 3, form: 1 }
    duration: number;
  };
}
```

## Screen Result Structure

```typescript
interface FlowScreenResult {
  screenName: string;

  // Сгенерированные файлы
  files: [
    {
      type: 'component',
      path: 'screens/HomeScreen.tsx',
      content: '...',  // React Native компонент
    },
    {
      type: 'types',
      path: 'types/HomeScreen.types.ts',
      content: '...',  // TypeScript интерфейсы
    },
    {
      type: 'hooks',
      path: 'hooks/HomeScreen.hooks.ts',
      content: '...',  // React Query хуки
    },
  ];

  // Результаты обнаружения
  detections: {
    dataModels: DataModel[];        // Обнаруженные модели данных
    navigationElements: string[];   // Элементы навигации
    screenType: 'list' | 'detail' | 'form' | 'profile' | 'unknown';
    entityName: string;             // Название сущности (Product, User, etc.)
  };

  status: 'success' | 'error';
  error?: string;
}
```

## Advanced Usage

### Custom Output Paths

```typescript
const result = await generateCompleteFlow(
  figmaToken,
  [
    {
      figmaUrl: 'https://...',
      screenName: 'HomeScreen',
      outputPath: 'src/features/home/HomeScreen.tsx',
    },
  ]
);
```

### Selective Generation

```typescript
const result = await generateCompleteFlow(
  figmaToken,
  screens,
  {
    generateNavigation: false,  // Пропустить навигацию
    generateSharedTypes: false, // Пропустить shared типы
    generateIndex: true,        // Генерировать только index
    generateHooks: false,       // Не генерировать React Query хуки
    generateDataTypes: true,    // Генерировать только типы данных
  }
);
```

## Processing Results

### Save All Files

```typescript
import { writeFile } from 'fs/promises';
import { dirname } from 'path';
import { mkdir } from 'fs/promises';

// Сохранение всех файлов экранов
for (const screen of result.screens) {
  if (screen.status === 'success') {
    for (const file of screen.files) {
      // Создаем директорию если не существует
      await mkdir(dirname(file.path), { recursive: true });

      // Сохраняем файл
      await writeFile(file.path, file.content, 'utf-8');
      console.log(`✅ Сохранен: ${file.path}`);
    }
  } else {
    console.error(`❌ Ошибка генерации ${screen.screenName}: ${screen.error}`);
  }
}

// Сохранение навигации
if (result.navigation.types) {
  await writeFile('src/navigation/types.ts', result.navigation.types);
  await writeFile('src/navigation/Navigator.tsx', result.navigation.navigator);
}

// Сохранение shared типов
if (result.sharedTypes) {
  await writeFile('src/types/shared.ts', result.sharedTypes);
}

// Сохранение index
if (result.indexFile) {
  await writeFile('src/screens/index.ts', result.indexFile);
}
```

### Error Handling

```typescript
const result = await generateCompleteFlow(figmaToken, screens);

// Фильтрация успешных экранов
const successful = result.screens.filter(s => s.status === 'success');
const failed = result.screens.filter(s => s.status === 'error');

// Логирование ошибок
failed.forEach(screen => {
  console.error(`❌ ${screen.screenName}: ${screen.error}`);
});

// Продолжаем работу с успешными экранами
if (successful.length > 0) {
  console.log(`✅ ${successful.length} экранов успешно сгенерировано`);
  // Save files...
}
```

## Generation Phases

Flow Generator работает в 6 фазах:

### Phase 1: Parallel Figma Nodes Fetching
```
[FLOW] Фаза 1/6: Загрузка Figma узлов...
[FLOW] ✓ Загружен: HomeScreen
[FLOW] ✓ Загружен: ProfileScreen
[FLOW] ✅ Загружено узлов: 2 / 2
```

### Phase 2: Unified Theme Mapping
```
[FLOW] Фаза 2/6: Генерация единого маппинга темы...
[FLOW] Найдено уникальных цветов: 15
[FLOW] ✅ Создано цветовых маппингов: 15
```

### Phase 3: Screen Code Generation
```
[FLOW] Фаза 3/6: Генерация кода экранов...
[FLOW] ✓ Сгенерирован: HomeScreen (3 файлов)
[FLOW] ✓ Сгенерирован: ProfileScreen (2 файла)
[FLOW] ✅ Успешно сгенерировано экранов: 2 / 2
```

### Phase 4: Navigation Generation
```
[FLOW] Фаза 4/6: Генерация навигации...
[FLOW] ✅ Навигация сгенерирована
```

### Phase 5: Shared Types Generation
```
[FLOW] Фаза 5/6: Генерация shared типов...
[FLOW] ✅ Shared типы сгенерированы
```

### Phase 6: Barrel Export Generation
```
[FLOW] Фаза 6/6: Генерация barrel export...
[FLOW] ✅ Index файл сгенерирован
```

## Detection Results

### Screen Types
Flow Generator автоматически определяет тип экрана:

- **list** - списочные экраны (каталоги, ленты)
- **detail** - экраны деталей (карточки товаров/пользователей)
- **form** - формы (создание/редактирование)
- **profile** - профильные экраны
- **unknown** - неопределенный тип

### Data Models
Для каждого экрана генерируются TypeScript интерфейсы:

```typescript
// Пример для списочного экрана ProductsScreen
export interface Product {
  id: string;
  name: string;
  price: number;
  image?: string;
  category?: string;
  inStock: boolean;
}

export interface ProductListResponse {
  data: Product[];
  total: number;
  page?: number;
  pageSize?: number;
}
```

### React Query Hooks
Для каждой модели генерируются хуки:

```typescript
export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const response = await api.get<ProductListResponse>('/api/products');
      return response.data;
    },
  });
}
```

## Navigation Structure

Flow Generator анализирует экраны и создает навигационную структуру:

```typescript
// Сгенерированные типы
export type RootStackParamList = {
  Home: undefined;
  Profile: { userId: string };
  Settings: undefined;
};

// Сгенерированный навигатор
function RootStackNavigator() {
  return (
    <RootStack.Navigator>
      <RootStack.Screen name="Home" component={HomeScreen} />
      <RootStack.Screen name="Profile" component={ProfileScreen} />
      <RootStack.Screen name="Settings" component={SettingsScreen} />
    </RootStack.Navigator>
  );
}
```

## Performance

### Benchmark (3 screens)
- **Последовательная генерация**: ~4500ms
- **Flow Generator (параллельно)**: ~1800ms
- **Ускорение**: **2.5x**

### Benchmark (10 screens)
- **Последовательная генерация**: ~15000ms
- **Flow Generator (параллельно)**: ~3200ms
- **Ускорение**: **4.7x**

## Best Practices

### 1. Правильное именование экранов
```typescript
// ✅ Хорошо
'ProductsListScreen'   // Определится как list
'ProductDetailScreen'  // Определится как detail
'ProductEditForm'      // Определится как form
'UserProfileScreen'    // Определится как profile

// ❌ Плохо
'Screen1'              // Неясный тип
'Component'            // Не экран
```

### 2. Группировка связанных экранов
```typescript
// Генерируем связанные экраны вместе для лучшего анализа
const productFlowScreens = [
  { figmaUrl: '...', screenName: 'ProductsListScreen' },
  { figmaUrl: '...', screenName: 'ProductDetailScreen' },
  { figmaUrl: '...', screenName: 'ProductEditForm' },
];

const result = await generateCompleteFlow(
  figmaToken,
  productFlowScreens,
  { generateNavigation: true }
);
```

### 3. Обработка ошибок
```typescript
const result = await generateCompleteFlow(figmaToken, screens);

// Проверяем критические экраны
const criticalScreens = ['HomeScreen', 'AuthScreen'];
const criticalFailed = result.screens
  .filter(s => criticalScreens.includes(s.screenName) && s.status === 'error');

if (criticalFailed.length > 0) {
  throw new Error(`Critical screens failed: ${criticalFailed.map(s => s.screenName).join(', ')}`);
}
```

## Troubleshooting

### Ошибка: "Узел не найден"
```
Проверьте корректность node-id в Figma URL
Формат: ?node-id=123-456 (с дефисом, не двоеточием)
```

### Ошибка: "Invalid Figma URL"
```
URL должен быть в формате:
https://www.figma.com/design/FILE_ID?node-id=123-456
или
https://www.figma.com/file/FILE_ID?node-id=123-456
```

### Медленная генерация
```
Flow Generator загружает экраны параллельно.
Если медленно - проверьте интернет соединение или Figma API лимиты.
```

## API Reference

### generateCompleteFlow

```typescript
function generateCompleteFlow(
  figmaToken: string,
  screens: FlowScreen[],
  options?: FlowGenerationOptions
): Promise<FlowResult>
```

#### Parameters

- **figmaToken**: Figma API токен
- **screens**: Массив экранов для генерации
  - `figmaUrl`: Figma URL с node-id
  - `screenName`: Название экрана (например, HomeScreen)
  - `outputPath`: (опционально) Путь для вывода файла
- **options**: Опции генерации (все опциональны, по умолчанию true)
  - `generateNavigation`: Генерировать навигацию
  - `generateSharedTypes`: Генерировать общие типы
  - `generateIndex`: Генерировать index.ts
  - `generateHooks`: Генерировать React Query хуки
  - `generateDataTypes`: Генерировать типы данных

#### Returns

Promise<FlowResult> с полными результатами генерации

## Examples

См. примеры в директории `examples/flow-generator/`

## License

[PolyForm Small Business License 1.0.0](../LICENSE.md)
