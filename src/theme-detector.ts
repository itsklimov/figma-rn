import { SourceFile, SyntaxKind } from 'ts-morph';
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

/**
 * Project theme structure
 */
export interface ThemeStructure {
  type: 'object-export' | 'styled-components' | 'nativewind' | 'unknown';
  paths: {
    colors?: string;      // Path to colors object
    fonts?: string;       // Path to fonts/typography object
    spacing?: string;     // Path to spacing object
  };
  scaleFunction?: string; // Scale function name (scale, RFValue, etc.)
}

/**
 * Detects theme structure from source file
 *
 * @param sourceFile - Theme file to analyze
 * @returns Theme structure
 */
export function detectThemeStructure(sourceFile: SourceFile): ThemeStructure {
  const text = sourceFile.getText();
  const structure: ThemeStructure = {
    type: 'object-export',
    paths: {},
  };

  // Determine theme type by imports and keywords
  if (text.includes('styled-components') || text.includes('styled(')) {
    structure.type = 'styled-components';
  } else if (text.includes('nativewind') || text.includes('tailwind')) {
    structure.type = 'nativewind';
  } else if (text.includes('export default') || text.includes('export const')) {
    structure.type = 'object-export';
  } else {
    structure.type = 'unknown';
  }

  // Find paths to colors, fonts, spacing objects
  structure.paths = detectObjectPaths(sourceFile);

  return structure;
}

/**
 * Detects paths to various theme objects
 */
function detectObjectPaths(sourceFile: SourceFile): ThemeStructure['paths'] {
  const paths: ThemeStructure['paths'] = {};

  // Get all object literals
  const objects = sourceFile.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression);

  for (const obj of objects) {
    const parent = obj.getParent();

    // Get variable or property name
    let name = '';
    if (parent && parent.getKind() === SyntaxKind.PropertyAssignment) {
      name = (parent as any).getName();
    } else if (parent && parent.getKind() === SyntaxKind.VariableDeclaration) {
      name = (parent as any).getName();
    }

    const nameLower = name.toLowerCase();

    // Check for colors/palette
    if (nameLower.includes('color') || nameLower.includes('palette')) {
      paths.colors = name;
    }

    // Check for fonts/typography
    if (nameLower.includes('font') || nameLower.includes('typography')) {
      paths.fonts = name;
    }

    // Check for spacing
    if (nameLower.includes('spacing') || nameLower.includes('space')) {
      paths.spacing = name;
    }
  }

  return paths;
}

/**
 * Detects scale function in the project
 *
 * Looks for common scaling functions:
 * - scale() - react-native-size-matters
 * - RFValue() - react-native-responsive-fontsize
 * - moderateScale() - react-native-size-matters
 * - wp(), hp() - react-native-responsive-screen
 * - scaleFont() - custom
 *
 * @param projectRoot - Project root directory
 * @returns Function name or undefined
 */
export async function detectScaleFunction(projectRoot: string): Promise<string | undefined> {
  try {
    // Look for files with possible imports
    const patterns = [
      path.join(projectRoot, 'src', '**', '*.{ts,tsx,js,jsx}'),
      path.join(projectRoot, '**', '*.{ts,tsx,js,jsx}'),
    ];

    const scaleFunctions = [
      'scale',
      'RFValue',
      'moderateScale',
      'verticalScale',
      'horizontalScale',
      'wp',
      'hp',
      'scaleFont',
      'scaleSize',
    ];

    const functionCounts = new Map<string, number>();

    for (const pattern of patterns) {
      const files = await glob(pattern, {
        ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
        absolute: true,
      });

      // Limit search to first 50 files for performance
      const filesToCheck = files.slice(0, 50);

      for (const file of filesToCheck) {
        try {
          const content = fs.readFileSync(file, 'utf-8');

          // Look for scaling function usage
          for (const func of scaleFunctions) {
            const regex = new RegExp(`\\b${func}\\s*\\(`, 'g');
            const matches = content.match(regex);
            if (matches) {
              const count = functionCounts.get(func) || 0;
              functionCounts.set(func, count + matches.length);
            }
          }
        } catch (error) {
          // Skip files with read errors
          continue;
        }
      }
    }

    // Return most frequently used function
    if (functionCounts.size > 0) {
      const sorted = Array.from(functionCounts.entries()).sort((a, b) => b[1] - a[1]);
      return sorted[0][0];
    }

    return undefined;
  } catch (error) {
    console.error('Error detecting scale function:', error);
    return undefined;
  }
}

/**
 * Detects style pattern in the project
 *
 * @param projectRoot - Project root directory
 * @returns Detected pattern
 */
export async function detectStylePattern(projectRoot: string): Promise<string> {
  try {
    const patterns = [
      path.join(projectRoot, 'src', '**', '*.{ts,tsx,js,jsx}'),
      path.join(projectRoot, '**', '*.{ts,tsx,js,jsx}'),
    ];

    const patternCounts = {
      useTheme: 0,
      StyleSheet: 0,
      'styled-components': 0,
      nativewind: 0,
    };

    for (const pattern of patterns) {
      const files = await glob(pattern, {
        ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
        absolute: true,
      });

      // Limit search to first 30 files
      const filesToCheck = files.slice(0, 30);

      for (const file of filesToCheck) {
        try {
          const content = fs.readFileSync(file, 'utf-8');

          // Look for useTheme hook
          if (/\buseTheme\s*\(/.test(content)) {
            patternCounts.useTheme++;
          }

          // Look for StyleSheet.create
          if (/StyleSheet\.create/.test(content)) {
            patternCounts.StyleSheet++;
          }

          // Look for styled-components
          if (/styled\(/.test(content) || /import.*styled.*from.*styled-components/.test(content)) {
            patternCounts['styled-components']++;
          }

          // Look for className (nativewind/tailwind)
          if (/className=/.test(content)) {
            patternCounts.nativewind++;
          }
        } catch (error) {
          continue;
        }
      }
    }

    // Determine most popular pattern
    const entries = Object.entries(patternCounts).sort((a, b) => b[1] - a[1]);

    // If there's a clear leader (>= 3 uses), return it
    if (entries[0][1] >= 3) {
      return entries[0][0];
    }

    // Default to StyleSheet (React Native standard)
    return 'StyleSheet';
  } catch (error) {
    console.error('Error detecting style pattern:', error);
    return 'StyleSheet';
  }
}

/**
 * Searches for theme file in the project
 *
 * @param projectRoot - Project root directory
 * @returns Path to theme file or undefined
 */
export async function findThemeFile(projectRoot: string): Promise<string | undefined> {
  const possibleNames = [
    'theme.ts',
    'theme.tsx',
    'theme.js',
    'theme.jsx',
    'colors.ts',
    'colors.tsx',
    'tokens.ts',
    'design-tokens.ts',
    'theme/index.ts',
    'theme/index.tsx',
    'styles/theme.ts',
  ];

  const possibleDirs = [
    path.join(projectRoot, 'src'),
    path.join(projectRoot, 'app'),
    path.join(projectRoot),
  ];

  // First check standard locations
  for (const dir of possibleDirs) {
    for (const name of possibleNames) {
      const fullPath = path.join(dir, name);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
  }

  // If not found, search using glob
  try {
    const files = await glob('**/theme*.{ts,tsx,js,jsx}', {
      cwd: projectRoot,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
      absolute: true,
    });

    if (files.length > 0) {
      // Return first found file
      return files[0];
    }
  } catch (error) {
    console.error('Error searching for theme file:', error);
  }

  return undefined;
}

/**
 * Detects used UI component library
 */
export async function detectUILibrary(projectRoot: string): Promise<string | undefined> {
  try {
    const packageJsonPath = path.join(projectRoot, 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
      return undefined;
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    // Check popular libraries
    const libraries = [
      'react-native-paper',
      'native-base',
      '@ui-kitten/components',
      'react-native-elements',
      '@shopify/restyle',
      'tamagui',
      'dripsy',
    ];

    for (const lib of libraries) {
      if (allDeps[lib]) {
        return lib;
      }
    }

    return undefined;
  } catch (error) {
    console.error('Error detecting UI library:', error);
    return undefined;
  }
}

/**
 * Complete project theme analysis
 */
export interface ThemeAnalysis {
  themeFile?: string;               // Path to theme file
  structure?: ThemeStructure;       // Theme structure
  scaleFunction?: string;           // Scale function
  stylePattern: string;             // Style pattern
  uiLibrary?: string;              // UI library
}

export async function analyzeProjectTheme(projectRoot: string): Promise<ThemeAnalysis> {
  const analysis: ThemeAnalysis = {
    stylePattern: 'StyleSheet', // default
  };

  // 1. Find theme file
  analysis.themeFile = await findThemeFile(projectRoot);

  // 2. Detect scale function
  analysis.scaleFunction = await detectScaleFunction(projectRoot);

  // 3. Detect style pattern
  analysis.stylePattern = await detectStylePattern(projectRoot);

  // 4. Detect UI library
  analysis.uiLibrary = await detectUILibrary(projectRoot);

  return analysis;
}

/**
 * Formats analysis results for output
 */
export function formatThemeAnalysis(analysis: ThemeAnalysis): string {
  const lines: string[] = [];

  lines.push('=== Theme Analysis ===');
  lines.push('');

  if (analysis.themeFile) {
    lines.push(`Theme file: ${analysis.themeFile}`);
  } else {
    lines.push('Theme file: Not found');
  }

  if (analysis.scaleFunction) {
    lines.push(`Scale function: ${analysis.scaleFunction}()`);
  }

  lines.push(`Style pattern: ${analysis.stylePattern}`);

  if (analysis.uiLibrary) {
    lines.push(`UI library: ${analysis.uiLibrary}`);
  }

  if (analysis.structure) {
    lines.push('');
    lines.push('Theme structure:');
    lines.push(`  Type: ${analysis.structure.type}`);
    if (analysis.structure.paths.colors) {
      lines.push(`  Colors path: ${analysis.structure.paths.colors}`);
    }
    if (analysis.structure.paths.fonts) {
      lines.push(`  Fonts path: ${analysis.structure.paths.fonts}`);
    }
    if (analysis.structure.paths.spacing) {
      lines.push(`  Spacing path: ${analysis.structure.paths.spacing}`);
    }
  }

  return lines.join('\n');
}
