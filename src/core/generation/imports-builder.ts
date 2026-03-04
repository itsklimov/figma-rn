/**
 * Imports Builder - Collect required imports from IR tree
 * Uses discovered project config for hook and theme imports
 */

import type { IRNode, StylesBundle } from '../types.js';
import type { ContractDiagnostic } from '../contracts/types.js';

/**
 * Configuration for import generation
 */
export interface ImportConfig {
  /** Import prefix from tsconfig (e.g., '@app') */
  importPrefix: string;
  /** Path to useTheme hook if discovered */
  useThemeHookPath?: string;
  /** Path to theme/styles directory */
  themeImportPath?: string;
  /** Style pattern: useTheme uses hooks, StyleSheet uses direct imports, unistyles uses react-native-unistyles */
  stylePattern: 'useTheme' | 'StyleSheet' | 'unistyles';
  /** Has project theme tokens */
  hasProjectTheme: boolean;
  /** Scaling function name */
  scaleFunction?: string;
  /** Scaling function path */
  scaleFunctionPath?: string;
  /** Whether to include theme import in generated file */
  includeThemeImport?: boolean;
  /** Explicit SvgIcon provider path (contract-driven, optional) */
  svgIconImportPath?: string;
  /** Optional diagnostics collector */
  diagnostics?: ContractDiagnostic[];
}

/**
 * Collect RN components needed based on IR tree
 */
function collectComponents(
  node: IRNode,
  set: Set<string>,
  visited: Set<string> = new Set()
): void {
  if (visited.has(node.id)) return;
  visited.add(node.id);

  try {
  switch (node.semanticType) {
    case 'Container':
    case 'Card':
      set.add('View');
      for (const child of node.children) {
        collectComponents(child, set, visited);
      }
      break;
    case 'Text':
      set.add('Text');
      break;
    case 'Image':
      set.add('Image');
      break;
    case 'Icon':
      set.add('Image');
      set.add('TouchableOpacity');
      break;
    case 'Button':
      set.add('TouchableOpacity');
      set.add('Text');
      break;
  }
  } finally {
    visited.delete(node.id);
  }
}

/**
 * Check gradient usage (linear/radial) in a tree.
 */
function collectGradientUsage(
  node: IRNode,
  stylesBundle?: StylesBundle,
  visited: Set<string> = new Set()
): { hasLinear: boolean; hasRadial: boolean } {
  if (visited.has(node.id)) {
    return { hasLinear: false, hasRadial: false };
  }
  visited.add(node.id);

  let hasLinear = false;
  let hasRadial = false;

  if (stylesBundle) {
    const style = stylesBundle.styles[node.styleRef];
    if (style?.backgroundGradient) {
      if (style.backgroundGradient.type === 'radial') hasRadial = true;
      if (style.backgroundGradient.type === 'linear') hasLinear = true;
    }
  }

  if ('children' in node && node.children) {
    for (const child of node.children) {
      const childUsage = collectGradientUsage(child, stylesBundle, visited);
      if (childUsage.hasLinear) hasLinear = true;
      if (childUsage.hasRadial) hasRadial = true;
    }
  }

  visited.delete(node.id);
  return { hasLinear, hasRadial };
}

/**
 * Generate theme/hook import based on config
 */
function generateThemeImport(config: ImportConfig): string | null {
  if (config.includeThemeImport === false) return null;
  if (!config.hasProjectTheme) return null;
  
  const imports: string[] = [];

  // 1. Hook import
  if (config.stylePattern === 'useTheme' && config.useThemeHookPath) {
    const cleanPath = config.useThemeHookPath
      .replace(/^(.*\/)?(src|app)\//, '')  // Remove everything up to and including /src/ or /app/, or just src/ if at start
      .replace(/\.(ts|tsx|js|jsx)$/, '');
    imports.push(`import { useTheme } from '${config.importPrefix}/${cleanPath}';`);
  }
  
  // 2. Static theme import (for module-level StyleSheet.create)
  if (config.themeImportPath) {
    imports.push(`import { theme } from '${config.themeImportPath}';`);
  } else {
    imports.push(`import { theme } from '${config.importPrefix}/styles';`);
  }

  // 3. Scaling function import
  if (config.scaleFunction && config.scaleFunctionPath) {
    const providedPath = config.scaleFunctionPath.replace(/\.(ts|tsx|js|jsx)$/, '');
    const isAliased = providedPath.startsWith(`${config.importPrefix}/`) || providedPath.startsWith('@');
    const cleanPath = isAliased
      ? providedPath
      : `${config.importPrefix}/${providedPath.replace(/^(.*\/)?(src|app)\//, '')}`;
    imports.push(`import { ${config.scaleFunction} } from '${cleanPath}';`);
  }
  
  return imports.join('\n');
}

/**
 * Build import statements from IR tree
 */
export function buildImports(
  root: IRNode,
  extraImports: string[] = [],
  stylesBundle?: StylesBundle,
  config?: ImportConfig
): string {
  const rnComponents = new Set<string>(['StyleSheet']);
  let needsSvgIcon = false;

  collectComponents(root, rnComponents);

  // Add extra imports (like ImageSourcePropType)
  extraImports.forEach((i) => {
    if (i === 'SvgIcon') {
      needsSvgIcon = true;
      return;
    }
    rnComponents.add(i);
  });

  // For Unistyles, StyleSheet comes from react-native-unistyles
  const isUnistyles = config?.stylePattern === 'unistyles';
  if (isUnistyles) {
    rnComponents.delete('StyleSheet');
  }

  const sorted = Array.from(rnComponents).sort();

  const lines = [
    `import React from 'react';`,
  ];

  // React Native imports (without StyleSheet for Unistyles)
  if (sorted.length > 0) {
    lines.push(`import { ${sorted.join(', ')} } from 'react-native';`);
  }

  // Unistyles: import StyleSheet from react-native-unistyles
  if (isUnistyles) {
    lines.push(`import { StyleSheet } from 'react-native-unistyles';`);
  }

  // Add gradient imports only when they are actually used.
  const gradientUsage = collectGradientUsage(root, stylesBundle);
  if (gradientUsage.hasLinear) {
    lines.push(`import { LinearGradient } from 'expo-linear-gradient';`);
  }
  if (gradientUsage.hasRadial) {
    lines.push(
      `import Svg, { Defs, Rect, RadialGradient as SvgRadialGradient, Stop } from 'react-native-svg';`
    );
  }

  // Add theme/hook import based on config
  // Skip for Unistyles - theme is injected via StyleSheet.create callback
  if (config && !isUnistyles) {
    const themeImport = generateThemeImport(config);
    if (themeImport) {
      lines.push(themeImport);
    }
  }

  if (needsSvgIcon) {
    if (config?.svgIconImportPath) {
      lines.push(`import { SvgIcon } from '${config.svgIconImportPath}';`);
    } else if (config?.diagnostics) {
      config.diagnostics.push({
        level: 'warning',
        code: 'SVG_ICON_IMPORT_SKIPPED',
        message: 'SvgIcon usage detected but no contract provider path was resolved.',
      });
    }
  }

  return lines.join('\n');
}
