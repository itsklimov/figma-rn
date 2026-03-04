import { readFile } from 'fs/promises';
import { join } from 'path';
import { glob } from 'glob';
import type {
  ContractDiagnostic,
  ProfileMode,
  RequestedSvgMode,
  ResolvedProjectProfile,
  ResolvedSvgMode,
} from './types.js';

interface ResolverConfig {
  importPrefix?: string;
  stylePattern?: string;
  themeImportPath?: string;
  scaleFunctionName?: string;
  scaleFunctionPath?: string;
}

export interface ResolveProjectProfileOptions {
  strictContracts?: boolean;
  profileMode?: ProfileMode;
  svgMode?: RequestedSvgMode;
  config?: ResolverConfig;
}

interface SourceSignals {
  hasUseTheme: boolean;
  usesSafeAreaImport: boolean;
  usesSvgFileImports: boolean;
  svgIconProviderPath?: string;
}

interface PackageSignals {
  dependencies: Record<string, string>;
  hasSafeAreaDep: boolean;
  hasSvgDep: boolean;
  hasSvgTransformerDep: boolean;
}

async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

function normalizeStylePattern(value?: string): 'useTheme' | 'StyleSheet' | 'unistyles' {
  if (value === 'useTheme' || value === 'StyleSheet' || value === 'unistyles') {
    return value;
  }
  return 'StyleSheet';
}

function toAliasedImportPath(projectRoot: string, absolutePath: string, importPrefix: string): string {
  const rel = absolutePath
    .replace(projectRoot, '')
    .replace(/^\/+/, '')
    .replace(/^(src|app)\//, '')
    .replace(/\/index\.(ts|tsx|js|jsx)$/, '')
    .replace(/\.(ts|tsx|js|jsx)$/, '');

  return `${importPrefix}/${rel}`;
}

async function resolveImportPrefix(projectRoot: string, fallback: string): Promise<string> {
  const tsconfig = await readJsonIfExists<any>(join(projectRoot, 'tsconfig.json'));
  const paths = tsconfig?.compilerOptions?.paths;
  if (!paths || typeof paths !== 'object') return fallback;

  const preferred = ['@app/*', '@/*', '~/*', '@src/*'];
  for (const key of preferred) {
    if (paths[key]) {
      return key.replace(/\/\*$/, '');
    }
  }

  const firstPathKey = Object.keys(paths).find((k) => k.endsWith('/*'));
  if (firstPathKey) return firstPathKey.replace(/\/\*$/, '');
  return fallback;
}

async function scanPackageSignals(projectRoot: string): Promise<PackageSignals> {
  const pkg = await readJsonIfExists<any>(join(projectRoot, 'package.json'));
  const dependencies = {
    ...(pkg?.dependencies || {}),
    ...(pkg?.devDependencies || {}),
  } as Record<string, string>;

  return {
    dependencies,
    hasSafeAreaDep: !!dependencies['react-native-safe-area-context'],
    hasSvgDep: !!dependencies['react-native-svg'],
    hasSvgTransformerDep: !!dependencies['react-native-svg-transformer'],
  };
}

async function scanConfigFilesForSvg(projectRoot: string): Promise<boolean> {
  const configFiles = [
    'metro.config.js',
    'metro.config.cjs',
    'metro.config.mjs',
    'metro.config.ts',
    'babel.config.js',
    'babel.config.cjs',
    'babel.config.mjs',
    'babel.config.ts',
  ];

  for (const configFile of configFiles) {
    try {
      const content = await readFile(join(projectRoot, configFile), 'utf-8');
      if (
        content.includes('react-native-svg-transformer') ||
        content.includes('.svg') ||
        content.includes('svgTransformer')
      ) {
        return true;
      }
    } catch {
      // ignore missing file
    }
  }

  return false;
}

async function scanSourceSignals(projectRoot: string, importPrefix: string): Promise<SourceSignals> {
  const files = await glob('**/*.{ts,tsx,js,jsx}', {
    cwd: projectRoot,
    absolute: true,
    nodir: true,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.figma/**', '**/tests/**', '**/test/**'],
  });

  let hasUseTheme = false;
  let usesSafeAreaImport = false;
  let usesSvgFileImports = false;
  let svgIconProviderPath: string | undefined;

  for (const file of files) {
    let content: string;
    try {
      content = await readFile(file, 'utf-8');
    } catch {
      continue;
    }

    if (!hasUseTheme && /useTheme\s*\(/.test(content)) {
      hasUseTheme = true;
    }

    if (!usesSafeAreaImport && /from\s+['"]react-native-safe-area-context['"]/.test(content)) {
      usesSafeAreaImport = true;
    }

    if (
      !usesSvgFileImports &&
      (/from\s+['"][^'"]+\.svg['"]/.test(content) || /require\(\s*['"][^'"]+\.svg['"]\s*\)/.test(content))
    ) {
      usesSvgFileImports = true;
    }

    if (!svgIconProviderPath) {
      const exportsSvgIcon =
        /export\s+(const|function|class)\s+SvgIcon\b/.test(content) ||
        /export\s*\{[^}]*\bSvgIcon\b[^}]*\}/.test(content);

      if (exportsSvgIcon) {
        svgIconProviderPath = toAliasedImportPath(projectRoot, file, importPrefix);
      }
    }
  }

  return {
    hasUseTheme,
    usesSafeAreaImport,
    usesSvgFileImports,
    svgIconProviderPath,
  };
}

function resolveSvgMode(
  requestedMode: RequestedSvgMode,
  sourceSignals: SourceSignals,
  packageSignals: PackageSignals,
  hasSvgConfigHints: boolean,
  diagnostics: ContractDiagnostic[]
): ResolvedSvgMode {
  if (requestedMode === 'component') {
    if (!sourceSignals.svgIconProviderPath) {
      diagnostics.push({
        level: 'warning',
        code: 'SVG_COMPONENT_PROVIDER_MISSING',
        message: 'Requested svgMode=component but no SvgIcon provider export was discovered.',
      });
    }
    return 'component';
  }

  if (requestedMode === 'runtime') {
    if (!packageSignals.hasSvgDep) {
      diagnostics.push({
        level: 'warning',
        code: 'SVG_RUNTIME_DEP_MISSING',
        message: 'Requested svgMode=runtime but react-native-svg dependency was not detected.',
      });
    }
    return 'runtime';
  }

  if (requestedMode === 'raster') {
    return 'raster';
  }

  if (sourceSignals.svgIconProviderPath) {
    return 'component';
  }

  if (packageSignals.hasSvgDep && (packageSignals.hasSvgTransformerDep || hasSvgConfigHints || sourceSignals.usesSvgFileImports)) {
    diagnostics.push({
      level: 'info',
      code: 'SVG_AUTO_RUNTIME_DOWNGRADED',
      message: 'SVG dependencies detected without explicit provider. Falling back to raster mode for stable output.',
    });
  }

  return 'raster';
}

export async function resolveProjectProfile(
  projectRoot: string,
  options: ResolveProjectProfileOptions = {}
): Promise<ResolvedProjectProfile> {
  const diagnostics: ContractDiagnostic[] = [];
  const requestedMode = options.svgMode || 'auto';
  const strictContracts = options.strictContracts ?? true;
  const profileMode = options.profileMode || 'auto';

  const packageSignals = await scanPackageSignals(projectRoot);
  const fallbackPrefix = options.config?.importPrefix || '@app';
  const importPrefix = await resolveImportPrefix(projectRoot, fallbackPrefix);
  const sourceSignals = await scanSourceSignals(projectRoot, importPrefix);
  const hasSvgConfigHints = await scanConfigFilesForSvg(projectRoot);

  let stylePattern = normalizeStylePattern(options.config?.stylePattern);
  if (stylePattern === 'StyleSheet') {
    if (packageSignals.dependencies['react-native-unistyles']) {
      stylePattern = 'unistyles';
    } else if (sourceSignals.hasUseTheme) {
      stylePattern = 'useTheme';
    }
  }

  const svgMode = resolveSvgMode(
    requestedMode,
    sourceSignals,
    packageSignals,
    hasSvgConfigHints,
    diagnostics
  );

  const safeAreaAvailable = packageSignals.hasSafeAreaDep || sourceSignals.usesSafeAreaImport;
  if (!safeAreaAvailable && strictContracts) {
    diagnostics.push({
      level: 'warning',
      code: 'SAFE_AREA_DEP_MISSING',
      message: 'react-native-safe-area-context was not detected. SafeAreaView imports will be rejected by contract validator.',
    });
  }

  if (!sourceSignals.svgIconProviderPath && svgMode === 'component') {
    diagnostics.push({
      level: 'error',
      code: 'SVG_ICON_PROVIDER_UNRESOLVED',
      message: 'Component SVG mode requires a project SvgIcon provider export, but none was found.',
    });
  }

  const scalePath = options.config?.scaleFunctionPath
    ? options.config.scaleFunctionPath
        .replace(/^(src|app)\//, '')
        .replace(/\.(ts|tsx|js|jsx)$/, '')
    : undefined;

  const profile: ResolvedProjectProfile = {
    importPrefix,
    stylePattern,
    themeImportPath: options.config?.themeImportPath,
    scaleImport:
      options.config?.scaleFunctionName && scalePath
        ? { name: options.config.scaleFunctionName, path: `${importPrefix}/${scalePath}` }
        : undefined,
    safeAreaSupport: {
      available: safeAreaAvailable,
      importPath: 'react-native-safe-area-context',
    },
    svgSupport: {
      mode: svgMode,
      componentImportPattern: sourceSignals.svgIconProviderPath
        ? `import { SvgIcon } from '${sourceSignals.svgIconProviderPath}'`
        : undefined,
      svgIconProviderPath: sourceSignals.svgIconProviderPath,
      runtimeDeps: packageSignals.hasSvgDep ? ['react-native-svg'] : [],
    },
    assetImportPolicy: {
      relativeOnly: profileMode !== 'portable' || strictContracts,
      allowAliasAssets: false,
    },
    strictValidation: {
      strictContracts,
      forbidEmptyImageSources: true,
      forbidPlaceholderUris: true,
      forbidUnresolvedAliasRequires: true,
    },
    diagnostics,
  };

  return profile;
}
