---
name: h-implement-get-screen-pipeline
branch: feature/get-screen-pipeline
status: completed
created: 2025-12-17
completed: 2025-12-18
---

# Implement Full get_screen Pipeline

## Problem/Goal

The `get_screen` MCP tool currently has a clean transformation pipeline (Figma → IR → detection → code generation) but is missing critical "last mile" functionality:

1. **Broken Image Paths** - Using raw Figma `imageRef` hashes instead of downloading images and generating proper asset paths (`@assets/images/name.png`)

2. **Incomplete Component Extraction** - Extracted components are TODOs instead of actual implementations with JSX and styles

3. **No Name Deduplication** - Multiple components can get the same filename causing conflicts

4. **No File I/O** - Code is returned in response but not written to disk (folders, files, assets, screenshots)

The goal is to complete the clean architecture implementation so `get_screen` produces the same quality output as the legacy `generate_screen` but with maintainable, modular code.

## Architecture

```
src/edge/
├── tools/
│   └── get-screen.ts       # MCP tool orchestration
├── asset-downloader.ts     # Downloads images from Figma API
├── file-writer.ts          # Writes generated files to disk
├── name-resolver.ts        # Deduplicates component/style names
└── screenshot.ts           # Captures screenshots for validation
```

## Success Criteria

### Edge Modules
- [x] `asset-downloader.ts` - Downloads images from Figma API with deduplication, returns mapping `imageRef → local path`
- [x] `file-writer.ts` - Creates folder structure, writes all generated files atomically
- [x] `name-resolver.ts` - Deduplicates component names against manifest
- [x] `screenshot.ts` - Captures Figma screenshot at 2x scale

### Integration
- [x] Image paths in generated code use proper asset paths (`./assets/filename.png`)
- [x] Extracted components have full JSX implementation with styles
- [x] No duplicate filenames in multi-file output
- [x] Files written to `.figma/{category}/{name}/` structure
- [x] Screenshot saved alongside generated code

### Quality
- [x] All 260 unit tests passing
- [x] Generated code compiles without TypeScript errors
- [x] Output matches/exceeds quality of legacy `generate_screen`
- [x] Clean separation maintained: core modules have no I/O, edge modules handle all I/O

## Context Manifest

### Pipeline Architecture

The `get_screen` tool orchestrates:

1. **Figma API Fetch** → `FigmaClient.fetchNodeByUrl()` → `FetchNodesResult`
2. **IR Transformation** → `transformToScreenIR()` → `ScreenIR`
3. **Detection Layer** → `runDetectors()` → patterns (lists, repetitions)
4. **Token Mapping** (optional) → `matchTokens()` → token mappings
5. **Code Generation** → `generateComponentMultiFile()` → `MultiFileResult`
6. **Asset Download** → `downloadAssets()` → local files + imagePathMap
7. **File Writing** → writes to `.figma/{category}/{name}/` structure

### Core vs Edge Separation

**Core Modules** (`/src/core/`): Pure transforms, no I/O
- Pipeline, detection, generation logic
- Takes data in, returns transformed data

**Edge Modules** (`/src/edge/`): I/O and orchestration
- MCP tools, asset downloading, file writing, screenshots
- Handles all side effects

### Key Components

**Edge Modules**:
- `asset-downloader.ts` - Downloads images/icons from Figma API with deduplication
- `file-writer.ts` - Writes generated files to `.figma/` structure
- `name-resolver.ts` - Deduplicates component names against manifest
- `screenshot.ts` - Captures PNG screenshots at 2x scale

**Core Modifications**:
- `jsx-builder.ts` - Image path lookup via imagePathMap parameter
- `component-builder.ts` - Full extracted component generation
- `list-generator.ts` - Actual JSX rendering with prop substitution
- `utils.ts` - Consolidated sanitization utilities

### Output Directory Structure
```
.figma/
├── manifest.json
├── screens/ComponentName/
│   ├── index.tsx
│   ├── ExtractedComponent.tsx
│   ├── screenshot.png
│   └── assets/
│       ├── image-hash1.png
│       └── icon-hash2.svg
```

## User Notes
- Built on completed Step 4 quality improvements (detection layer, a11y, list-gen, tokens-gen)
- Full pipeline implementation complete with all "last mile" functionality
- Clean architecture maintained throughout: core (pure transforms) vs edge (I/O)
- Ready to replace legacy `generate_screen` tool

## Work Log

### 2025-12-17
- Task created with detailed architecture planning

### 2025-12-18

#### Completed

**Created 4 New Edge Modules**:
1. `src/edge/asset-downloader.ts` - Downloads images/icons from Figma API with hash-based deduplication, returns imagePathMap
2. `src/edge/file-writer.ts` - Writes all generated files (components, assets, screenshot) to `.figma/{category}/{name}/` structure
3. `src/edge/name-resolver.ts` - Deduplicates component names against manifest to prevent filename conflicts
4. `src/edge/screenshot.ts` - Captures PNG screenshots at 2x scale for visual validation

**Modified Core Modules**:
1. `src/core/generation/jsx-builder.ts` - Added imagePathMap parameter for Image/Icon node path resolution
2. `src/core/generation/component-builder.ts` - Implemented full extracted component generation (actual JSX, not TODO placeholders)
3. `src/core/generation/list-generator.ts` - Generate actual JSX for list items with proper prop substitution
4. `src/core/generation/utils.ts` - Consolidated sanitization utilities (DRY principle), added path validation

**Integration**:
- `src/edge/tools/get-screen.ts` - Full pipeline orchestration with all edge modules integrated

**Quality Improvements**:
- Fixed extracted components to generate full JSX implementations instead of TODO placeholders
- Fixed list item components to render actual content with props
- Added asset deduplication by imageRef to prevent duplicate downloads
- Added download progress logging for better observability
- Fixed directory creation timing issues
- Fixed all unused variable warnings
- Consolidated sanitization utilities across generation modules

**Testing & Validation**:
- All 260 unit tests passing
- Updated jsx-builder tests to include imagePathMap parameter
- Integration tests verified imagePathMap flow end-to-end
- TypeScript compilation successful with no errors

#### Results
- Generated output quality matches/exceeds legacy `generate_screen` tool
- Clean architecture maintained (core=pure, edge=I/O)
- Asset deduplication working (2 files instead of 9 with hash suffixes)
- Image paths correctly resolved (`./assets/filename.png` instead of raw Figma hashes)
- Screenshots captured successfully at 2x scale
- Extracted components have full implementations with styles
- Ready for production use
