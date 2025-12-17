/**
 * Figma Workspace Manager v2.0
 * One URL = one folder with all contents
 *
 * Structure:
 * .figma/
 * ├── manifest.json         # URL → folder mapping
 * ├── theme.json            # Global design tokens
 * ├── screens/
 * │   └── HomeScreen/       # One folder per element
 * │       ├── index.tsx     # Component code
 * │       ├── screenshot.png
 * │       ├── meta.json     # Element-specific metadata
 * │       └── assets/
 * │           ├── icon-search.svg
 * │           └── hero-image.png
 * ├── modals/
 * ├── sheets/
 * ├── components/
 * └── icons/                # Standalone icons (SVG files)
 */

import { mkdir, writeFile, readFile, access, appendFile } from 'fs/promises';
import { join, dirname, basename } from 'path';
// existsSync removed - now using glob for recursive search
import { glob } from 'glob';
import { ElementType } from './element-analyzer.js';
import { DesignTokens, mergeDesignTokens } from './design-tokens.js';
import { HierarchyNode } from './one-shot-generator.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Element category
 */
export type ManifestCategory = 'screens' | 'modals' | 'sheets' | 'components' | 'icons';

/**
 * Asset info
 */
export interface AssetInfo {
  /** Filename */
  filename: string;
  /** Type: icon or image */
  type: 'icon' | 'image';
  /** Instance ID in Figma */
  nodeId: string;
  /** Component ID (stable for deduplication) */
  componentId?: string;
  /** Name in Figma (can change) */
  figmaName?: string;
  /** Format */
  format: 'svg' | 'png' | 'jpg';
  /** Dimensions */
  dimensions?: { width: number; height: number };
}

/**
 * Figma component info (grouped by componentId)
 */
export interface ComponentInfo {
  /** Component type */
  type: 'icon' | 'image' | 'component';
  /** Name in Figma (can change) */
  figmaName: string;
  /** Local file path */
  localPath: string;
  /** All instances of this component */
  instances: string[];
}

/**
 * Element metadata (meta.json inside element folder)
 */
export interface ElementMeta {
  /** Component name */
  name: string;
  /** Figma URL */
  figmaUrl: string;
  /** Figma node ID */
  nodeId: string;
  /** Figma name (may differ from name) */
  figmaName?: string;
  /** Generation timestamp */
  generatedAt: string;
  /** Exported entities */
  exports: string[];
  /** Dependencies */
  dependencies: string[];
  /** Detected patterns */
  patterns: {
    hasFloatingFooter?: boolean;
    hasModalOverlay?: boolean;
    hasList?: boolean;
    hasForm?: boolean;
    hasStatusBar?: boolean;
    hasDragHandle?: boolean;
  };
  /** Asset list (legacy, for backwards compatibility) */
  assets: AssetInfo[];
  /** Full node hierarchy */
  hierarchy?: HierarchyNode;
  /** Hidden nodes in design */
  hiddenNodes?: string[];
  /** Total node count */
  totalNodes?: number;
  /** Instance count */
  instanceCount?: number;
  /** Has screenshot */
  hasScreenshot: boolean;
  /** Extracted tokens (element-specific) */
  tokensExtracted: number;
  /** Extracted interactions */
  interactions?: Array<{
    /** Node ID */
    nodeId: string;
    /** Node name */
    nodeName: string;
    /** Interaction trigger */
    trigger: string;
    /** Action */
    action: string;
    /** Destination ID (for navigation) */
    destinationId?: string;
  }>;
  /** Extracted scrolls */
  scrolls?: Array<{
    /** Node ID */
    nodeId: string;
    /** Node name */
    nodeName: string;
    /** Scroll direction */
    direction: 'HORIZONTAL' | 'VERTICAL' | 'BOTH';
  }>;
}

/**
 * Manifest entry (folder reference)
 */
export interface ManifestEntry {
  /** Component name */
  name: string;
  /** Folder path relative to .figma/ */
  folder: string;
  /** Generation timestamp */
  generatedAt: string;
  /** Figma node ID */
  nodeId: string;
  /** Figma URL */
  figmaUrl: string;
}

/**
 * Manifest structure
 */
export interface Manifest {
  /** Schema version */
  version: string;
  /** Project root */
  projectRoot: string;
  /** Project config */
  config: {
    framework: string;
    stylePattern: string;
    importPrefix?: string;
    scaleFunction?: string;
  };
  /** Screens (nodeId → Entry) */
  screens: Record<string, ManifestEntry>;
  /** Modals (nodeId → Entry) */
  modals: Record<string, ManifestEntry>;
  /** Bottom sheets (nodeId → Entry) */
  sheets: Record<string, ManifestEntry>;
  /** Components (nodeId → Entry) */
  components: Record<string, ManifestEntry>;
  /** Icons (standalone) (nodeId → Entry) */
  icons: Record<string, ManifestEntry>;
}

/**
 * Project configuration for Figma generation
 */
export interface FigmaConfig {
  version: string;
  projectRoot: string;
  theme?: {
    colorsFile?: string;      // e.g., "src/styles/theme/colors.ts"
    typographyFile?: string;  // e.g., "src/styles/theme/typography.ts"
    spacingFile?: string;     // e.g., "src/styles/theme/spacing.ts"
    shadowsFile?: string;     // e.g., "src/styles/theme/shadows.ts"
    radiiFile?: string;       // e.g., "src/styles/theme/radii.ts"
    mainThemeFile?: string;   // e.g., "src/styles/theme/index.ts"
    type: 'object-export' | 'styled-components' | 'nativewind';
  };
  codeStyle: {
    stylePattern: 'useTheme' | 'StyleSheet';
    scaleFunction: string;
    importPrefix: string;
  };
}

/**
 * Generation result
 */
export interface GenerationResult {
  status: 'generated' | 'replaced' | 'error';
  category: ManifestCategory;
  name: string;
  /** Folder path */
  folder: string;
  /** Path to index.tsx */
  indexPath: string;
  exports: string[];
  dependencies: string[];
  patterns: ElementMeta['patterns'];
  figmaUrl: string;
  nodeId: string;
  /** Assets */
  assets: AssetInfo[];
  /** Screenshot path */
  screenshotPath?: string;
  /** Suggested project path */
  suggestedTarget: string;
  /** Copy command */
  copyCommand: string;
  /** Was replaced */
  wasReplaced: boolean;
  /** Number of extracted tokens */
  tokensExtracted: number;
}

// ============================================================================
// Constants
// ============================================================================

const FIGMA_DIR = '.figma';
const MANIFEST_FILE = 'manifest.json';
const THEME_FILE = 'theme.json';
const CONFIG_FILE = 'config.json';
const META_FILE = 'meta.json';
const ASSETS_DIR = 'assets';
const INDEX_FILE = 'index.tsx';
const SCREENSHOT_FILE = 'screenshot.png';
const MANIFEST_VERSION = '3.0.0';

const CATEGORY_FOLDERS: Record<ManifestCategory, string> = {
  screens: 'screens',
  modals: 'modals',
  sheets: 'sheets',
  components: 'components',
  icons: 'icons',
};

// ============================================================================
// Utilities
// ============================================================================

/**
 * Get category from element type
 */
export function getManifestCategory(elementType: ElementType): ManifestCategory {
  switch (elementType) {
    case 'screen':
    case 'screen-fragment':
      return 'screens';
    case 'modal':
    case 'dialog':
    case 'toast':
    case 'popover':
      return 'modals';
    case 'bottom-sheet':
    case 'action-sheet':
      return 'sheets';
    case 'icon':
    case 'logo':
    case 'illustration':
      return 'icons';
    default:
      return 'components';
  }
}

/**
 * Normalize URL
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const nodeId = parsed.searchParams.get('node-id');
    return `${parsed.origin}${parsed.pathname}?node-id=${nodeId}`;
  } catch {
    return url;
  }
}

/**
 * Extract node-id
 */
export function extractNodeId(url: string): string {
  try {
    const parsed = new URL(url);
    const nodeId = parsed.searchParams.get('node-id') || 'unknown';
    // Convert to canonical colon format
    return nodeId.replace(/-/g, ':');
  } catch {
    const match = url.match(/node-id=([^&]+)/);
    const nodeId = match ? match[1] : 'unknown';
    return nodeId.replace(/-/g, ':');
  }
}

/**
 * Suggested target path
 */
function getSuggestedTarget(category: ManifestCategory, name: string): string {
  switch (category) {
    case 'screens':
      return `src/screens/${name}`;
    case 'modals':
      return `src/components/modals/${name}`;
    case 'sheets':
      return `src/components/sheets/${name}`;
    case 'components':
      return `src/components/${name}`;
    case 'icons':
      return `src/assets/icons`;
    default:
      return `src/components/${name}`;
  }
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize workspace
 */
export async function initWorkspace(projectRoot: string): Promise<string> {
  const figmaDir = join(projectRoot, FIGMA_DIR);

  // Create structure
  await mkdir(figmaDir, { recursive: true });
  for (const folder of Object.values(CATEGORY_FOLDERS)) {
    await mkdir(join(figmaDir, folder), { recursive: true });
  }

  // Add to .gitignore
  await ensureGitignore(projectRoot);

  return figmaDir;
}

/**
 * Add to .gitignore
 */
async function ensureGitignore(projectRoot: string): Promise<void> {
  const gitignorePath = join(projectRoot, '.gitignore');

  try {
    let content = '';
    try {
      content = await readFile(gitignorePath, 'utf-8');
    } catch {
      // File does not exist
    }

    if (!content.includes('.figma/') && !content.includes('.figma\n')) {
      const addition = content.endsWith('\n') || content === ''
        ? '\n# Figma MCP generated files\n.figma/\n'
        : '\n\n# Figma MCP generated files\n.figma/\n';

      await appendFile(gitignorePath, addition);
      console.error('📝 Added .figma/ to .gitignore');
    }
  } catch (error) {
    console.error('⚠️ Could not update .gitignore:', error);
  }
}

// ============================================================================
// Manifest
// ============================================================================

/**
 * Migrate manifest v1.0.0 → v2.0.0 → v3.0.0
 */
function migrateManifest(manifest: any): Manifest {
  // If already v3.0.0, do nothing
  if (manifest.version === MANIFEST_VERSION) {
    return manifest as Manifest;
  }

  console.error(`🔄 Migrating manifest from ${manifest.version} to ${MANIFEST_VERSION}...`);

  const categories: ManifestCategory[] = ['screens', 'modals', 'sheets', 'components', 'icons'];

  // Migration v1.0.0 → v2.0.0
  if (manifest.version === '1.0.0') {
    for (const category of categories) {
      const entries = manifest[category] || {};

      for (const [url, entry] of Object.entries(entries)) {
        const oldEntry = entry as any;

        // Convert path → folder
        // Old format: { path: ".figma/screens/HomeScreen.tsx" }
        // New format: { folder: ".figma/screens/HomeScreen" }
        if (oldEntry.path && !oldEntry.folder) {
          const oldPath = oldEntry.path;
          // Remove file extension (.tsx)
          const pathWithoutExt = oldEntry.path.replace(/\.(tsx|ts|jsx|js)$/, '');
          oldEntry.folder = pathWithoutExt;
          delete oldEntry.path;

          console.error(`   ✓ ${category}: ${oldEntry.name} (${oldPath} → ${oldEntry.folder})`);
        }
      }
    }

    manifest.version = '2.0.0';
  }

  // Migration v2.0.0 → v3.0.0
  // Convert URL-based keys → nodeId-based keys
  if (manifest.version === '2.0.0') {
    console.error(`   🔄 Converting URL-based keys to nodeId-based keys...`);

    for (const category of categories) {
      const entries = manifest[category] || {};
      const newEntries: Record<string, any> = {};

      for (const [key, entry] of Object.entries(entries)) {
        const oldEntry = entry as any;

        // Extract nodeId from existing field or from URL (key)
        let nodeId = oldEntry.nodeId;
        if (!nodeId) {
          // If nodeId doesn't exist, extract from URL
          nodeId = extractNodeId(key);
        }

        // Add figmaUrl if it doesn't exist
        if (!oldEntry.figmaUrl) {
          oldEntry.figmaUrl = key;
        }

        // Save under new key (nodeId)
        newEntries[nodeId] = oldEntry;

        console.error(`   ✓ ${category}: ${oldEntry.name} (URL → nodeId: ${nodeId})`);
      }

      // Replace old entries with new ones
      manifest[category] = newEntries;
    }

    manifest.version = '3.0.0';
    console.error(`✅ Migration complete: ${MANIFEST_VERSION}`);
  }

  return manifest as Manifest;
}

/**
 * Load manifest
 * Automatically migrates old versions
 */
export async function loadManifest(projectRoot: string): Promise<Manifest | null> {
  const manifestPath = join(projectRoot, FIGMA_DIR, MANIFEST_FILE);

  try {
    const content = await readFile(manifestPath, 'utf-8');
    let manifest = JSON.parse(content);

    // Check version and migrate if needed
    if (manifest.version && manifest.version !== MANIFEST_VERSION) {
      manifest = migrateManifest(manifest);

      // Save migrated manifest
      await saveManifest(projectRoot, manifest);
      console.error(`💾 Migrated manifest saved`);
    }

    return manifest as Manifest;
  } catch {
    return null;
  }
}

/**
 * Create empty manifest
 */
export function createEmptyManifest(projectRoot: string, config?: Manifest['config']): Manifest {
  return {
    version: MANIFEST_VERSION,
    projectRoot,
    config: config || {
      framework: 'react-native',
      stylePattern: 'StyleSheet',
    },
    screens: {},
    modals: {},
    sheets: {},
    components: {},
    icons: {},
  };
}

/**
 * Save manifest
 */
export async function saveManifest(projectRoot: string, manifest: Manifest): Promise<void> {
  const manifestPath = join(projectRoot, FIGMA_DIR, MANIFEST_FILE);
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
}

/**
 * Auto-detect config
 */
async function autoDetectConfig(projectRoot: string): Promise<Manifest['config']> {
  const config: Manifest['config'] = {
    framework: 'react-native',
    stylePattern: 'StyleSheet',
  };

  try {
    // Framework from package.json
    const packageJsonPath = join(projectRoot, 'package.json');
    try {
      const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

      if (deps['ignite-cli'] || deps['@thecodingmachine/ignite-cli']) {
        config.framework = 'ignite';
      } else if (deps['expo']) {
        config.framework = 'expo';
      }
    } catch {
      // Not found
    }

    // Import prefix from tsconfig.json
    const tsconfigPath = join(projectRoot, 'tsconfig.json');
    try {
      const tsconfig = JSON.parse(await readFile(tsconfigPath, 'utf-8'));
      const paths = tsconfig?.compilerOptions?.paths;
      if (paths) {
        const commonPrefixes = ['@app/*', '@components/*', '@/*', '~/*'];
        for (const prefix of commonPrefixes) {
          if (paths[prefix]) {
            config.importPrefix = prefix.replace('/*', '');
            break;
          }
        }
      }
    } catch {
      // Not found
    }

    // Style pattern from source files
    const files = await glob('**/*.{ts,tsx}', {
      cwd: projectRoot,
      ignore: ['node_modules/**', 'dist/**', 'build/**', '.figma/**'],
      absolute: true,
      nodir: true,
    });

    const patterns = { useTheme: 0, StyleSheet: 0, styled: 0 };
    const filesToCheck = files.slice(0, 30);

    for (const file of filesToCheck) {
      try {
        const content = await readFile(file, 'utf-8');
        if (content.includes('useTheme')) patterns.useTheme++;
        if (content.includes('StyleSheet.create')) patterns.StyleSheet++;
        if (content.includes('styled.') || content.includes('styled-components')) patterns.styled++;
      } catch {
        continue;
      }
    }

    if (patterns.useTheme > patterns.StyleSheet && patterns.useTheme > patterns.styled) {
      config.stylePattern = 'useTheme';
    } else if (patterns.styled > patterns.StyleSheet) {
      config.stylePattern = 'styled-components';
    }

    // Scale function
    for (const file of filesToCheck) {
      try {
        const content = await readFile(file, 'utf-8');
        const scaleFuncs = ['scale', 'RFValue', 'moderateScale'];
        for (const func of scaleFuncs) {
          if (content.includes(`import { ${func}`) || content.includes(`import ${func}`)) {
            config.scaleFunction = func;
            break;
          }
        }
        if (config.scaleFunction) break;
      } catch {
        continue;
      }
    }
  } catch (error) {
    console.error('⚠️ Auto-detect config error:', error);
  }

  return config;
}

/**
 * Get or create manifest
 */
export async function getOrCreateManifest(projectRoot: string): Promise<Manifest> {
  let manifest = await loadManifest(projectRoot);

  if (!manifest) {
    console.error('⚙️ Initializing .figma/ workspace...');

    console.error('🔍 Auto-detecting project configuration...');
    const config = await autoDetectConfig(projectRoot);
    console.error(`   Framework: ${config.framework}`);
    console.error(`   Style pattern: ${config.stylePattern}`);
    if (config.importPrefix) console.error(`   Import prefix: ${config.importPrefix}`);
    if (config.scaleFunction) console.error(`   Scale function: ${config.scaleFunction}`);

    await initWorkspace(projectRoot);
    manifest = createEmptyManifest(projectRoot, config);
    await saveManifest(projectRoot, manifest);

    console.error('✅ Workspace initialized at .figma/');
  }

  return manifest;
}

/**
 * Find entry by URL
 * First searches by nodeId, then by URL (for backwards compatibility)
 */
export function findEntryByUrl(
  manifest: Manifest,
  figmaUrl: string
): { category: ManifestCategory; entry: ManifestEntry } | null {
  const normalizedUrl = normalizeUrl(figmaUrl);
  const nodeId = extractNodeId(figmaUrl);
  const categories: ManifestCategory[] = ['screens', 'modals', 'sheets', 'components', 'icons'];

  // First try to find by nodeId (new logic)
  for (const category of categories) {
    const entries = manifest[category];
    if (entries[nodeId]) {
      return { category, entry: entries[nodeId] };
    }
  }

  // Fallback: search by URL (for old manifests)
  for (const category of categories) {
    const entries = manifest[category];
    if (entries[normalizedUrl]) {
      return { category, entry: entries[normalizedUrl] };
    }
  }

  return null;
}

// ============================================================================
// Configuration (config.json)
// ============================================================================

/**
 * Load configuration
 */
export async function loadFigmaConfig(projectRoot: string): Promise<FigmaConfig | null> {
  const configPath = join(projectRoot, FIGMA_DIR, CONFIG_FILE);
  try {
    const content = await readFile(configPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Save configuration
 */
export async function saveFigmaConfig(projectRoot: string, config: FigmaConfig): Promise<void> {
  const configPath = join(projectRoot, FIGMA_DIR, CONFIG_FILE);
  await mkdir(join(projectRoot, FIGMA_DIR), { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Get or create configuration
 */
export async function getOrCreateFigmaConfig(projectRoot: string): Promise<FigmaConfig> {
  let config = await loadFigmaConfig(projectRoot);

  if (!config) {
    console.error('⚙️ Generating .figma/config.json...');
    config = await generateFigmaConfig(projectRoot);
    await saveFigmaConfig(projectRoot, config);
    console.error('✅ Config generated');
  }

  return config;
}

/**
 * Generate configuration with theme auto-detection
 */
async function generateFigmaConfig(projectRoot: string): Promise<FigmaConfig> {
  console.error('🔍 Scanning project for theme files...');

  let colorsFile: string | undefined;
  let typographyFile: string | undefined;
  let spacingFile: string | undefined;
  let shadowsFile: string | undefined;
  let radiiFile: string | undefined;
  let mainThemeFile: string | undefined;

  // Recursively search for colors file in any subdirectory
  // Pattern searches for colors.ts in typical locations: **/styles/**/colors.ts, **/theme/**/colors.ts, etc.
  const colorFiles = await glob('**/@(styles|theme|constants)/**/colors.{ts,js}', {
    cwd: projectRoot,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.figma/**', '**/test/**', '**/tests/**'],
    nodir: true,
    absolute: false,
  });

  if (colorFiles.length > 0) {
    // Priority: prefer files with 'theme' in path
    const themeColorFile = colorFiles.find(f => f.includes('/theme/'));
    colorsFile = themeColorFile || colorFiles[0];
    console.error(`   📦 Found colors: ${colorsFile}`);
    if (colorFiles.length > 1) {
      console.error(`   ⚠️  Multiple color files found (${colorFiles.length}), using: ${colorsFile}`);
    }
  }

  // Recursively search for typography file
  const typographyFiles = await glob('**/@(styles|theme|constants)/**/@(typography|fonts).{ts,js}', {
    cwd: projectRoot,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.figma/**', '**/test/**', '**/tests/**'],
    nodir: true,
    absolute: false,
  });

  if (typographyFiles.length > 0) {
    const themeTypoFile = typographyFiles.find(f => f.includes('/theme/'));
    typographyFile = themeTypoFile || typographyFiles[0];
    console.error(`   📝 Found typography: ${typographyFile}`);
    if (typographyFiles.length > 1) {
      console.error(`   ⚠️  Multiple typography files found (${typographyFiles.length}), using: ${typographyFile}`);
    }
  }

  // Recursively search for spacing file
  const spacingFiles = await glob('**/@(styles|theme|constants)/**/@(spacing|metrics|dimensions).{ts,js}', {
    cwd: projectRoot,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.figma/**', '**/test/**', '**/tests/**'],
    nodir: true,
    absolute: false,
  });

  if (spacingFiles.length > 0) {
    const themeSpacingFile = spacingFiles.find(f => f.includes('/theme/'));
    spacingFile = themeSpacingFile || spacingFiles[0];
    console.error(`   📏 Found spacing: ${spacingFile}`);
    if (spacingFiles.length > 1) {
      console.error(`   ⚠️  Multiple spacing files found (${spacingFiles.length}), using: ${spacingFile}`);
    }
  }

  // Recursively search for shadows file
  const shadowFiles = await glob('**/@(styles|theme|constants)/**/@(shadows|elevation).{ts,js}', {
    cwd: projectRoot,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.figma/**', '**/test/**', '**/tests/**'],
    nodir: true,
    absolute: false,
  });

  if (shadowFiles.length > 0) {
    const themeShadowFile = shadowFiles.find(f => f.includes('/theme/'));
    shadowsFile = themeShadowFile || shadowFiles[0];
    console.error(`   🌓 Found shadows: ${shadowsFile}`);
    if (shadowFiles.length > 1) {
      console.error(`   ⚠️  Multiple shadow files found (${shadowFiles.length}), using: ${shadowsFile}`);
    }
  }

  // Recursively search for radii file
  const radiiFiles = await glob('**/@(styles|theme|constants)/**/@(radii|borderRadius).{ts,js}', {
    cwd: projectRoot,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.figma/**', '**/test/**', '**/tests/**'],
    nodir: true,
    absolute: false,
  });

  if (radiiFiles.length > 0) {
    const themeRadiiFile = radiiFiles.find(f => f.includes('/theme/'));
    radiiFile = themeRadiiFile || radiiFiles[0];
    console.error(`   ⬜ Found radii: ${radiiFile}`);
    if (radiiFiles.length > 1) {
      console.error(`   ⚠️  Multiple radii files found (${radiiFiles.length}), using: ${radiiFile}`);
    }
  }

  // Recursively search for main theme file
  const mainThemeFiles = await glob('**/@(styles|theme)/**/@(defaultTheme|theme|index).{ts,js}', {
    cwd: projectRoot,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.figma/**', '**/test/**', '**/tests/**'],
    nodir: true,
    absolute: false,
  });

  if (mainThemeFiles.length > 0) {
    // Priority: prefer files with 'theme' in path and not index.ts
    const themeMainFile = mainThemeFiles.find(f => f.includes('/theme/') && !f.endsWith('/index.ts'));
    const anyThemeFile = mainThemeFiles.find(f => f.includes('/theme/'));
    mainThemeFile = themeMainFile || anyThemeFile || mainThemeFiles[0];
    console.error(`   🎨 Found main theme: ${mainThemeFile}`);
    if (mainThemeFiles.length > 1) {
      console.error(`   ⚠️  Multiple main theme files found (${mainThemeFiles.length}), using: ${mainThemeFile}`);
    }
  }

  // Load existing manifest for settings
  const manifest = await loadManifest(projectRoot);

  return {
    version: '1.0.0',
    projectRoot,
    theme: colorsFile || typographyFile || spacingFile || shadowsFile || radiiFile || mainThemeFile ? {
      colorsFile,
      typographyFile,
      spacingFile,
      shadowsFile,
      radiiFile,
      mainThemeFile,
      type: 'object-export',
    } : undefined,
    codeStyle: {
      stylePattern: (manifest?.config.stylePattern as 'useTheme' | 'StyleSheet') || 'StyleSheet',
      scaleFunction: manifest?.config.scaleFunction || 'scale',
      importPrefix: manifest?.config.importPrefix || '@app',
    },
  };
}

// ============================================================================
// Design Tokens (theme.json)
// ============================================================================

/**
 * Load global tokens
 */
export async function loadTheme(projectRoot: string): Promise<DesignTokens | null> {
  const themePath = join(projectRoot, FIGMA_DIR, THEME_FILE);

  try {
    const content = await readFile(themePath, 'utf-8');
    return JSON.parse(content) as DesignTokens;
  } catch {
    return null;
  }
}

/**
 * Save global tokens
 */
export async function saveTheme(projectRoot: string, tokens: DesignTokens): Promise<void> {
  const themePath = join(projectRoot, FIGMA_DIR, THEME_FILE);
  await mkdir(dirname(themePath), { recursive: true });
  await writeFile(themePath, JSON.stringify(tokens, null, 2), 'utf-8');
}

/**
 * Update global tokens
 * Merges new tokens with existing ones
 */
export async function updateTheme(
  projectRoot: string,
  newTokens: DesignTokens
): Promise<DesignTokens> {
  const existing = await loadTheme(projectRoot);

  const merged = existing
    ? mergeDesignTokens(existing, newTokens)
    : newTokens;

  await saveTheme(projectRoot, merged);

  return merged;
}

// ============================================================================
// Element Generation
// ============================================================================

/**
 * Create element folder
 */
async function createElementFolder(
  projectRoot: string,
  category: ManifestCategory,
  name: string
): Promise<string> {
  const figmaDir = join(projectRoot, FIGMA_DIR);
  const categoryFolder = CATEGORY_FOLDERS[category];
  const elementFolder = join(figmaDir, categoryFolder, name);

  // Create folder and assets subfolder
  await mkdir(elementFolder, { recursive: true });
  await mkdir(join(elementFolder, ASSETS_DIR), { recursive: true });

  return elementFolder;
}

/**
 * Save element metadata
 */
async function saveElementMeta(elementFolder: string, meta: ElementMeta): Promise<void> {
  const metaPath = join(elementFolder, META_FILE);
  await writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
}

/**
 * Load element metadata
 */
export async function loadElementMeta(elementFolder: string): Promise<ElementMeta | null> {
  const metaPath = join(elementFolder, META_FILE);

  try {
    const content = await readFile(metaPath, 'utf-8');
    return JSON.parse(content) as ElementMeta;
  } catch {
    return null;
  }
}

/**
 * Save component code
 */
async function saveComponentCode(elementFolder: string, code: string): Promise<string> {
  const indexPath = join(elementFolder, INDEX_FILE);
  await writeFile(indexPath, code, 'utf-8');
  return indexPath;
}

/**
 * Save screenshot
 */
export async function saveScreenshot(
  elementFolder: string,
  screenshotBuffer: Buffer
): Promise<string> {
  const screenshotPath = join(elementFolder, SCREENSHOT_FILE);
  await writeFile(screenshotPath, screenshotBuffer);
  return screenshotPath;
}

/**
 * Save asset
 */
export async function saveAsset(
  elementFolder: string,
  filename: string,
  buffer: Buffer
): Promise<string> {
  const assetPath = join(elementFolder, ASSETS_DIR, filename);
  await writeFile(assetPath, buffer);
  return assetPath;
}

/**
 * Register generated element
 */
export async function registerGeneration(
  projectRoot: string,
  figmaUrl: string,
  category: ManifestCategory,
  name: string,
  code: string,
  options: {
    exports?: string[];
    dependencies?: string[];
    patterns?: ElementMeta['patterns'];
    assets?: AssetInfo[];
    screenshotPath?: string;
    tokens?: DesignTokens;
    figmaName?: string;
    hierarchy?: HierarchyNode;
    hiddenNodes?: string[];
    totalNodes?: number;
    instanceCount?: number;
    interactions?: ElementMeta['interactions'];
    scrolls?: ElementMeta['scrolls'];
  } = {}
): Promise<GenerationResult> {
  // Get manifest
  const manifest = await getOrCreateManifest(projectRoot);

  const normalizedUrl = normalizeUrl(figmaUrl);
  const nodeId = extractNodeId(figmaUrl);

  // Check if exists
  const existing = findEntryByUrl(manifest, figmaUrl);
  const wasReplaced = existing !== null;

  // Remove from other category if exists
  if (existing && existing.category !== category) {
    delete manifest[existing.category][normalizedUrl];
  }

  // Create element folder
  const elementFolder = await createElementFolder(projectRoot, category, name);
  const relativeFolderPath = join(FIGMA_DIR, CATEGORY_FOLDERS[category], name);

  // Save code
  await saveComponentCode(elementFolder, code);

  // Screenshot already saved directly to local folder
  let hasScreenshot = false;
  let screenshotPath: string | undefined;
  if (options.screenshotPath) {
    // Path already points to local folder
    screenshotPath = options.screenshotPath;
    hasScreenshot = true;
  }

  // Save metadata
  const meta: ElementMeta = {
    name,
    figmaUrl: normalizedUrl,
    nodeId,
    figmaName: options.figmaName,
    generatedAt: new Date().toISOString(),
    exports: options.exports || [name, `${name}Props`],
    dependencies: options.dependencies || [],
    patterns: options.patterns || {},
    assets: options.assets || [],
    hierarchy: options.hierarchy,
    hiddenNodes: options.hiddenNodes?.length ? options.hiddenNodes : undefined,
    totalNodes: options.totalNodes,
    instanceCount: options.instanceCount,
    hasScreenshot,
    tokensExtracted: options.tokens
      ? options.tokens.colors.length + options.tokens.typography.length + options.tokens.shadows.length
      : 0,
    interactions: options.interactions,
    scrolls: options.scrolls,
  };

  await saveElementMeta(elementFolder, meta);

  // Update global tokens
  if (options.tokens) {
    await updateTheme(projectRoot, options.tokens);
  }

  // Add to manifest
  const entry: ManifestEntry = {
    name,
    folder: relativeFolderPath,
    generatedAt: new Date().toISOString(),
    nodeId,
    figmaUrl: normalizedUrl,
  };

  manifest[category][nodeId] = entry;
  await saveManifest(projectRoot, manifest);

  // Build result
  const suggestedTarget = getSuggestedTarget(category, name);

  return {
    status: wasReplaced ? 'replaced' : 'generated',
    category,
    name,
    folder: relativeFolderPath,
    indexPath: join(relativeFolderPath, INDEX_FILE),
    exports: meta.exports,
    dependencies: meta.dependencies,
    patterns: meta.patterns,
    figmaUrl: normalizedUrl,
    nodeId,
    assets: meta.assets,
    screenshotPath: hasScreenshot ? join(relativeFolderPath, SCREENSHOT_FILE) : undefined,
    suggestedTarget,
    copyCommand: `cp -r ${relativeFolderPath}/* ${suggestedTarget}/`,
    wasReplaced,
    tokensExtracted: meta.tokensExtracted,
  };
}

/**
 * Update config
 */
export async function updateManifestConfig(
  projectRoot: string,
  config: Partial<Manifest['config']>
): Promise<void> {
  const manifest = await getOrCreateManifest(projectRoot);
  manifest.config = { ...manifest.config, ...config };
  await saveManifest(projectRoot, manifest);
}

/**
 * Get entries by category
 */
export function getEntriesByCategory(
  manifest: Manifest,
  category: ManifestCategory
): Array<{ url: string; entry: ManifestEntry }> {
  const entries = manifest[category];
  return Object.entries(entries).map(([url, entry]) => ({ url, entry }));
}

// ============================================================================
// LLM Formatting
// ============================================================================

/**
 * Format result for LLM
 */
export function formatResultForLLM(result: GenerationResult): string {
  let response = `## ${result.wasReplaced ? '🔄 Replaced' : '✅ Generated'} ${result.name}\n\n`;

  response += `| Property | Value |\n`;
  response += `|----------|-------|\n`;
  response += `| **Type** | ${result.category} |\n`;
  response += `| **Folder** | \`${result.folder}\` |\n`;
  response += `| **Code** | \`${result.indexPath}\` |\n`;
  response += `| **Exports** | ${result.exports.map(e => `\`${e}\``).join(', ')} |\n`;

  if (result.dependencies.length > 0) {
    response += `| **Dependencies** | ${result.dependencies.map(d => `\`${d}\``).join(', ')} |\n`;
  }

  if (result.screenshotPath) {
    response += `| **Screenshot** | \`${result.screenshotPath}\` |\n`;
  }

  if (result.assets.length > 0) {
    response += `| **Assets** | ${result.assets.length} files |\n`;
  }

  if (result.tokensExtracted > 0) {
    response += `| **Tokens** | ${result.tokensExtracted} extracted |\n`;
  }

  response += `\n`;

  // Patterns
  const activePatterns = Object.entries(result.patterns)
    .filter(([_, value]) => value)
    .map(([key, _]) => key);

  if (activePatterns.length > 0) {
    response += `### Detected Patterns\n\n`;
    activePatterns.forEach(pattern => {
      response += `- ✓ ${pattern}\n`;
    });
    response += `\n`;
  }

  // Assets
  if (result.assets.length > 0) {
    response += `### Assets\n\n`;
    const icons = result.assets.filter(a => a.type === 'icon');
    const images = result.assets.filter(a => a.type === 'image');

    if (icons.length > 0) {
      response += `**Icons** (${icons.length}):\n`;
      icons.slice(0, 5).forEach(icon => {
        response += `- \`${icon.filename}\`\n`;
      });
      if (icons.length > 5) response += `- ... and ${icons.length - 5} more\n`;
      response += `\n`;
    }

    if (images.length > 0) {
      response += `**Images** (${images.length}):\n`;
      images.slice(0, 5).forEach(img => {
        response += `- \`${img.filename}\`\n`;
      });
      if (images.length > 5) response += `- ... and ${images.length - 5} more\n`;
      response += `\n`;
    }
  }

  // Copy command
  response += `### To Use\n\n`;
  response += `\`\`\`bash\n${result.copyCommand}\n\`\`\`\n\n`;
  response += `**Suggested path**: \`${result.suggestedTarget}\`\n`;

  return response;
}

/**
 * Format tokens for LLM
 */
export function formatTokensForLLM(tokens: DesignTokens): string {
  let response = `## 🎨 Design Tokens\n\n`;

  // Colors
  if (tokens.colors.length > 0) {
    response += `### Colors (${tokens.colors.length})\n\n`;
    response += `| Color | Type | Usage |\n`;
    response += `|-------|------|-------|\n`;

    const topColors = tokens.colors.slice(0, 10);
    for (const color of topColors) {
      if (color.type === 'solid') {
        response += `| \`${color.hex}\` | solid | ${color.usageCount}x |\n`;
      } else {
        response += `| gradient-${color.gradientType} | ${color.gradientStops?.length} stops | ${color.usageCount}x |\n`;
      }
    }

    if (tokens.colors.length > 10) {
      response += `\n*... and ${tokens.colors.length - 10} more colors*\n`;
    }
    response += `\n`;
  }

  // Typography
  if (tokens.typography.length > 0) {
    response += `### Typography (${tokens.typography.length})\n\n`;
    response += `| Font | Size | Weight | Usage |\n`;
    response += `|------|------|--------|-------|\n`;

    const topTypo = tokens.typography.slice(0, 8);
    for (const typo of topTypo) {
      response += `| ${typo.figma.fontFamily} | ${typo.figma.fontSize}px | ${typo.figma.fontWeight} | ${typo.usageCount}x |\n`;
    }

    if (tokens.typography.length > 8) {
      response += `\n*... and ${tokens.typography.length - 8} more typography styles*\n`;
    }
    response += `\n`;
  }

  // Shadows
  if (tokens.shadows.length > 0) {
    response += `### Shadows (${tokens.shadows.length})\n\n`;
    for (const shadow of tokens.shadows.slice(0, 3)) {
      response += `- **${shadow.type}**: offset(${shadow.offset.x}, ${shadow.offset.y}), blur ${shadow.radius}, color ${shadow.color}\n`;
    }
    response += `\n`;
  }

  return response;
}
