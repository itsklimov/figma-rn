---
name: 02-generation
status: completed
---

# Subtask: Generation Layer

## Goal

Generate production-ready TSX + StyleSheet from ScreenIR (~410 LOC total).

## Files Created

```
src/core/generation/
├── index.ts              # Barrel exports
├── component-builder.ts  # Main orchestrator - generateComponent()
├── jsx-builder.ts        # IRNode → JSX string
├── styles-builder.ts     # StylesBundle → StyleSheet.create
├── imports-builder.ts    # Collect RN component imports
└── utils.ts              # Shared utilities (toValidIdentifier, escapeJSXText)
```

## Implementation Details

### component-builder.ts

Main orchestration:

```typescript
interface GenerationResult {
  code: string;           // Complete TSX file content
  unmappedTokens: {       // For visibility
    colors: string[];
    spacing: number[];
    radii: number[];
  };
}

function generateComponent(
  screen: ScreenIR,
  mappings: TokenMappings,
  options?: { componentName?: string }
): GenerationResult
```

### jsx-builder.ts

Transform IR tree to JSX string:

```typescript
function buildJSX(node: IRNode, indent: number = 0): string
```

Handles:
- Container → View
- Text → Text
- Image → Image
- Button → TouchableOpacity + Text
- Card → View with card styling
- Icon → Image (for now)

### styles-builder.ts

Generate StyleSheet.create:

```typescript
function buildStyles(
  stylesBundle: StylesBundle,
  mappings: TokenMappings
): string
```

Key features:
- Semantic naming (derive from node context)
- Logical property order (layout → spacing → border → colors → text)
- TODO comments for unmatched tokens
- Use theme.X references when mapped

### imports-builder.ts

Collect required imports:

```typescript
function buildImports(root: IRNode): string
```

## Output Format

```tsx
import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';

export function ProductCardContent() {
  return (
    <View style={styles.container}>
      <Image source={require('./assets/avatar.png')} style={styles.avatar} />
      <Text style={styles.title}>Product Name</Text>
      <TouchableOpacity style={styles.primaryButton} onPress={() => {}}>
        <Text style={styles.primaryButtonText}>Add to Cart</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
    padding: 16,
    backgroundColor: theme.colors.surface,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
  },
  primaryButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
```

## Success Criteria

- [x] Generate valid TSX from ScreenIR
- [x] StyleSheet.create with mapped tokens
- [x] Semantic style naming
- [x] Single file output (component + styles)
- [x] TODO comments for unmatched tokens
- [x] Unit tests for each builder

## Dependencies

- Requires `TokenMappings` from mapping layer (01-mapping-layer.md)
- Uses `ScreenIR` from `src/core/types.ts`

## Context Manifest
<!-- Added by context-gathering agent -->

### How This Currently Works: Pipeline to ScreenIR

The transformation pipeline in `src/core/pipeline.ts` produces a `ScreenIR` structure that is the input for code generation. When `transformToScreenIR()` is called with a FigmaNode, it runs through four sequential stages:

**Stage 1 (Normalize)**: The `normalizeTree()` function filters hidden nodes, annotation/measurement layers, and system components (StatusBar, HomeIndicator). It also unwraps useless wrapper groups. The result is a `NormalizedNode` tree containing only visible, relevant UI elements with preserved visual properties (fills, strokes, effects, cornerRadius, opacity, typography).

**Stage 2 (Add Layout)**: The `addLayoutInfo()` function analyzes each node's children positioning and Figma auto-layout properties to detect the layout type (`row`, `column`, `stack`, or `absolute`). It extracts gap, padding, mainAlign (`start`, `center`, `end`, `space-between`, `space-around`), and crossAlign (`start`, `center`, `end`, `stretch`, `baseline`). Each node becomes a `LayoutNode` with a `layout: LayoutMeta` property.

**Stage 3 (Recognize)**: The `recognizeSemantics()` function classifies each node into one of six semantic types: `Container`, `Text`, `Image`, `Button`, `Card`, or `Icon`. The classification is done by `classifyNode()` which checks in order: text nodes (`type === 'TEXT'`), icons (small vectors 8-48px), images (fills with `type === 'image'`), buttons (container + background + centered text), cards (container + corner radius + shadow + background), and defaults to Container. Each classified node becomes an `IRNode` with a `styleRef` (e.g., `style_1_2_3`) pointing into the StylesBundle.

**Stage 4 (Extract Styles)**: The `extractStyles()` function builds a map of visual properties from the LayoutNode tree, then collects styles for each IRNode. The `extractStyleFromProps()` function transforms Figma fills/strokes/effects into `ExtractedStyle` objects with properties like `backgroundColor`, `borderColor`, `borderWidth`, `borderRadius`, `shadow`, `typography`, `width`, `height`, `opacity`. The `extractTokens()` function then deduplicates all colors, spacing, radii, typography, and shadows into a `DesignTokens` object.

The final `ScreenIR` structure looks like:
```typescript
interface ScreenIR {
  id: string;                    // From input FigmaNode
  name: string;                  // Screen name
  root: IRNode;                  // IR tree (Container with children)
  stylesBundle: StylesBundle;    // { styles: Record<string, ExtractedStyle>, tokens: DesignTokens }
}
```

### Data Structures This Layer Must Consume

**IRNode Union Type** (from `src/core/types.ts`):
```typescript
type IRNode = ContainerIR | TextIR | ImageIR | ButtonIR | CardIR | IconIR;

// All have base props:
interface IRNodeBase {
  id: string;
  name: string;
  semanticType: SemanticType;
  boundingBox: BoundingBox;
  styleRef: string;  // Key into StylesBundle.styles
}

// Container/Card have layout and children
interface ContainerIR extends IRNodeBase {
  semanticType: 'Container';
  layout: LayoutMeta;
  children: IRNode[];
}

// Text has text content
interface TextIR extends IRNodeBase {
  semanticType: 'Text';
  text: string;
}

// Button has label and variant
interface ButtonIR extends IRNodeBase {
  semanticType: 'Button';
  label: string;
  iconRef?: string;
  variant: 'primary' | 'secondary' | 'outline' | 'ghost';
}

// Image has optional imageRef
interface ImageIR extends IRNodeBase {
  semanticType: 'Image';
  imageRef?: string;
}

// Icon has size and iconRef
interface IconIR extends IRNodeBase {
  semanticType: 'Icon';
  iconRef: string;
  size: number;
}
```

**LayoutMeta** (for Container/Card children layout):
```typescript
interface LayoutMeta {
  type: 'row' | 'column' | 'stack' | 'absolute';
  gap: number;
  padding: { top: number; right: number; bottom: number; left: number };
  mainAlign: 'start' | 'center' | 'end' | 'space-between' | 'space-around';
  crossAlign: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
}
```

**StylesBundle** (from ScreenIR.stylesBundle):
```typescript
interface StylesBundle {
  styles: Record<string, ExtractedStyle>;  // styleRef -> visual props
  tokens: DesignTokens;                    // Deduplicated design tokens
}

interface ExtractedStyle {
  id: string;
  backgroundColor?: string;           // Hex: "#3b82f6"
  backgroundGradient?: { type, colors, positions, angle };
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number | { topLeft, topRight, bottomRight, bottomLeft };
  shadow?: { color, offsetX, offsetY, blur, spread };
  typography?: { fontFamily, fontSize, fontWeight, lineHeight, letterSpacing, textAlign, color };
  width?: number;
  height?: number;
  opacity?: number;
}

interface DesignTokens {
  colors: Record<string, string>;     // "color_0" -> "#3b82f6"
  spacing: Record<string, number>;    // "spacing_0" -> 16
  radii: Record<string, number>;      // "radius_0" -> 8
  typography: Record<string, { fontFamily, fontSize, fontWeight, lineHeight }>;
  shadows: Record<string, { color, offsetX, offsetY, blur, spread }>;
}
```

**TokenMappings** (from 01-mapping-layer, not yet implemented):
```typescript
interface TokenMappings {
  [category: string]: Record<string | number, string>;
  // e.g., colors: { "#3B82F6": "theme.colors.primary", "#FF0000": "#FF0000" }
  // e.g., spacing: { 16: "spacing.md", 18: "18" }
}
```

### Patterns from Existing Code Generator (code-generator-v2.ts)

The existing `generateReactNativeComponent()` function in `src/code-generator-v2.ts` (~1500 LOC) is complex and tightly coupled to Figma's raw node format. The new generation layer should be MUCH simpler because it consumes the clean ScreenIR format.

**Key Patterns to PRESERVE (but simplify)**:

1. **Semantic Type to RN Component Mapping** (from `mapToRNComponent`):
   - TEXT -> `Text`
   - Frame/Group with button name -> `TouchableOpacity`
   - Rectangle with image fill -> `Image`
   - Default -> `View`

   Our new mapping from IR:
   - `Container` -> `View`
   - `Text` -> `Text`
   - `Image` -> `Image`
   - `Button` -> `TouchableOpacity` wrapping children
   - `Card` -> `View` with card styling
   - `Icon` -> `Image` (for now)

2. **JSX Generation with Indentation** (from `generateJSXRecursive`):
   ```typescript
   const indent = '  '.repeat(depth);
   // <Component style={styles.styleName}>{children}</Component>
   ```

3. **Style Object Generation** (from `generateStyleObject`):
   - Layout: `flexDirection`, `gap`, `justifyContent`, `alignItems`
   - Spacing: `paddingLeft`, `paddingRight`, `paddingTop`, `paddingBottom`
   - Dimensions: `width`, `height`, `flex`
   - Visual: `backgroundColor`, `borderRadius`, `borderColor`, `borderWidth`
   - Shadow: `shadowColor`, `shadowOpacity`, `shadowRadius`, `shadowOffset`, `elevation`
   - Typography: `fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing`, `textAlign`, `color`

4. **Style Naming** (from `smart-namer.ts` and `style-normalizer.ts`):
   - Use `normalizeStyleName()` which transliterates Cyrillic and converts to camelCase
   - Handle numeric prefixes by adding "style" prefix (JS property names can't start with numbers)
   - Generic names (label, frame, group) get context-aware naming

5. **Imports Collection**:
   - Scan IR tree for which RN components are needed (View, Text, Image, TouchableOpacity, etc.)
   - Add StyleSheet import always
   - Add LinearGradient from expo-linear-gradient if gradients detected

**Patterns to AVOID** (complexity in v2):
- On-the-fly theme mapping with regex replacement (already done by mapping layer)
- ts-morph AST generation (just use string concatenation)
- System component filtering (already done in normalize stage)
- Interactive group detection (separate concern, not in scope)
- Prettier formatting as build step (let user run linter)

### How New Generation Layer Should Work

**component-builder.ts** (~150 LOC):
```typescript
function generateComponent(
  screen: ScreenIR,
  mappings: TokenMappings,
  options?: { componentName?: string }
): GenerationResult {
  // 1. Build imports from IR tree
  const imports = buildImports(screen.root);

  // 2. Build JSX from IR tree
  const jsx = buildJSX(screen.root, 0);

  // 3. Build StyleSheet from StylesBundle + mappings
  const styles = buildStyles(screen.stylesBundle, mappings);

  // 4. Assemble final file
  const componentName = options?.componentName || pascalCase(screen.name);
  const code = assembleComponent(imports, componentName, jsx, styles);

  // 5. Return with unmapped tokens report
  return { code, unmappedTokens: collectUnmapped(mappings) };
}
```

**jsx-builder.ts** (~100 LOC):
```typescript
function buildJSX(node: IRNode, indent: number = 0): string {
  const spaces = '  '.repeat(indent);
  const styleName = deriveStyleName(node);  // From styleRef or name

  switch (node.semanticType) {
    case 'Container':
    case 'Card':
      return `${spaces}<View style={styles.${styleName}}>
${node.children.map(c => buildJSX(c, indent + 1)).join('\n')}
${spaces}</View>`;

    case 'Text':
      return `${spaces}<Text style={styles.${styleName}}>{${JSON.stringify(node.text)}}</Text>`;

    case 'Image':
      const source = node.imageRef ? `require('${node.imageRef}')` : `{uri: 'TODO'}`;
      return `${spaces}<Image source={${source}} style={styles.${styleName}} />`;

    case 'Button':
      return `${spaces}<TouchableOpacity style={styles.${styleName}} onPress={() => {}}>
${spaces}  <Text style={styles.${styleName}Text}>{${JSON.stringify(node.label)}}</Text>
${spaces}</TouchableOpacity>`;

    case 'Icon':
      return `${spaces}<Image source={require('./assets/${styleName}.png')} style={styles.${styleName}} />`;
  }
}
```

**styles-builder.ts** (~120 LOC):
```typescript
function buildStyles(
  stylesBundle: StylesBundle,
  mappings: TokenMappings
): string {
  const styleEntries: string[] = [];

  for (const [styleRef, extractedStyle] of Object.entries(stylesBundle.styles)) {
    const styleName = deriveStyleName(styleRef);
    const props = buildStyleProps(extractedStyle, mappings);
    styleEntries.push(`  ${styleName}: {\n${props}\n  },`);
  }

  return `const styles = StyleSheet.create({
${styleEntries.join('\n')}
});`;
}

function buildStyleProps(style: ExtractedStyle, mappings: TokenMappings): string {
  const lines: string[] = [];

  // Layout props first
  // Then spacing (padding, margin)
  // Then border (width, color, radius)
  // Then colors (background)
  // Then text (font, size, weight, color)

  // Apply mappings: if color "#3B82F6" maps to "theme.colors.primary", use that
  // Otherwise use raw value with TODO comment

  return lines.join('\n');
}
```

**imports-builder.ts** (~40 LOC):
```typescript
function buildImports(root: IRNode): string {
  const rnComponents = new Set<string>(['StyleSheet']);

  collectComponents(root, rnComponents);

  const lines = [
    `import React from 'react';`,
    `import { ${Array.from(rnComponents).sort().join(', ')} } from 'react-native';`,
  ];

  return lines.join('\n');
}

function collectComponents(node: IRNode, set: Set<string>): void {
  switch (node.semanticType) {
    case 'Container':
    case 'Card':
      set.add('View');
      for (const child of node.children) collectComponents(child, set);
      break;
    case 'Text':
      set.add('Text');
      break;
    case 'Image':
    case 'Icon':
      set.add('Image');
      break;
    case 'Button':
      set.add('TouchableOpacity');
      set.add('Text');
      break;
  }
}
```

### Style Property Order Convention

For maintainable StyleSheet output, use this property order:

1. **Layout**: `flexDirection`, `flex`, `flexWrap`, `flexGrow`, `flexShrink`
2. **Alignment**: `justifyContent`, `alignItems`, `alignSelf`
3. **Spacing (gap)**: `gap`, `rowGap`, `columnGap`
4. **Spacing (padding)**: `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft` (or `padding`)
5. **Spacing (margin)**: `marginTop`, `marginRight`, `marginBottom`, `marginLeft` (or `margin`)
6. **Size**: `width`, `height`, `minWidth`, `minHeight`, `maxWidth`, `maxHeight`
7. **Position**: `position`, `top`, `right`, `bottom`, `left`, `zIndex`
8. **Border**: `borderWidth`, `borderColor`, `borderStyle`
9. **Border Radius**: `borderRadius` (or individual corners)
10. **Background**: `backgroundColor`, `opacity`
11. **Shadow**: `shadowColor`, `shadowOffset`, `shadowOpacity`, `shadowRadius`, `elevation`
12. **Text**: `fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing`, `textAlign`, `color`

### LayoutMeta to Flex Mapping

```typescript
function layoutToFlex(layout: LayoutMeta): Record<string, any> {
  const styles: Record<string, any> = {};

  // Direction
  if (layout.type === 'row') styles.flexDirection = 'row';
  else if (layout.type === 'column') styles.flexDirection = 'column';
  // stack and absolute don't set flexDirection

  // Gap
  if (layout.gap > 0) styles.gap = layout.gap;

  // Main axis alignment
  const mainMap = {
    'start': 'flex-start',
    'center': 'center',
    'end': 'flex-end',
    'space-between': 'space-between',
    'space-around': 'space-around'
  };
  if (layout.mainAlign !== 'start') {
    styles.justifyContent = mainMap[layout.mainAlign];
  }

  // Cross axis alignment
  const crossMap = {
    'start': 'flex-start',
    'center': 'center',
    'end': 'flex-end',
    'stretch': 'stretch',
    'baseline': 'baseline'
  };
  if (layout.crossAlign !== 'stretch') {
    styles.alignItems = crossMap[layout.crossAlign];
  }

  // Padding
  const { top, right, bottom, left } = layout.padding;
  if (top > 0) styles.paddingTop = top;
  if (right > 0) styles.paddingRight = right;
  if (bottom > 0) styles.paddingBottom = bottom;
  if (left > 0) styles.paddingLeft = left;

  return styles;
}
```

### Token Mapping Application

When generating style values, check mappings first:

```typescript
function mapValue(category: string, value: string | number, mappings: TokenMappings): string {
  const categoryMappings = mappings[category];
  if (categoryMappings && categoryMappings[value]) {
    return categoryMappings[value];  // Returns "theme.colors.primary"
  }
  // Return raw value with TODO comment marker for unmapped
  return typeof value === 'string' ? `'${value}'` : String(value);
}
```

If a color like `#3B82F6` maps to `theme.colors.primary`, the output should be:
```javascript
backgroundColor: theme.colors.primary,
```

If unmapped, add TODO comment:
```javascript
backgroundColor: '#3B82F6', // TODO: map to theme
```

### Technical Reference Details

#### File Locations
- Implementation: `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/core/generation/`
- Types consumed: `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/core/types.ts`
- Pipeline producing ScreenIR: `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/core/pipeline.ts`
- Style extraction logic: `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/core/styles/extractor.ts`
- Existing v2 generator (patterns ref): `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/code-generator-v2.ts`
- Style naming utilities: `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/smart-namer.ts`, `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/style-normalizer.ts`
- Tests should go: `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/tests/core/generation/`

#### Key Functions to Import
```typescript
// From src/core/types.ts
import type { ScreenIR, IRNode, StylesBundle, ExtractedStyle, DesignTokens, LayoutMeta, SemanticType } from '../types.js';

// For style naming (existing utilities can be reused or simplified inline)
// From src/style-normalizer.ts: normalizeStyleName(name: string): string
// From src/smart-namer.ts: generateSmartStyleName(nodeName, nodeType, context): string
```

#### Output Type
```typescript
interface GenerationResult {
  code: string;           // Complete TSX file content
  unmappedTokens: {       // For visibility/debugging
    colors: string[];     // Hex colors not mapped to theme
    spacing: number[];    // Spacing values not mapped
    radii: number[];      // Radii values not mapped
  };
}
```

### Testing Strategy

Create unit tests for each builder in `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/tests/core/generation/`:

1. **jsx-builder.test.ts**: Test each semantic type produces correct JSX string
2. **styles-builder.test.ts**: Test ExtractedStyle -> StyleSheet string conversion
3. **imports-builder.test.ts**: Test component collection from IR tree
4. **component-builder.test.ts**: Integration test producing valid TSX

Use inline fixtures (no separate fixture files). Example test structure:
```typescript
import { describe, it, expect } from 'vitest';
import { buildJSX } from '../../../src/core/generation/jsx-builder.js';

describe('buildJSX', () => {
  it('should generate View for Container', () => {
    const node: IRNode = {
      id: '1:1',
      name: 'container',
      semanticType: 'Container',
      boundingBox: { x: 0, y: 0, width: 100, height: 100 },
      styleRef: 'style_container',
      layout: { type: 'column', gap: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, mainAlign: 'start', crossAlign: 'start' },
      children: [],
    };

    const result = buildJSX(node, 0);
    expect(result).toContain('<View');
    expect(result).toContain('style={styles.container}');
  });
});
```
