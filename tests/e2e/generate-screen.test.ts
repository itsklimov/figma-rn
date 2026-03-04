/**
 * Live E2E quality matrix for get_screen.
 *
 * Scope:
 * 1. Real Figma API calls for multiple representative nodes
 * 2. Persisted artifacts validation in .figma workspace
 * 3. Generated TSX compilation checks
 * 4. Basic quality guardrails (TODO count, metadata consistency)
 *
 * Opt-in:
 *   RUN_FIGMA_E2E=1 bun run test:live
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';
import { readdir, readFile, rm, stat, rename } from 'fs/promises';
import { createMCPClient, MCPClient } from '../helpers/mcp-client';
import { compileTypeScript } from '../helpers/typescript-compiler';
import {
  LIVE_E2E_CASES,
  extractNodeId,
  requireFigmaToken,
  type LiveE2ECase,
} from '../fixtures/test-figma-urls';

const RUN_LIVE_FIGMA_E2E = process.env.RUN_FIGMA_E2E === '1';
const LIVE_PROJECT_ROOT = process.env.FIGMA_E2E_PROJECT_ROOT;

interface CaseReport {
  id: string;
  category: string;
  requestedName: string | null;
  resolvedName: string;
  resolvedFolder: string;
  status: 'passed' | 'failed';
  error?: string;
  linesOfCode: number;
  assetsInMeta: number;
  assetsOnDisk: number;
  assetRequires: number;
  unresolvedAssetRequires: number;
  todoCount: number;
  todoImageSourceCount: number;
  emptyUriCount: number;
  placeholderCount: number;
  compileSuccess: boolean;
}

interface ManifestEntry {
  name: string;
  folder: string;
  nodeId: string;
  figmaUrl: string;
}

interface ManifestShape {
  screens: Record<string, ManifestEntry>;
  modals: Record<string, ManifestEntry>;
  sheets: Record<string, ManifestEntry>;
  components: Record<string, ManifestEntry>;
  icons: Record<string, ManifestEntry>;
}

const FIGMA_DIR = '.figma';
const E2E_BACKUP_PREFIX = '.figma.__live_e2e_backup__';

function collectRequirePaths(code: string): string[] {
  const matches = code.matchAll(/require\((['"])([^'"]+)\1\)/g);
  return Array.from(matches, (match) => match[2]);
}

async function countFilesRecursive(dirPath: string): Promise<number> {
  if (!existsSync(dirPath)) return 0;

  let total = 0;
  const entries = await readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += await countFilesRecursive(full);
    } else if (entry.isFile()) {
      total += 1;
    }
  }
  return total;
}

function assertCaseCategory(testCase: LiveE2ECase): void {
  const valid = ['screens', 'modals', 'sheets', 'components', 'icons'];
  if (!valid.includes(testCase.category)) {
    throw new Error(`Invalid category for ${testCase.id}: ${testCase.category}`);
  }
}

async function loadManifest(projectRoot: string): Promise<ManifestShape | null> {
  const manifestPath = join(projectRoot, FIGMA_DIR, 'manifest.json');
  if (!existsSync(manifestPath)) return null;

  try {
    const content = await readFile(manifestPath, 'utf-8');
    return JSON.parse(content) as ManifestShape;
  } catch {
    return null;
  }
}

async function backupWorkspaceState(projectRoot: string): Promise<string | null> {
  const figmaDir = join(projectRoot, FIGMA_DIR);
  if (!existsSync(figmaDir)) return null;

  const backupPath = join(projectRoot, `${E2E_BACKUP_PREFIX}_${Date.now()}`);
  await rename(figmaDir, backupPath);
  return backupPath;
}

async function restoreWorkspaceState(
  projectRoot: string,
  backupPath: string | null
): Promise<void> {
  const figmaDir = join(projectRoot, FIGMA_DIR);
  await rm(figmaDir, { recursive: true, force: true });

  if (backupPath && existsSync(backupPath)) {
    await rename(backupPath, figmaDir);
  }
}

if (!RUN_LIVE_FIGMA_E2E) {
  describe('get_screen live matrix', () => {
    it('is disabled by default (set RUN_FIGMA_E2E=1 to enable)', () => {
      expect(RUN_LIVE_FIGMA_E2E).toBe(false);
    });
  });
} else {
  describe('get_screen live matrix', () => {
    let client: MCPClient;
    let figmaToken: string;

    beforeAll(async () => {
      figmaToken = requireFigmaToken();
      client = await createMCPClient(figmaToken);
    });

    afterAll(async () => {
      await client.stop();
    });

    it(
      'should generate stable artifacts for all live cases',
      { timeout: 10 * 60 * 1000 },
      async () => {
        if (!LIVE_PROJECT_ROOT) {
          throw new Error(
            'FIGMA_E2E_PROJECT_ROOT is required when RUN_FIGMA_E2E=1'
          );
        }
        if (!existsSync(LIVE_PROJECT_ROOT)) {
          throw new Error(
            `FIGMA_E2E_PROJECT_ROOT does not exist: ${LIVE_PROJECT_ROOT}`
          );
        }

        let backupPath: string | null = null;
        const failures: string[] = [];
        const reports: CaseReport[] = [];

        try {
          backupPath = await backupWorkspaceState(LIVE_PROJECT_ROOT);

          for (const testCase of LIVE_E2E_CASES) {
            try {
              assertCaseCategory(testCase);
              const expectedNodeId = extractNodeId(testCase.figmaUrl);
              if (!expectedNodeId) {
                throw new Error(`Cannot extract node-id from URL: ${testCase.figmaUrl}`);
              }

              const request: Parameters<MCPClient['getScreen']>[0] = {
                figmaUrl: testCase.figmaUrl,
                projectRoot: LIVE_PROJECT_ROOT,
                category: testCase.category,
              };
              if (testCase.componentName) {
                request.componentName = testCase.componentName;
              }

              const result = await client.getScreen(request);

              if (result.isError) {
                const text = result.content?.[0]?.text || 'Unknown error';
                throw new Error(`Tool returned error: ${text.slice(0, 400)}`);
              }

              const manifestAfter = await loadManifest(LIVE_PROJECT_ROOT);
              const resolvedEntry = manifestAfter?.[testCase.category]?.[expectedNodeId];
              if (!resolvedEntry) {
                throw new Error(
                  `Manifest entry not found for node ${expectedNodeId} in ${testCase.category}`
                );
              }

              const componentFolder = join(LIVE_PROJECT_ROOT, resolvedEntry.folder);
              const indexPath = join(componentFolder, 'index.tsx');
              const metaPath = join(componentFolder, 'meta.json');
              const assetsPath = join(componentFolder, 'assets');

              expect(existsSync(indexPath)).toBe(true);
              expect(existsSync(metaPath)).toBe(true);
              expect(existsSync(assetsPath)).toBe(true);

              const indexStat = await stat(indexPath);
              expect(indexStat.size).toBeGreaterThan(0);

              const code = await readFile(indexPath, 'utf-8');
              const meta = JSON.parse(await readFile(metaPath, 'utf-8')) as {
                name: string;
                nodeId: string;
                figmaUrl: string;
                exports: string[];
                assets: Array<{ filename: string }>;
              };

              expect(meta.name).toBe(resolvedEntry.name);
              expect(meta.nodeId).toBe(expectedNodeId);
              expect(Array.isArray(meta.exports)).toBe(true);
              expect(meta.exports.length).toBeGreaterThan(0);
              expect(Array.isArray(meta.assets)).toBe(true);
              expect(resolvedEntry.name).toBe(testCase.expectedResolvedName);
              expect(resolvedEntry.name).toMatch(/^[A-Z][A-Za-z0-9]*$/);
              expect(resolvedEntry.name).not.toMatch(/^E2E/);

              const assetsOnDisk = await countFilesRecursive(assetsPath);
              const assetsInMeta = meta.assets.length;
              const todoCount = (code.match(/TODO:/g) || []).length;
              const todoImageSourceCount = (code.match(/TODO:\s*Add image source/g) || []).length;
              const emptyUriCount = (code.match(/uri:\s*''/g) || []).length;
              const placeholderCount = (code.match(/via\.placeholder\.com/g) || []).length;
              const isP0StrictCase = testCase.id === 'screen-main' || testCase.id === 'screen-1669-21091';

              const requirePaths = collectRequirePaths(code);
              const assetRequires = requirePaths.filter((requirePath) =>
                requirePath.startsWith('./assets/')
              );
              const nonRelativeAssetRequires = requirePaths.filter(
                (requirePath) =>
                  (requirePath.includes('/icons/') || requirePath.includes('/images/')) &&
                  !requirePath.startsWith('./assets/')
              );
              const unresolvedAssetRequires = assetRequires.filter((requirePath) => {
                const relativeAssetPath = requirePath.replace(/^\.\//, '');
                const absoluteAssetPath = join(componentFolder, relativeAssetPath);
                return !existsSync(absoluteAssetPath);
              });

              expect(assetsOnDisk).toBe(assetsInMeta);
              expect(assetsOnDisk).toBeGreaterThanOrEqual(testCase.minAssets);
              if (isP0StrictCase) {
                expect(todoImageSourceCount).toBe(0);
                expect(emptyUriCount).toBe(0);
                expect(placeholderCount).toBe(0);
              } else {
                expect(todoCount).toBeLessThanOrEqual(testCase.maxTodos);
                expect(placeholderCount).toBeLessThanOrEqual(testCase.maxPlaceholders);
              }
              expect(nonRelativeAssetRequires).toEqual([]);
              expect(unresolvedAssetRequires).toEqual([]);

              const compileResult = compileTypeScript(code, `${resolvedEntry.name}.tsx`, {
                mode: isP0StrictCase ? 'strict' : 'permissive',
              });
              const ignorableDiagnosticCodes = new Set([2322, 2591, 2614]);
              const relevantCompileErrors = compileResult.errors.filter(
                (error) => !error.code || !ignorableDiagnosticCodes.has(error.code)
              );

              if (relevantCompileErrors.length > 0) {
                const firstErrors = relevantCompileErrors.slice(0, 5);
                throw new Error(
                  `Compilation failed: ${JSON.stringify(firstErrors)}`
                );
              }

              reports.push({
                id: testCase.id,
                category: testCase.category,
                requestedName: testCase.componentName || null,
                resolvedName: resolvedEntry.name,
                resolvedFolder: resolvedEntry.folder,
                status: 'passed',
                linesOfCode: code.split('\n').length,
                assetsInMeta,
                assetsOnDisk,
                assetRequires: assetRequires.length,
                unresolvedAssetRequires: unresolvedAssetRequires.length,
                todoCount,
                todoImageSourceCount,
                emptyUriCount,
                placeholderCount,
                compileSuccess: relevantCompileErrors.length === 0,
              });
            } catch (error) {
              reports.push({
                id: testCase.id,
                category: testCase.category,
                requestedName: testCase.componentName || null,
                resolvedName: '',
                resolvedFolder: '',
                status: 'failed',
                error: error instanceof Error ? error.message : String(error),
                linesOfCode: 0,
                assetsInMeta: 0,
                assetsOnDisk: 0,
                assetRequires: 0,
                unresolvedAssetRequires: 0,
                todoCount: 0,
                todoImageSourceCount: 0,
                emptyUriCount: 0,
                placeholderCount: 0,
                compileSuccess: false,
              });
              failures.push(
                `[${testCase.id}] ${error instanceof Error ? error.message : String(error)}`
              );
            }
          }

          console.log('LIVE_E2E_QUALITY_REPORT');
          console.log(JSON.stringify(reports, null, 2));

          if (failures.length > 0) {
            throw new Error(`Live matrix failed:\n${failures.join('\n')}`);
          }

          expect(reports.length).toBe(LIVE_E2E_CASES.length);
        } finally {
          await restoreWorkspaceState(LIVE_PROJECT_ROOT, backupPath);
        }
      }
    );
  });
}
