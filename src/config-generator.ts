/**
 * Project configuration generator
 * Analyzes the project and creates a configuration file
 */

import { writeFile, readFile, access } from 'fs/promises';
import { join, dirname, relative } from 'path';
import { glob } from 'glob';
import { ProjectConfig, ProjectConfigInput, DEFAULT_CONFIG } from './config-schema.js';
import { findThemeFiles } from './theme-parser.js';

/**
 */
export interface GeneratedConfig {
  /** Generated configuration */
  config: ProjectConfig;

  /** Created file path */
  filePath: string;

  /** Detected patterns */
  detectedPatterns: {
    stylePattern?: string;
    scaleFunction?: string;
    importPrefix?: string;
    themeType?: string;
  };
}

/**
 *
 * @param input - Generation input
 * @returns Generated configuration and file path
 */
export async function generateProjectConfig(
  input: ProjectConfigInput
): Promise<GeneratedConfig> {
  const detectedPatterns: GeneratedConfig['detectedPatterns'] = {};

  const framework = (input.framework as ProjectConfig['framework']) ||
    await detectFramework(input.projectRoot);

  const config: ProjectConfig = {
    framework,
    codeStyle: {
      stylePattern: 'StyleSheet',
    }
  };

  const stylePattern = (input.styleApproach as ProjectConfig['codeStyle']['stylePattern']) ||
    await detectStylePattern(input.projectRoot);
  config.codeStyle.stylePattern = stylePattern;
  detectedPatterns.stylePattern = stylePattern;

  const scaleFunction = await detectScaleFunction(input.projectRoot);
  if (scaleFunction) {
    config.codeStyle.scaleFunction = scaleFunction;
    detectedPatterns.scaleFunction = scaleFunction;
  }

  const importPrefix = await detectImportPrefix(input.projectRoot);
  if (importPrefix) {
    config.codeStyle.importPrefix = importPrefix;
    detectedPatterns.importPrefix = importPrefix;
  }

  if (input.themePath) {
    const themeType = await detectThemeType(join(input.projectRoot, input.themePath));
    config.theme = {
      location: input.themePath,
      type: themeType
    };
    detectedPatterns.themeType = themeType;
  } else {
    const foundThemes = await findThemeFiles(input.projectRoot);
    if (foundThemes.length > 0) {
      const absolutePath = foundThemes[0];
      const relativePath = relative(input.projectRoot, absolutePath);
      const themeType = await detectThemeType(absolutePath);

      config.theme = {
        location: relativePath,
        type: themeType
      };
      detectedPatterns.themeType = themeType;
    }
  }

  if (input.componentsPath) {
    config.components = {
      location: input.componentsPath,
      pattern: '**/*.tsx'
    };
  }

  const filePath = join(input.projectRoot, '.figmarc.json');
  await writeFile(filePath, JSON.stringify(config, null, 2), 'utf-8');

  return { config, filePath, detectedPatterns };
}

/**
 *
 * @param projectRoot - Project root directory
 * @returns Detected framework
 */
async function detectFramework(
  projectRoot: string
): Promise<ProjectConfig['framework']> {
  try {
    const packageJsonPath = join(projectRoot, 'package.json');
    const packageJson = JSON.parse(
      await readFile(packageJsonPath, 'utf-8')
    );

    const deps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    };

    if (deps['ignite-cli'] || deps['@thecodingmachine/ignite-cli']) {
      return 'ignite';
    }
    if (deps['expo']) {
      return 'expo';
    }

    return 'react-native';
  } catch {
    return 'react-native';
  }
}

/**
 *
 * @param projectRoot - Project root directory
 * @returns Detected style pattern
 */
async function detectStylePattern(
  projectRoot: string
): Promise<ProjectConfig['codeStyle']['stylePattern']> {
  try {
    const files = await glob('**/*.{ts,tsx,js,jsx}', {
      cwd: projectRoot,
      ignore: ['node_modules/**', 'dist/**', 'build/**'],
      absolute: true,
      nodir: true
    });

    const patterns = {
      useTheme: 0,
      StyleSheet: 0,
      'styled-components': 0,
      nativewind: 0
    };

    const filesToCheck = files.slice(0, 50);

    for (const file of filesToCheck) {
      try {
        const content = await readFile(file, 'utf-8');

        if (content.includes('useTheme')) patterns.useTheme++;
        if (content.includes('StyleSheet.create')) patterns.StyleSheet++;
        if (content.includes('styled-components') || content.includes('styled.')) {
          patterns['styled-components']++;
        }
        if (content.includes('className=') && content.includes('tw`')) {
          patterns.nativewind++;
        }
      } catch {
        continue;
      }
    }

    const maxPattern = Object.entries(patterns).reduce((max, [key, val]) =>
      val > max[1] ? [key, val] : max
    , ['StyleSheet', 0])[0] as ProjectConfig['codeStyle']['stylePattern'];

    return maxPattern;
  } catch {
    return 'StyleSheet';
  }
}

/**
 *
 * @param projectRoot - Project root directory
 * @returns Detected scale function or undefined
 */
async function detectScaleFunction(
  projectRoot: string
): Promise<string | undefined> {
  try {
    const files = await glob('**/*.{ts,tsx,js,jsx}', {
      cwd: projectRoot,
      ignore: ['node_modules/**', 'dist/**', 'build/**'],
      absolute: true,
      nodir: true
    });

    const scaleFunctions = ['scale', 'RFValue', 'moderateScale', 'verticalScale', 'horizontalScale'];

    for (const file of files.slice(0, 30)) {
      try {
        const content = await readFile(file, 'utf-8');

        for (const func of scaleFunctions) {
          if (
            content.includes(`import { ${func}`) ||
            content.includes(`import ${func}`) ||
            content.includes(`export const ${func}`) ||
            content.includes(`export function ${func}`)
          ) {
            return func;
          }
        }
      } catch {
        continue;
      }
    }

    return undefined;
  } catch {
    return undefined;
  }
}

/**
 *
 * @param projectRoot - Project root directory
 * @returns Detected import prefix or undefined
 */
async function detectImportPrefix(
  projectRoot: string
): Promise<string | undefined> {
  try {
    const tsconfigPath = join(projectRoot, 'tsconfig.json');
    try {
      await access(tsconfigPath);
      const tsconfig = JSON.parse(
        await readFile(tsconfigPath, 'utf-8')
      );

      const paths = tsconfig?.compilerOptions?.paths;
      if (paths) {
        const commonPrefixes = ['@app/*', '@components/*', '@/*', '~/*'];
        for (const prefix of commonPrefixes) {
          if (paths[prefix]) {
            return prefix.replace('/*', '');
          }
        }

        const firstPath = Object.keys(paths)[0];
        if (firstPath && firstPath.includes('*')) {
          return firstPath.replace('/*', '');
        }
      }
    } catch {
    }

    const babelConfigPath = join(projectRoot, 'babel.config.js');
    try {
      await access(babelConfigPath);
      const babelConfig = await readFile(babelConfigPath, 'utf-8');

      if (babelConfig.includes('module-resolver')) {
        const aliasMatch = babelConfig.match(/['"]@app['"]/);
        if (aliasMatch) return '@app';

        const componentMatch = babelConfig.match(/['"]@components['"]/);
        if (componentMatch) return '@components';

        const atMatch = babelConfig.match(/['"]@['"]/);
        if (atMatch) return '@';

        const tildeMatch = babelConfig.match(/['"]~['"]/);
        if (tildeMatch) return '~';
      }
    } catch {
    }

    return undefined;
  } catch {
    return undefined;
  }
}

/**
 *
 * @param themePath - Absolute path to theme file
 * @returns Detected theme type
 */
async function detectThemeType(
  themePath: string
): Promise<ProjectConfig['theme']['type']> {
  try {
    const content = await readFile(themePath, 'utf-8');

    if (
      content.includes('styled-components') ||
      content.includes('ThemeProvider')
    ) {
      return 'styled-components';
    }

    if (
      content.includes('nativewind') ||
      content.includes('tailwind')
    ) {
      return 'nativewind';
    }

    if (
      content.includes('tamagui') ||
      content.includes('createTamagui')
    ) {
      return 'tamagui';
    }

    return 'object-export';
  } catch {
    return 'object-export';
  }
}

/**
 *
 * @param projectRoot - Project root directory
 */
export async function configExists(projectRoot: string): Promise<boolean> {
  const possiblePaths = [
    '.figmarc.json',
    '.figmarc.js',
    'figma.config.js',
    '.config/figma.json'
  ];

  for (const path of possiblePaths) {
    try {
      await access(join(projectRoot, path));
      return true;
    } catch {
      continue;
    }
  }

  return false;
}
