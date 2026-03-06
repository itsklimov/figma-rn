import { promises as fs } from 'fs';
import { join } from 'path';

const CORE_DIR = join(process.cwd(), 'src', 'core');
const CHECK_ZONES = [
  join(CORE_DIR, 'recognize'),
  join(CORE_DIR, 'layout'),
  join(CORE_DIR, 'detection'),
];

const forbiddenMatchers = [
  (value: string) => value === '../generation',
  (value: string) => value.startsWith('../generation/'),
  (value: string) => value === '../../core/generation',
  (value: string) => value.startsWith('../../core/generation/'),
];

async function collectTsFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTsFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && fullPath.endsWith('.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

function getImportSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const importRegex = /import\s+(?:type\s+)?[^;]*?from\s+['\"]([^'\"]+)['\"]/g;
  let match: RegExpExecArray | null;

  while ((match = importRegex.exec(source)) !== null) {
    specs.push(match[1]);
  }

  return specs;
}

async function main(): Promise<void> {
  const files = (await Promise.all(CHECK_ZONES.map((zone) => collectTsFiles(zone)))).flat();
  const violations: Array<{ file: string; specifier: string }> = [];

  for (const file of files) {
    const source = await fs.readFile(file, 'utf-8');
    const specs = getImportSpecifiers(source);

    for (const specifier of specs) {
      if (forbiddenMatchers.some((matcher) => matcher(specifier))) {
        violations.push({ file, specifier });
      }
    }
  }

  if (violations.length === 0) {
    console.log('Layering check passed: no recognize/layout/detection -> generation imports found.');
    return;
  }

  console.error('Layering check failed. Forbidden imports found:');
  for (const violation of violations) {
    const relative = violation.file.replace(`${process.cwd()}/`, '');
    console.error(`- ${relative} imports "${violation.specifier}"`);
  }
  process.exit(1);
}

main().catch((error) => {
  console.error('Layering check crashed:', error);
  process.exit(1);
});
