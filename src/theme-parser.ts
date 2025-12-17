import { Project, SourceFile, SyntaxKind, Node, ObjectLiteralExpression, PropertyAssignment } from 'ts-morph';
import { existsSync } from 'fs';
import { resolve, join } from 'path';

/**
 * Color token from theme
 * Color token from theme
 */
export interface ColorToken {
  value: string;      // Hex color value (e.g., '#FF0000')
  path: string;       // Full path to token (e.g., 'theme.colors.primary')
  name: string;       // Short name (e.g., 'primary')
}

/**
 * Font token from theme
 * Font token from theme
 */
export interface FontToken {
  family: string;     // Font family name
  weight?: number;    // Font weight (100-900)
  path: string;       // Full path to token
  name: string;       // Short name
}

/**
 * Typography style token (complete)
 * Typography style token (complete)
 */
export interface TypographyStyleToken {
  path: string;       // Full path, e.g. "typography.body.regular"
  fontSize: number;   // Font size
  lineHeight?: number; // Line height
  fontWeight: number; // Font weight
  fontFamily?: string; // Font family
  letterSpacing?: number; // Letter spacing
}

/**
 * Spacing system information
 * Spacing system information
 */
export interface SpacingInfo {
  function?: string;  // Scaling function name (e.g., 'scale')
  values?: number[];  // Discovered spacing values
}

/**
 * All extracted theme tokens
 * All extracted theme tokens
 */
export interface ThemeTokens {
  colors: Map<string, ColorToken>;
  fonts: Map<string, FontToken>;
  typography?: Map<string, TypographyStyleToken>;  // Complete typography styles
  spacing?: SpacingInfo;
  radii?: Map<string, number>;
  shadows?: Map<string, any>;
}

/**
 * Parses theme file and extracts design tokens
 * Parses theme file and extracts design tokens
 *
 * @param filePath - Absolute path to theme file
 * @param basePath - Base path for tokens (default 'theme')
 * @returns Extracted theme tokens
 */
export async function parseThemeFile(
  filePath: string,
  basePath: string = 'theme'
): Promise<ThemeTokens> {
  try {
    // Resolve absolute file path
    const absolutePath = resolve(filePath);

    // Check file existence
    if (!existsSync(absolutePath)) {
      throw new Error(`File not found: ${absolutePath}`);
    }

    // Create ts-morph project (without in-memory FS to read files)
    const project = new Project({
      compilerOptions: {
        allowJs: true,
        jsx: 1, // React
      },
    });

    const sourceFile = project.addSourceFileAtPath(absolutePath);

    // Find theme node
    const themeNode = findThemeNode(sourceFile);

    if (!themeNode) {
      throw new Error(`Could not find theme object in file: ${filePath}`);
    }

    // Extract tokens recursively
    const tokens = extractTokensRecursive(themeNode, basePath);

    return tokens;
  } catch (error) {
    console.error(`Error parsing theme file ${filePath}:`, error);
    throw error;
  }
}

/**
 * Finds theme object node in the file
 * Finds theme object node in the file
 *
 * Search strategies:
 * 1. Default export
 * 2. Named export 'theme', 'colors', 'palette'
 * 3. Variable declaration with theme-like name
 */
function findThemeNode(sourceFile: SourceFile): ObjectLiteralExpression | null {
  // Strategy 1: Find default export
  const defaultExport = sourceFile.getDefaultExportSymbol();
  if (defaultExport) {
    const declarations = defaultExport.getDeclarations();
    for (const decl of declarations) {
      const objLiteral = findObjectLiteralInNode(decl);
      if (objLiteral) return objLiteral;
    }
  }

  // Strategy 2: Find named exports with known names
  const themeNames = ['theme', 'colors', 'palette', 'tokens', 'designTokens', 'typography'];
  for (const name of themeNames) {
    const exportedDecl = sourceFile.getExportedDeclarations().get(name);
    if (exportedDecl && exportedDecl.length > 0) {
      const objLiteral = findObjectLiteralInNode(exportedDecl[0]);
      if (objLiteral) return objLiteral;
    }
  }

  // Strategy 3: Find variables with matching names
  const variableStatements = sourceFile.getVariableStatements();
  for (const varStatement of variableStatements) {
    const declarations = varStatement.getDeclarations();
    for (const decl of declarations) {
      const name = decl.getName().toLowerCase();
      if (themeNames.some(themeName => name.includes(themeName))) {
        const objLiteral = findObjectLiteralInNode(decl);
        if (objLiteral) return objLiteral;
      }
    }
  }

  // Strategy 4: If nothing found, take the first large object
  const allObjectLiterals = sourceFile.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression);
  if (allObjectLiterals.length > 0) {
    // Sort by size (number of properties) and take the largest
    const sorted = allObjectLiterals.sort((a, b) =>
      b.getProperties().length - a.getProperties().length
    );
    return sorted[0];
  }

  return null;
}

/**
 * Finds ObjectLiteralExpression in node or its descendants
 * Finds ObjectLiteralExpression in node or its descendants
 */
function findObjectLiteralInNode(node: Node): ObjectLiteralExpression | null {
  // Check the node itself
  if (Node.isObjectLiteralExpression(node)) {
    return node;
  }

  // Check initializer (for variables)
  if (Node.isVariableDeclaration(node)) {
    const initializer = node.getInitializer();
    if (initializer && Node.isObjectLiteralExpression(initializer)) {
      return initializer;
    }
  }

  // Search in descendants
  const objLiteral = node.getFirstDescendantByKind(SyntaxKind.ObjectLiteralExpression);
  return objLiteral || null;
}

/**
 * Recursively extracts tokens from object node
 * Recursively extracts tokens from object node
 *
 * @param node - Node to analyze
 * @param currentPath - Current path (e.g., 'theme.colors')
 * @param tokens - Token accumulator
 * @returns Theme tokens
 */
function extractTokensRecursive(
  node: ObjectLiteralExpression,
  currentPath: string,
  tokens: ThemeTokens = { colors: new Map(), fonts: new Map(), typography: new Map(), radii: new Map(), shadows: new Map() }
): ThemeTokens {
  const properties = node.getProperties();

  for (const prop of properties) {
    if (!Node.isPropertyAssignment(prop)) continue;

    const propName = prop.getName();
    const propPath = `${currentPath}.${propName}`;
    const initializer = prop.getInitializer();

    if (!initializer) continue;

    // If nested object - check if it's a typography style or regular object
    if (Node.isObjectLiteralExpression(initializer)) {
      // Check if this is a typography style (contains fontSize)
      const typoStyle = extractTypographyStyle(initializer, propPath);
      if (typoStyle) {
        if (!tokens.typography) tokens.typography = new Map();
        tokens.typography.set(propPath, typoStyle);
      } else {
        // Otherwise recurse
        extractTokensRecursive(initializer, propPath, tokens);
      }
      continue;
    }

    // Get text value
    const valueText = initializer.getText().replace(/['"]/g, '');

    // Check for color (hex, rgb, rgba)
    if (isColorValue(valueText)) {
      const colorToken: ColorToken = {
        value: normalizeColorValue(valueText),
        path: propPath,
        name: propName,
      };
      // Use normalized value as key
      tokens.colors.set(colorToken.value, colorToken);
    }

    // Check for font
    const fontToken = extractFontToken(propName, valueText, propPath);
    if (fontToken) {
      const key = `${fontToken.family}-${fontToken.weight || 400}`;
      tokens.fonts.set(key, fontToken);
    }

    // Check for spacing values
    if (isSpacingValue(propName)) {
      if (!tokens.spacing) {
        tokens.spacing = { values: [] };
      }
      const numValue = parseFloat(valueText);
      if (!isNaN(numValue) && tokens.spacing.values) {
        tokens.spacing.values.push(numValue);
      }
    }

    // Check for radii values - check both property name and path
    if (isRadiiValue(propName) || isRadiiValue(currentPath)) {
      // Extract number from valueText (could be "12", "scale(12)", etc.)
      const numValue = extractNumberFromValue(valueText);
      if (numValue !== null) {
        if (!tokens.radii) {
          tokens.radii = new Map();
        }
        tokens.radii.set(propPath, numValue);
      }
    }

    // Check for shadow objects
    if (Node.isObjectLiteralExpression(initializer) && isShadowValue(propName)) {
      const shadowObj = extractShadowObject(initializer);
      if (shadowObj) {
        if (!tokens.shadows) {
          tokens.shadows = new Map();
        }
        tokens.shadows.set(propPath, shadowObj);
      }
    }
  }

  return tokens;
}

/**
 * Checks if value is a color
 * Checks if value is a color
 */
function isColorValue(value: string): boolean {
  // Hex color
  if (/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/.test(value)) return true;

  // RGB/RGBA
  if (/^rgba?\(/.test(value)) return true;

  // HSL/HSLA
  if (/^hsla?\(/.test(value)) return true;

  return false;
}

/**
 * Normalizes color to hex format
 * Normalizes color to hex format
 */
function normalizeColorValue(value: string): string {
  // If already hex - return as is (in uppercase)
  if (value.startsWith('#')) {
    return value.toUpperCase();
  }

  // For rgb/rgba/hsl/hsla can return as is
  // or convert to hex (requires additional library)
  // For now just return as is
  return value;
}

/**
 * Extracts font token from property
 * Extracts font token from property
 */
function extractFontToken(
  propName: string,
  value: string,
  propPath: string
): FontToken | null {
  const nameLower = propName.toLowerCase();

  // Check for fontFamily
  if (nameLower.includes('font') && nameLower.includes('family')) {
    return {
      family: value,
      path: propPath,
      name: propName,
    };
  }

  // Check for fontWeight
  if (nameLower.includes('font') && nameLower.includes('weight')) {
    const weight = parseInt(value);
    if (!isNaN(weight)) {
      return {
        family: 'unknown', // Weight without family
        weight,
        path: propPath,
        name: propName,
      };
    }
  }

  // Check for combined font property
  if (nameLower === 'font' && typeof value === 'string') {
    // Simple heuristic for parsing font shorthand
    const parts = value.split(' ');
    let family = parts[parts.length - 1];
    let weight: number | undefined;

    for (const part of parts) {
      const num = parseInt(part);
      if (!isNaN(num) && num >= 100 && num <= 900) {
        weight = num;
      }
    }

    if (family) {
      return {
        family,
        weight,
        path: propPath,
        name: propName,
      };
    }
  }

  return null;
}

/**
 * Extracts typography style from object (if contains fontSize)
 * Extracts typography style from object (if contains fontSize)
 */
function extractTypographyStyle(
  node: ObjectLiteralExpression,
  path: string
): TypographyStyleToken | null {
  const properties = node.getProperties();

  let fontSize: number | null = null;
  let lineHeight: number | undefined;
  let fontWeight: number = 400;
  let fontFamily: string | undefined;
  let letterSpacing: number | undefined;

  for (const prop of properties) {
    if (!Node.isPropertyAssignment(prop)) continue;

    const propName = prop.getName().toLowerCase();
    const initializer = prop.getInitializer();
    if (!initializer) continue;

    const valueText = initializer.getText().replace(/['"]/g, '');
    const numValue = extractNumberFromValue(valueText);

    if (propName === 'fontsize' || propName === 'size') {
      fontSize = numValue;
    } else if (propName === 'lineheight' || propName === 'lineheightpx') {
      lineHeight = numValue ?? undefined;
    } else if (propName === 'fontweight' || propName === 'weight') {
      fontWeight = numValue ?? 400;
    } else if (propName === 'fontfamily' || propName === 'family') {
      // Extract weight from family name
      fontFamily = valueText;
      const nameLower = valueText.toLowerCase();
      if (nameLower.includes('bold')) {
        fontWeight = 700;
      } else if (nameLower.includes('semibold') || nameLower.includes('semi-bold')) {
        fontWeight = 590;
      } else if (nameLower.includes('medium')) {
        fontWeight = 500;
      }
    } else if (propName === 'letterspacing') {
      letterSpacing = numValue ?? undefined;
    }
  }

  // If found fontSize - it's a typography style
  if (fontSize !== null) {
    return {
      path,
      fontSize,
      lineHeight,
      fontWeight,
      fontFamily,
      letterSpacing,
    };
  }

  return null;
}

/**
 * Extracts number from value (could be "12", "scale(12)", "moderateScale(12)", etc.)
 * Extracts number from value (could be "12", "scale(12)", "moderateScale(12)", etc.)
 */
function extractNumberFromValue(valueText: string): number | null {
  // Direct number
  const directNum = parseFloat(valueText);
  if (!isNaN(directNum)) {
    return directNum;
  }

  // Function with numeric argument: scale(12), moderateScale(16), RFValue(20)
  const funcMatch = valueText.match(/\w+\s*\(\s*(\d+(?:\.\d+)?)\s*(?:,|\))/);
  if (funcMatch) {
    return parseFloat(funcMatch[1]);
  }

  return null;
}

/**
 * Checks if property is a spacing value
 * Checks if property is a spacing value
 */
function isSpacingValue(propName: string): boolean {
  const nameLower = propName.toLowerCase();
  const spacingKeywords = [
    'spacing',
    'margin',
    'padding',
    'gap',
    'gutter',
    'offset',
  ];

  return spacingKeywords.some(keyword => nameLower.includes(keyword));
}

/**
 * Checks if property is a radii value
 * Checks if property is a radii value
 */
function isRadiiValue(propName: string): boolean {
  const nameLower = propName.toLowerCase();
  const radiiKeywords = [
    'radius',
    'radii',
    'borderradius',
    'cornerradius',
  ];

  return radiiKeywords.some(keyword => nameLower.includes(keyword));
}

/**
 * Checks if property is a shadow object
 * Checks if property is a shadow object
 */
function isShadowValue(propName: string): boolean {
  const nameLower = propName.toLowerCase();
  const shadowKeywords = [
    'shadow',
    'elevation',
    'boxshadow',
  ];

  return shadowKeywords.some(keyword => nameLower.includes(keyword));
}

/**
 * Extracts shadow object from ObjectLiteralExpression
 * Extracts shadow object from ObjectLiteralExpression
 */
function extractShadowObject(node: ObjectLiteralExpression): any {
  const shadowObj: any = {};
  const properties = node.getProperties();

  for (const prop of properties) {
    if (!Node.isPropertyAssignment(prop)) continue;

    const propName = prop.getName();
    const initializer = prop.getInitializer();
    if (!initializer) continue;

    const nameLower = propName.toLowerCase();

    // Extract various shadow property formats
    if (nameLower.includes('offset')) {
      // Could be object { x: 0, y: 4 } or { width: 0, height: 4 }
      if (Node.isObjectLiteralExpression(initializer)) {
        const offsetProps = initializer.getProperties();
        const offsetObj: any = {};
        for (const offsetProp of offsetProps) {
          if (Node.isPropertyAssignment(offsetProp)) {
            const offsetName = offsetProp.getName();
            const offsetInit = offsetProp.getInitializer();
            if (offsetInit) {
              const offsetValue = parseFloat(offsetInit.getText());
              if (!isNaN(offsetValue)) {
                offsetObj[offsetName] = offsetValue;
              }
            }
          }
        }
        shadowObj.offset = offsetObj;
      }
    } else if (nameLower.includes('opacity')) {
      const value = parseFloat(initializer.getText());
      if (!isNaN(value)) {
        shadowObj.opacity = value;
      }
    } else if (nameLower.includes('radius') || nameLower.includes('blur')) {
      const value = parseFloat(initializer.getText());
      if (!isNaN(value)) {
        shadowObj.radius = value;
      }
    } else if (nameLower.includes('color')) {
      shadowObj.color = initializer.getText().replace(/['"]/g, '');
    }
  }

  // Check if we got at least basic shadow properties
  if (shadowObj.offset || shadowObj.opacity !== undefined || shadowObj.radius !== undefined) {
    return shadowObj;
  }

  return null;
}

/**
 * Search for all theme files in project directory
 * Search for all theme files in project directory
 */
export async function findThemeFiles(projectRoot: string): Promise<string[]> {
  const themeFiles: string[] = [];
  const possibleNames = [
    'theme.ts',
    'theme.tsx',
    'theme.js',
    'theme.jsx',
    'colors.ts',
    'colors.tsx',
    'colors.js',
    'tokens.ts',
    'design-tokens.ts',
  ];

  const possibleDirs = [
    join(projectRoot, 'src', 'styles', 'theme'),
    join(projectRoot, 'src', 'theme'),
    join(projectRoot, 'src', 'styles'),
    join(projectRoot, 'theme'),
    join(projectRoot, 'styles'),
    join(projectRoot, 'src'),
    projectRoot,
  ];

  for (const dir of possibleDirs) {
    if (!existsSync(dir)) continue;

    for (const name of possibleNames) {
      const fullPath = join(dir, name);
      if (existsSync(fullPath)) {
        themeFiles.push(fullPath);
      }
    }
  }

  return themeFiles;
}
