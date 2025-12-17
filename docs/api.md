# Internal API Reference

> **Note:** This document describes the internal TypeScript API for direct programmatic usage.
> For MCP tool usage via Claude, see the [README](../README.md).

The ONE-SHOT generator combines all pattern detection and code generation steps into a single function call.

## Core Features

- ✅ **Single Figma API call** - all data loaded once
- ✅ **Parallel detection** - all detectors run simultaneously
- ✅ **Automatic screen type detection** - form, list, sheet, modal, or regular screen
- ✅ **Complete file set** - components, types, hooks, schemas, animations
- ✅ **Professional code comments** - all comments in English

## Quick Start

### Basic Usage

```typescript
import { generateCompleteScreen } from './one-shot-generator.js';

const result = await generateCompleteScreen(
  'your-figma-token',
  'https://www.figma.com/file/ABC123/Project?node-id=1-234',
  'ProductListScreen'
);

console.log(`Generated files: ${result.files.length}`);
console.log(`Screen type: ${result.summary.screenType}`);
console.log(`Confidence: ${result.summary.metadata.confidence}`);
```

### With Advanced Options

```typescript
const result = await generateCompleteScreen(
  'your-figma-token',
  figmaUrl,
  'CheckoutFormScreen',
  {
    generateTypes: true,       // Generate TypeScript types
    generateHooks: true,        // Generate React Query hooks
    detectAnimations: true,     // Detect animations (slower)
    generateExtras: true,       // Generate additional files
    config: customConfig,       // Custom configuration
  }
);
```

### Saving Files to Disk

```typescript
import { generateCompleteScreen, saveGeneratedFiles } from './one-shot-generator.js';

const result = await generateCompleteScreen(token, url, 'MyScreen');

// Save all files to current directory
await saveGeneratedFiles(result);

// Or to a specific directory
await saveGeneratedFiles(result, '/path/to/project');
```

### Batch Generation of Multiple Screens

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

// Save files for all screens
for (const result of results) {
  await saveGeneratedFiles(result);
}
```

## Result Structure

### OneShotResult

```typescript
interface OneShotResult {
  screenName: string;              // Screen name
  files: GeneratedFile[];          // Generated files
  detections: DetectionResults;    // Detection results
  summary: GenerationSummary;      // Generation summary
}
```

### GeneratedFile

```typescript
interface GeneratedFile {
  path: string;     // File path (e.g., 'src/screens/HomeScreen.tsx')
  content: string;  // File content
  type: 'screen' | 'types' | 'hooks' | 'form' | 'styles' | 'animations' | 'gestures';
}
```

### DetectionResults

```typescript
interface DetectionResults {
  list: ListPatternDetection | null;      // List detection
  form: FormDetection | null;              // Form detection
  sheet: SheetDetection | null;            // Sheet/modal detection
  variants: VariantDetection | null;       // Variant detection
  animations: AnimationHint | null;        // Animation hints
  dataModels: DataModel[];                 // Data models
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

## Usage Examples by Screen Type

### List Screen

```typescript
const result = await generateCompleteScreen(
  token,
  'https://figma.com/file/.../node-id=products-list',
  'ProductListScreen'
);

// Generated files:
// - src/screens/ProductListScreen.tsx (FlatList component)
// - src/types/ProductListScreenTypes.ts (Product interface)
// - src/hooks/useProductListScreenData.ts (useProducts hook)

console.log(result.summary.screenType);  // 'list'
console.log(result.detections.list?.itemCount);  // number of items
console.log(result.detections.list?.orientation);  // 'vertical' | 'horizontal'
```

### Form Screen

```typescript
const result = await generateCompleteScreen(
  token,
  'https://figma.com/file/.../node-id=checkout-form',
  'CheckoutFormScreen'
);

// Generated files:
// - src/screens/CheckoutFormScreen.tsx (form with react-hook-form)
// - src/schemas/CheckoutFormScreenSchema.ts (Zod validation schema)
// - src/hooks/useCheckoutFormScreen.ts (form management hook)
// - src/types/CheckoutFormScreenTypes.ts (data types)

console.log(result.summary.screenType);  // 'form'
console.log(result.detections.form?.fields.length);  // number of fields
console.log(result.detections.form?.hasSubmitButton);  // true/false
```

### Bottom Sheet / Modal

```typescript
const result = await generateCompleteScreen(
  token,
  'https://figma.com/file/.../node-id=filter-sheet',
  'FilterBottomSheet'
);

// Generated files:
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

// Generated files:
// - src/components/ActionsMenu.tsx (action sheet with buttons)

console.log(result.summary.screenType);  // 'action-sheet'
```

## Integration with Existing Code

### Usage in MCP Server

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
        detectAnimations: false,  // disable for speed
      }
    );

    return {
      content: [
        {
          type: 'text',
          text: `Generated ${result.files.length} files for ${screenName}`,
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

### CLI Script

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

console.log(`Generating ${screenName}...`);

const result = await generateCompleteScreen(token, figmaUrl, screenName);

await saveGeneratedFiles(result);

console.log(`✓ Generated ${result.files.length} files`);
console.log(`✓ Screen type: ${result.summary.screenType}`);
console.log(`✓ Confidence: ${(result.summary.metadata.confidence * 100).toFixed(0)}%`);
```

## Advanced Features

### Custom Configuration

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

### File Filtering

```typescript
const result = await generateCompleteScreen(token, figmaUrl, screenName);

// Only screen components
const screenFiles = result.files.filter(f => f.type === 'screen');

// Only hooks
const hookFiles = result.files.filter(f => f.type === 'hooks');

// Save only types
const typeFiles = result.files.filter(f => f.type === 'types');
for (const file of typeFiles) {
  await fs.writeFile(file.path, file.content);
}
```

### Checking Detections Before Generation

```typescript
const result = await generateCompleteScreen(token, figmaUrl, screenName);

// Check confidence
if (result.summary.metadata.confidence < 0.5) {
  console.warn('Low detection confidence. Manual review recommended.');
}

// Check for specific patterns
if (result.detections.form) {
  console.log(`Form detected with ${result.detections.form.fields.length} fields`);
  result.detections.form.fields.forEach(field => {
    console.log(`  - ${field.name}: ${field.type} (required: ${field.required})`);
  });
}

if (result.detections.list) {
  console.log(`List detected: ${result.detections.list.type}`);
  console.log(`  Items: ${result.detections.list.itemCount}`);
  console.log(`  Orientation: ${result.detections.list.orientation}`);
}
```

## Performance

- **Without animations**: ~2-5 seconds per screen
- **With animations**: ~5-10 seconds per screen
- **Batch generation**: parallel processing of all screens

```typescript
// Quick generation (without animations)
const quickResult = await generateCompleteScreen(token, url, name, {
  detectAnimations: false,
});

// Full generation (with animations)
const fullResult = await generateCompleteScreen(token, url, name, {
  detectAnimations: true,
  generateExtras: true,
});
```

## Troubleshooting

### Error: "Node not found"

Check URL format. Supported formats:
- `https://www.figma.com/file/{fileKey}/...?node-id={nodeId}`
- `https://www.figma.com/design/{fileKey}/...?node-id={nodeId}`

### Low Detection Confidence

- Ensure Figma design uses Auto Layout
- Check that elements have clear names
- Use Component Sets for variants

### Some Files Are Missing

Check generation options:
```typescript
{
  generateTypes: true,      // for types files
  generateHooks: true,       // for hooks files
  generateExtras: true,      // for form/animation files
}
```

## Best Practices

1. **Figma Naming**: Use clear names for nodes (e.g., "Email Input", "Submit Button")
2. **Structure**: Use Auto Layout for lists and forms
3. **Components**: Use Component Sets for state variants
4. **Annotations**: Add Dev Mode annotations for additional information
5. **Result Verification**: Always check `summary.metadata.confidence` before using code

## Limitations

- Animations detected only if there are prototype connections in Figma
- Forms require explicit input/button elements
- Lists require minimum 3 repeating elements
- Detectors work based on heuristics, results may require manual refinement
