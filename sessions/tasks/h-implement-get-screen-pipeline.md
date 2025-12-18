---
name: h-implement-get-screen-pipeline
branch: feature/get-screen-pipeline
status: pending
created: 2025-12-17
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
- [ ] `asset-downloader.ts` - Downloads images from Figma API, returns mapping `hash → local path`
- [ ] `file-writer.ts` - Creates folder structure, writes all generated files atomically
- [ ] `name-resolver.ts` - Deduplicates component names and style names before generation
- [ ] `screenshot.ts` - Captures Figma screenshot for visual validation

### Integration
- [ ] Image paths in generated code use proper asset paths (e.g., `require('./assets/images/avatar.png')`)
- [ ] Extracted components have full JSX implementation (not TODOs)
- [ ] No duplicate filenames in multi-file output
- [ ] Files written to `.figma/{category}/{name}/` structure
- [ ] Screenshot saved alongside generated code

### Quality
- [ ] Generated code compiles without TypeScript errors
- [ ] Output matches or exceeds quality of legacy `generate_screen`
- [ ] Clean separation maintained: core modules have no I/O, edge modules handle all I/O

## Context Manifest

### How The Current get_screen Tool Works

The `get_screen` MCP tool is located at `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/edge/tools/get-screen.ts` and implements the clean architecture pipeline. When a user provides a Figma URL, the tool orchestrates the following transformation:

1. **Figma API Fetch**: The `FigmaClient` (at `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/api/client.ts`) fetches the node data via `fetchNodeByUrl()`. This returns a `FetchNodesResult` containing transformed nodes with their document structure.

2. **IR Transformation**: The raw API response goes through `transformNode()` from `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/api/transformers.ts` to create a `FigmaNode`, then `transformToScreenIR()` from `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/core/pipeline.ts` converts it to a `ScreenIR` (intermediate representation).

3. **Detection Layer**: `runDetectors()` from `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/core/detection/index.ts` analyzes the IR tree for patterns:
   - `detectLists()` finds FlatList candidates (repeated similar items)
   - `detectRepetitions()` finds components that should be extracted

4. **Token Mapping**: If a `themeFilePath` is provided, `extractProjectTokens()` and `matchTokens()` from the mapping layer create token mappings between Figma design tokens and project theme tokens.

5. **Code Generation**: `generateComponentMultiFile()` from `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/core/generation/component-builder.ts` produces a `MultiFileResult` containing:
   - `mainComponent`: The main TSX file with imports, JSX, and StyleSheet
   - `extractedComponents`: Sub-components detected from repeated patterns
   - `tokens`: Generated tokens file (if no project theme)
   - `unmappedTokens`: Report of tokens that couldn't be mapped

**Critical Gap #1 - Image References**: The JSX builder at `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/core/generation/jsx-builder.ts` uses raw `imageRef` values from the IR. When generating Image/Icon elements:

```typescript
// From jsx-builder.ts lines 69-80
case 'Image': {
  // Uses imageRef if available, otherwise add placeholder comment
  const source = node.imageRef
    ? `require('${node.imageRef}')`
    : `{ uri: '' } /* TODO: Add image source */`;
  ...
}
```

The `imageRef` is the raw Figma image hash (e.g., `abc123def`), not a usable local path. The code generates `require('abc123def')` which will fail at runtime.

**Critical Gap #2 - No File I/O**: The `get_screen` tool returns code in the response but never writes to disk. The `formatGetScreenResponse()` function formats everything as markdown for display.

**Critical Gap #3 - No Screenshots**: Unlike the legacy tool, `get_screen` doesn't capture Figma screenshots for visual validation.

### How The Legacy generate_screen Tool Handles These

The legacy `generate_screen` tool in `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/index.ts` (the main MCP server) calls `generateCompleteScreen()` from `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/one-shot-generator.ts`. This implements the complete pipeline:

**Asset Downloading Flow**:

1. **Image Detection** (`extractImageNodes()` at line 476-579): Traverses the Figma node tree to identify images and icons:
   - Icons: Detected by name patterns (`/^Icon|^ic[\/\-_]|^ic$|[_\-]icon|star|chevron|arrow/i`)
   - Images: Detected by fill type (`f.type === 'IMAGE'`) or name patterns (`/^photo|^img$|^image|_image$/i`)
   - Deduplicates by `componentId` to avoid downloading the same icon multiple times

2. **URL Fetching**: The `downloadFigmaImages()` function from `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/image-downloader.ts` calls the Figma API's image export endpoint:
   ```
   GET /v1/images/{fileKey}?ids={nodeIds}&format={format}&scale={scale}
   ```
   This returns temporary signed URLs (expire after ~14 days).

3. **Downloading** (lines 764-852 in one-shot-generator.ts): Downloads images directly to the assets folder:
   ```typescript
   const assetsDir = join(outputFolder, 'assets');
   downloadedImages = await downloadExtractedImages(figmaToken, fileKey, extractedImages, assetsDir);
   ```

4. **Path Mapping**: Creates a `Map<nodeId, suggestedPath>` that maps node IDs to their local asset paths:
   ```typescript
   const imageMap = new Map<string, string>();
   downloadedImages.forEach(img => {
     imageMap.set(img.nodeId, img.suggestedPath);
   });
   ```

**File Writing Flow** (via `registerGeneration()` in figma-workspace.ts):

1. **Folder Structure**: Creates `.figma/{category}/{name}/` structure:
   - `createElementFolder()` at line 917-931 creates the element folder and `assets/` subfolder
   - Categories: `screens`, `modals`, `sheets`, `components`, `icons`

2. **File Writing**:
   - `saveComponentCode()` writes `index.tsx`
   - `saveElementMeta()` writes `meta.json` with full metadata
   - Assets are saved to the `assets/` subfolder via `downloadExtractedImages()`

3. **Manifest Update**: Updates `.figma/manifest.json` with the new entry keyed by `nodeId`.

**Screenshot Flow** (lines 861-901 in one-shot-generator.ts):

```typescript
async function downloadScreenshot(token, fileKey, nodeId, outputPath) {
  const screenshotUrl = await fetchFigmaScreenshot(token, fileKey, nodeId, 2);
  // Downloads via HTTPS and saves to outputPath
  await writeFile(outputPath, buffer);
}
```

The `fetchFigmaScreenshot()` from `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/figma-api-client.ts` uses the same image export endpoint with `format=png&scale=2`.

**Name Deduplication Flow** (lines 259-308 in index.ts):

1. Extracts `nodeId` from URL (canonical colon format)
2. Checks if `nodeId` already exists in any category
3. If exists: Reuses existing name (for updates)
4. If new: Generates unique name by appending counter if needed:
   ```typescript
   let screenName = baseName;
   let counter = 2;
   while (existingNames.has(screenName)) {
     screenName = `${baseName}${counter}`;
     counter++;
   }
   ```

### Existing API Modules Available for Reuse

**FigmaClient** (`/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/api/client.ts`):
- `exportImages(fileKey, nodeIds, options)`: Returns `ImageExportResult[]` with temporary URLs
- Options: `{ format: 'png'|'jpg'|'svg'|'pdf', scale: number, svgOptions }`

**Asset Pipeline** (`/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/api/assets.ts`):
- `downloadImage(url, filepath)`: Downloads single image from URL
- `downloadAssets(exportResults, options)`: Downloads multiple assets with naming

**Image Downloader** (`/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/image-downloader.ts`):
- `downloadFigmaImages(token, fileKey, nodeIds, outputDir, format, scale)`: Complete download pipeline
- Returns `ImageDownloadResult[]` with `downloadedPath`, `suggestedImportPath`

**Figma Workspace** (`/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/figma-workspace.ts`):
- `initWorkspace(projectRoot)`: Creates `.figma/` structure
- `getOrCreateManifest(projectRoot)`: Gets or creates manifest
- `registerGeneration(...)`: Registers generated component
- `saveScreenshot(elementFolder, buffer)`: Saves screenshot
- `saveAsset(elementFolder, filename, buffer)`: Saves asset

### Architecture: Core vs Edge Separation

The clean architecture maintains strict separation:

**Core Modules** (pure transforms, no I/O):
- `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/core/` - All transformation, detection, generation logic
- Take data in, return transformed data out
- No `fs`, `fetch`, or side effects

**Edge Modules** (I/O, orchestration):
- `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/edge/` - MCP tools that call core + handle I/O
- Currently only contains `tools/get-screen.ts`
- Should contain: `asset-downloader.ts`, `file-writer.ts`, `name-resolver.ts`, `screenshot.ts`

### Key Type Definitions

**ScreenIR** (`/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/core/types.ts`):
```typescript
interface ScreenIR {
  id: string;
  name: string;
  root: IRNode;  // Tree of Container, Text, Image, Button, Card, Icon nodes
  stylesBundle: StylesBundle;
}
```

**ImageIR** (has `imageRef?: string` that needs to become a local path):
```typescript
interface ImageIR extends IRNodeBase {
  semanticType: 'Image';
  imageRef?: string;  // Currently raw Figma hash, needs to be local path
}
```

**MultiFileResult** (`/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/core/generation/component-builder.ts`):
```typescript
interface MultiFileResult {
  mainComponent: GeneratedFile;
  extractedComponents: GeneratedFile[];
  tokens: GeneratedFile | null;
  unmappedTokens: { colors: string[], spacing: number[], radii: number[] };
}
```

**ExtractedImage** (from legacy, useful reference):
```typescript
interface ExtractedImage {
  nodeId: string;
  componentId?: string;
  nodeName: string;
  category: 'image' | 'icon';
  downloadedPath?: string;
  figmaUrl?: string;
  suggestedPath: string;
  suggestedFilename: string;
  format: 'png' | 'svg' | 'jpg';
  dimensions?: { width: number; height: number };
}
```

### Integration Points for New Edge Modules

**1. asset-downloader.ts** should:
- Extract image/icon nodes from ScreenIR tree (traverse and find `semanticType === 'Image' || 'Icon'`)
- Call `FigmaClient.exportImages()` to get temporary URLs
- Download to local `assets/` folder
- Return mapping `{ [imageRef: string]: localPath: string }`

**2. file-writer.ts** should:
- Use `figma-workspace.ts` utilities for folder creation
- Accept `MultiFileResult` and write all files atomically
- Save assets from the asset-downloader
- Save screenshot

**3. name-resolver.ts** should:
- Deduplicate component names against existing manifest
- Deduplicate style names within StyleSheet
- Follow existing pattern from `smart-namer.ts`

**4. screenshot.ts** should:
- Use `FigmaClient.exportImages()` with format='png', scale=2
- Save to element folder as `screenshot.png`

### Technical Reference Details

#### FigmaClient Image Export Signature
```typescript
async exportImages(
  fileKey: string,
  nodeIds: string[],
  options?: ImageExportOptions
): Promise<ImageExportResult[]>

interface ImageExportOptions {
  format: 'png' | 'jpg' | 'svg' | 'pdf';
  scale?: number;
  svgOptions?: { svgIdAttribute?: boolean; svgSimplifyStroke?: boolean };
}

interface ImageExportResult {
  nodeId: string;
  url: string;  // Temporary URL, expires
  error?: string;
}
```

#### File Paths
- New modules: `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/edge/asset-downloader.ts`
- New modules: `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/edge/file-writer.ts`
- New modules: `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/edge/name-resolver.ts`
- New modules: `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/edge/screenshot.ts`
- Main tool: `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/edge/tools/get-screen.ts`
- Core generation: `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/core/generation/`
- Workspace utils: `/Users/its/Documents/Dev/code/MCPs/dev/figma-rn/src/figma-workspace.ts`

#### Output Directory Structure
```
.figma/
├── manifest.json         # URL → folder mapping (keyed by nodeId)
├── theme.json            # Global design tokens
├── screens/
│   └── HomeScreen/       # One folder per element
│       ├── index.tsx     # Component code
│       ├── screenshot.png
│       ├── meta.json     # Element-specific metadata
│       └── assets/
│           ├── icon-search.svg
│           └── hero-image.png
├── modals/
├── sheets/
├── components/
└── icons/
```

#### Image Path Resolution Flow
1. IR has `imageRef: "abc123def"` (Figma hash)
2. Asset downloader maps `abc123def` → `./assets/images/hero-image.png`
3. JSX builder receives mapping and generates: `require('./assets/images/hero-image.png')`

## User Notes
- Builds on completed Step 4 quality improvements (detection layer, a11y, list-gen, tokens-gen)
- Should replace legacy `generate_screen` once complete
- Must maintain clean separation: core (pure transforms) vs edge (I/O)

## Work Log
- [2025-12-17] Task created
