# Flow Generator - Usage Guide

## Overview

Flow Generator is a module for generating complete app flows from multiple Figma screens in a single call.

## Features

✅ **Parallel Generation** - Loads all Figma nodes in parallel
✅ **Unified Theme Mapping** - Single theme mapping for all screens
✅ **Navigation Auto-generation** - Automatic generation of React Navigation types and navigators
✅ **Shared Types** - Generation of shared data types for all screens
✅ **Data Models** - Detection of data models and generation of TypeScript interfaces
✅ **React Query Hooks** - Generation of hooks for data loading
✅ **Barrel Exports** - Generation of index.ts for convenient imports

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

console.log(`✅ Generated ${result.summary.successful} screens`);
console.log(`❌ Errors: ${result.summary.failed}`);
console.log(`⏱️ Time: ${result.summary.duration}ms`);
```

## Result Structure

```typescript
interface FlowResult {
  // Generation results for each screen
  screens: FlowScreenResult[];

  // Navigation
  navigation: {
    types: string;        // TypeScript types for React Navigation
    navigator: string;    // Navigator code
    structure: NavigationStructure;
  };

  // Shared types for all screens
  sharedTypes: string;

  // Barrel export (index.ts)
  indexFile: string;

  // Statistics
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

  // Generated files
  files: [
    {
      type: 'component',
      path: 'screens/HomeScreen.tsx',
      content: '...',  // React Native component
    },
    {
      type: 'types',
      path: 'types/HomeScreen.types.ts',
      content: '...',  // TypeScript interfaces
    },
    {
      type: 'hooks',
      path: 'hooks/HomeScreen.hooks.ts',
      content: '...',  // React Query hooks
    },
  ];

  // Detection results
  detections: {
    dataModels: DataModel[];        // Detected data models
    navigationElements: string[];   // Navigation elements
    screenType: 'list' | 'detail' | 'form' | 'profile' | 'unknown';
    entityName: string;             // Entity name (Product, User, etc.)
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
    generateNavigation: false,  // Skip navigation
    generateSharedTypes: false, // Skip shared types
    generateIndex: true,        // Generate only index
    generateHooks: false,       // Don't generate React Query hooks
    generateDataTypes: true,    // Generate only data types
  }
);
```

## Processing Results

### Save All Files

```typescript
import { writeFile } from 'fs/promises';
import { dirname } from 'path';
import { mkdir } from 'fs/promises';

// Save all screen files
for (const screen of result.screens) {
  if (screen.status === 'success') {
    for (const file of screen.files) {
      // Create directory if it doesn't exist
      await mkdir(dirname(file.path), { recursive: true });

      // Save file
      await writeFile(file.path, file.content, 'utf-8');
      console.log(`✅ Saved: ${file.path}`);
    }
  } else {
    console.error(`❌ Generation error ${screen.screenName}: ${screen.error}`);
  }
}

// Save navigation
if (result.navigation.types) {
  await writeFile('src/navigation/types.ts', result.navigation.types);
  await writeFile('src/navigation/Navigator.tsx', result.navigation.navigator);
}

// Save shared types
if (result.sharedTypes) {
  await writeFile('src/types/shared.ts', result.sharedTypes);
}

// Save index
if (result.indexFile) {
  await writeFile('src/screens/index.ts', result.indexFile);
}
```

### Error Handling

```typescript
const result = await generateCompleteFlow(figmaToken, screens);

// Filter successful screens
const successful = result.screens.filter(s => s.status === 'success');
const failed = result.screens.filter(s => s.status === 'error');

// Log errors
failed.forEach(screen => {
  console.error(`❌ ${screen.screenName}: ${screen.error}`);
});

// Continue with successful screens
if (successful.length > 0) {
  console.log(`✅ ${successful.length} screens generated successfully`);
  // Save files...
}
```

## Generation Phases

Flow Generator works in 6 phases:

### Phase 1: Parallel Figma Nodes Fetching
```
[FLOW] Phase 1/6: Loading Figma nodes...
[FLOW] ✓ Loaded: HomeScreen
[FLOW] ✓ Loaded: ProfileScreen
[FLOW] ✅ Nodes loaded: 2 / 2
```

### Phase 2: Unified Theme Mapping
```
[FLOW] Phase 2/6: Generating unified theme mapping...
[FLOW] Unique colors found: 15
[FLOW] ✅ Color mappings created: 15
```

### Phase 3: Screen Code Generation
```
[FLOW] Phase 3/6: Generating screen code...
[FLOW] ✓ Generated: HomeScreen (3 files)
[FLOW] ✓ Generated: ProfileScreen (2 files)
[FLOW] ✅ Screens generated successfully: 2 / 2
```

### Phase 4: Navigation Generation
```
[FLOW] Phase 4/6: Generating navigation...
[FLOW] ✅ Navigation generated
```

### Phase 5: Shared Types Generation
```
[FLOW] Phase 5/6: Generating shared types...
[FLOW] ✅ Shared types generated
```

### Phase 6: Barrel Export Generation
```
[FLOW] Phase 6/6: Generating barrel export...
[FLOW] ✅ Index file generated
```

## Detection Results

### Screen Types
Flow Generator automatically detects screen type:

- **list** - list screens (catalogs, feeds)
- **detail** - detail screens (product/user cards)
- **form** - forms (create/edit)
- **profile** - profile screens
- **unknown** - unknown type

### Data Models
TypeScript interfaces generated for each screen:

```typescript
// Example for ProductsScreen list screen
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
Hooks generated for each model:

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

Flow Generator analyzes screens and creates navigation structure:

```typescript
// Generated types
export type RootStackParamList = {
  Home: undefined;
  Profile: { userId: string };
  Settings: undefined;
};

// Generated navigator
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
- **Sequential generation**: ~4500ms
- **Flow Generator (parallel)**: ~1800ms
- **Speedup**: **2.5x**

### Benchmark (10 screens)
- **Sequential generation**: ~15000ms
- **Flow Generator (parallel)**: ~3200ms
- **Speedup**: **4.7x**

## Best Practices

### 1. Proper Screen Naming
```typescript
// ✅ Good
'ProductsListScreen'   // Detected as list
'ProductDetailScreen'  // Detected as detail
'ProductEditForm'      // Detected as form
'UserProfileScreen'    // Detected as profile

// ❌ Bad
'Screen1'              // Unclear type
'Component'            // Not a screen
```

### 2. Grouping Related Screens
```typescript
// Generate related screens together for better analysis
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

### 3. Error Handling
```typescript
const result = await generateCompleteFlow(figmaToken, screens);

// Check critical screens
const criticalScreens = ['HomeScreen', 'AuthScreen'];
const criticalFailed = result.screens
  .filter(s => criticalScreens.includes(s.screenName) && s.status === 'error');

if (criticalFailed.length > 0) {
  throw new Error(`Critical screens failed: ${criticalFailed.map(s => s.screenName).join(', ')}`);
}
```

## Troubleshooting

### Error: "Node not found"
```
Check node-id correctness in Figma URL
Format: ?node-id=123-456 (with hyphen, not colon)
```

### Error: "Invalid Figma URL"
```
URL should be in format:
https://www.figma.com/design/FILE_ID?node-id=123-456
or
https://www.figma.com/file/FILE_ID?node-id=123-456
```

### Slow Generation
```
Flow Generator loads screens in parallel.
If slow - check internet connection or Figma API limits.
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

- **figmaToken**: Figma API token
- **screens**: Array of screens to generate
  - `figmaUrl`: Figma URL with node-id
  - `screenName`: Screen name (e.g., HomeScreen)
  - `outputPath`: (optional) File output path
- **options**: Generation options (all optional, default true)
  - `generateNavigation`: Generate navigation
  - `generateSharedTypes`: Generate shared types
  - `generateIndex`: Generate index.ts
  - `generateHooks`: Generate React Query hooks
  - `generateDataTypes`: Generate data types

#### Returns

Promise<FlowResult> with complete generation results

## Examples

See examples in `examples/flow-generator/` directory

## License

[PolyForm Small Business License 1.0.0](../LICENSE.md)
