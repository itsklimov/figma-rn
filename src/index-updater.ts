/**
 * Automatic index.ts file updater
 *
 * Analyzes project structure and automatically updates barrel exports
 */

import { Project, SourceFile, SyntaxKind, ExportDeclaration } from 'ts-morph';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Export entry
 */
export interface ExportEntry {
  /** Exported element name */
  name: string;
  /** File path (relative) */
  path: string;
  /** Is default export */
  isDefault: boolean;
  /** Is type */
  isType?: boolean;
}

/**
 * Index file update options
 */
export interface IndexUpdateOptions {
  /** Path to index.ts file */
  indexPath: string;
  /** New exports to add */
  newExports: ExportEntry[];
  /** Preserve existing exports */
  preserveExisting?: boolean;
  /** Sort alphabetically */
  sortAlphabetically?: boolean;
}

/**
 * Screen registry generation options
 */
export interface ScreenRegistryOptions {
  /** Screen list */
  screens: Array<{ name: string; path: string }>;
  /** Registry file path */
  registryPath: string;
}

/**
 * Parses existing exports from index file content
 *
 * @param indexContent - index.ts file content
 * @returns List of found exports
 */
export function parseExistingExports(indexContent: string): ExportEntry[] {
  const exports: ExportEntry[] = [];

  try {
    // Create temporary ts-morph project for parsing
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        target: 99, // ESNext
        module: 99, // ESNext
      },
    });

    // Create temporary file in memory
    const sourceFile = project.createSourceFile('temp.ts', indexContent);

    // Get all export declarations
    const exportDeclarations = sourceFile.getExportDeclarations();

    exportDeclarations.forEach((exportDecl) => {
      const moduleSpecifier = exportDecl.getModuleSpecifierValue();

      if (!moduleSpecifier) {
        // Export without module specifier (export { x })
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
        // or default re-export: export { default } from './module'
        const defaultExport = exportDecl.getText().includes('default');

        if (defaultExport) {
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

    // Parse regular export statements (export const x = ...)
    const exportedDeclarations = sourceFile.getExportedDeclarations();
    exportedDeclarations.forEach((declarations, name) => {
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
          path: '', // Local declaration
          isDefault: false,
          isType,
        });
      });
    });

  } catch (error) {
    console.error('Error parsing exports:', error);
  }

  return exports;
}

/**
 * Merges existing and new exports
 *
 * @param existing - Existing exports
 * @param newEntries - New exports
 * @returns Merged list without duplicates
 */
export function mergeExports(
  existing: ExportEntry[],
  newEntries: ExportEntry[]
): ExportEntry[] {
  const merged = [...existing];

  newEntries.forEach((newEntry) => {
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
 * Sorts exports alphabetically
 *
 * @param exports - Export list
 * @returns Sorted list
 */
function sortExports(exports: ExportEntry[]): ExportEntry[] {
  return [...exports].sort((a, b) => {
    // First sort by name
    const nameCompare = a.name.localeCompare(b.name);
    if (nameCompare !== 0) return nameCompare;

    // Then by path
    return a.path.localeCompare(b.path);
  });
}

/**
 * Groups exports by source files
 *
 * @param exports - Export list
 * @returns Map with export groups
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
 * Generates export statement string
 *
 * @param entries - Exports from one file
 * @param sourcePath - Source file path
 * @returns Export statement string
 */
function generateExportStatement(
  entries: ExportEntry[],
  sourcePath: string
): string {
  if (entries.length === 0) return '';

  // Local declarations (empty path)
  if (!sourcePath) {
    return ''; // Already in file
  }

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
 * Updates index.ts file with new exports
 *
 * @param options - Update options
 * @returns New file content
 */
export function updateIndexFile(options: IndexUpdateOptions): string {
  const {
    indexPath,
    newExports,
    preserveExisting = true,
    sortAlphabetically = true,
  } = options;

  let existingExports: ExportEntry[] = [];

  // Read existing file if we need to preserve exports
  if (preserveExisting && fs.existsSync(indexPath)) {
    const existingContent = fs.readFileSync(indexPath, 'utf-8');
    existingExports = parseExistingExports(existingContent);
  }

  // Merge exports
  let allExports = mergeExports(existingExports, newExports);

  // Sort if required
  if (sortAlphabetically) {
    allExports = sortExports(allExports);
  }

  // Group by files
  const groupedExports = groupExportsByPath(allExports);

  // Generate file content
  const lines: string[] = [
    '/**',
    ' * Auto-generated barrel export file',
    ' */',
    '',
  ];

  // Sort paths for deterministic output
  const sortedPaths = Array.from(groupedExports.keys())
    .filter(p => p !== '') // Skip local declarations
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

  lines.push(''); // Final newline

  return lines.join('\n');
}

/**
 * Generates screen registry for React Navigation
 *
 * @param options - Generation options
 * @returns Registry file content
 */
export function generateScreenRegistry(
  options: ScreenRegistryOptions
): string {
  const { screens, registryPath } = options;

  const lines: string[] = [
    '/**',
    ' * Auto-generated screen registry',
    ' */',
    '',
  ];

  // Import all screens
  screens.forEach(({ name, path: screenPath }) => {
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

  // Generate navigation types
  lines.push('/**');
  lines.push(' * Screen parameters types');
  lines.push(' */');
  lines.push('export type RootStackParamList = {');
  screens.forEach(({ name }) => {
    lines.push(`  ${name}: undefined;`);
  });
  lines.push('};');
  lines.push('');

  // Generate screen registry
  lines.push('/**');
  lines.push(' * Application screen registry');
  lines.push(' */');
  lines.push('export const screens = {');
  screens.forEach(({ name }) => {
    lines.push(`  ${name},`);
  });
  lines.push('} as const;');
  lines.push('');

  // Generate configuration array for navigator
  lines.push('/**');
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
 * Scans directory and finds all components for export
 *
 * @param dirPath - Directory path
 * @param extensions - File extensions to search for
 * @returns List of found exports
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

        // Determine export type by file content
        try {
          const content = fs.readFileSync(filePath, 'utf-8');

          // Check for default export
          const hasDefaultExport = /export\s+default\s+/.test(content);

          if (hasDefaultExport) {
            exports.push({
              name: baseName,
              path: relativePath,
              isDefault: true,
            });
          } else {
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
          console.error(`Error reading file ${filePath}:`, error);
        }
      }
    }
  });

  return exports;
}

/**
 * Automatically updates index.ts in directory
 *
 * @param dirPath - Directory path
 * @param options - Additional options
 */
export function autoUpdateIndex(
  dirPath: string,
  options?: Partial<IndexUpdateOptions>
): void {
  const indexPath = path.join(dirPath, 'index.ts');

  // Scan directory
  const newExports = scanDirectoryForExports(dirPath);

  // Update index.ts
  const content = updateIndexFile({
    indexPath,
    newExports,
    preserveExisting: true,
    sortAlphabetically: true,
    ...options,
  });

  // Write file
  fs.writeFileSync(indexPath, content, 'utf-8');

  console.log(`✓ Updated ${indexPath}`);
  console.log(`  Exports: ${newExports.length}`);
}
