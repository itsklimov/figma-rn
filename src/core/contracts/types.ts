export type ProfileMode = 'auto' | 'portable';

export type RequestedSvgMode = 'auto' | 'component' | 'runtime' | 'raster';

export type ResolvedSvgMode = 'component' | 'runtime' | 'raster';

export type DiagnosticLevel = 'info' | 'warning' | 'error';

export interface ContractDiagnostic {
  level: DiagnosticLevel;
  code: string;
  message: string;
  location?: string;
}

export interface ScaleImport {
  name: string;
  path: string;
}

export interface SafeAreaSupport {
  available: boolean;
  importPath: string;
}

export interface SvgSupport {
  mode: ResolvedSvgMode;
  componentImportPattern?: string;
  svgIconProviderPath?: string;
  runtimeDeps: string[];
}

export interface AssetImportPolicy {
  relativeOnly: boolean;
  allowAliasAssets: boolean;
}

export interface StrictValidationFlags {
  strictContracts: boolean;
  forbidEmptyImageSources: boolean;
  forbidPlaceholderUris: boolean;
  forbidUnresolvedAliasRequires: boolean;
}

export interface ResolvedProjectProfile {
  importPrefix: string;
  stylePattern: 'useTheme' | 'StyleSheet' | 'unistyles';
  themeImportPath?: string;
  scaleImport?: ScaleImport;
  safeAreaSupport: SafeAreaSupport;
  svgSupport: SvgSupport;
  assetImportPolicy: AssetImportPolicy;
  strictValidation: StrictValidationFlags;
  diagnostics: ContractDiagnostic[];
}

export interface ContractProfileSummary {
  importPrefix: string;
  stylePattern: 'useTheme' | 'StyleSheet' | 'unistyles';
  themeImportPath?: string;
  scaleImport?: ScaleImport;
  safeAreaAvailable: boolean;
  svgMode: ResolvedSvgMode;
  svgIconProviderPath?: string;
  relativeAssetImportsOnly: boolean;
  strictContracts: boolean;
}

export interface UnresolvedAssetRef {
  ref: string;
  nodeId: string;
  semanticType: string;
  location?: string;
}

export function toContractProfileSummary(
  profile: ResolvedProjectProfile
): ContractProfileSummary {
  return {
    importPrefix: profile.importPrefix,
    stylePattern: profile.stylePattern,
    themeImportPath: profile.themeImportPath,
    scaleImport: profile.scaleImport,
    safeAreaAvailable: profile.safeAreaSupport.available,
    svgMode: profile.svgSupport.mode,
    svgIconProviderPath: profile.svgSupport.svgIconProviderPath,
    relativeAssetImportsOnly: profile.assetImportPolicy.relativeOnly,
    strictContracts: profile.strictValidation.strictContracts,
  };
}
