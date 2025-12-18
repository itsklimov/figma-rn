---
name: h-implement-step4-quality
branch: feature/step4-quality
status: pending
created: 2025-12-17
---

# Step 4: Quality Improvements for Production-Ready Code

## Problem/Goal

Transform "layout in code" into maintainable, production-ready React Native code by adding:

1. **4.1 Component Decomposition** - Extract repeated blocks (>=2 occurrences) into components; split large screens into sections (Header, Content, Footer, CTASection)

2. **4.2 List Generation** - Detect repeating items and generate FlatList with renderItem and Item type instead of copy-paste

3. **4.3 Tokenization Enhancement** - Ensure colors/spacing/typography reference project tokens; generate `generatedTokens.ts` when no theme file exists

4. **4.4 Accessibility + UX Safeguards** - Add accessibilityRole/Label for buttons, hitSlop for small icons, numberOfLines where needed, ScrollView for overflow content

5. **Integration** - Wire up `get_screen` MCP tool to expose the full pipeline

## Architecture

### Detection Layer (NEW)
```
src/core/detection/
├── index.ts                  # Barrel + runDetectors()
├── list-detector.ts          # Repeating items → ListHint
├── repetition-detector.ts    # Repeated blocks → ComponentHint
└── types.ts                  # DetectionResult types
```

### Generation Enhancements
```
src/core/generation/
├── component-builder.ts      # Enhanced orchestrator (consumes hints)
├── jsx-builder.ts            # + a11y props
├── list-generator.ts         # NEW: FlatList + renderItem
├── tokens-generator.ts       # NEW: generatedTokens.ts fallback
└── ...existing
```

### MCP Tool
```
src/edge/tools/
└── get-screen.ts             # MCP tool exposing full pipeline
```

## Success Criteria

### Detection Layer (4.1 + 4.2)
- [ ] `list-detector.ts` identifies repeating items in IR tree and returns `ListHint[]`
- [ ] `repetition-detector.ts` identifies repeated blocks (>=2 occurrences) and returns `ComponentHint[]`
- [ ] `runDetectors()` orchestrates all detectors and returns `DetectionResult`

### Generation Enhancements (4.3 + 4.4)
- [ ] `tokens-generator.ts` produces `generatedTokens.ts` when no project theme is provided
- [ ] `jsx-builder.ts` adds a11y props (accessibilityRole/Label, hitSlop for small icons)
- [ ] `list-generator.ts` produces FlatList with renderItem and Item type from `ListHint`
- [ ] `component-builder.ts` consumes detection hints and produces multi-file output

### Integration
- [ ] `get_screen` MCP tool exposes full pipeline (Figma URL → generated code)
- [ ] Generated code compiles without TypeScript errors
- [ ] End-to-end test with real Figma design produces usable React Native component

### Quality
- [ ] Unit tests for detection layer
- [ ] Unit tests for new generation modules

## Context Manifest
<!-- Added by context-gathering agent -->

### How This Currently Works: The Figma-to-ScreenIR Transformation Pipeline

The codebase has a clean transformation pipeline that converts Figma nodes into React Native code through several stages. Understanding this pipeline is critical for implementing Step 4 quality improvements.

**Stage 1: API Layer** (`/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/api/`)
When a Figma URL is provided, the `FigmaClient` in `client.ts` parses the URL to extract `fileKey` and `nodeId`, then calls the Figma API to fetch node data. The `transformers.ts` module converts raw Figma API responses into clean internal types (`FigmaNode`). Key transformations include:
- `transformColor()`: Converts RGBA (0-1 range) to hex + rgba object
- `transformLayout()`: Maps Figma's `layoutMode` (HORIZONTAL/VERTICAL/NONE) to internal LayoutInfo
- `transformFills()`: Handles SOLID, GRADIENT_LINEAR, GRADIENT_RADIAL, and IMAGE fills
- `transformNode()`: Recursive transformer that produces a complete `FigmaNode` tree

**Stage 2: Normalization** (`/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/core/normalize/`)
The `normalizeTree()` function in `index.ts` filters out hidden/irrelevant nodes and unwraps useless wrapper groups. This produces a `NormalizedNode` tree with only visible, relevant UI elements. The filtering logic in `filter.ts` removes annotation layers, measurement guides, StatusBar, HomeIndicator, etc.

**Stage 3: Layout Detection** (`/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/core/layout/`)
The `addLayoutInfo()` function analyzes child positioning and Figma auto-layout to detect layout types (`row`, `column`, `stack`, or `absolute`). The `detector.ts` has functions like `isRowByPosition()`, `isColumnByPosition()`, `isStackByPosition()` that analyze bounding boxes. The `extractor.ts` extracts gap, padding, mainAlign, and crossAlign. Each node becomes a `LayoutNode` with a `layout: LayoutMeta` property.

**Stage 4: Semantic Recognition** (`/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/core/recognize/classifier.ts`)
The `recognizeSemantics()` function classifies nodes into semantic types. The `classifyNode()` function checks in order:
1. `isText()` - node.type === 'TEXT' && node.text exists
2. `isIcon()` - small vectors (8-48px), roughly square aspect ratio
3. `isImage()` - fills with type === 'image'
4. `isButton()` - container with background + centered text, max height 80px
5. `isCard()` - container with 2+ visual treatments (corner radius, shadow, background)
6. Default: Container

Each classified node becomes an `IRNode` with a `styleRef` pointing into StylesBundle.

**Stage 5: Style Extraction** (`/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/core/styles/extractor.ts`)
The `extractStyleFromProps()` function transforms Figma fills/strokes/effects into `ExtractedStyle` objects. The `extractTokens()` function deduplicates all colors, spacing, radii, typography, and shadows into a `DesignTokens` object. The final `StylesBundle` contains `styles: Record<string, ExtractedStyle>` and `tokens: DesignTokens`.

**Stage 6: Token Mapping** (`/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/core/mapping/`)
The mapping layer bridges extraction and generation:
- `theme-extractor.ts`: Parses project theme files (.ts, .js, .json) using dynamic `import()` and `walkObject()` to discover token categories
- `color-matcher.ts`: Inline Delta-E (CIE76) implementation for fuzzy color matching without chroma-js dependency
- `token-matcher.ts`: `matchTokens()` matches Figma tokens to project tokens using exact match priority, then fuzzy matching for colors

The `matchTokens()` function returns a `TokenMappings` object:
```typescript
interface TokenMappings {
  [category: string]: Record<string | number, string>;
  // e.g., colors: { "#3B82F6": "theme.colors.primary" }
  // e.g., spacing: { 16: "spacing.md" }
}
```

**Stage 7: Code Generation** (`/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/core/generation/`)
The `generateComponent()` orchestrator in `component-builder.ts` coordinates:
1. `buildImports()` - Collects RN components from IR tree (View, Text, Image, TouchableOpacity, StyleSheet)
2. `buildJSX()` - Recursive JSX string generation with proper indentation
3. `buildStyles()` - StyleSheet.create from StylesBundle with token mappings applied

The output is `GenerationResult`:
```typescript
interface GenerationResult {
  code: string;              // Complete TSX file content
  unmappedTokens: {
    colors: string[];
    spacing: number[];
    radii: number[];
  };
}
```

### The Full Pipeline Entry Point

The main pipeline is in `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/core/pipeline.ts`:
```typescript
export function transformToScreenIR(
  input: FigmaNode,
  options?: PipelineOptions
): ScreenIR {
  // Stage 1: Normalize
  const normalized = normalize(input, options);
  // Stage 2: Add Layout
  const withLayout = addLayout(normalized);
  // Stage 3: Recognize
  const ir = recognize(withLayout);
  // Stage 4: Extract Styles
  const stylesBundle = extractStyles(ir, withLayout, options);

  return { id, name, root: ir, stylesBundle };
}
```

### Key Data Types for Step 4 Implementation

**IRNode Union** (from `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/core/types.ts`):
```typescript
type IRNode = ContainerIR | TextIR | ImageIR | ButtonIR | CardIR | IconIR;

interface ContainerIR extends IRNodeBase {
  semanticType: 'Container';
  layout: LayoutMeta;
  children: IRNode[];
}

interface ButtonIR extends IRNodeBase {
  semanticType: 'Button';
  label: string;
  iconRef?: string;
  variant: 'primary' | 'secondary' | 'outline' | 'ghost';
}
```

**LayoutMeta** (controls flex layout generation):
```typescript
interface LayoutMeta {
  type: 'row' | 'column' | 'stack' | 'absolute';
  gap: number;
  padding: { top: number; right: number; bottom: number; left: number };
  mainAlign: 'start' | 'center' | 'end' | 'space-between' | 'space-around';
  crossAlign: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
}
```

**ScreenIR** (final pipeline output):
```typescript
interface ScreenIR {
  id: string;
  name: string;
  root: IRNode;
  stylesBundle: StylesBundle;
}
```

### How Detection Layer Should Integrate

**Detection runs AFTER semantic recognition, BEFORE code generation.** The detection layer should analyze the IR tree to find patterns:

1. **List Detection** - Find repeating items (3+ similar children in row/column layout):
   - Input: `IRNode` tree (Container with children)
   - Output: `ListHint[]` - identifies which containers should become FlatList
   - Signals: Similar bounding box dimensions, identical semanticType, consistent spacing

2. **Repetition Detection** - Find repeated component blocks (>=2 occurrences):
   - Input: `IRNode` tree
   - Output: `ComponentHint[]` - identifies extractable components
   - Signals: Matching structure (same child count, same semanticTypes), similar styles

**Proposed Detection Types** (for `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/core/detection/types.ts`):
```typescript
interface ListHint {
  containerId: string;
  itemIds: string[];
  orientation: 'horizontal' | 'vertical';
  itemType: 'inferred-component-name';
}

interface ComponentHint {
  componentName: string;
  instanceIds: string[];
  propsVariations: Record<string, string[]>;
}

interface DetectionResult {
  lists: ListHint[];
  components: ComponentHint[];
}
```

### How Generation Enhancements Should Work

**1. tokens-generator.ts** - Generate fallback tokens file when no project theme exists:
```typescript
function generateTokensFile(tokens: DesignTokens): string {
  // Produce: export const colors = { primary: '#3B82F6', ... };
  // Produce: export const spacing = { sm: 8, md: 16, ... };
  // Output path: generated/tokens.ts
}
```

**2. list-generator.ts** - Generate FlatList from ListHint:
```typescript
function generateFlatList(hint: ListHint, irTree: IRNode): {
  imports: string[];
  typeDefinition: string;
  renderItemFunction: string;
  flatListJSX: string;
}
```

The output should produce:
```tsx
interface ItemType { /* inferred from item props */ }

const renderItem = ({ item }: { item: ItemType }) => (
  <View style={styles.item}>...</View>
);

<FlatList
  data={data}
  renderItem={renderItem}
  keyExtractor={(item) => item.id}
/>
```

**3. jsx-builder.ts A11y Enhancements** - Add accessibility props:
- `accessibilityRole` for buttons, images, text
- `accessibilityLabel` derived from text content or node name
- `hitSlop` for small touch targets (icons <44px)
- `numberOfLines` where text overflow detected

Current JSX builder location: `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/core/generation/jsx-builder.ts`

Example enhancement for Button:
```typescript
case 'Button': {
  const escapedLabel = escapeJSXText(node.label);
  return `${spaces}<TouchableOpacity
  style={styles.${styleName}}
  onPress={() => {}}
  accessibilityRole="button"
  accessibilityLabel="${escapedLabel}"
>
${spaces}  <Text style={styles.${styleName}Text}>${escapedLabel}</Text>
${spaces}</TouchableOpacity>`;
}
```

**4. component-builder.ts Multi-file Output** - Enhanced to support multiple files:
```typescript
interface MultiFileResult {
  mainComponent: { path: string; content: string };
  extractedComponents: Array<{ path: string; content: string }>;
  tokens?: { path: string; content: string };
}
```

### How MCP Tool Integration Works

The existing MCP server (`/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/index.ts`) uses:
- `@modelcontextprotocol/sdk/server/index.js` for Server class
- `StdioServerTransport` for stdio communication
- Tool definitions with `inputSchema` for parameters
- Request handlers via `server.setRequestHandler()`

Current tools pattern:
```typescript
const tools: Tool[] = [
  {
    name: 'generate_screen',
    description: `...`,
    inputSchema: {
      type: 'object',
      properties: { figmaUrl: { type: 'string', ... }, ... },
      required: ['figmaUrl'],
    },
  },
];

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  switch (name) {
    case 'generate_screen': { /* implementation */ }
  }
});
```

**New `get_screen` Tool** (`/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/edge/tools/get-screen.ts`):

This tool should:
1. Parse Figma URL and fetch node via `FigmaClient`
2. Run the pipeline: `transformToScreenIR()`
3. Run detection: `runDetectors(irTree)`
4. Extract/match tokens: `matchTokens()`
5. Generate code: `generateComponent()` with detection hints
6. Return structured result

The `src/edge/tools/` directory does not exist yet - it should be created following the architecture blueprint.

### Existing MCP Server's generate_screen Implementation Reference

The current `generate_screen` tool (lines 232-577 in `src/index.ts`) shows the pattern:
1. Parse figmaUrl, extract nodeId
2. Load config via `getOrCreateFigmaConfig()`
3. Categorize element type (screen/modal/sheet/component)
4. Call `generateCompleteScreen()` from `one-shot-generator.js`
5. Register in manifest, save files
6. Return formatted response

The new `get_screen` tool should use the NEW pipeline (`src/core/pipeline.ts`) instead of the old `one-shot-generator.js`.

### Testing Patterns

Existing tests use Vitest with inline fixtures. Test file structure:
```
tests/core/generation/
├── component-builder.test.ts
├── imports-builder.test.ts
├── jsx-builder.test.ts
└── styles-builder.test.ts
```

Example test pattern from `component-builder.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { generateComponent } from '../../../src/core/generation/component-builder.js';
import type { ScreenIR, ContainerIR, TextIR } from '../../../src/core/types.js';
import type { TokenMappings } from '../../../src/core/mapping/token-matcher.js';

describe('generateComponent', () => {
  const baseBoundingBox = { x: 0, y: 0, width: 100, height: 100 };
  const baseLayout = { type: 'column' as const, gap: 0, ... };
  const emptyMappings: TokenMappings = { colors: {}, spacing: {}, ... };

  it('should generate complete TSX component', () => {
    const screen: ScreenIR = { ... };
    const result = generateComponent(screen, emptyMappings);
    expect(result.code).toContain("import React from 'react';");
    expect(result.code).toContain('export function ProductCard()');
  });
});
```

### Technical Reference Details

#### File Locations for Implementation

**Detection Layer (NEW)**:
- `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/core/detection/index.ts` - Barrel + runDetectors()
- `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/core/detection/list-detector.ts` - Repeating items detection
- `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/core/detection/repetition-detector.ts` - Repeated blocks detection
- `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/core/detection/types.ts` - DetectionResult types

**Generation Enhancements**:
- `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/core/generation/tokens-generator.ts` - NEW: generatedTokens.ts fallback
- `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/core/generation/list-generator.ts` - NEW: FlatList generation
- `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/core/generation/jsx-builder.ts` - ENHANCE: Add a11y props
- `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/core/generation/component-builder.ts` - ENHANCE: Multi-file output

**MCP Tool**:
- `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/edge/tools/get-screen.ts` - NEW: MCP tool

**Tests**:
- `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/tests/core/detection/` - NEW: Detection tests
- `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/tests/core/generation/` - ENHANCE: New generator tests

#### Key Imports

For Detection Layer:
```typescript
import type { IRNode, ContainerIR, LayoutMeta, BoundingBox } from '../types.js';
```

For Generation Enhancements:
```typescript
import type { ScreenIR, IRNode, StylesBundle, DesignTokens } from '../types.js';
import type { TokenMappings } from '../mapping/token-matcher.js';
import type { DetectionResult, ListHint, ComponentHint } from '../detection/types.js';
```

For MCP Tool:
```typescript
import { FigmaClient } from '../../api/client.js';
import { transformToScreenIR } from '../../core/pipeline.js';
import { runDetectors } from '../../core/detection/index.js';
import { extractProjectTokens, matchTokens } from '../../core/mapping/index.js';
import { generateComponent } from '../../core/generation/index.js';
```

#### Configuration

Project uses ES modules with `.js` extensions in imports (despite being TypeScript). TypeScript path aliases are defined in tsconfig.json:
```json
{
  "paths": {
    "@/*": ["src/*"],
    "@/core/*": ["src/core/*"]
  }
}
```

Run tests with: `npm test` (Vitest)
Build with: `npm run build`

### List Detection Algorithm Hints

To detect repeating items for FlatList generation:

1. **Candidate Containers**: Find containers with 3+ children
2. **Similarity Check**: Compare child structure:
   - Same semanticType distribution
   - Similar bounding box dimensions (within 10% tolerance)
   - Consistent gap between items
3. **Orientation**: Determine from container's layout.type (row = horizontal, column = vertical)
4. **Item Type Inference**: Use first item's structure to generate type name

Example algorithm:
```typescript
function detectList(container: ContainerIR): ListHint | null {
  if (container.children.length < 3) return null;

  const firstChild = container.children[0];
  const allSimilar = container.children.every(child =>
    isSimilarStructure(child, firstChild)
  );

  if (!allSimilar) return null;

  return {
    containerId: container.id,
    itemIds: container.children.map(c => c.id),
    orientation: container.layout.type === 'row' ? 'horizontal' : 'vertical',
    itemType: inferTypeName(firstChild),
  };
}
```

### A11y Props Reference

For jsx-builder.ts enhancements:

**Button**:
```typescript
accessibilityRole="button"
accessibilityLabel="${label}"
```

**Image**:
```typescript
accessibilityRole="image"
accessibilityLabel="${node.name}"
```

**Icon** (small touch target):
```typescript
hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
accessibilityRole="button"
```

**Text** (potential overflow):
```typescript
numberOfLines={2}
ellipsizeMode="tail"
```

## User Notes
- Builds on completed Step 3 (mapping + generation layers)
- See `.local/docs/implementation-plan.md` for full context
- See `.local/architecture-blueprint.md` for module structure

## Work Log
<!-- Updated as work progresses -->
- [2025-12-17] Task created
