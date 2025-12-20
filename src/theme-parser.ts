import { Project, SourceFile, SyntaxKind, Node, ObjectLiteralExpression, PropertyAssignment } from 'ts-morph';
import { existsSync } from 'fs';
import { resolve, join, basename } from 'path';

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
  typography?: Map<string, TypographyStyleToken>;
  spacing?: Map<string, number>;
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
  basePath?: string
): Promise<ThemeTokens> {
  try {
    // Resolve absolute file path
    const absolutePath = resolve(filePath);
    const fileName = basename(filePath).toLowerCase();

    // If base path not provided, try to infer from filename
    if (!basePath) {
      if (fileName.includes('color') || fileName.includes('palette')) basePath = 'colors';
      else if (fileName.includes('typogra') || fileName.includes('font')) basePath = 'typography';
      else if (fileName.includes('spacing')) basePath = 'spacing';
      else if (fileName.includes('radius') || fileName.includes('radii')) basePath = 'radii';
      else if (fileName.includes('shadow') || fileName.includes('elevation')) basePath = 'shadows';
      else basePath = 'theme';
    }

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
      console.error(`   ❌ No theme object found in ${filePath}`);
      throw new Error(`Could not find theme object in file: ${filePath}`);
    }

    // Determine the starting path for tokens
    // We want to preserve the object name (e.g., 'palette') if it's not redundant with the basePath
    const nodeName = getObjectLiteralName(themeNode);
    let effectivePath = basePath || 'theme';
    if (nodeName && nodeName !== basePath && nodeName !== 'default' && !['theme', 'tokens', 'designTokens'].includes(nodeName)) {
      effectivePath = basePath ? `${basePath}.${nodeName}` : nodeName;
    }

    // Extract tokens recursively
    const tokens = extractTokensRecursive(themeNode, effectivePath);

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
  const themeNames = ['theme', 'colors', 'palette', 'tokens', 'designTokens', 'typography', 'spacing', 'radii', 'shadows'];
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
    if (initializer) {
      if (Node.isObjectLiteralExpression(initializer)) {
        return initializer;
      }
      // Handle ArrowFunction: (palette) => ({ ... })
      if (Node.isArrowFunction(initializer)) {
        const body = initializer.getBody();
        if (Node.isParenthesizedExpression(body)) {
          const expression = body.getExpression();
          if (Node.isObjectLiteralExpression(expression)) {
            return expression;
          }
        } else if (Node.isObjectLiteralExpression(body)) {
          return body;
        }
      }
    }
  }

  // Search in descendants
  const objLiteral = node.getFirstDescendantByKind(SyntaxKind.ObjectLiteralExpression);
  return objLiteral || null;
}

/**
 * Finds the name of an ObjectLiteralExpression (from its variable declaration or property assignment)
 */
function getObjectLiteralName(node: ObjectLiteralExpression): string | null {
  const parent = node.getParent();
  
  if (Node.isVariableDeclaration(parent) || Node.isPropertyAssignment(parent)) {
    return parent.getName();
  }

  // Check if it's a default export: export default { ... }
  if (Node.isExportAssignment(parent)) {
    return 'default';
  }

  return null;
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
  tokens: ThemeTokens = { colors: new Map(), fonts: new Map(), typography: new Map(), radii: new Map(), shadows: new Map(), spacing: new Map() }
): ThemeTokens {
  const properties = node.getProperties();

  for (const prop of properties) {
    if (!Node.isPropertyAssignment(prop)) continue;

    const rawPropName = prop.getName();
    // Strip quotes if present (prop.getName() returns 'key' for quoted keys)
    const propName = rawPropName.replace(/^['"]|['"]$/g, '');
    // Use bracket notation for keys that aren't valid JS identifiers (e.g., '2xl', '3d')
    const isValidIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(propName);
    const propPath = isValidIdentifier 
      ? `${currentPath}.${propName}` 
      : `${currentPath}['${propName}']`;
    const initializer = prop.getInitializer();

    if (!initializer) continue;

    const isInsideSpacing = isSpacingValue(currentPath) || isSpacingValue(propName);
    const isInsideRadii = isRadiiValue(currentPath) || isRadiiValue(propName);
    const isInsideShadows = isShadowValue(currentPath) || isShadowValue(propName);

    // 1. Handle Object Literals
    if (Node.isObjectLiteralExpression(initializer)) {
      // Check if this is a typography style (contains fontSize)
      const typoStyle = extractTypographyStyle(initializer, propPath);
      if (typoStyle) {
        if (!tokens.typography) tokens.typography = new Map();
        tokens.typography.set(propPath, typoStyle);
        continue;
      }

      // Check for shadow objects
      if (isInsideShadows) {
        const shadowObj = extractShadowObject(initializer);
        if (shadowObj) {
          if (!tokens.shadows) tokens.shadows = new Map();
          tokens.shadows.set(propPath, shadowObj);
          continue;
        }
      }

      // Otherwise recurse
      extractTokensRecursive(initializer, propPath, tokens);
      continue;
    }

    // 2. Handle Call Expressions (Shadows/Scaling)
    if (Node.isCallExpression(initializer)) {
      if (isInsideShadows) {
        const shadowObj = extractShadowFromCall(initializer);
        if (shadowObj) {
          if (!tokens.shadows) tokens.shadows = new Map();
          tokens.shadows.set(propPath, shadowObj);
          continue;
        }
      }
    }

    // Get text value
    const valueText = initializer.getText().replace(/['"]/g, '');

    // 3. Handle Colors
    if (isColorValue(valueText)) {
      const colorToken: ColorToken = {
        value: normalizeColorValue(valueText),
        path: propPath,
        name: propName,
      };
      tokens.colors.set(colorToken.value, colorToken);
      continue;
    }

    // 4. Handle Numeric Tokens (Spacing, Radii)
    const numValue = extractNumberFromValue(valueText);
    if (numValue !== null) {
      if (isInsideSpacing) {
        if (!tokens.spacing) tokens.spacing = new Map();
        tokens.spacing.set(propPath, numValue);
      } else if (isInsideRadii) {
        if (!tokens.radii) tokens.radii = new Map();
        tokens.radii.set(propPath, numValue);
      }
      continue;
    }

    // 5. Check for font
    const fontToken = extractFontToken(propName, valueText, propPath);
    if (fontToken) {
      const key = `${fontToken.family}-${fontToken.weight || 400}`;
      tokens.fonts.set(key, fontToken);
    }
  }

  return tokens;
}

/**
 * Checks if value is a color
 * Checks if value is a color
 */
function isColorValue(value: string): boolean {
  // Hex color (support 3, 6, or 8 digits)
  if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(value)) return true;

  // RGB/RGBA
  if (/^rgba?\(/.test(value)) return true;

  // HSL/HSLA
  if (/^hsla?\(/.test(value)) return true;

  return false;
}

/**
 * Normalizes color to uppercase 6-digit hex format if possible
 */
function normalizeColorValue(value: string): string {
  if (value.startsWith('#')) {
    let hex = value.replace('#', '').toUpperCase();
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    return `#${hex}`;
  }
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
    const family = parts[parts.length - 1];
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
        fontWeight = 600;
      } else if (nameLower.includes('medium')) {
        fontWeight = 500;
      } else if (nameLower.includes('regular')) {
        fontWeight = 400;
      } else if (nameLower.includes('light')) {
        fontWeight = 300;
      } else if (nameLower.includes('thin')) {
        fontWeight = 100;
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
      fontWeight: fontWeight === 590 ? 600 : fontWeight, // Normalize Apple's 590 to standard 600
      fontFamily,
      letterSpacing,
    };
  }

  return null;
}

/**
 * Extracts number from value (could be "12", "12px", "scale(12)", "moderateScale(12)", etc.)
 */
function extractNumberFromValue(valueText: string): number | null {
  // Remove 'px' suffix if present
  const cleanValue = valueText.replace(/px$/, '').trim();

  // Direct number
  const directNum = parseFloat(cleanValue);
  if (!isNaN(directNum) && isFinite(directNum)) {
    return directNum;
  }

  // Function with numeric argument: scale(12), moderateScale(16), RFValue(20), size(24)
  const funcMatch = cleanValue.match(/\w+\s*\(\s*(-?\d+(?:\.\d+)?)\s*(?:,|\))/);
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
 * Extracts shadow object from CallExpression (e.g., createShadow(y, opacity, blur, elevation))
 */
function extractShadowFromCall(node: any): any {
  const args = node.getArguments();
  const funcName = node.getExpression().getText().toLowerCase();

  // Handle Marafet's createShadow(offsetY, opacity, radius, elevation)
  if (funcName.includes('shadow') && args.length >= 3) {
    const offsetY = extractNumberFromValue(args[0].getText());
    const opacity = extractNumberFromValue(args[1].getText());
    const radius = extractNumberFromValue(args[2].getText());

    if (offsetY !== null || opacity !== null || radius !== null) {
      return {
        offset: { width: 0, height: offsetY ?? 0 },
        opacity: opacity ?? 1,
        radius: radius ?? 0,
        color: '#000000', // Default for createShadow in Marafet
      };
    }
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
