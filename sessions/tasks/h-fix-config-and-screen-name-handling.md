---
name: h-fix-config-and-screen-name-handling
branch: fix/config-and-screen-name-handling
status: pending
created: 2025-12-18
---

# Fix Config File and Screen Name Handling

## Problem/Goal
Two related issues in the generation pipeline:

1. **Config file not being used**: The folder structure is supposed to use a config file within each folder to generate typography and colors mapping, but this isn't working properly.

2. **Screen name not respected**: When the LLM provides a screen name, the system doesn't listen for that name - it generates its own name but does so incorrectly.

## Success Criteria
- [ ] Config files in folders are properly detected and loaded
- [ ] Typography generation uses config file settings
- [ ] Colors mapping generation uses config file settings
- [ ] LLM-provided screen names are respected and used correctly
- [ ] Generated output uses the correct screen name from LLM input

## Context Manifest
<!-- Added by context-gathering agent -->

### Issue 1: Config Files in Folders Not Being Used for Typography/Colors Mapping

#### How Config Loading Currently Works

When a user calls `generate_screen` or `get_screen`, the configuration loading follows this path:

**Entry Point - `src/index.ts` (lines 316-320):**
```typescript
const figmaConfig = await getOrCreateFigmaConfig(root);
console.error(`📁 Config loaded from: ${root}/.figma/config.json`);
```

The `getOrCreateFigmaConfig()` function in `src/figma-workspace.ts` (lines 709-720) loads config from a single global location: `{projectRoot}/.figma/config.json`. It does NOT look for folder-specific configs.

**Alternative Config Loading - `src/config-loader.ts`:**
```typescript
const SEARCH_PLACES = [
  '.figmarc.json',
  '.figmarc.js',
  'figma.config.js',
  '.config/figma.json',
  'package.json'
];

export async function loadProjectConfig(
  searchFrom?: string
): Promise<ProjectConfig | null> {
  const explorer = cosmiconfig(MODULE_NAME, {
    searchPlaces: SEARCH_PLACES,
    stopDir: undefined, // Search up to filesystem root
  });
  const result = await explorer.search(searchFrom);
  // ...
}
```

The `loadProjectConfig()` uses cosmiconfig to search for config files, but:
1. When called without `searchFrom`, it defaults to `process.cwd()`, NOT the output folder
2. It searches UP the directory tree, never DOWN into subfolders
3. It's designed for project-level config, not folder-specific overrides

#### How Mapping Generation Currently Works

In `src/code-generator-v2.ts` (lines 47-91), mappings are generated on-the-fly:

```typescript
if (config.theme?.location) {
  // Generate color mappings
  const figmaColors = extractFigmaColors(metadata);
  const colorMappings = await autoGenerateColorMappings(figmaColors, config);

  // Generate typography mappings
  const figmaTypography = extractFigmaTypography(metadata);
  const typographyPath = config.theme?.typographyFile
    ? `${config.projectRoot || '.'}/${config.theme.typographyFile}`
    : mainThemePath;
  const typographyMappings = await autoGenerateTypographyMappings(figmaTypography, typographyPath);

  if (!config.mappings) config.mappings = {};
  config.mappings.colors = colorMappings;
  config.mappings.typography = typographyMappings;
  // ...
}
```

The `autoGenerateColorMappings()` in `src/auto-theme-mapper.ts` reads the theme file and uses fuzzy color matching:
```typescript
const tokens = await parseThemeFile(themePath, 'palette');
for (const figmaHex of figmaColors) {
  const match = findClosestThemeColor(figmaHex, tokens.colors, 0.85);
  if (match && match.confidence > 0.85) {
    mappings[figmaHex] = match.token.path;
  }
}
```

#### THE PROBLEM

1. **No folder-specific config support**: The system only loads ONE config from `{projectRoot}/.figma/config.json`
2. **Config schema supports mappings but they're ignored**: The `ProjectConfig` interface in `src/config-schema.ts` has:
   ```typescript
   mappings?: {
     colors?: Record<string, string>;
     typography?: Record<string, string>;
     // ...
   };
   ```
   But these are OVERWRITTEN by auto-generation, not merged.

3. **No mechanism to load folder config**: There's no code path that looks for `.figmarc.json` inside `.figma/screens/{ScreenName}/` folders

#### Expected Behavior (to implement)

1. When generating for `.figma/screens/HomeScreen/`, should look for:
   - `.figma/screens/HomeScreen/.figmarc.json` (folder-specific)
   - `.figma/.figmarc.json` (workspace-level)
   - Project root config
2. Folder-level `mappings.colors` and `mappings.typography` should OVERRIDE auto-generated ones

---

### Issue 2: Screen Names from LLM Not Being Respected

#### How Screen Name Flows Through the System

**Step 1 - MCP Tool Input (`src/index.ts`, lines 241-243):**
```typescript
const { figmaUrl, screenName: providedName, projectRoot, options = {} } = args as {
  figmaUrl: string;
  screenName?: string;
  // ...
};
```

**Step 2 - Name Resolution (`src/index.ts`, lines 286-308):**
```typescript
let screenName: string;
if (existingEntry && !providedName) {
  // If nodeId exists and user didn't provide new name - reuse existing
  screenName = existingEntry.name;
} else {
  // Base name: from user or default
  const baseName = providedName || 'Screen';
  screenName = baseName;
  let counter = 2;
  while (existingNames.has(screenName)) {
    screenName = `${baseName}${counter}`;
    counter++;
  }
}
```

**Step 3 - Pass to Generator (`src/index.ts`, lines 348-381):**
```typescript
const result = await generateCompleteScreen(
  FIGMA_TOKEN,
  figmaUrl,
  screenName,  // <-- This is the LLM-provided name
  {
    // options
  }
);
```

**Step 4 - one-shot-generator.ts (lines 985-1105):**
```typescript
export async function generateCompleteScreen(
  figmaToken: string,
  figmaUrl: string,
  screenName: string,  // <-- Receives LLM name
  options: OneShotOptions = {}
): Promise<OneShotResult> {
  // ...
  // At line 1105:
  mainComponentCode = await generateReactNativeComponent(node, screenName, projectConfig, imageMap, { styleMap, componentGroups });
}
```

**Step 5 - code-generator-v2.ts (line 35):**
```typescript
export async function generateReactNativeComponent(
  metadata: any,
  componentName: string,  // <-- Receives screenName here
  config?: ProjectConfig,
  // ...
)
```

#### THE get_screen TOOL PATH (Clean Architecture)

In `src/edge/tools/get-screen.ts`, there's a DIFFERENT flow:

**Name Resolution (lines 237-244):**
```typescript
const resolved = resolveComponentName(
  manifest,
  category,
  nodeId,
  componentName || screenIR.name  // <-- Falls back to Figma node name!
);
```

**Component Generation (lines 267-273):**
```typescript
const multiFileResult = generateComponentMultiFile(screenIR, tokenMappings, {
  componentName: resolved.name,  // <-- Uses resolved name
  // ...
});
```

**Inside component-builder.ts (line 136, 213):**
```typescript
const componentName = options?.componentName || toPascalCase(screen.name) || 'GeneratedComponent';
```

#### THE PROBLEM

For the **clean architecture pipeline** (`get_screen` tool):

1. **Fallback to Figma name**: In `get-screen.ts` line 243, if `componentName` is not provided, it uses `screenIR.name` which comes from the Figma node name
2. **Double transformation**: The name goes through:
   - `resolveComponentName()` -> sanitizes with `sanitizeComponentName()`
   - Then `toPascalCase()` in component-builder
3. **screenIR.name is always from Figma**: In `src/core/pipeline.ts` lines 189-194:
   ```typescript
   return {
     id: input.id,
     name: input.name,  // <-- This is the Figma node name!
     root: ir,
     stylesBundle,
   };
   ```

For the **legacy pipeline** (`generate_screen` tool):
- The LLM name flows correctly through `generateCompleteScreen()` to `generateReactNativeComponent()`
- But the name appears in files at multiple places that may not all respect the provided name

#### Key Files for Screen Name Handling

| File | Function | Role |
|------|----------|------|
| `src/index.ts` | `generate_screen` handler | Receives LLM name, resolves uniqueness |
| `src/edge/tools/get-screen.ts` | `executeGetScreen()` | Resolves name, may fall back to Figma |
| `src/edge/name-resolver.ts` | `resolveComponentName()` | Sanitizes and deduplicates |
| `src/core/generation/component-builder.ts` | `generateComponent()` | Uses `options?.componentName` |
| `src/core/generation/utils.ts` | `sanitizeComponentName()` | PascalCase conversion |
| `src/one-shot-generator.ts` | `generateCompleteScreen()` | Passes name to code-generator |
| `src/code-generator-v2.ts` | `generateReactNativeComponent()` | Uses componentName parameter |

---

### Technical Reference Details

#### Config Schema (`src/config-schema.ts`)

```typescript
export interface ProjectConfig {
  framework: 'react-native' | 'expo' | 'ignite';
  projectRoot?: string;
  theme?: {
    location: string;
    type: 'object-export' | 'styled-components' | 'nativewind' | 'tamagui';
    typographyFile?: string;
    // ...
  };
  mappings?: {
    colors?: Record<string, string>;      // Figma hex -> theme path
    typography?: Record<string, string>;   // Figma key -> theme path
    fonts?: Record<string, string>;
    spacing?: Record<number, string>;
    radii?: Record<number, string>;
    shadows?: Record<string, string>;
  };
  // ...
}
```

#### Workspace Structure (`src/figma-workspace.ts`)

```
.figma/
├── manifest.json         # URL → folder mapping (nodeId-based keys)
├── config.json           # Global FigmaConfig (theme paths, codeStyle)
├── theme.json            # Accumulated design tokens
├── screens/
│   └── HomeScreen/       # Per-element folder
│       ├── index.tsx     # Generated component
│       ├── meta.json     # Element metadata
│       ├── screenshot.png
│       └── assets/       # Downloaded images/icons
```

#### Key Function Signatures

**Config Loading:**
```typescript
// src/config-loader.ts
export async function loadProjectConfig(searchFrom?: string): Promise<ProjectConfig | null>

// src/figma-workspace.ts
export async function getOrCreateFigmaConfig(projectRoot: string): Promise<FigmaConfig>
```

**Mapping Generation:**
```typescript
// src/auto-theme-mapper.ts
export async function autoGenerateColorMappings(
  figmaColors: string[],
  config: ProjectConfig
): Promise<Record<string, string>>

export async function autoGenerateTypographyMappings(
  figmaTypography: Array<{ key: string; fontSize: number; fontWeight: number }>,
  themePath: string
): Promise<Record<string, string>>
```

**Name Resolution:**
```typescript
// src/edge/name-resolver.ts
export function resolveComponentName(
  manifest: Manifest,
  category: ManifestCategory,
  nodeId: string,
  baseName: string
): ResolvedName

// src/core/generation/utils.ts
export function sanitizeComponentName(figmaName: string): string
```

---

### Implementation Strategy

#### For Issue 1 (Folder Config):

1. **Create folder config loader**: Add function to look for `.figmarc.json` in element folder
2. **Merge configs**: Project config -> workspace config -> folder config (folder wins)
3. **Respect explicit mappings**: If folder config has `mappings.colors`, don't auto-generate
4. **Modify code-generator-v2.ts**: Check for pre-existing mappings before auto-generating

#### For Issue 2 (Screen Name):

1. **In get-screen.ts**: Ensure `componentName` from args takes priority over `screenIR.name`
2. **In component-builder.ts**: Verify `options.componentName` is always passed correctly
3. **Trace the flow**: Ensure the LLM-provided name is passed through every function in the chain
4. **Add logging**: Debug where name might be getting lost or transformed

#### Files to Modify

| File | Change |
|------|--------|
| `src/config-loader.ts` | Add `loadFolderConfig()` function |
| `src/code-generator-v2.ts` | Merge folder config, respect explicit mappings |
| `src/figma-workspace.ts` | Support folder-level config in workspace structure |
| `src/edge/tools/get-screen.ts` | Ensure componentName from args takes priority |
| `src/core/generation/component-builder.ts` | Verify componentName propagation |

## User Notes
<!-- Any specific notes or requirements from the developer -->

## Work Log
<!-- Updated as work progresses -->
- [2025-12-18] Task created
