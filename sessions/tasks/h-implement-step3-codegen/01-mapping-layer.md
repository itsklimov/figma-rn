---
name: 01-mapping-layer
status: pending
---

# Subtask: Mapping Layer

## Goal

Create simplified token extraction and matching system (~230 LOC total).

## Files to Create

```
src/core/mapping/
├── index.ts              # Barrel exports
├── theme-extractor.ts    # ~100 LOC - Extract project tokens
├── token-matcher.ts      # ~80 LOC - Match Figma → project
└── color-matcher.ts      # ~50 LOC - Delta-E (inline, no deps)
```

## Implementation Details

### theme-extractor.ts

Extract project theme tokens from theme file:

```typescript
// Dynamic token categories - discovers what the project has
type TokenCategory = string;  // 'colors' | 'spacing' | 'radii' | 'shadows' | ...

interface ProjectTokens {
  [category: TokenCategory]: Map<string | number, string>;
  // Dynamically populated based on what theme file contains
  // e.g., colors: Map<"#3B82F6", "theme.colors.primary">
  // e.g., spacing: Map<16, "spacing.md">
  // e.g., shadows: Map<"shadow-key", "shadows.card">
}

async function extractProjectTokens(themePath: string): Promise<ProjectTokens>
```

**Strategy**: Dynamic import if .ts/.js, JSON parse if .json, regex fallback for edge cases.
**Key**: Discover token categories from theme structure, don't hardcode them.

### token-matcher.ts

Match Figma tokens to project tokens:

```typescript
interface TokenMappings {
  [category: TokenCategory]: Record<string | number, string>;
  // Dynamically matches whatever categories exist in both Figma and project
  // e.g., colors: { "#3B82F6": "theme.colors.primary", "#FF0000": "#FF0000" }
  // e.g., spacing: { 16: "spacing.md", 18: "18" }
}

function matchTokens(
  extracted: DesignTokens,  // From ScreenIR.stylesBundle.tokens
  project: ProjectTokens
): TokenMappings
```

**Strategy**: Exact match first, fuzzy only for colors (Delta-E).

### color-matcher.ts

Inline Delta-E color matching (no chroma-js):

```typescript
function findClosestColor(
  hex: string,
  themeColors: Map<string, string>,
  threshold: number = 5
): string | null

function hexToLab(hex: string): [number, number, number]
function labDistance(a: Lab, b: Lab): number
```

## Success Criteria

- [ ] Extract tokens dynamically from theme file (any category the project defines)
- [ ] Match Figma tokens with exact match priority
- [ ] Delta-E color matching with inline LAB math (for color categories)
- [ ] No heavy dependencies
- [ ] Unit tests for each module

## Reference Code

Core logic to extract from existing (simplify, don't copy verbatim):
- `src/theme-parser.ts` - token extraction patterns
- `src/color-matcher.ts` - Delta-E logic
- `src/auto-theme-mapper.ts` - matching patterns

## Context Manifest
<!-- Added by context-gathering agent -->

### How Token Extraction Currently Works

The existing implementation spans three main files totaling approximately 1,658 lines of code. The goal of this subtask is to simplify this down to ~230 LOC while preserving the core functionality.

#### Theme Parsing Flow (`src/theme-parser.ts` - 612 LOC)

When extracting project tokens, the current `parseThemeFile()` function uses **ts-morph** (a heavy TypeScript AST manipulation library) to parse theme files. The flow works as follows:

1. **File Loading**: The function takes an absolute path to a theme file (`.ts`, `.tsx`, `.js`, `.jsx`, or `.json`) and a base path string for token naming (default: `'theme'`).

2. **Theme Object Discovery**: The `findThemeNode()` function uses multiple strategies to locate the theme object:
   - Strategy 1: Look for default export
   - Strategy 2: Look for named exports with known names (`'theme'`, `'colors'`, `'palette'`, `'tokens'`, `'designTokens'`, `'typography'`)
   - Strategy 3: Look for variable declarations with theme-like names
   - Strategy 4: Fallback to the largest object literal in the file

3. **Recursive Token Extraction**: `extractTokensRecursive()` walks the AST and extracts:
   - **Colors**: Hex (`#RRGGBB`), RGB, RGBA, HSL patterns via `isColorValue()` regex
   - **Fonts**: Properties containing `font` + `family` or `font` + `weight`
   - **Typography Styles**: Objects containing `fontSize` property (complete style objects)
   - **Spacing Values**: Properties containing keywords like `spacing`, `margin`, `padding`, `gap`
   - **Radii Values**: Properties containing `radius`, `radii`, `borderRadius`
   - **Shadow Objects**: Properties containing `shadow`, `elevation`, `boxShadow`

4. **Output Structure**: Returns `ThemeTokens` interface:
```typescript
interface ThemeTokens {
  colors: Map<string, ColorToken>;      // hex → { value, path, name }
  fonts: Map<string, FontToken>;        // key → { family, weight, path, name }
  typography?: Map<string, TypographyStyleToken>;  // path → style object
  spacing?: SpacingInfo;                // { function?, values: number[] }
  radii?: Map<string, number>;          // path → value
  shadows?: Map<string, any>;           // path → shadow object
}
```

**Key Insight for Simplification**: The ts-morph dependency is overkill. For the simplified version, we should:
- Use dynamic `import()` for `.ts/.js` files (leveraging Node's native ESM/CJS handling)
- Use `JSON.parse()` for `.json` files
- Avoid AST parsing entirely - work with runtime objects instead

#### Color Matching Flow (`src/color-matcher.ts` - 254 LOC)

The color matching uses **chroma-js** library for perceptual color comparison. The core algorithm:

1. **Input**: A Figma hex color and a `Map<string, ColorToken>` of theme colors.

2. **Delta-E Calculation**: Uses `chroma(hex).lab()` to convert hex to LAB color space, then calculates Euclidean distance (CIE76 formula):
```typescript
function calculateDeltaE(lab1: number[], lab2: number[]): number {
  const deltaL = lab1[0] - lab2[0];
  const deltaA = lab1[1] - lab2[1];
  const deltaB = lab1[2] - lab2[2];
  return Math.sqrt(deltaL * deltaL + deltaA * deltaA + deltaB * deltaB);
}
```

3. **Confidence Calculation**: Delta-E is converted to a 0-1 confidence score using exponential decay:
```typescript
const confidence = Math.exp(-deltaE / 20);
// deltaE = 0 → confidence = 1.0 (perfect)
// deltaE = 2.3 → confidence ≈ 0.9 (imperceptible)
// deltaE = 5 → confidence ≈ 0.8 (small difference)
// deltaE = 10 → confidence ≈ 0.6 (noticeable)
```

4. **Threshold**: Default `minConfidence` is 0.8, meaning Delta-E < 5 for a match.

**Key Insight for Simplification**: The chroma-js dependency can be replaced with ~30 lines of inline LAB math:
- Hex → RGB: String parsing
- RGB → XYZ: Linear sRGB conversion with gamma correction
- XYZ → LAB: Standard D65 illuminant transformation

#### Auto Theme Mapping Flow (`src/auto-theme-mapper.ts` - 792 LOC)

This orchestrates the mapping process for different token categories:

1. **Color Mapping** (`autoGenerateColorMappings()`):
   - Calls `parseThemeFile()` to get theme tokens
   - Iterates through Figma colors
   - Uses `findClosestThemeColor()` with 0.85 confidence threshold
   - Returns `Record<string, string>` (hex → theme path)

2. **Typography Mapping** (`autoGenerateTypographyMappings()`):
   - Matches by fontSize and fontWeight with tolerance (size ±2px, weight ±100)
   - Confidence formula: `1 - (sizeDiff / 10) - (weightDiff / 1000)`

3. **Spacing Mapping** (`autoGenerateSpacingMappings()`):
   - Exact match = 1.0 confidence
   - Within 2px = confidence based on difference

4. **Radii Mapping** (`autoGenerateRadiiMappings()`):
   - Same approach as spacing (exact match priority, 2px tolerance)

5. **Shadow Mapping** (`autoGenerateShadowMappings()`):
   - Matches on offsetX, offsetY, blur, opacity with tolerances
   - Uses weighted average of parameter similarities

**Extraction Functions**: The file also contains functions to extract Figma values from node metadata:
- `extractFigmaColors()` - traverses fills, backgroundColor
- `extractFigmaSpacing()` - traverses padding, gap properties
- `extractFigmaRadii()` - traverses cornerRadius values
- `extractFigmaShadows()` - traverses effects array
- `extractFigmaTypography()` - traverses TEXT nodes for style info

### Input/Output Data Shapes

#### Input: DesignTokens (from ScreenIR.stylesBundle.tokens)

Defined in `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/core/types.ts`:
```typescript
interface DesignTokens {
  colors: Record<string, string>;        // "color_0" → "#3B82F6"
  spacing: Record<string, number>;       // "spacing_0" → 16
  radii: Record<string, number>;         // "radius_0" → 8
  typography: Record<string, {
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    lineHeight: number;
  }>;
  shadows: Record<string, {
    color: string;
    offsetX: number;
    offsetY: number;
    blur: number;
    spread: number;
  }>;
}
```

These tokens are collected by `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/core/styles/extractor.ts` during the pipeline (see `extractTokens()` function at line 336).

#### Input: ProjectConfig (configuration)

Defined in `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/config-schema.ts`:
```typescript
interface ProjectConfig {
  framework: 'react-native' | 'expo' | 'ignite';
  theme?: {
    location: string;           // Path to theme file
    type: 'object-export' | 'styled-components' | 'nativewind' | 'tamagui';
    mainThemeLocation?: string; // For spacing, radii, shadows
    colorPath?: string;         // e.g., 'colors' or 'palette.colors'
    fontPath?: string;
    typographyFile?: string;
  };
  codeStyle: {
    stylePattern: 'useTheme' | 'StyleSheet' | 'styled-components' | 'nativewind';
    scaleFunction?: string;     // e.g., 'scale', 'RFValue'
    importPrefix?: string;      // e.g., '@app', '@components'
  };
  mappings?: {                  // Manual overrides
    colors?: Record<string, string>;
    fonts?: Record<string, string>;
    spacing?: Record<number, string>;
    radii?: Record<number, string>;
    shadows?: Record<string, string>;
    typography?: Record<string, string>;
  };
}
```

#### Output: New Interfaces to Create

```typescript
// Dynamic categories - not hardcoded
type TokenCategory = string;  // 'colors' | 'spacing' | 'radii' | 'shadows' | ...

// From theme-extractor.ts
interface ProjectTokens {
  [category: TokenCategory]: Map<string | number, string>;
  // Example:
  // colors: Map<"#3B82F6", "theme.colors.primary">
  // spacing: Map<16, "spacing.md">
}

// From token-matcher.ts
interface TokenMappings {
  [category: TokenCategory]: Record<string | number, string>;
  // Example:
  // colors: { "#3B82F6": "theme.colors.primary", "#FF0000": "#FF0000" }
  // spacing: { 16: "spacing.md", 18: "18" }
}
```

### Hex to LAB Conversion (Inline Implementation)

The color-matcher.ts needs inline LAB math to replace chroma-js. Here's the required conversion chain:

**Step 1: Hex to RGB (0-255)**
```typescript
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}
```

**Step 2: RGB to Linear RGB (gamma correction)**
```typescript
function srgbToLinear(c: number): number {
  c = c / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
```

**Step 3: Linear RGB to XYZ (D65 illuminant)**
```typescript
function linearRgbToXyz(r: number, g: number, b: number): [number, number, number] {
  return [
    r * 0.4124564 + g * 0.3575761 + b * 0.1804375,
    r * 0.2126729 + g * 0.7151522 + b * 0.0721750,
    r * 0.0193339 + g * 0.1191920 + b * 0.9503041,
  ];
}
```

**Step 4: XYZ to LAB**
```typescript
// D65 reference white
const Xn = 0.95047, Yn = 1.0, Zn = 1.08883;

function f(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : (7.787 * t) + 16/116;
}

function xyzToLab(x: number, y: number, z: number): [number, number, number] {
  const L = 116 * f(y / Yn) - 16;
  const a = 500 * (f(x / Xn) - f(y / Yn));
  const b = 200 * (f(y / Yn) - f(z / Zn));
  return [L, a, b];
}
```

### Testing Patterns

Tests use **vitest** framework. Pattern from `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/tests/core/styles/extractor.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('moduleName', () => {
  it('should do specific thing', () => {
    const input = /* ... */;
    const result = functionUnderTest(input);
    expect(result.property).toBe(expectedValue);
  });
});
```

Test files should be created at:
- `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/tests/core/mapping/theme-extractor.test.ts`
- `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/tests/core/mapping/token-matcher.test.ts`
- `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/tests/core/mapping/color-matcher.test.ts`

### Technical Reference Details

#### Key File Locations

| Purpose | Path |
|---------|------|
| New implementation | `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/core/mapping/` |
| Types to consume | `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/core/types.ts` |
| Config types | `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/config-schema.ts` |
| Existing theme parser (reference) | `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/theme-parser.ts` |
| Existing color matcher (reference) | `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/color-matcher.ts` |
| Existing auto mapper (reference) | `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/auto-theme-mapper.ts` |
| Tests location | `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/tests/core/mapping/` |

#### Dependencies

**Current (to avoid)**:
- `ts-morph` - Heavy TypeScript AST library (~21MB)
- `chroma-js` - Color manipulation library (~30KB)

**New (allowed)**:
- Node's native `import()` for dynamic module loading
- Built-in `JSON.parse()` for JSON files
- No external dependencies for color math

#### Function Signatures to Implement

**theme-extractor.ts:**
```typescript
async function extractProjectTokens(themePath: string): Promise<ProjectTokens>
```

**token-matcher.ts:**
```typescript
function matchTokens(
  extracted: DesignTokens,    // From ScreenIR.stylesBundle.tokens
  project: ProjectTokens       // From extractProjectTokens()
): TokenMappings
```

**color-matcher.ts:**
```typescript
function findClosestColor(
  hex: string,
  themeColors: Map<string, string>,
  threshold?: number           // Default: 5 (Delta-E)
): string | null

function hexToLab(hex: string): [number, number, number]

function labDistance(a: [number, number, number], b: [number, number, number]): number
```

### Implementation Notes

1. **Theme File Loading Strategy**:
   - For `.ts/.js`: Use `await import(themePath)` and access default/named exports
   - For `.json`: Use `fs.readFile` + `JSON.parse`
   - Walk the resulting runtime object recursively (no AST needed)

2. **Token Category Discovery**:
   - Don't hardcode categories - discover them from the theme object structure
   - Common patterns: `theme.colors.*`, `theme.spacing.*`, `spacing.*`, etc.
   - Use heuristics: if value is hex string → colors; if value is number → spacing/radii

3. **Exact Match Priority**:
   - Always check exact match first before fuzzy matching
   - Only use Delta-E for colors (not spacing, radii, etc.)
   - Fuzzy matching threshold: Delta-E < 5 (confidence ~0.78)

4. **Output Format**:
   - Matched tokens: `"theme.colors.primary"`
   - Unmatched tokens: Keep original value (e.g., `"#FF0000"`, `"16"`)
   - Generation layer handles TODO comments for unmatched values
