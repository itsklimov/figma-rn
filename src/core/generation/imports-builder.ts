/**
 * Imports Builder - Collect required imports from IR tree
 * Uses discovered project config for hook and theme imports
 */

import type { IRNode, StylesBundle } from '../types.js';

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
  /** Whether the theme should be imported as default */
  themeImportIsDefault?: boolean;
  /** Export name to import for the theme module */
  themeImportName?: string;
  /** Style pattern: useTheme uses hooks, StyleSheet uses direct imports, unistyles uses react-native-unistyles */
  stylePattern: 'useTheme' | 'StyleSheet' | 'unistyles';
  /** Has project theme tokens */
  hasProjectTheme: boolean;
  /** Scaling function name */
  scaleFunction?: string;
  /** Scaling function import path */
  scaleFunctionImportPath?: string;
}

/**
 * Collect RN components needed based on IR tree
 */
function collectComponents(node: IRNode, set: Set<string>): void {
  const children = 'children' in node && Array.isArray(node.children) ? node.children : [];

  switch (node.semanticType) {
    case 'Container':
    case 'Card':
      set.add('View');
      break;
    case 'Text':
      set.add('Text');
      break;
    case 'Image':
      if (children.length > 0) {
        set.add('View');
      } else {
        set.add('Image');
      }
      break;
    case 'Icon':
      set.add('TouchableOpacity');
      if (!children.length) {
        set.add('Image');
      }
      break;
    case 'Button':
      set.add('TouchableOpacity');
      if (!children.length) {
        set.add('Text');
      }
      break;
    case 'Component':
      set.add('View');
      break;
    case 'Repeater':
      break;
  }

  for (const child of children) {
    collectComponents(child, set);
  }
}

/**
 * Check if any node in tree has a gradient background
 */
function hasGradients(node: IRNode, stylesBundle?: StylesBundle): boolean {
  if (stylesBundle) {
    const style = stylesBundle.styles[node.styleRef];
    if (style?.backgroundGradient) return true;
  }

  if ('children' in node && node.children) {
    return node.children.some(child => hasGradients(child, stylesBundle));
  }
  return false;
}

/**
 * Generate theme/hook import based on config
 */
function generateThemeImport(config: ImportConfig): string | null {
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
    if (config.themeImportIsDefault) {
      imports.push(`import theme from '${config.themeImportPath}';`);
    } else {
      imports.push(`import { ${config.themeImportName || 'theme'} } from '${config.themeImportPath}';`);
    }
  } else if (config.hasProjectTheme) {
    imports.push('// TODO: Wire a theme import for mapped theme tokens.');
  }

  // 3. Scaling function import
  if (config.scaleFunction && config.scaleFunctionImportPath) {
    imports.push(`import { ${config.scaleFunction} } from '${config.scaleFunctionImportPath}';`);
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

  collectComponents(root, rnComponents);

  // Add extra imports (like ImageSourcePropType)
  extraImports.forEach(i => rnComponents.add(i));

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

  // Add LinearGradient if needed
  if (hasGradients(root, stylesBundle)) {
    lines.push(`import { LinearGradient } from 'expo-linear-gradient';`);
  }

  // Add theme/hook import based on config
  // Skip for Unistyles - theme is injected via StyleSheet.create callback
  if (config && !isUnistyles) {
    const themeImport = generateThemeImport(config);
    if (themeImport) {
      lines.push(themeImport);
    }
  }

  // Add SvgIcon if needed (checking extraImports or manually here)
  if (rnComponents.has('SvgIcon')) {
    // SvgIcon is likely a custom component in the project
    // We remove it from RN imports and add it as a separate import
    rnComponents.delete('SvgIcon');
    const sortedRN = Array.from(rnComponents).sort();
    lines[1] = `import { ${sortedRN.join(', ')} } from 'react-native';`;
    const prefix = config?.importPrefix || '@app';
    lines.push(`import { SvgIcon } from '${prefix}/components';`);
  }

  return lines.join('\n');
}
