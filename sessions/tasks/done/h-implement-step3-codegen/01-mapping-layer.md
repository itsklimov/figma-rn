---
name: 01-mapping-layer
status: completed
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

## Implementation Summary

Successfully implemented simplified token extraction and matching system with zero heavy dependencies:

- **theme-extractor.ts** (118 LOC): Dynamically extracts tokens from theme files using native import()/JSON.parse()
- **token-matcher.ts** (125 LOC): Matches Figma tokens to project tokens with exact match priority
- **color-matcher.ts** (115 LOC): Inline Delta-E color matching (hex→LAB→distance calculation)
- **index.ts** (20 LOC): Barrel exports

**Total**: ~361 LOC (simplified from ~1,658 LOC existing implementation)

## Success Criteria

- [x] Extract tokens dynamically from theme file (any category the project defines)
- [x] Match Figma tokens with exact match priority
- [x] Delta-E color matching with inline LAB math (for color categories)
- [x] No heavy dependencies
- [x] Unit tests for each module

## Work Log

### 2025-12-17

#### Completed

**Core Implementation** (~361 LOC total)
- Implemented `color-matcher.ts` (115 LOC): Inline Delta-E implementation with hex→RGB→linear RGB→XYZ→LAB conversion pipeline
- Implemented `theme-extractor.ts` (118 LOC): Dynamic token extraction using native import()/JSON.parse() - detects categories from theme structure
- Implemented `token-matcher.ts` (125 LOC): Token matching with exact match priority, fuzzy matching only for colors
- Created `index.ts` (20 LOC): Barrel exports for clean module interface

**Testing** (24 tests, all passing)
- Created `tests/core/mapping/color-matcher.test.ts`: Tests for hex→LAB conversion, Delta-E calculation, and closest color matching
- Created `tests/core/mapping/theme-extractor.test.ts`: Tests for JSON/TS/JS theme file extraction and token categorization
- Created `tests/core/mapping/token-matcher.test.ts`: Tests for exact matching, fuzzy color matching, and unmatched value handling

**Manual Testing**
- Created 3 test scripts for real-world validation:
  - `scripts/test-color-match.ts`: Standalone color matching test
  - `scripts/test-theme-extract.ts`: Theme extraction test with real project files
  - `scripts/test-mapping-integration.ts`: End-to-end integration test
- Successfully tested with real Figma URL and theme files
- Achieved 100% color match rate in integration test

**Code Quality**
- Addressed code review findings:
  - Added input validation for hex colors (format checking)
  - Implemented deterministic shadow keys (sorted property serialization)
  - Enhanced JSDoc documentation with examples
  - Added error handling for invalid inputs

#### Decisions

- **No AST parsing**: Used native import()/JSON.parse() instead of ts-morph - reduces dependencies and complexity
- **No color library**: Implemented inline LAB conversion instead of using chroma-js - full control, zero dependencies
- **Dynamic category detection**: System discovers token categories from theme structure rather than hardcoding them
- **Deterministic shadow matching**: Shadow objects matched using sorted property keys for consistency
- **Exact match priority**: Always check exact match before fuzzy matching to avoid unnecessary computation

#### Discovered

- Native import() handles both ESM and CJS modules seamlessly
- Delta-E threshold of 5 provides good balance (allows minor variations while avoiding false matches)
- Shadow objects need deterministic keys for reliable matching across different extraction runs
- Ambiguous numeric values (no clear path indicators) are intentionally skipped to prevent misclassification

## Context Manifest

### Architecture

This mapping layer replaces the existing 1,658 LOC implementation across three files:
- `src/theme-parser.ts` (612 LOC) - Used ts-morph for AST parsing
- `src/color-matcher.ts` (254 LOC) - Used chroma-js for color matching
- `src/auto-theme-mapper.ts` (792 LOC) - Orchestration logic

**Simplification approach**: Replace AST parsing with runtime imports, inline the color math, focus on core matching logic.

### Key Technical Decisions

**Theme extraction**: Uses native `import()` for .ts/.js files and `JSON.parse()` for .json files instead of AST parsing.

**Color matching**: Inline LAB conversion (Hex→RGB→Linear RGB→XYZ→LAB) with Delta-E CIE76 formula instead of chroma-js.

**Category detection**: Dynamically discovers token categories from theme structure using path and value heuristics.

### Data Shapes

**Input**: `DesignTokens` from `ScreenIR.stylesBundle.tokens` (see `src/core/types.ts`)
```typescript
interface DesignTokens {
  colors: Record<string, string>;       // "color_0" → "#3B82F6"
  spacing: Record<string, number>;
  radii: Record<string, number>;
  typography: Record<string, { fontFamily, fontSize, fontWeight, lineHeight }>;
  shadows: Record<string, { color, offsetX, offsetY, blur, spread }>;
}
```

**Output**: `ProjectTokens` (value → theme path mapping)
```typescript
interface ProjectTokens {
  [category: string]: Map<string | number, string>;
  // Example: colors: Map<"#3B82F6", "theme.colors.primary">
}
```

**Output**: `TokenMappings` (Figma token → theme path or original value)
```typescript
interface TokenMappings {
  [category: string]: Record<string | number, string>;
  // Example: colors: { "#3B82F6": "theme.colors.primary", "#FF0000": "#FF0000" }
}
```

### Reference Files

- Implementation: `src/core/mapping/`
- Types consumed: `src/core/types.ts`, `src/config-schema.ts`
- Tests: `tests/core/mapping/`
- Legacy reference: `src/theme-parser.ts`, `src/color-matcher.ts`, `src/auto-theme-mapper.ts`
