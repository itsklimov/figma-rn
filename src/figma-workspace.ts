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

import { mkdir, writeFile, readFile, appendFile, rm } from 'fs/promises';
import { join, dirname } from 'path';
// existsSync removed - now using glob for recursive search
import { glob } from 'glob';

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
  /** Detected component groups (ratings, tabs, etc.) */
  componentGroups?: Array<{
    /** Parent node ID */
    nodeId: string;
    /** Parent node name */
    nodeName: string;
    /** Group type */
    type: 'interactive-group';
    /** Pattern type */
    pattern: 'rating' | 'tabs' | 'segmented-control' | 'stepper' | 'toggle-group' | 'pagination' | 'unknown';
    /** Number of items */
    childCount: number;
    /** Suggested component */
    inferredComponent: string;
    /** Confidence */
    confidence: number;
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
 * This is a project knowledge base - stores paths to all useful files
 */
export interface FigmaConfig {
  version: string;
  projectRoot: string;
  
  // Token sources - simple list of all files containing tokens
  tokenFiles: string[];
  
  // Hooks that can be used in generated code
  hooks: {
    useTheme?: string;    // Path to useTheme hook
    useStyles?: string;   // Path to useStyles hook
  };
  
  // Utility functions
  utils: {
    scale?: string;       // Path to scale/responsive function
    scaleFunctionName?: string; // Name of the scaling function (e.g., 'scale')
  };
  
  // Components directory
  componentsDir?: string;
  
  // Import configuration
  importPrefix: string;   // e.g., "@app" from tsconfig paths
  
  // Framework detection
  framework: 'expo' | 'react-native' | 'ignite';
  
  // Style pattern detection
  stylePattern: 'useTheme' | 'StyleSheet' | 'unistyles';
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

      for (const [, entry] of Object.entries(entries)) {
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
 * Re-evaluates project configuration by re-scanning the project.
 * Always does a full replace - no complex merge logic.
 */
export async function refreshFigmaConfig(projectRoot: string): Promise<FigmaConfig> {
  console.error('🔄 Re-evaluating project configuration...');
  const config = await generateFigmaConfig(projectRoot);
  await saveFigmaConfig(projectRoot, config);
  console.error('✅ Configuration refreshed');
  return config;
}

/**
 * Load and merge all project tokens based on configuration
 */
export async function loadAllProjectTokens(projectRoot: string): Promise<any> {
  const config = await getOrCreateFigmaConfig(projectRoot);
  if (config.tokenFiles.length === 0) {
    console.error('⚠️ No token files found in config');
    return null;
  }

  const { extractProjectTokens, mergeProjectTokens } = await import('./core/mapping/theme-extractor.js');
  
  console.log(`📦 Loading tokens from ${config.tokenFiles.length} file(s)...`);
  
  const tokenSets = await Promise.all(
    config.tokenFiles.map(async (file) => {
      try {
        return await extractProjectTokens(join(projectRoot, file));
      } catch (e) {
        console.error(`⚠️ Failed to load tokens from ${file}:`, e);
        return {};
      }
    })
  );

  return mergeProjectTokens(tokenSets);
}

/**
 * Generate configuration by scanning the project
 */
async function generateFigmaConfig(projectRoot: string): Promise<FigmaConfig> {
  console.error('🔍 Scanning project for theme files...');

  const ignorePatterns = ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.figma/**', '**/test/**', '**/tests/**'];
  const tokenFiles: string[] = [];
  const hooks: FigmaConfig['hooks'] = {};
  const utils: FigmaConfig['utils'] = {};
  let framework: FigmaConfig['framework'] = 'react-native';
  let stylePattern: FigmaConfig['stylePattern'] = 'StyleSheet';
  let hasUnistyles = false;
  let importPrefix = '@app';
  let scaleFunctionName: string | undefined;
  let componentsDir: string | undefined;

  // ============================================================================
  // 1. DISCOVER TOKEN FILES
  // ============================================================================
  const tokenPatterns = [
    // Unistyles config (highest priority when using react-native-unistyles)
    '**/unistyles.{ts,js}',
    '**/unistyles.config.{ts,js}',
    'src/unistyles.{ts,js}',
    // Consolidated/generated files (highest priority)
    '**/@(styles|theme)/generated/tokens.{ts,js}',
    '**/@(styles|theme)/compiled/tokens.{ts,js}',
    '**/styles/tokens.{ts,js}',
    '**/styles/primitives.{ts,js}',
    '**/design-tokens.{ts,js}',
    // Individual token files
    '**/@(styles|theme|constants|tokens)/**/@(colors|palette)*.{ts,js}',
    '**/@(styles|theme|constants|tokens)/**/@(typography|fonts)*.{ts,js}',
    '**/@(styles|theme|constants|tokens)/**/@(spacing|space)*.{ts,js}',
    '**/@(styles|theme|constants|tokens)/**/@(shadows|shadow)*.{ts,js}',
    '**/@(styles|theme|constants|tokens)/**/@(radii|radius)*.{ts,js}',
    // Font files (for typography)
    '**/@(styles|theme)/font.{ts,js}',
    '**/@(styles|theme)/fonts.{ts,js}',
    // Theme index files
    '**/@(styles|theme)/index.{ts,js}',
    '**/@(styles|theme)/theme.{ts,js}',
  ];

  for (const pattern of tokenPatterns) {
    const matches = await glob(pattern, {
      cwd: projectRoot,
      ignore: ignorePatterns,
      nodir: true,
      absolute: false,
    });
    
    for (const match of matches) {
      if (!tokenFiles.includes(match)) {
        // Prefer generated files first
        if (match.includes('generated')) {
          tokenFiles.unshift(match);
        } else {
          tokenFiles.push(match);
        }
      }
    }
  }

  // Log found token files
  if (tokenFiles.length > 0) {
    console.error(`   📦 Found ${tokenFiles.length} token file(s):`);
    tokenFiles.slice(0, 5).forEach(f => console.error(`      - ${f}`));
    if (tokenFiles.length > 5) console.error(`      ... and ${tokenFiles.length - 5} more`);
  }

  // ============================================================================
  // 2. DISCOVER HOOKS
  // ============================================================================
  const hookPatterns = [
    // Dedicated hook files
    '**/hooks/useTheme.{ts,tsx}',
    '**/hooks/use-theme.{ts,tsx}',
    '**/useTheme.{ts,tsx}',
    '**/hooks/useStyles.{ts,tsx}',
    '**/hooks/use-styles.{ts,tsx}',
    // Context files that often export hooks
    '**/context/ThemeContext.{ts,tsx}',
    '**/contexts/ThemeContext.{ts,tsx}',
    '**/*ThemeContext.{ts,tsx}',
    '**/theme/context.{ts,tsx}',
  ];

  for (const pattern of hookPatterns) {
    const matches = await glob(pattern, {
      cwd: projectRoot,
      ignore: ignorePatterns,
      nodir: true,
      absolute: false,
    });
    
    if (matches.length > 0) {
      const match = matches[0];
      const matchLower = match.toLowerCase();
      // Check for useTheme hook or ThemeContext (which exports useTheme)
      if ((matchLower.includes('usetheme') || matchLower.includes('themecontext')) && !hooks.useTheme) {
        hooks.useTheme = match;
        console.error(`   🪝 Found useTheme hook: ${match}`);
      } else if (matchLower.includes('usestyles') && !hooks.useStyles) {
        hooks.useStyles = match;
        console.error(`   🪝 Found useStyles hook: ${match}`);
      }
    }
  }

  // ============================================================================
  // 3. DISCOVER UTILS (scale functions)
  // ============================================================================
  const utilPatterns = [
    '**/utils/scale.{ts,js}',
    '**/utils/responsive.{ts,js}',
    '**/utils/scaling.{ts,js}',
    '**/scale.{ts,js}',
    '**/moderateScale.{ts,js}',
  ];

  for (const pattern of utilPatterns) {
    const matches = await glob(pattern, {
      cwd: projectRoot,
      ignore: ignorePatterns,
      nodir: true,
      absolute: false,
    });
    
    if (matches.length > 0 && !utils.scale) {
      const match = matches[0];
      utils.scale = match;
      
      // Try to detect function name from filename first
      const nameMatch = match.match(/\/([^./]+)\.(ts|js)$/);
      if (nameMatch) {
        const fileName = nameMatch[1];
        if (['scale', 'moderateScale', 'RFValue', 'verticalScale'].includes(fileName)) {
          scaleFunctionName = fileName;
        }
      }
      
      // Fallback: If filename isn't the function, read file content
      if (!scaleFunctionName) {
        try {
          const content = await readFile(join(projectRoot, match), 'utf-8');
          const exportMatches = content.match(/export (?:const|function) (\w+)/g);
          if (exportMatches) {
            const names = exportMatches.map(m => m.split(' ')[2]);
            scaleFunctionName = names.find(n => ['scale', 'moderateScale', 'RFValue', 'verticalScale'].includes(n)) || names[0];
          }
        } catch (e) {
          // Ignore
        }
      }
      
      // Final fallback
      if (!scaleFunctionName) scaleFunctionName = 'scale';
      
      utils.scaleFunctionName = scaleFunctionName;
      console.error(`   🛠️ Found scale util: ${utils.scale} (function: ${scaleFunctionName})`);
      break;
    }
  }

  // ============================================================================
  // 4. DETECT FRAMEWORK AND STYLING LIBRARY
  // ============================================================================
  try {
    const packageJsonPath = join(projectRoot, 'package.json');
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

    if (deps['expo']) framework = 'expo';
    else if (deps['ignite-cli']) framework = 'ignite';

    // Detect Unistyles
    if (deps['react-native-unistyles']) {
      hasUnistyles = true;
      console.error(`   🎨 Detected react-native-unistyles`);

      // CRITICAL: When Unistyles is detected, prioritize Unistyles file first
      // The merger will prefer simpler paths from Unistyles over primitives
      // But we need primitives for resolving imported references (like margins, radius)
      const unistylesFiles = tokenFiles.filter(f => f.toLowerCase().includes('unistyles'));
      const nonUnistylesFiles = tokenFiles.filter(f => !f.toLowerCase().includes('unistyles'));

      if (unistylesFiles.length > 0) {
        // Reorder: Unistyles first (takes priority), then primitives (for resolution)
        tokenFiles.length = 0;
        tokenFiles.push(...unistylesFiles, ...nonUnistylesFiles);
        console.error(`   ⚠️ Unistyles detected - prioritizing Unistyles paths, using primitives for resolution only`);
      }
    }
  } catch {
    // Default to react-native
  }

  // ============================================================================
  // 5. DETECT IMPORT PREFIX FROM TSCONFIG
  // ============================================================================
  try {
    const tsconfigPath = join(projectRoot, 'tsconfig.json');
    const tsconfig = JSON.parse(await readFile(tsconfigPath, 'utf-8'));
    const paths = tsconfig?.compilerOptions?.paths;
    
    if (paths) {
      const prefixes = ['@app/*', '@/*', '~/*', '@src/*'];
      for (const prefix of prefixes) {
        if (paths[prefix]) {
          importPrefix = prefix.replace('/*', '');
          console.error(`   📍 Import prefix: ${importPrefix}`);
          break;
        }
      }
    }
  } catch {
    // Default import prefix
  }

  // ============================================================================
  // 6. DETECT STYLE PATTERN
  // ============================================================================
  const manifest = await loadManifest(projectRoot);
  if (manifest?.config.stylePattern) {
    stylePattern = manifest.config.stylePattern as FigmaConfig['stylePattern'];
  } else if (hasUnistyles) {
    // Unistyles takes priority - it has its own theme injection
    stylePattern = 'unistyles';
  } else if (hooks.useTheme) {
    stylePattern = 'useTheme';
  }

  // ============================================================================
  // 7. DETECT COMPONENTS DIRECTORY
  // ============================================================================
  const componentPatterns = [
    'src/components',
    'app/components',
    'components',
  ];

  for (const pattern of componentPatterns) {
    try {
      const stat = await import('fs/promises').then(fs => fs.stat(join(projectRoot, pattern)));
      if (stat.isDirectory()) {
        componentsDir = pattern;
        break;
      }
    } catch {
      continue;
    }
  }

  return {
    version: '1.0.0',
    projectRoot,
    tokenFiles,
    hooks,
    utils,
    importPrefix,
    framework,
    stylePattern,
    componentsDir,
  };
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
    figmaName?: string;
    hiddenNodes?: string[];
    totalNodes?: number;
    instanceCount?: number;
    interactions?: ElementMeta['interactions'];
    componentGroups?: ElementMeta['componentGroups'];
    previousName?: string;
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
    delete manifest[existing.category][nodeId];
  }

  // Handle cleanup if renamed
  if (options.previousName && options.previousName !== name) {
    const oldFolder = join(projectRoot, FIGMA_DIR, CATEGORY_FOLDERS[category], options.previousName);
    try {
      console.error(`🗑️ Cleaning up old component folder: ${oldFolder}`);
      await rm(oldFolder, { recursive: true, force: true });
    } catch (e) {
      console.error(`⚠️ Failed to cleanup old folder ${oldFolder}:`, e);
    }
  }

  // Create element folder
  const elementFolder = await createElementFolder(projectRoot, category, name);
  const relativeFolderPath = join(FIGMA_DIR, CATEGORY_FOLDERS[category], name);

  // Save code
  await saveComponentCode(elementFolder, code);

  // Screenshot already saved directly to local folder
  let hasScreenshot = false;
  if (options.screenshotPath) {
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
    hiddenNodes: options.hiddenNodes?.length ? options.hiddenNodes : undefined,
    totalNodes: options.totalNodes,
    instanceCount: options.instanceCount,
    hasScreenshot,
    tokensExtracted: 0,
    interactions: options.interactions,
    componentGroups: options.componentGroups,
  };

  await saveElementMeta(elementFolder, meta);

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
export function formatResultForLLM(result: GenerationResult, projectRoot?: string): string {
  // Use absolute path if provided, otherwise fall back to cwd
  const root = projectRoot ?? process.cwd();

  let response = `## ${result.wasReplaced ? '🔄 Replaced' : '✅ Generated'} ${result.name}\n\n`;

  response += `| Property | Value |\n`;
  response += `|----------|-------|\n`;
  response += `| **Type** | ${result.category} |\n`;
  response += `| **Folder** | \`${join(root, result.folder)}\` |\n`;
  response += `| **Code** | \`${join(root, result.indexPath)}\` |\n`;
  response += `| **Exports** | ${result.exports.map(e => `\`${e}\``).join(', ')} |\n`;

  if (result.dependencies.length > 0) {
    response += `| **Dependencies** | ${result.dependencies.map(d => `\`${d}\``).join(', ')} |\n`;
  }

  if (result.screenshotPath) {
    response += `| **Screenshot** | \`${join(root, result.screenshotPath)}\` |\n`;
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
