# Data Model Generator

**File**: `src/data-model-generator.ts`

## Description

Module for automatic data model and API type inference from Figma screens. Analyzes screen content and generates:
- TypeScript interfaces for data
- React Query hooks for data fetching
- API endpoint structure

## Features

### 1. Screen Type Detection

Automatically detects screen type by name:
- **List screens** → generates data arrays
- **Detail screens** → generates single objects
- **Form screens** → generates Input and Output types
- **Profile screens** → generates User model

### 2. Entity Detection Heuristics

Automatically detects specific entities:
- **Product** → fields: id, name, description, price, image, category, inStock
- **Order** → fields: id, orderNumber, status, total, createdAt, customerId
- **Visit** → fields: id, date, time, serviceId, masterId, status, price
- **Master** → fields: id, name, specialty, rating, avatar, experience
- **User** → fields: id, name, email, phone, avatar, createdAt

### 3. Field Type Inference

Analyzes text content to determine types:
- **number**: prices (1990 ₽), ratings (4.8), counters (123)
- **Date**: dates (Nov 15 2023, 2023-11-15)
- **string**: names, descriptions, statuses, time (14:30)
- **boolean**: flags (true/false, isActive, hasAccess)

### 4. API Endpoint Generation

Automatically creates correct REST endpoints:
- List screens → `/api/products`
- Detail screens → `/api/product/:id`
- Create forms → `/api/product` (POST)
- Edit forms → `/api/product/:id` (PUT)

## API

### Interfaces

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

### Functions

#### `inferDataModels(node: any, screenName: string): DataModel[]`

Analyzes Figma node and infers data models.

**Parameters**:
- `node` - Figma node to analyze
- `screenName` - Screen name (e.g., "ProductsListScreen")

**Returns**: Array of data models

**Example**:
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

Generates TypeScript interfaces from data models.

**Parameters**:
- `models` - Array of data models

**Returns**: TypeScript interface code

**Example**:
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

Generates React Query hooks for data loading.

**Parameters**:
- `models` - Array of data models
- `screenName` - Screen name

**Returns**: TypeScript code with React Query hooks

**Example**:
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

Infers API endpoint from screen and model names.

**Parameters**:
- `screenName` - Screen name
- `modelName` - Model name

**Returns**: API endpoint

**Example**:
```typescript
inferAPIEndpoint('ProductsListScreen', 'Product');  // "/api/products"
inferAPIEndpoint('ProductDetailsScreen', 'Product'); // "/api/product/:id"
inferAPIEndpoint('CreateProductForm', 'Product');   // "/api/product"
```

## Usage Examples

### Example 1: Product List Screen

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

// 1. Infer data models
const models = inferDataModels(productListNode, 'ProductsListScreen');

// 2. Generate TypeScript interfaces
const types = generateTypeDefinitions(models);

// 3. Generate React Query hooks
const hooks = generateReactQueryHooks(models, 'ProductsListScreen');

console.log(types);
console.log(hooks);
```

### Example 2: Visit Creation Form

```typescript
const visitFormNode = {
  type: 'FRAME',
  name: 'CreateVisitForm',
  children: [
    { type: 'TEXT', name: 'Date', characters: 'Dec 20 2023' },
    { type: 'TEXT', name: 'Time', characters: '14:30' },
    { type: 'TEXT', name: 'ServiceId', characters: 'service-123' },
    { type: 'TEXT', name: 'Price', characters: '2500 ₽' },
  ],
};

const models = inferDataModels(visitFormNode, 'CreateVisitForm');
// Creates two types:
// - VisitInput (without id, for creation)
// - Visit (with id, full model)

const types = generateTypeDefinitions(models);
const hooks = generateReactQueryHooks(models, 'CreateVisitForm');
// Generates hooks:
// - useCreateVisit() - for creation
// - useUpdateVisit() - for update
// - useDeleteVisit() - for deletion
```

### Example 3: Profile Screen

```typescript
const profileNode = {
  type: 'FRAME',
  name: 'ProfileScreen',
  children: [
    { type: 'TEXT', name: 'Name', characters: 'John Smith' },
    { type: 'TEXT', name: 'Email', characters: 'john@example.com' },
    { type: 'TEXT', name: 'Phone', characters: '+1 900 123-4567' },
  ],
};

const models = inferDataModels(profileNode, 'ProfileScreen');
// Automatically creates User model with fields:
// id, name, email, phone, avatar, createdAt

const hooks = generateReactQueryHooks(models, 'ProfileScreen');
// Generates hook:
// - useUser(id) - for getting user profile
```

## Figma MCP Server Integration

Module can be integrated as a new MCP tool:

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

## Testing

Run examples:
```bash
npx tsx examples/data-model-example.ts
```

Output shows:
- Inferred data models
- Generated TypeScript interfaces
- Generated React Query hooks
- Inferred API endpoints

## Limitations

1. **Text Content**: Inference based on text elements in Figma. If design has no text, model will be basic.

2. **Nested Structures**: Current version doesn't support deeply nested objects. Complex structures require manual refinement.

3. **Specific Types**: Only detects basic types (string, number, boolean, Date). For enum or union types, manual editing required.

## Future Improvements

- [ ] Support for nested objects and arrays
- [ ] Detection of enum types from repeating values
- [ ] Generation of Zod schemas for validation
- [ ] Support for GraphQL types
- [ ] Detection of relationships between models (foreign keys)
- [ ] Generation of mock data for testing
- [ ] Integration with existing API schemas (OpenAPI, GraphQL)

## Dependencies

Module uses only built-in TypeScript types and requires no additional dependencies. To use generated hooks, you need:

```json
{
  "dependencies": {
    "@tanstack/react-query": "^5.0.0"
  }
}
```

## Code Style

Code follows existing project style:
- ✅ Comments in English
- ✅ JSDoc documentation for all exported functions
- ✅ TypeScript strict typing
- ✅ Functional approach without mutations
- ✅ Pure functions without side effects
