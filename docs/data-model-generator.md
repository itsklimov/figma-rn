# Data Model Generator

**File**: `src/data-model-generator.ts`

## Описание / Description

Модуль для автоматического вывода моделей данных и API типов из Figma экранов. Анализирует содержимое экрана и генерирует:
- TypeScript интерфейсы для данных
- React Query хуки для загрузки данных
- API endpoint структуру

Module for automatic data model and API type inference from Figma screens. Analyzes screen content and generates:
- TypeScript interfaces for data
- React Query hooks for data fetching
- API endpoint structure

## Возможности / Features

### 1. Определение типа экрана / Screen Type Detection

Автоматически определяет тип экрана по названию:
- **List screens** (списки) → генерирует массивы данных
- **Detail screens** (детали) → генерирует одиночные объекты
- **Form screens** (формы) → генерирует Input и Output типы
- **Profile screens** (профиль) → генерирует User модель

### 2. Эвристики определения сущностей / Entity Detection Heuristics

Автоматически определяет специфические сущности:
- **Product** (товар) → поля: id, name, description, price, image, category, inStock
- **Order** (заказ) → поля: id, orderNumber, status, total, createdAt, customerId
- **Visit** (визит) → поля: id, date, time, serviceId, masterId, status, price
- **Master** (мастер) → поля: id, name, specialty, rating, avatar, experience
- **User** (пользователь) → поля: id, name, email, phone, avatar, createdAt

### 3. Определение типов полей / Field Type Inference

Анализирует текстовое содержимое для определения типов:
- **number**: цены (1990 ₽), рейтинги (4.8), счётчики (123)
- **Date**: даты (15 ноя 2023, 2023-11-15)
- **string**: имена, описания, статусы, время (14:30)
- **boolean**: флаги (true/false, isActive, hasAccess)

### 4. Генерация API endpoints / API Endpoint Generation

Автоматически создаёт правильные REST endpoints:
- List screens → `/api/products`
- Detail screens → `/api/product/:id`
- Create forms → `/api/product` (POST)
- Edit forms → `/api/product/:id` (PUT)

## API

### Интерфейсы / Interfaces

```typescript
interface DataField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'Date' | 'array' | 'object';
  nullable: boolean;
  arrayItemType?: string;
  nestedFields?: DataField[];
}

interface DataModel {
  name: string;
  fields: DataField[];
  isArray: boolean;
  apiEndpoint?: string;
}

interface APIHook {
  hookName: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  requestType?: string;
  responseType: string;
}
```

### Функции / Functions

#### `inferDataModels(node: any, screenName: string): DataModel[]`

Анализирует Figma узел и выводит модели данных.

**Параметры**:
- `node` - Figma узел для анализа
- `screenName` - Название экрана (например, "ProductsListScreen")

**Возвращает**: Массив моделей данных

**Пример**:
```typescript
const models = inferDataModels(figmaNode, 'ProductsListScreen');
// [{
//   name: 'Product',
//   fields: [
//     { name: 'id', type: 'string', nullable: false },
//     { name: 'name', type: 'string', nullable: false },
//     { name: 'price', type: 'number', nullable: false }
//   ],
//   isArray: true,
//   apiEndpoint: '/api/products'
// }]
```

#### `generateTypeDefinitions(models: DataModel[]): string`

Генерирует TypeScript интерфейсы из моделей данных.

**Параметры**:
- `models` - Массив моделей данных

**Возвращает**: TypeScript код интерфейсов

**Пример**:
```typescript
const types = generateTypeDefinitions(models);
// export interface Product {
//   id: string;
//   name: string;
//   price: number;
// }
//
// export interface ProductListResponse {
//   data: Product[];
//   total: number;
//   page?: number;
//   pageSize?: number;
// }
```

#### `generateReactQueryHooks(models: DataModel[], screenName: string): string`

Генерирует React Query хуки для загрузки данных.

**Параметры**:
- `models` - Массив моделей данных
- `screenName` - Название экрана

**Возвращает**: TypeScript код с React Query хуками

**Пример**:
```typescript
const hooks = generateReactQueryHooks(models, 'ProductsListScreen');
// export function useProducts() {
//   return useQuery({
//     queryKey: ['products'],
//     queryFn: async () => {
//       const response = await api.get<ProductListResponse>('/api/products');
//       return response.data;
//     },
//   });
// }
```

#### `inferAPIEndpoint(screenName: string, modelName: string): string`

Выводит API endpoint из названия экрана и модели.

**Параметры**:
- `screenName` - Название экрана
- `modelName` - Название модели

**Возвращает**: API endpoint

**Пример**:
```typescript
inferAPIEndpoint('ProductsListScreen', 'Product');  // "/api/products"
inferAPIEndpoint('ProductDetailsScreen', 'Product'); // "/api/product/:id"
inferAPIEndpoint('CreateProductForm', 'Product');   // "/api/product"
```

## Примеры использования / Usage Examples

### Пример 1: Экран списка продуктов

```typescript
import { inferDataModels, generateTypeDefinitions, generateReactQueryHooks } from './data-model-generator';

const productListNode = {
  type: 'FRAME',
  name: 'ProductsListScreen',
  children: [
    {
      type: 'FRAME',
      name: 'ProductCard',
      children: [
        { type: 'TEXT', name: 'ProductName', characters: 'Awesome Product' },
        { type: 'TEXT', name: 'Price', characters: '1990 ₽' },
        { type: 'TEXT', name: 'Rating', characters: '4.8' },
      ],
    },
  ],
};

// 1. Вывести модели данных
const models = inferDataModels(productListNode, 'ProductsListScreen');

// 2. Сгенерировать TypeScript интерфейсы
const types = generateTypeDefinitions(models);

// 3. Сгенерировать React Query хуки
const hooks = generateReactQueryHooks(models, 'ProductsListScreen');

console.log(types);
console.log(hooks);
```

### Пример 2: Форма создания визита

```typescript
const visitFormNode = {
  type: 'FRAME',
  name: 'CreateVisitForm',
  children: [
    { type: 'TEXT', name: 'Date', characters: '20 дек 2023' },
    { type: 'TEXT', name: 'Time', characters: '14:30' },
    { type: 'TEXT', name: 'ServiceId', characters: 'service-123' },
    { type: 'TEXT', name: 'Price', characters: '2500 ₽' },
  ],
};

const models = inferDataModels(visitFormNode, 'CreateVisitForm');
// Создаёт два типа:
// - VisitInput (без id, для создания)
// - Visit (с id, полная модель)

const types = generateTypeDefinitions(models);
const hooks = generateReactQueryHooks(models, 'CreateVisitForm');
// Генерирует хуки:
// - useCreateVisit() - для создания
// - useUpdateVisit() - для обновления
// - useDeleteVisit() - для удаления
```

### Пример 3: Экран профиля

```typescript
const profileNode = {
  type: 'FRAME',
  name: 'ProfileScreen',
  children: [
    { type: 'TEXT', name: 'Name', characters: 'Иван Иванов' },
    { type: 'TEXT', name: 'Email', characters: 'ivan@example.com' },
    { type: 'TEXT', name: 'Phone', characters: '+7 900 123-45-67' },
  ],
};

const models = inferDataModels(profileNode, 'ProfileScreen');
// Автоматически создаёт модель User с полями:
// id, name, email, phone, avatar, createdAt

const hooks = generateReactQueryHooks(models, 'ProfileScreen');
// Генерирует хук:
// - useUser(id) - для получения профиля пользователя
```

## Интеграция с Figma MCP Server

Модуль можно интегрировать как новый инструмент MCP:

```typescript
{
  name: 'infer_data_models',
  description: 'Analyze screen to infer data models and generate TypeScript types + React Query hooks',
  inputSchema: {
    type: 'object',
    properties: {
      figmaUrl: {
        type: 'string',
        description: 'Figma URL to analyze',
      },
      screenName: {
        type: 'string',
        description: 'Screen name (e.g., ProductsListScreen)',
      },
      generateTypes: {
        type: 'boolean',
        description: 'Generate TypeScript interfaces (default: true)',
        default: true,
      },
      generateHooks: {
        type: 'boolean',
        description: 'Generate React Query hooks (default: true)',
        default: true,
      },
    },
    required: ['figmaUrl', 'screenName'],
  },
}
```

## Тестирование / Testing

Запустить примеры:
```bash
npx tsx examples/data-model-example.ts
```

Выход покажет:
- Выведенные модели данных
- Сгенерированные TypeScript интерфейсы
- Сгенерированные React Query хуки
- Выведенные API endpoints

## Ограничения / Limitations

1. **Текстовый контент**: Вывод основан на текстовых элементах в Figma. Если в дизайне нет текста, модель будет базовой.

2. **Вложенные структуры**: Текущая версия не поддерживает глубоко вложенные объекты. Для сложных структур требуется ручная доработка.

3. **Специфические типы**: Определяет только базовые типы (string, number, boolean, Date). Для enum или union types требуется ручное редактирование.

## Будущие улучшения / Future Improvements

- [ ] Поддержка вложенных объектов и массивов
- [ ] Определение enum типов из повторяющихся значений
- [ ] Генерация Zod схем для валидации
- [ ] Поддержка GraphQL типов
- [ ] Определение связей между моделями (foreign keys)
- [ ] Генерация mock данных для тестирования
- [ ] Интеграция с существующими API схемами (OpenAPI, GraphQL)

## Зависимости / Dependencies

Модуль использует только встроенные TypeScript типы и не требует дополнительных зависимостей. Для использования сгенерированных хуков требуется:

```json
{
  "dependencies": {
    "@tanstack/react-query": "^5.0.0"
  }
}
```

## Стиль кода / Code Style

Код следует существующему стилю проекта:
- ✅ Комментарии на русском и английском языках
- ✅ JSDoc документация для всех экспортируемых функций
- ✅ TypeScript строгая типизация
- ✅ Функциональный подход без мутаций
- ✅ Чистые функции без побочных эффектов
