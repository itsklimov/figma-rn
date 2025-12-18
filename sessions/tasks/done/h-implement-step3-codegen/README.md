---
name: h-implement-step3-codegen
branch: feature/step3-codegen
status: pending
created: 2025-12-17
---

# Step 3: Code Generation from ScreenIR

## Problem/Goal

Transform ScreenIR (from Step 2) into production-ready React Native TSX + StyleSheet code.

Two main components:
1. **Mapping Layer** - Extract project theme tokens, match Figma tokens to existing project patterns
2. **Generation Layer** - Build TSX component + StyleSheet from IR with mapped tokens

Key principles:
- Simplify over-engineered existing code (~1,700 LOC → ~500 LOC)
- No heavy dependencies (no ts-morph, no chroma-js)
- Single traversal for token extraction
- Exact match priority, fuzzy only for colors
- Output looks hand-written (semantic naming, logical grouping)

## Success Criteria

### Mapping Layer
- [ ] Extract project theme tokens dynamically (any token category the project defines)
- [ ] Match Figma-extracted tokens to project tokens (exact match + Delta-E for colors)
- [ ] No heavy dependencies (inline LAB math for color matching)
- [ ] Single traversal for all token types
- [ ] Tests passing

### Generation Layer
- [ ] Generate valid TSX component from ScreenIR
- [ ] Generate StyleSheet.create with mapped tokens (theme.X when matched, raw when not)
- [ ] Output single file per screen (component + styles at bottom)
- [ ] Semantic style naming (card, title, primaryButton vs style_1, style_2)
- [ ] TODO comments for unmatched tokens
- [ ] Tests passing

### Integration
- [ ] Works with real Figma design (verified on test URL)
- [ ] Generated code compiles without errors
- [ ] Output matches project's existing code style

## Subtasks

| Subtask | Description | Status |
|---------|-------------|--------|
| [01-mapping-layer.md](./01-mapping-layer.md) | Theme extraction + token matching | pending |
| [02-generation.md](./02-generation.md) | TSX + StyleSheet generation | pending |

## Interface Contract

Mapping layer outputs `TokenMappings` that generation layer consumes:

```typescript
// Dynamic token categories - not hardcoded to colors/spacing/radii/typography
type TokenCategory = string;  // 'colors' | 'spacing' | 'radii' | 'shadows' | 'gradients' | ...

interface ProjectTokens {
  [category: TokenCategory]: Map<string | number, string>;
  // e.g., colors: Map<"#3B82F6", "theme.colors.primary">
  // e.g., spacing: Map<16, "spacing.md">
}

interface TokenMappings {
  [category: TokenCategory]: Record<string | number, string>;
  // e.g., colors: { "#3B82F6": "theme.colors.primary", "#FF0000": "#FF0000" }
  // e.g., spacing: { 16: "spacing.md", 18: "18" }
}
```

## Context Manifest
<!-- Added by context-gathering agent -->

## User Notes
- Parallel implementation via sub-agents
- Reuse core logic from existing code, but simplify significantly
- See `.local/docs/implementation-plan.md` for full context

## Work Log
<!-- Updated as work progresses -->
- [2025-12-17] Task created
