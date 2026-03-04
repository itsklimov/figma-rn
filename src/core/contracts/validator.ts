import type { ContractDiagnostic, ResolvedProjectProfile } from './types.js';

export interface ContractValidationResult {
  diagnostics: ContractDiagnostic[];
  hasBlockingErrors: boolean;
}

const IMPORT_REGEX = /^import\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"];?/gm;
const REQUIRE_REGEX = /require\(\s*['"]([^'"]+)['"]\s*\)/g;

function pushDiagnostic(
  diagnostics: ContractDiagnostic[],
  level: ContractDiagnostic['level'],
  code: string,
  message: string
): void {
  diagnostics.push({ level, code, message });
}

function validateImports(code: string, profile: ResolvedProjectProfile, diagnostics: ContractDiagnostic[]): void {
  const imports = Array.from(code.matchAll(IMPORT_REGEX), (m) => m[1]);

  for (const importPath of imports) {
    if (
      importPath === profile.safeAreaSupport.importPath &&
      !profile.safeAreaSupport.available
    ) {
      pushDiagnostic(
        diagnostics,
        'error',
        'SAFE_AREA_IMPORT_UNAVAILABLE',
        `Import "${importPath}" is not allowed by resolved project profile.`
      );
    }

    if (
      importPath === 'react-native-svg' &&
      profile.svgSupport.mode === 'raster'
    ) {
      pushDiagnostic(
        diagnostics,
        'error',
        'SVG_RUNTIME_IMPORT_FORBIDDEN',
        'react-native-svg import was generated while profile enforces raster SVG mode.'
      );
    }

    if (/\/components/.test(importPath) && /SvgIcon/.test(code)) {
      const allowedPath = profile.svgSupport.svgIconProviderPath;
      if (!allowedPath || importPath !== allowedPath) {
        pushDiagnostic(
          diagnostics,
          'error',
          'SVG_ICON_IMPORT_UNSUPPORTED',
          `SvgIcon import "${importPath}" does not match resolved profile provider.`
        );
      }
    }
  }
}

function validateRequires(code: string, profile: ResolvedProjectProfile, diagnostics: ContractDiagnostic[]): void {
  const requirePaths = Array.from(code.matchAll(REQUIRE_REGEX), (m) => m[1]);
  for (const requirePath of requirePaths) {
    const isRelative = requirePath.startsWith('./') || requirePath.startsWith('../');
    const looksLikeAsset = /\/(icons|images)\//.test(requirePath);

    if (
      profile.strictValidation.forbidUnresolvedAliasRequires &&
      profile.assetImportPolicy.relativeOnly &&
      !isRelative &&
      looksLikeAsset
    ) {
      pushDiagnostic(
        diagnostics,
        'error',
        'ALIAS_ASSET_REQUIRE',
        `Alias/non-relative asset require is forbidden: "${requirePath}".`
      );
    }
  }
}

export function validateGeneratedCodeContracts(
  code: string,
  profile: ResolvedProjectProfile
): ContractValidationResult {
  const diagnostics: ContractDiagnostic[] = [];

  if (profile.strictValidation.forbidEmptyImageSources && /uri:\s*''/.test(code)) {
    pushDiagnostic(
      diagnostics,
      'error',
      'EMPTY_IMAGE_SOURCE',
      'Generated code contains empty image URI sources.'
    );
  }

  if (profile.strictValidation.forbidPlaceholderUris && /via\.placeholder\.com/.test(code)) {
    pushDiagnostic(
      diagnostics,
      'error',
      'PLACEHOLDER_URI',
      'Generated code contains network placeholder URIs.'
    );
  }

  if (/TODO:\s*Add image source/.test(code)) {
    pushDiagnostic(
      diagnostics,
      'error',
      'TODO_IMAGE_SOURCE',
      'Generated code still contains TODO image source placeholders.'
    );
  }

  validateImports(code, profile, diagnostics);
  validateRequires(code, profile, diagnostics);

  return {
    diagnostics,
    hasBlockingErrors: diagnostics.some((d) => d.level === 'error'),
  };
}
