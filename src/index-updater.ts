/**
 * Автоматический обновлятель index.ts файлов
 * Automatic index.ts file updater
 *
 * Анализирует структуру проекта и автоматически обновляет barrel exports
 * Analyzes project structure and automatically updates barrel exports
 */

import { Project, SourceFile, SyntaxKind, ExportDeclaration } from 'ts-morph';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Запись экспорта
 * Export entry
 */
export interface ExportEntry {
  /** Имя экспортируемого элемента / Exported element name */
  name: string;
  /** Путь к файлу (относительный) / File path (relative) */
  path: string;
  /** Является ли дефолтным экспортом / Is default export */
  isDefault: boolean;
  /** Является ли типом / Is type */
  isType?: boolean;
}

/**
 * Опции обновления index файла
 * Index file update options
 */
export interface IndexUpdateOptions {
  /** Путь к index.ts файлу / Path to index.ts file */
  indexPath: string;
  /** Новые экспорты для добавления / New exports to add */
  newExports: ExportEntry[];
  /** Сохранять существующие экспорты / Preserve existing exports */
  preserveExisting?: boolean;
  /** Сортировать по алфавиту / Sort alphabetically */
  sortAlphabetically?: boolean;
}

/**
 * Опции генерации реестра экранов
 * Screen registry generation options
 */
export interface ScreenRegistryOptions {
  /** Список экранов / Screen list */
  screens: Array<{ name: string; path: string }>;
  /** Путь к файлу реестра / Registry file path */
  registryPath: string;
}

/**
 * Парсит существующие экспорты из содержимого index файла
 * Parses existing exports from index file content
 *
 * @param indexContent - Содержимое index.ts файла
 * @returns Список найденных экспортов
 */
export function parseExistingExports(indexContent: string): ExportEntry[] {
  const exports: ExportEntry[] = [];

  try {
    // Создаем временный проект ts-morph для парсинга
    // Create temporary ts-morph project for parsing
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        target: 99, // ESNext
        module: 99, // ESNext
      },
    });

    // Создаем временный файл в памяти
    // Create temporary file in memory
    const sourceFile = project.createSourceFile('temp.ts', indexContent);

    // Получаем все export декларации
    // Get all export declarations
    const exportDeclarations = sourceFile.getExportDeclarations();

    exportDeclarations.forEach((exportDecl) => {
      const moduleSpecifier = exportDecl.getModuleSpecifierValue();

      if (!moduleSpecifier) {
        // Экспорт без module specifier (export { x })
        // Export without module specifier
        return;
      }

      const namedExports = exportDecl.getNamedExports();
      const isTypeOnly = exportDecl.isTypeOnly();

      if (namedExports.length > 0) {
        // Named exports: export { A, B } from './module'
        namedExports.forEach((namedExport) => {
          const name = namedExport.getName();
          const alias = namedExport.getAliasNode()?.getText();

          exports.push({
            name: alias || name,
            path: moduleSpecifier,
            isDefault: false,
            isType: isTypeOnly || namedExport.isTypeOnly(),
          });
        });
      } else {
        // Wildcard export: export * from './module'
        // или default re-export: export { default } from './module'
        const defaultExport = exportDecl.getText().includes('default');

        if (defaultExport) {
          // Извлекаем имя из пути для дефолтного экспорта
          // Extract name from path for default export
          const baseName = path.basename(moduleSpecifier, path.extname(moduleSpecifier));
          exports.push({
            name: baseName,
            path: moduleSpecifier,
            isDefault: true,
            isType: isTypeOnly,
          });
        }
      }
    });

    // Парсим обычные export statements (export const x = ...)
    // Parse regular export statements
    const exportedDeclarations = sourceFile.getExportedDeclarations();
    exportedDeclarations.forEach((declarations, name) => {
      // Пропускаем, если уже есть в списке
      // Skip if already in list
      if (exports.some(e => e.name === name)) {
        return;
      }

      declarations.forEach((declaration) => {
        const isType =
          declaration.getKind() === SyntaxKind.InterfaceDeclaration ||
          declaration.getKind() === SyntaxKind.TypeAliasDeclaration;

        exports.push({
          name,
          path: '', // Локальная декларация / Local declaration
          isDefault: false,
          isType,
        });
      });
    });

  } catch (error) {
    console.error('Ошибка парсинга экспортов:', error);
    // Error parsing exports
  }

  return exports;
}

/**
 * Объединяет существующие и новые экспорты
 * Merges existing and new exports
 *
 * @param existing - Существующие экспорты
 * @param newEntries - Новые экспорты
 * @returns Объединенный список без дубликатов
 */
export function mergeExports(
  existing: ExportEntry[],
  newEntries: ExportEntry[]
): ExportEntry[] {
  const merged = [...existing];

  newEntries.forEach((newEntry) => {
    // Проверяем дубликаты по имени и пути
    // Check duplicates by name and path
    const isDuplicate = merged.some(
      (e) => e.name === newEntry.name && e.path === newEntry.path
    );

    if (!isDuplicate) {
      merged.push(newEntry);
    }
  });

  return merged;
}

/**
 * Сортирует экспорты по алфавиту
 * Sorts exports alphabetically
 *
 * @param exports - Список экспортов
 * @returns Отсортированный список
 */
function sortExports(exports: ExportEntry[]): ExportEntry[] {
  return [...exports].sort((a, b) => {
    // Сначала сортируем по имени
    // First sort by name
    const nameCompare = a.name.localeCompare(b.name);
    if (nameCompare !== 0) return nameCompare;

    // Затем по пути
    // Then by path
    return a.path.localeCompare(b.path);
  });
}

/**
 * Группирует экспорты по файлам источникам
 * Groups exports by source files
 *
 * @param exports - Список экспортов
 * @returns Map с группами экспортов
 */
function groupExportsByPath(
  exports: ExportEntry[]
): Map<string, ExportEntry[]> {
  const groups = new Map<string, ExportEntry[]>();

  exports.forEach((entry) => {
    const existing = groups.get(entry.path) || [];
    existing.push(entry);
    groups.set(entry.path, existing);
  });

  return groups;
}

/**
 * Генерирует строку export statement
 * Generates export statement string
 *
 * @param entries - Экспорты из одного файла
 * @param sourcePath - Путь к файлу источнику
 * @returns Строка export statement
 */
function generateExportStatement(
  entries: ExportEntry[],
  sourcePath: string
): string {
  if (entries.length === 0) return '';

  // Локальные декларации (path пустой)
  // Local declarations (empty path)
  if (!sourcePath) {
    return ''; // Локальные декларации уже в файле / Already in file
  }

  // Группируем по типам
  // Group by type
  const types = entries.filter(e => e.isType);
  const values = entries.filter(e => !e.isType);
  const defaults = entries.filter(e => e.isDefault);

  const statements: string[] = [];

  // Type exports
  if (types.length > 0) {
    const names = types.map(t => t.name).join(', ');
    statements.push(`export type { ${names} } from '${sourcePath}';`);
  }

  // Default re-exports
  if (defaults.length > 0) {
    defaults.forEach(d => {
      statements.push(`export { default as ${d.name} } from '${sourcePath}';`);
    });
  }

  // Named value exports
  if (values.length > 0 && !defaults.length) {
    const names = values.map(v => v.name).join(', ');
    statements.push(`export { ${names} } from '${sourcePath}';`);
  }

  return statements.join('\n');
}

/**
 * Обновляет index.ts файл с новыми экспортами
 * Updates index.ts file with new exports
 *
 * @param options - Опции обновления
 * @returns Новое содержимое файла
 */
export function updateIndexFile(options: IndexUpdateOptions): string {
  const {
    indexPath,
    newExports,
    preserveExisting = true,
    sortAlphabetically = true,
  } = options;

  let existingExports: ExportEntry[] = [];

  // Читаем существующий файл если нужно сохранить экспорты
  // Read existing file if we need to preserve exports
  if (preserveExisting && fs.existsSync(indexPath)) {
    const existingContent = fs.readFileSync(indexPath, 'utf-8');
    existingExports = parseExistingExports(existingContent);
  }

  // Объединяем экспорты
  // Merge exports
  let allExports = mergeExports(existingExports, newExports);

  // Сортируем если требуется
  // Sort if required
  if (sortAlphabetically) {
    allExports = sortExports(allExports);
  }

  // Группируем по файлам
  // Group by files
  const groupedExports = groupExportsByPath(allExports);

  // Генерируем содержимое файла
  // Generate file content
  const lines: string[] = [
    '/**',
    ' * Auto-generated barrel export file',
    ' * Автоматически сгенерированный файл экспортов',
    ' */',
    '',
  ];

  // Сортируем пути для детерминированного вывода
  // Sort paths for deterministic output
  const sortedPaths = Array.from(groupedExports.keys())
    .filter(p => p !== '') // Пропускаем локальные декларации
    .sort();

  sortedPaths.forEach((sourcePath) => {
    const entries = groupedExports.get(sourcePath);
    if (entries && entries.length > 0) {
      const statement = generateExportStatement(entries, sourcePath);
      if (statement) {
        lines.push(statement);
      }
    }
  });

  lines.push(''); // Финальный перевод строки / Final newline

  return lines.join('\n');
}

/**
 * Генерирует реестр экранов для React Navigation
 * Generates screen registry for React Navigation
 *
 * @param options - Опции генерации
 * @returns Содержимое файла реестра
 */
export function generateScreenRegistry(
  options: ScreenRegistryOptions
): string {
  const { screens, registryPath } = options;

  const lines: string[] = [
    '/**',
    ' * Auto-generated screen registry',
    ' * Автоматически сгенерированный реестр экранов',
    ' */',
    '',
  ];

  // Импортируем все экраны
  // Import all screens
  screens.forEach(({ name, path: screenPath }) => {
    // Вычисляем относительный путь от registryPath
    // Calculate relative path from registryPath
    const registryDir = path.dirname(registryPath);
    const relativePath = path.relative(registryDir, screenPath)
      .replace(/\\/g, '/') // Windows paths
      .replace(/\.tsx?$/, ''); // Remove extension

    const importPath = relativePath.startsWith('.')
      ? relativePath
      : `./${relativePath}`;

    lines.push(`import ${name} from '${importPath}';`);
  });

  lines.push('');

  // Генерируем типы для навигации
  // Generate navigation types
  lines.push('/**');
  lines.push(' * Типы параметров экранов');
  lines.push(' * Screen parameters types');
  lines.push(' */');
  lines.push('export type RootStackParamList = {');
  screens.forEach(({ name }) => {
    lines.push(`  ${name}: undefined;`);
  });
  lines.push('};');
  lines.push('');

  // Генерируем реестр экранов
  // Generate screen registry
  lines.push('/**');
  lines.push(' * Реестр всех экранов приложения');
  lines.push(' * Application screen registry');
  lines.push(' */');
  lines.push('export const screens = {');
  screens.forEach(({ name }) => {
    lines.push(`  ${name},`);
  });
  lines.push('} as const;');
  lines.push('');

  // Генерируем массив конфигурации для навигатора
  // Generate configuration array for navigator
  lines.push('/**');
  lines.push(' * Конфигурация экранов для React Navigation');
  lines.push(' * Screen configuration for React Navigation');
  lines.push(' */');
  lines.push('export const screenConfigs = [');
  screens.forEach(({ name }) => {
    lines.push(`  { name: '${name}' as const, component: ${name} },`);
  });
  lines.push('] as const;');
  lines.push('');

  return lines.join('\n');
}

/**
 * Сканирует директорию и находит все компоненты для экспорта
 * Scans directory and finds all components for export
 *
 * @param dirPath - Путь к директории
 * @param extensions - Расширения файлов для поиска
 * @returns Список найденных экспортов
 */
export function scanDirectoryForExports(
  dirPath: string,
  extensions: string[] = ['.ts', '.tsx']
): ExportEntry[] {
  const exports: ExportEntry[] = [];

  if (!fs.existsSync(dirPath)) {
    return exports;
  }

  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);

    // Пропускаем index.ts и test файлы
    // Skip index.ts and test files
    if (
      file === 'index.ts' ||
      file === 'index.tsx' ||
      file.includes('.test.') ||
      file.includes('.spec.')
    ) {
      return;
    }

    if (stat.isFile()) {
      const ext = path.extname(file);

      if (extensions.includes(ext)) {
        const baseName = path.basename(file, ext);
        const relativePath = `./${baseName}`;

        // Определяем тип экспорта по содержимому файла
        // Determine export type by file content
        try {
          const content = fs.readFileSync(filePath, 'utf-8');

          // Проверяем на default export
          // Check for default export
          const hasDefaultExport = /export\s+default\s+/.test(content);

          if (hasDefaultExport) {
            exports.push({
              name: baseName,
              path: relativePath,
              isDefault: true,
            });
          } else {
            // Ищем named exports
            // Look for named exports
            const namedExportRegex = /export\s+(?:const|function|class|interface|type)\s+(\w+)/g;
            let match;

            while ((match = namedExportRegex.exec(content)) !== null) {
              const name = match[1];
              const isType = content.includes(`export type ${name}`) ||
                           content.includes(`export interface ${name}`);

              exports.push({
                name,
                path: relativePath,
                isDefault: false,
                isType,
              });
            }
          }
        } catch (error) {
          console.error(`Ошибка чтения файла ${filePath}:`, error);
          // Error reading file
        }
      }
    }
  });

  return exports;
}

/**
 * Автоматически обновляет index.ts в директории
 * Automatically updates index.ts in directory
 *
 * @param dirPath - Путь к директории
 * @param options - Дополнительные опции
 */
export function autoUpdateIndex(
  dirPath: string,
  options?: Partial<IndexUpdateOptions>
): void {
  const indexPath = path.join(dirPath, 'index.ts');

  // Сканируем директорию
  // Scan directory
  const newExports = scanDirectoryForExports(dirPath);

  // Обновляем index.ts
  // Update index.ts
  const content = updateIndexFile({
    indexPath,
    newExports,
    preserveExisting: true,
    sortAlphabetically: true,
    ...options,
  });

  // Записываем файл
  // Write file
  fs.writeFileSync(indexPath, content, 'utf-8');

  console.log(`✓ Обновлен ${indexPath}`);
  console.log(`  Экспортов: ${newExports.length}`);
}
