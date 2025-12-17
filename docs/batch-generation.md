# Batch Generation Example

## Overview

The batch generator allows you to generate multiple React Native screens from Figma in a single operation, with shared types, navigation types, and barrel exports.

## Basic Usage

### Via MCP Tool

```json
{
  "tool": "generate_batch_screens",
  "arguments": {
    "screens": [
      {
        "figmaUrl": "https://www.figma.com/design/FILE_ID?node-id=123-456",
        "screenName": "HomeScreen",
        "outputPath": "src/screens/HomeScreen.tsx"
      },
      {
        "figmaUrl": "https://www.figma.com/design/FILE_ID?node-id=123-789",
        "screenName": "ProfileScreen",
        "outputPath": "src/screens/ProfileScreen.tsx"
      },
      {
        "figmaUrl": "https://www.figma.com/design/FILE_ID?node-id=456-123",
        "screenName": "SettingsScreen",
        "outputPath": "src/screens/SettingsScreen.tsx"
      }
    ],
    "sharedTypesPath": "src/types/screens.ts",
    "generateNavigation": true,
    "generateIndex": true
  }
}
```

### Via Direct Import

```typescript
import { generateBatch } from 'figma-rn/dist/batch-generator.js';

const result = await generateBatch(
  {
    screens: [
      {
        figmaUrl: 'https://www.figma.com/design/FILE?node-id=123-456',
        screenName: 'HomeScreen',
      },
      {
        figmaUrl: 'https://www.figma.com/design/FILE?node-id=123-789',
        screenName: 'ProfileScreen',
      },
    ],
    sharedTypesPath: 'src/types/screens.ts',
    generateNavigation: true,
    generateIndex: true,
  },
  process.env.FIGMA_TOKEN!
);

console.log(`Generated ${result.summary.successful} screens`);
console.log(`Failed: ${result.summary.failed}`);
console.log(`Duration: ${result.summary.duration}ms`);
```

## Features

### 1. Parallel Generation
All screens are generated in parallel for optimal performance:
- Phase 1: Parallel Figma API calls to fetch metadata
- Phase 2: Unified theme mapping across all screens
- Phase 3: Parallel code generation

### 2. Shared Color Mappings
Colors from all screens are collected and mapped to theme tokens once:
```typescript
// Automatically generates unified color mappings
{
  "#7A54FF": "palette.primary",
  "#FFFFFF": "palette.background",
  "#000000": "palette.text"
}
```

### 3. Shared Types Generation
Automatically extracts common types across screens:
```typescript
export interface User {
  id: string;
  name: string;
  avatar?: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  image?: string;
}

export type ScreenName = 'HomeScreen' | 'ProfileScreen' | 'SettingsScreen';
```

### 4. Navigation Types
Generates React Navigation type definitions:
```typescript
export type RootStackParamList = {
  Home: undefined;
  Profile: undefined;
  Settings: undefined;
};

export type HomeScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Home'>;
export type HomeScreenRouteProp = RouteProp<RootStackParamList, 'Home'>;
```

### 5. Barrel Export
Generates index.ts for easy imports:
```typescript
export { default as HomeScreen } from './HomeScreen';
export { default as ProfileScreen } from './ProfileScreen';
export { default as SettingsScreen } from './SettingsScreen';

export * from './types/shared';
```

## Output Structure

```
BatchResult {
  screens: [
    {
      screenName: 'HomeScreen',
      code: '...',
      outputPath: 'src/screens/HomeScreen.tsx',
      status: 'success',
      extractedTypes: [...]
    },
    ...
  ],
  sharedTypes: '...', // TypeScript code for shared types
  navigationTypes: '...', // TypeScript code for navigation types
  indexFile: '...', // Barrel export code
  summary: {
    total: 3,
    successful: 3,
    failed: 0,
    duration: 2500
  }
}
```

## Error Handling

If a screen fails to generate, it's marked with status 'error':
```typescript
{
  screenName: 'BrokenScreen',
  code: '',
  outputPath: 'src/screens/BrokenScreen.tsx',
  status: 'error',
  error: 'Node 123:456 not found in Figma file'
}
```

Other screens continue to generate successfully.

## Performance Tips

1. **Use batch generation for 3+ screens** - overhead is amortized across multiple screens
2. **Group screens from same Figma file** - reduces API calls
3. **Run during project setup** - generates all screens at once with consistent theme mapping
4. **Enable shared types** - reduces duplication across screens

## Advanced Example

```typescript
import { generateBatch, generateSharedTypes, generateBarrelExport } from './batch-generator.js';

// Generate 10 screens in parallel
const screens = [];
for (let i = 0; i < 10; i++) {
  screens.push({
    figmaUrl: `https://www.figma.com/design/FILE?node-id=${i}-${i}`,
    screenName: `Screen${i}`,
    outputPath: `src/screens/Screen${i}.tsx`,
  });
}

const result = await generateBatch(
  {
    screens,
    sharedTypesPath: 'src/types/screens.ts',
    generateNavigation: true,
    generateIndex: true,
  },
  figmaToken
);

// Save all files
for (const screen of result.screens) {
  if (screen.status === 'success') {
    await fs.writeFile(screen.outputPath, screen.code);
  }
}

if (result.sharedTypes) {
  await fs.writeFile('src/types/screens.ts', result.sharedTypes);
}

if (result.navigationTypes) {
  await fs.writeFile('src/types/navigation.ts', result.navigationTypes);
}

if (result.indexFile) {
  await fs.writeFile('src/screens/index.ts', result.indexFile);
}

console.log(`✅ Generated ${result.summary.successful} screens in ${result.summary.duration}ms`);
```

## Debugging

Enable debug logging:
```bash
FIGMA_TOKEN=your_token DEBUG=1 npm start
```

Look for batch generation logs:
```
[BATCH] Начало пакетной генерации...
[BATCH] Экранов для генерации: 3
[BATCH] Фаза 1: Загрузка метаданных из Figma...
[BATCH] ✅ Загружено: HomeScreen (15 цветов)
[BATCH] Фаза 2: Генерация маппинга темы...
[BATCH] ✅ Создано 12 цветовых маппингов
[BATCH] Фаза 3: Генерация кода экранов...
[BATCH] ✅ Сгенерирован: HomeScreen (2 типов)
[BATCH] ✅ Пакетная генерация завершена за 2543ms
```

## Limitations

1. All screens must be from accessible Figma files
2. Maximum recommended: 50 screens per batch (API rate limits)
3. Shared types are basic - manual refinement may be needed
4. Navigation types assume standard React Navigation structure

## Next Steps

After batch generation:
1. Review generated code for accuracy
2. Refine shared types based on actual data models
3. Add navigation props to screen components
4. Test all screens on device
5. Add data fetching and state management
