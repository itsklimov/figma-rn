/**
 * Менеджер рабочей папки .figma/ v2.0
 * Один URL = одна папка со всем содержимым
 *
 * Figma Workspace Manager v2.0
 * One URL = one folder with all contents
 *
 * Структура / Structure:
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
// Типы / Types
// ============================================================================

/**
 * Категория элемента / Element category
 */
export type ManifestCategory = 'screens' | 'modals' | 'sheets' | 'components' | 'icons';

/**
 * Информация об ассете / Asset info
 */
export interface AssetInfo {
  /** Имя файла / Filename */
  filename: string;
  /** Тип: icon или image / Type: icon or image */
  type: 'icon' | 'image';
  /** ID экземпляра в Figma / Instance ID in Figma */
  nodeId: string;
  /** ID компонента (стабильный для дедупликации) / Component ID (stable for deduplication) */
  componentId?: string;
  /** Имя в Figma (может меняться) / Name in Figma (can change) */
  figmaName?: string;
  /** Формат / Format */
  format: 'svg' | 'png' | 'jpg';
  /** Размеры / Dimensions */
  dimensions?: { width: number; height: number };
}

/**
 * Информация о компоненте Figma (группировка по componentId)
 * Figma component info (grouped by componentId)
 */
export interface ComponentInfo {
  /** Тип компонента / Component type */
  type: 'icon' | 'image' | 'component';
  /** Имя в Figma (может меняться) / Name in Figma (can change) */
  figmaName: string;
  /** Локальный путь к файлу / Local file path */
  localPath: string;
  /** Все экземпляры этого компонента / All instances of this component */
  instances: string[];
}

/**
 * Метаданные элемента (meta.json внутри папки элемента)
 * Element metadata (meta.json inside element folder)
 */
export interface ElementMeta {
  /** Имя компонента / Component name */
  name: string;
  /** Figma URL */
  figmaUrl: string;
  /** Figma node ID */
  nodeId: string;
  /** Имя в Figma (может отличаться от name) / Figma name (may differ from name) */
  figmaName?: string;
  /** Время генерации / Generation timestamp */
  generatedAt: string;
  /** Экспортируемые сущности / Exported entities */
  exports: string[];
  /** Зависимости / Dependencies */
  dependencies: string[];
  /** Обнаруженные паттерны / Detected patterns */
  patterns: {
    hasFloatingFooter?: boolean;
    hasModalOverlay?: boolean;
    hasList?: boolean;
    hasForm?: boolean;
    hasStatusBar?: boolean;
    hasDragHandle?: boolean;
  };
  /** Список ассетов (legacy, для обратной совместимости) / Asset list (legacy, for backwards compatibility) */
  assets: AssetInfo[];
  /** Полная иерархия узла / Full node hierarchy */
  hierarchy?: HierarchyNode;
  /** Скрытые узлы в дизайне / Hidden nodes in design */
  hiddenNodes?: string[];
  /** Общее количество узлов / Total node count */
  totalNodes?: number;
  /** Количество экземпляров компонентов / Instance count */
  instanceCount?: number;
  /** Есть ли скриншот / Has screenshot */
  hasScreenshot: boolean;
  /** Извлечённые токены (только для этого элемента) / Extracted tokens (element-specific) */
  tokensExtracted: number;
  /** Извлеченные интерактивности / Extracted interactions */
  interactions?: Array<{
    /** ID узла / Node ID */
    nodeId: string;
    /** Имя узла / Node name */
    nodeName: string;
    /** Триггер взаимодействия / Interaction trigger */
    trigger: string;
    /** Действие / Action */
    action: string;
    /** ID назначения (для навигации) / Destination ID (for navigation) */
    destinationId?: string;
  }>;
  /** Извлеченные прокрутки / Extracted scrolls */
  scrolls?: Array<{
    /** ID узла / Node ID */
    nodeId: string;
    /** Имя узла / Node name */
    nodeName: string;
    /** Направление прокрутки / Scroll direction */
    direction: 'HORIZONTAL' | 'VERTICAL' | 'BOTH';
  }>;
}

/**
 * Запись в манифесте (ссылка на папку) / Manifest entry (folder reference)
 */
export interface ManifestEntry {
  /** Имя компонента / Component name */
  name: string;
  /** Путь к папке относительно .figma/ / Folder path relative to .figma/ */
  folder: string;
  /** Время генерации / Generation timestamp */
  generatedAt: string;
  /** Figma node ID */
  nodeId: string;
  /** Figma URL */
  figmaUrl: string;
}

/**
 * Структура манифеста / Manifest structure
 */
export interface Manifest {
  /** Версия схемы / Schema version */
  version: string;
  /** Корень проекта / Project root */
  projectRoot: string;
  /** Конфигурация проекта / Project config */
  config: {
    framework: string;
    stylePattern: string;
    importPrefix?: string;
    scaleFunction?: string;
  };
  /** Экраны (nodeId → Entry) */
  screens: Record<string, ManifestEntry>;
  /** Модальные окна (nodeId → Entry) */
  modals: Record<string, ManifestEntry>;
  /** Bottom sheets (nodeId → Entry) */
  sheets: Record<string, ManifestEntry>;
  /** Компоненты (nodeId → Entry) */
  components: Record<string, ManifestEntry>;
  /** Иконки (standalone) (nodeId → Entry) */
  icons: Record<string, ManifestEntry>;
}

/**
 * Конфигурация проекта для Figma генерации
 * Project configuration for Figma generation
 */
export interface FigmaConfig {
  version: string;
  projectRoot: string;
  theme?: {
    colorsFile?: string;      // например, "src/styles/theme/colors.ts"
    typographyFile?: string;  // например, "src/styles/theme/typography.ts"
    spacingFile?: string;     // например, "src/styles/theme/spacing.ts"
    shadowsFile?: string;     // например, "src/styles/theme/shadows.ts"
    radiiFile?: string;       // например, "src/styles/theme/radii.ts"
    mainThemeFile?: string;   // например, "src/styles/theme/index.ts"
    type: 'object-export' | 'styled-components' | 'nativewind';
  };
  codeStyle: {
    stylePattern: 'useTheme' | 'StyleSheet';
    scaleFunction: string;
    importPrefix: string;
  };
}

/**
 * Результат генерации / Generation result
 */
export interface GenerationResult {
  status: 'generated' | 'replaced' | 'error';
  category: ManifestCategory;
  name: string;
  /** Путь к папке / Folder path */
  folder: string;
  /** Путь к index.tsx / Path to index.tsx */
  indexPath: string;
  exports: string[];
  dependencies: string[];
  patterns: ElementMeta['patterns'];
  figmaUrl: string;
  nodeId: string;
  /** Ассеты / Assets */
  assets: AssetInfo[];
  /** Путь к скриншоту / Screenshot path */
  screenshotPath?: string;
  /** Предлагаемый путь в проекте / Suggested project path */
  suggestedTarget: string;
  /** Команда для копирования / Copy command */
  copyCommand: string;
  /** Было заменено / Was replaced */
  wasReplaced: boolean;
  /** Количество извлечённых токенов / Number of extracted tokens */
  tokensExtracted: number;
}

// ============================================================================
// Константы / Constants
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
// Утилиты / Utilities
// ============================================================================

/**
 * Определение категории по типу элемента / Get category from element type
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
 * Нормализация URL / Normalize URL
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
 * Извлечение node-id / Extract node-id
 */
export function extractNodeId(url: string): string {
  try {
    const parsed = new URL(url);
    const nodeId = parsed.searchParams.get('node-id') || 'unknown';
    // Конвертируем в канонический формат с двоеточием / Convert to canonical colon format
    return nodeId.replace(/-/g, ':');
  } catch {
    const match = url.match(/node-id=([^&]+)/);
    const nodeId = match ? match[1] : 'unknown';
    return nodeId.replace(/-/g, ':');
  }
}

/**
 * Предлагаемый путь в проекте / Suggested target path
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
// Инициализация / Initialization
// ============================================================================

/**
 * Инициализация workspace / Initialize workspace
 */
export async function initWorkspace(projectRoot: string): Promise<string> {
  const figmaDir = join(projectRoot, FIGMA_DIR);

  // Создаём структуру / Create structure
  await mkdir(figmaDir, { recursive: true });
  for (const folder of Object.values(CATEGORY_FOLDERS)) {
    await mkdir(join(figmaDir, folder), { recursive: true });
  }

  // Добавляем в .gitignore / Add to .gitignore
  await ensureGitignore(projectRoot);

  return figmaDir;
}

/**
 * Добавление в .gitignore / Add to .gitignore
 */
async function ensureGitignore(projectRoot: string): Promise<void> {
  const gitignorePath = join(projectRoot, '.gitignore');

  try {
    let content = '';
    try {
      content = await readFile(gitignorePath, 'utf-8');
    } catch {
      // Файл не существует
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
// Манифест / Manifest
// ============================================================================

/**
 * Миграция манифеста v1.0.0 → v2.0.0 → v3.0.0
 * Migrate manifest v1.0.0 → v2.0.0 → v3.0.0
 */
function migrateManifest(manifest: any): Manifest {
  // Если уже v3.0.0, ничего не делаем / If already v3.0.0, do nothing
  if (manifest.version === MANIFEST_VERSION) {
    return manifest as Manifest;
  }

  console.error(`🔄 Migrating manifest from ${manifest.version} to ${MANIFEST_VERSION}...`);

  const categories: ManifestCategory[] = ['screens', 'modals', 'sheets', 'components', 'icons'];

  // Миграция v1.0.0 → v2.0.0 / Migration v1.0.0 → v2.0.0
  if (manifest.version === '1.0.0') {
    for (const category of categories) {
      const entries = manifest[category] || {};

      for (const [url, entry] of Object.entries(entries)) {
        const oldEntry = entry as any;

        // Конвертируем path → folder
        // Старый формат: { path: ".figma/screens/HomeScreen.tsx" }
        // Новый формат: { folder: ".figma/screens/HomeScreen" }
        if (oldEntry.path && !oldEntry.folder) {
          const oldPath = oldEntry.path;
          // Убираем расширение файла (.tsx)
          const pathWithoutExt = oldEntry.path.replace(/\.(tsx|ts|jsx|js)$/, '');
          oldEntry.folder = pathWithoutExt;
          delete oldEntry.path;

          console.error(`   ✓ ${category}: ${oldEntry.name} (${oldPath} → ${oldEntry.folder})`);
        }
      }
    }

    manifest.version = '2.0.0';
  }

  // Миграция v2.0.0 → v3.0.0 / Migration v2.0.0 → v3.0.0
  // Конвертируем URL-based keys → nodeId-based keys
  // Convert URL-based keys → nodeId-based keys
  if (manifest.version === '2.0.0') {
    console.error(`   🔄 Converting URL-based keys to nodeId-based keys...`);

    for (const category of categories) {
      const entries = manifest[category] || {};
      const newEntries: Record<string, any> = {};

      for (const [key, entry] of Object.entries(entries)) {
        const oldEntry = entry as any;

        // Извлекаем nodeId из существующего поля или из URL (key)
        // Extract nodeId from existing field or from URL (key)
        let nodeId = oldEntry.nodeId;
        if (!nodeId) {
          // Если nodeId нет, извлекаем из URL
          nodeId = extractNodeId(key);
        }

        // Добавляем figmaUrl если его нет
        // Add figmaUrl if it doesn't exist
        if (!oldEntry.figmaUrl) {
          oldEntry.figmaUrl = key;
        }

        // Сохраняем под новым ключом (nodeId)
        // Save under new key (nodeId)
        newEntries[nodeId] = oldEntry;

        console.error(`   ✓ ${category}: ${oldEntry.name} (URL → nodeId: ${nodeId})`);
      }

      // Заменяем старые записи новыми
      // Replace old entries with new ones
      manifest[category] = newEntries;
    }

    manifest.version = '3.0.0';
    console.error(`✅ Migration complete: ${MANIFEST_VERSION}`);
  }

  return manifest as Manifest;
}

/**
 * Загрузка манифеста / Load manifest
 * Автоматически мигрирует старые версии
 */
export async function loadManifest(projectRoot: string): Promise<Manifest | null> {
  const manifestPath = join(projectRoot, FIGMA_DIR, MANIFEST_FILE);

  try {
    const content = await readFile(manifestPath, 'utf-8');
    let manifest = JSON.parse(content);

    // Проверяем версию и мигрируем если нужно
    if (manifest.version && manifest.version !== MANIFEST_VERSION) {
      manifest = migrateManifest(manifest);

      // Сохраняем мигрированный манифест
      await saveManifest(projectRoot, manifest);
      console.error(`💾 Migrated manifest saved`);
    }

    return manifest as Manifest;
  } catch {
    return null;
  }
}

/**
 * Создание пустого манифеста / Create empty manifest
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
 * Сохранение манифеста / Save manifest
 */
export async function saveManifest(projectRoot: string, manifest: Manifest): Promise<void> {
  const manifestPath = join(projectRoot, FIGMA_DIR, MANIFEST_FILE);
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
}

/**
 * Автоопределение конфигурации / Auto-detect config
 */
async function autoDetectConfig(projectRoot: string): Promise<Manifest['config']> {
  const config: Manifest['config'] = {
    framework: 'react-native',
    stylePattern: 'StyleSheet',
  };

  try {
    // Framework из package.json
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
      // Не найден
    }

    // Import prefix из tsconfig.json
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
      // Не найден
    }

    // Style pattern из исходников
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
 * Получение или создание манифеста / Get or create manifest
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
 * Поиск записи по URL / Find entry by URL
 * Сначала ищет по nodeId, затем по URL (для обратной совместимости)
 * First searches by nodeId, then by URL (for backwards compatibility)
 */
export function findEntryByUrl(
  manifest: Manifest,
  figmaUrl: string
): { category: ManifestCategory; entry: ManifestEntry } | null {
  const normalizedUrl = normalizeUrl(figmaUrl);
  const nodeId = extractNodeId(figmaUrl);
  const categories: ManifestCategory[] = ['screens', 'modals', 'sheets', 'components', 'icons'];

  // Сначала пытаемся найти по nodeId (новая логика)
  // First try to find by nodeId (new logic)
  for (const category of categories) {
    const entries = manifest[category];
    if (entries[nodeId]) {
      return { category, entry: entries[nodeId] };
    }
  }

  // Fallback: ищем по URL (для старых манифестов)
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
// Конфигурация (config.json) / Configuration (config.json)
// ============================================================================

/**
 * Загрузка конфигурации / Load configuration
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
 * Сохранение конфигурации / Save configuration
 */
export async function saveFigmaConfig(projectRoot: string, config: FigmaConfig): Promise<void> {
  const configPath = join(projectRoot, FIGMA_DIR, CONFIG_FILE);
  await mkdir(join(projectRoot, FIGMA_DIR), { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Получить или создать конфигурацию / Get or create configuration
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
 * Генерация конфигурации с автоопределением темы
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

  // Рекурсивно ищем файл цветов в любой подпапке / Recursively search for colors file in any subdirectory
  // Паттерн ищет colors.ts в типичных локациях: **/styles/**/colors.ts, **/theme/**/colors.ts, etc.
  const colorFiles = await glob('**/@(styles|theme|constants)/**/colors.{ts,js}', {
    cwd: projectRoot,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.figma/**', '**/test/**', '**/tests/**'],
    nodir: true,
    absolute: false,
  });

  if (colorFiles.length > 0) {
    // Приоритет: предпочитаем файлы с 'theme' в пути / Priority: prefer files with 'theme' in path
    const themeColorFile = colorFiles.find(f => f.includes('/theme/'));
    colorsFile = themeColorFile || colorFiles[0];
    console.error(`   📦 Found colors: ${colorsFile}`);
    if (colorFiles.length > 1) {
      console.error(`   ⚠️  Multiple color files found (${colorFiles.length}), using: ${colorsFile}`);
    }
  }

  // Рекурсивно ищем файл типографики / Recursively search for typography file
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

  // Рекурсивно ищем файл spacing / Recursively search for spacing file
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

  // Рекурсивно ищем файл shadows / Recursively search for shadows file
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

  // Рекурсивно ищем файл radii / Recursively search for radii file
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

  // Рекурсивно ищем главный файл темы / Recursively search for main theme file
  const mainThemeFiles = await glob('**/@(styles|theme)/**/@(defaultTheme|theme|index).{ts,js}', {
    cwd: projectRoot,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.figma/**', '**/test/**', '**/tests/**'],
    nodir: true,
    absolute: false,
  });

  if (mainThemeFiles.length > 0) {
    // Приоритет: предпочитаем файлы с 'theme' в пути и не index.ts
    // Priority: prefer files with 'theme' in path and not index.ts
    const themeMainFile = mainThemeFiles.find(f => f.includes('/theme/') && !f.endsWith('/index.ts'));
    const anyThemeFile = mainThemeFiles.find(f => f.includes('/theme/'));
    mainThemeFile = themeMainFile || anyThemeFile || mainThemeFiles[0];
    console.error(`   🎨 Found main theme: ${mainThemeFile}`);
    if (mainThemeFiles.length > 1) {
      console.error(`   ⚠️  Multiple main theme files found (${mainThemeFiles.length}), using: ${mainThemeFile}`);
    }
  }

  // Загружаем существующий манифест для настроек / Load existing manifest for settings
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
// Дизайн токены (theme.json) / Design Tokens (theme.json)
// ============================================================================

/**
 * Загрузка глобальных токенов / Load global tokens
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
 * Сохранение глобальных токенов / Save global tokens
 */
export async function saveTheme(projectRoot: string, tokens: DesignTokens): Promise<void> {
  const themePath = join(projectRoot, FIGMA_DIR, THEME_FILE);
  await mkdir(dirname(themePath), { recursive: true });
  await writeFile(themePath, JSON.stringify(tokens, null, 2), 'utf-8');
}

/**
 * Обновление глобальных токенов / Update global tokens
 * Мержит новые токены с существующими
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
// Генерация элемента / Element Generation
// ============================================================================

/**
 * Создание папки элемента / Create element folder
 */
async function createElementFolder(
  projectRoot: string,
  category: ManifestCategory,
  name: string
): Promise<string> {
  const figmaDir = join(projectRoot, FIGMA_DIR);
  const categoryFolder = CATEGORY_FOLDERS[category];
  const elementFolder = join(figmaDir, categoryFolder, name);

  // Создаём папку и подпапку assets
  await mkdir(elementFolder, { recursive: true });
  await mkdir(join(elementFolder, ASSETS_DIR), { recursive: true });

  return elementFolder;
}

/**
 * Сохранение мета-данных элемента / Save element metadata
 */
async function saveElementMeta(elementFolder: string, meta: ElementMeta): Promise<void> {
  const metaPath = join(elementFolder, META_FILE);
  await writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
}

/**
 * Загрузка мета-данных элемента / Load element metadata
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
 * Сохранение кода компонента / Save component code
 */
async function saveComponentCode(elementFolder: string, code: string): Promise<string> {
  const indexPath = join(elementFolder, INDEX_FILE);
  await writeFile(indexPath, code, 'utf-8');
  return indexPath;
}

/**
 * Сохранение скриншота / Save screenshot
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
 * Сохранение ассета / Save asset
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
 * Регистрация сгенерированного элемента / Register generated element
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
  // Получаем манифест
  const manifest = await getOrCreateManifest(projectRoot);

  const normalizedUrl = normalizeUrl(figmaUrl);
  const nodeId = extractNodeId(figmaUrl);

  // Проверяем существование
  const existing = findEntryByUrl(manifest, figmaUrl);
  const wasReplaced = existing !== null;

  // Удаляем из другой категории если есть
  if (existing && existing.category !== category) {
    delete manifest[existing.category][normalizedUrl];
  }

  // Создаём папку элемента
  const elementFolder = await createElementFolder(projectRoot, category, name);
  const relativeFolderPath = join(FIGMA_DIR, CATEGORY_FOLDERS[category], name);

  // Сохраняем код
  await saveComponentCode(elementFolder, code);

  // Скриншот уже сохранен напрямую в локальную папку / Screenshot already saved directly to local folder
  let hasScreenshot = false;
  let screenshotPath: string | undefined;
  if (options.screenshotPath) {
    // Путь уже указывает на локальную папку / Path already points to local folder
    screenshotPath = options.screenshotPath;
    hasScreenshot = true;
  }

  // Сохраняем мета-данные
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

  // Обновляем глобальные токены
  if (options.tokens) {
    await updateTheme(projectRoot, options.tokens);
  }

  // Добавляем в манифест
  const entry: ManifestEntry = {
    name,
    folder: relativeFolderPath,
    generatedAt: new Date().toISOString(),
    nodeId,
    figmaUrl: normalizedUrl,
  };

  manifest[category][nodeId] = entry;
  await saveManifest(projectRoot, manifest);

  // Формируем результат
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
 * Обновление конфигурации / Update config
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
 * Получение записей категории / Get entries by category
 */
export function getEntriesByCategory(
  manifest: Manifest,
  category: ManifestCategory
): Array<{ url: string; entry: ManifestEntry }> {
  const entries = manifest[category];
  return Object.entries(entries).map(([url, entry]) => ({ url, entry }));
}

// ============================================================================
// Форматирование для LLM / LLM Formatting
// ============================================================================

/**
 * Форматирование результата / Format result for LLM
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

  // Паттерны
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

  // Ассеты
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

  // Команда для копирования
  response += `### To Use\n\n`;
  response += `\`\`\`bash\n${result.copyCommand}\n\`\`\`\n\n`;
  response += `**Suggested path**: \`${result.suggestedTarget}\`\n`;

  return response;
}

/**
 * Форматирование токенов для LLM / Format tokens for LLM
 */
export function formatTokensForLLM(tokens: DesignTokens): string {
  let response = `## 🎨 Design Tokens\n\n`;

  // Цвета
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

  // Типографика
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

  // Тени
  if (tokens.shadows.length > 0) {
    response += `### Shadows (${tokens.shadows.length})\n\n`;
    for (const shadow of tokens.shadows.slice(0, 3)) {
      response += `- **${shadow.type}**: offset(${shadow.offset.x}, ${shadow.offset.y}), blur ${shadow.radius}, color ${shadow.color}\n`;
    }
    response += `\n`;
  }

  return response;
}
