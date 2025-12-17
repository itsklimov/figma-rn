/**
 * Temporary Workspace для изолированных тестов
 * Создаёт временную директорию для каждого теста
 */

import { mkdtemp, rm, readFile, readdir, stat } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { existsSync } from 'fs';

export interface TempWorkspace {
  /** Корневая директория workspace */
  root: string;
  /** Путь к .figma директории */
  figmaDir: string;
  /** Очистка workspace */
  cleanup: () => Promise<void>;
  /** Проверка существования файла */
  exists: (relativePath: string) => boolean;
  /** Чтение файла */
  readFile: (relativePath: string) => Promise<string>;
  /** Чтение JSON файла */
  readJson: <T = unknown>(relativePath: string) => Promise<T>;
  /** Список файлов в директории */
  listDir: (relativePath: string) => Promise<string[]>;
  /** Проверка структуры директории */
  checkStructure: () => Promise<WorkspaceStructure>;
}

export interface WorkspaceStructure {
  manifest: boolean;
  config: boolean;
  screens: string[];
  modals: string[];
  sheets: string[];
  components: string[];
}

/**
 * Создаёт временный workspace для теста
 */
export async function createTempWorkspace(prefix = 'figma-test-'): Promise<TempWorkspace> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const figmaDir = join(root, '.figma');

  const workspace: TempWorkspace = {
    root,
    figmaDir,

    async cleanup() {
      try {
        await rm(root, { recursive: true, force: true });
      } catch (error) {
        // Игнорируем ошибки очистки
        console.error('Cleanup error:', error);
      }
    },

    exists(relativePath: string) {
      return existsSync(join(root, relativePath));
    },

    async readFile(relativePath: string) {
      const filePath = join(root, relativePath);
      return readFile(filePath, 'utf-8');
    },

    async readJson<T = unknown>(relativePath: string): Promise<T> {
      const content = await workspace.readFile(relativePath);
      return JSON.parse(content);
    },

    async listDir(relativePath: string) {
      const dirPath = join(root, relativePath);
      if (!existsSync(dirPath)) {
        return [];
      }
      return readdir(dirPath);
    },

    async checkStructure(): Promise<WorkspaceStructure> {
      const structure: WorkspaceStructure = {
        manifest: workspace.exists('.figma/manifest.json'),
        config: workspace.exists('.figma/config.json'),
        screens: [],
        modals: [],
        sheets: [],
        components: [],
      };

      // Собираем список экранов
      if (workspace.exists('.figma/screens')) {
        structure.screens = await workspace.listDir('.figma/screens');
      }

      // Собираем список модалов
      if (workspace.exists('.figma/modals')) {
        structure.modals = await workspace.listDir('.figma/modals');
      }

      // Собираем список sheets
      if (workspace.exists('.figma/sheets')) {
        structure.sheets = await workspace.listDir('.figma/sheets');
      }

      // Собираем список компонентов
      if (workspace.exists('.figma/components')) {
        structure.components = await workspace.listDir('.figma/components');
      }

      return structure;
    },
  };

  return workspace;
}

/**
 * Проверяет, что сгенерированный компонент имеет правильную структуру
 */
export async function validateGeneratedComponent(
  workspace: TempWorkspace,
  category: 'screens' | 'modals' | 'sheets' | 'components',
  name: string
): Promise<{
  valid: boolean;
  errors: string[];
  files: {
    indexTsx: boolean;
    metaJson: boolean;
    screenshot: boolean;
    assetsDir: boolean;
  };
}> {
  const errors: string[] = [];
  const basePath = `.figma/${category}/${name}`;

  const files = {
    indexTsx: workspace.exists(`${basePath}/index.tsx`),
    metaJson: workspace.exists(`${basePath}/meta.json`),
    screenshot: workspace.exists(`${basePath}/screenshot.png`),
    assetsDir: workspace.exists(`${basePath}/assets`),
  };

  // Проверяем обязательные файлы
  if (!files.indexTsx) {
    errors.push(`Missing ${basePath}/index.tsx`);
  }

  if (!files.metaJson) {
    errors.push(`Missing ${basePath}/meta.json`);
  }

  // Проверяем содержимое index.tsx
  if (files.indexTsx) {
    const content = await workspace.readFile(`${basePath}/index.tsx`);

    // Должен содержать экспорт компонента
    if (!content.includes(`export const ${name}`)) {
      errors.push(`index.tsx should export const ${name}`);
    }

    // Должен содержать createStyles
    if (!content.includes('createStyles')) {
      errors.push('index.tsx should contain createStyles function');
    }
  }

  // Проверяем содержимое meta.json
  if (files.metaJson) {
    try {
      const meta = await workspace.readJson<{
        name: string;
        figmaUrl: string;
        nodeId: string;
        exports: string[];
      }>(`${basePath}/meta.json`);

      if (meta.name !== name) {
        errors.push(`meta.json name mismatch: expected ${name}, got ${meta.name}`);
      }

      if (!meta.figmaUrl) {
        errors.push('meta.json missing figmaUrl');
      }

      if (!meta.nodeId) {
        errors.push('meta.json missing nodeId');
      }

      if (!Array.isArray(meta.exports) || meta.exports.length === 0) {
        errors.push('meta.json should have non-empty exports array');
      }
    } catch (error) {
      errors.push(`Invalid meta.json: ${error}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    files,
  };
}

/**
 * Получает статистику по workspace
 */
export async function getWorkspaceStats(workspace: TempWorkspace): Promise<{
  totalFiles: number;
  totalSize: number;
  categories: Record<string, number>;
}> {
  const stats = {
    totalFiles: 0,
    totalSize: 0,
    categories: {} as Record<string, number>,
  };

  if (!workspace.exists('.figma')) {
    return stats;
  }

  async function countDir(dir: string, category?: string) {
    const items = await readdir(join(workspace.root, dir), { withFileTypes: true });

    for (const item of items) {
      const itemPath = join(dir, item.name);

      if (item.isDirectory()) {
        await countDir(itemPath, category || item.name);
      } else if (item.isFile()) {
        stats.totalFiles++;
        const fileStat = await stat(join(workspace.root, itemPath));
        stats.totalSize += fileStat.size;

        if (category) {
          stats.categories[category] = (stats.categories[category] || 0) + 1;
        }
      }
    }
  }

  await countDir('.figma');

  return stats;
}
