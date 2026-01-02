import { Project, SourceFile, SyntaxKind, Node, ObjectLiteralExpression } from 'ts-morph';
import { existsSync } from 'fs';
import { resolve, join, basename } from 'path';
import { pathComplexity, normalizeHex } from './core/utils/path-utils.js';

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

    // Find theme nodes
    const themeNodes = findThemeNodes(sourceFile);

    if (themeNodes.length === 0) {
      console.error(`   ❌ No theme objects found in ${filePath}`);
      throw new Error(`Could not find theme objects in file: ${filePath}`);
    }

    const allTokens: ThemeTokens = { 
      colors: new Map(), 
      fonts: new Map(), 
      typography: new Map(), 
      radii: new Map(), 
      shadows: new Map(), 
      spacing: new Map() 
    };

    for (const node of themeNodes) {
      // Get the original variable name (before resolution)
      const originalName = Node.isVariableDeclaration(node) ? node.getName() : (node as any).getName?.();

      // Resolve to the object literal
      const targetNode = resolveValueNode(node);

      if (!Node.isObjectLiteralExpression(targetNode)) {
        continue;
      }

      // Determine the starting path for tokens
      // Use original variable name, fall back to object literal name
      const nodeName = originalName || getObjectLiteralName(targetNode as any);
      let effectivePath = basePath || 'theme';
      // Exclude common theme object names that represent the root theme
      // For Unistyles: clientTheme/masterTheme are the runtime theme object
      const rootThemeNames = ['theme', 'tokens', 'designTokens', 'clientTheme', 'masterTheme', 'lightTheme', 'darkTheme'];
      if (nodeName && nodeName !== basePath && nodeName !== 'default' && !rootThemeNames.includes(nodeName)) {
        effectivePath = basePath ? `${basePath}.${nodeName}` : nodeName;
      }

      // Debug: log processed nodes
      // console.log(`  [process] ${originalName || 'unnamed'} → path: ${effectivePath}`);

      // Extract tokens recursively
      const tokens = extractTokensRecursive(targetNode, effectivePath);
      
      // Merge results - prefer simpler paths when same value exists
      for (const [k, v] of tokens.colors) {
        const existing = allTokens.colors.get(k);
        if (!existing || pathComplexity(v.path) < pathComplexity(existing.path)) {
          allTokens.colors.set(k, v);
        }
      }
      for (const [k, v] of tokens.fonts) allTokens.fonts.set(k, v);
      for (const [k, v] of tokens.typography) allTokens.typography.set(k, v);
      // Spacing and radii use path as key, number as value - just overwrite
      for (const [k, v] of tokens.spacing) allTokens.spacing.set(k, v);
      for (const [k, v] of tokens.radii) allTokens.radii.set(k, v);
      for (const [k, v] of tokens.shadows) allTokens.shadows.set(k, v);
    }

    return allTokens;
  } catch (error) {
    console.error(`Error parsing theme file ${filePath}:`, error);
    throw error;
  }
}

/**
 * Finds all relevant theme nodes in the file
 */
function findThemeNodes(sourceFile: SourceFile): Node[] {
  const nodes: Node[] = [];
  // Include color scale names (gray, accent, etc.) to extract their values directly
  // Include Unistyles theme names (lightTheme, darkTheme, masterTheme)
  const themeNames = [
    'theme', 'colors', 'palette', 'tokens', 'designTokens', 'typography', 'spacing', 'radii', 'shadows',
    'clientPalette', 'masterPalette', 'clientThemeInstance',
    'gray', 'accent', 'black', 'white', 'success', 'error', 'gradient', 'opacityPresets',
    // Unistyles theme names
    'lightTheme', 'darkTheme', 'masterTheme', 'defaultTheme',
    // Font token objects
    'font', 'fonts', 'textStyles',
    // Spacing variations (support both 'margins' and 'spacing')
    'margins', 'spacing',
    // Radii variations (support both 'radius' and 'radii')
    'radius', 'radii',
    // Additional semantic token names
    'clientAccent', 'masterAccent', 'semantic', 'clientGradient', 'masterGradient',
  ];

  // 1. Default export
  const defaultExport = sourceFile.getDefaultExportSymbol();
  if (defaultExport) {
    const declarations = defaultExport.getDeclarations();
    nodes.push(...declarations);
  }

  // 2. Named exports
  for (const name of themeNames) {
    const exportedDecl = sourceFile.getExportedDeclarations().get(name);
    if (exportedDecl) nodes.push(...exportedDecl);
  }

  // 3. Variables with matching names
  const variableStatements = sourceFile.getVariableStatements();
  for (const varStatement of variableStatements) {
    const declarations = varStatement.getDeclarations();
    for (const decl of declarations) {
      const name = decl.getName().toLowerCase();
      if (themeNames.some(themeName => name.toLowerCase().includes(themeName.toLowerCase()))) {
        nodes.push(decl);
      }
    }
  }

  // 4. Large object literals (fallback)
  if (nodes.length === 0) {
    const allObjectLiterals = sourceFile.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression);
    if (allObjectLiterals.length > 0) {
      const sorted = allObjectLiterals.sort((a, b) =>
        b.getProperties().length - a.getProperties().length
      );
      nodes.push(sorted[0]);
    }
  }

  // Filter to unique nodes (by resolved target, but keep original for name extraction)
  const finalNodes: Node[] = [];
  const seen = new Set<string>();

  for (const node of nodes) {
    const resolved = resolveNodeToTarget(node);
    if (resolved) {
      // Use resolved node's position as unique key
      const key = `${resolved.getStartLineNumber()}-${resolved.getStart()}`;
      if (!seen.has(key)) {
        // Push original node (not resolved) to preserve variable name
        finalNodes.push(node);
        seen.add(key);
      } else {
        // console.log(`  [findNodes] SKIP ${nodeName} (duplicate key: ${key})`);
      }
    } else {
      // console.log(`  [findNodes] SKIP ${nodeName} (could not resolve)`);
    }
  }

  return finalNodes;
}

/**
 * Resolves a node to either an ObjectLiteralExpression or a Function that returns one
 */
function resolveNodeToTarget(node: Node): Node | null {
  // Check literal
  if (Node.isObjectLiteralExpression(node)) return node;
  
  // Check variable declaration
  if (Node.isVariableDeclaration(node)) {
    const init = node.getInitializer();
    if (init) {
      // Unwrap AsExpression or Parentheses
      let target = init;
      while (Node.isAsExpression(target) || Node.isParenthesizedExpression(target)) {
        target = target.getExpression();
      }

      if (Node.isObjectLiteralExpression(target)) return target;
      if (Node.isArrowFunction(target) || Node.isFunctionExpression(target)) return target;

      // Follow reference
      if (Node.isIdentifier(target)) {
        const refs = target.getDefinitions();
        for (const ref of refs) {
          const decl = ref.getDeclarationNode();
          if (decl && decl !== node) return resolveNodeToTarget(decl);
        }
      }

      // Handle CallExpression (e.g., createTheme('client'))
      if (Node.isCallExpression(target)) {
        return resolveNodeToTarget(target);
      }
    }
  }
  
  // Check property assignment
  if (Node.isPropertyAssignment(node)) {
    const init = node.getInitializer();
    if (init) return resolveNodeToTarget(init);
  }

  // Check call expression (e.g., createTheme('client'))
  if (Node.isCallExpression(node)) {
    const expression = node.getExpression();
    if (Node.isIdentifier(expression)) {
      const funcName = expression.getText();
      const sourceFile = node.getSourceFile();
      const funcDecl = sourceFile.getFunction(funcName);
      if (funcDecl) {
        const body = funcDecl.getBody();
        if (body && Node.isBlock(body)) {
          const returnStmt = body.getStatements().find(s => Node.isReturnStatement(s));
          if (returnStmt && Node.isReturnStatement(returnStmt)) {
            const returnExpr = returnStmt.getExpression();
            if (returnExpr) return resolveNodeToTarget(returnExpr);
          }
        }
      }
    }
  }

  return null;
}

/**
 * Resolves a node to its actual value node by following identifiers/variable references.
 * Limited to the same file for performance and simplicity.
 */
function resolveValueNode(node: Node): Node {
  // 0. Unwrap AsExpression or Parentheses
  if (Node.isAsExpression(node) || Node.isParenthesizedExpression(node)) {
    return resolveValueNode(node.getExpression());
  }

  // 0b. Handle VariableDeclaration directly
  if (Node.isVariableDeclaration(node)) {
    const init = node.getInitializer();
    if (init) return resolveValueNode(init);
  }

  // 1. Resolve Identifiers
  if (Node.isIdentifier(node)) {
    const definitions = node.getDefinitions();
    for (const def of definitions) {
      const decl = def.getDeclarationNode();
      if (decl && Node.isVariableDeclaration(decl)) {
        const init = decl.getInitializer();
        // Prevent infinite recursion for circular refs
        if (init && init !== node) return resolveValueNode(init);
      }
    }
  }

  // 2. Resolve Property Access (base.purple10)
  if (Node.isPropertyAccessExpression(node)) {
    const expression = node.getExpression();
    const name = node.getName();
    const baseObj = resolveValueNode(expression);

    if (Node.isObjectLiteralExpression(baseObj)) {
      const prop = baseObj.getProperty(name);
      if (prop && (Node.isPropertyAssignment(prop) || Node.isShorthandPropertyAssignment(prop))) {
        const init = Node.isPropertyAssignment(prop) ? prop.getInitializer() : prop.getNameNode();
        if (init) return resolveValueNode(init);
      }
    }
  }

  // 2b. Resolve Element Access (base[10], gray[10])
  if (Node.isElementAccessExpression(node)) {
    const expression = node.getExpression();
    const argument = node.getArgumentExpression();
    const baseObj = resolveValueNode(expression);
    // console.log(`  [ElementAccess] ${node.getText()} → base resolved to: ${baseObj?.getKindName()}`);

    if (Node.isObjectLiteralExpression(baseObj) && argument) {
      // Get the key (e.g., 10 from gray[10])
      const keyText = argument.getText().replace(/['"]/g, '');
      const prop = baseObj.getProperty(keyText);
      if (prop && (Node.isPropertyAssignment(prop) || Node.isShorthandPropertyAssignment(prop))) {
        const init = Node.isPropertyAssignment(prop) ? prop.getInitializer() : prop.getNameNode();
        if (init) return resolveValueNode(init);
      }
    }
  }

  // 3. Resolve Arrow Functions results (if no params)
  if (Node.isArrowFunction(node) || Node.isFunctionExpression(node)) {
    const body = node.getBody();
    if (Node.isParenthesizedExpression(body)) {
      return resolveValueNode(body.getExpression());
    }
    if (Node.isObjectLiteralExpression(body)) {
      return body;
    }
  }

  // 4. Resolve Call Expressions (e.g., createTheme('client'))
  if (Node.isCallExpression(node)) {
    const expression = node.getExpression();

    // Get the function being called
    if (Node.isIdentifier(expression)) {
      const funcName = expression.getText();
      const sourceFile = node.getSourceFile();

      // Find the function declaration
      const funcDecl = sourceFile.getFunction(funcName);
      if (funcDecl) {
        const body = funcDecl.getBody();
        if (body && Node.isBlock(body)) {
          // Find return statement
          const returnStmt = body.getStatements().find(s => Node.isReturnStatement(s));
          if (returnStmt && Node.isReturnStatement(returnStmt)) {
            const returnExpr = returnStmt.getExpression();
            if (returnExpr) {
              return resolveValueNode(returnExpr);
            }
          }
        }
      }
    }
  }

  return node;
}

/**
 * Finds the name of an ObjectLiteralExpression (from its variable declaration or property assignment)
 */
function getObjectLiteralName(node: ObjectLiteralExpression): string | null {
  let current: Node = node;
  let parent = current.getParent();
  
  // Unwrap AsExpression or Parentheses
  while (parent && (Node.isAsExpression(parent) || Node.isParenthesizedExpression(parent))) {
    current = parent;
    parent = current.getParent();
  }

  if (parent && (Node.isVariableDeclaration(parent) || Node.isPropertyAssignment(parent))) {
    return parent.getName();
  }

  // Check if it's a default export: export default { ... }
  if (parent && Node.isExportAssignment(parent)) {
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
    // Handle spread operators (e.g., ...grayColors)
    if (Node.isSpreadAssignment(prop)) {
      const spreadExpr = prop.getExpression();
      const resolvedSpread = resolveValueNode(spreadExpr);

      // If spread resolves to an object literal, inline its properties
      if (Node.isObjectLiteralExpression(resolvedSpread)) {
        extractTokensRecursive(resolvedSpread, currentPath, tokens);
      }
      continue;
    }

    if (!Node.isPropertyAssignment(prop)) continue;

    const rawPropName = prop.getName();
    // Strip quotes if present (prop.getName() returns 'key' for quoted keys)
    const propName = rawPropName.replace(/^['"]|['"]$/g, '');

    // Generate semantic property name for numeric keys in color/scale objects
    // e.g., gray[10] → gray.gray10, accent[60] → accent.accent60
    let semanticPropName = propName;
    if (/^\d+$/.test(propName)) {
      // Numeric key - extract parent name for semantic naming
      const pathParts = currentPath.split('.');
      const parentName = pathParts[pathParts.length - 1]?.replace(/[[\]']/g, '');
      // Support both singular and plural forms (margins/spacing, radius/radii)
      if (parentName && ['gray', 'accent', 'spacing', 'margins', 'radii', 'radius'].includes(parentName.toLowerCase())) {
        semanticPropName = `${parentName}${propName}`; // gray10, accent60, margins16
      }
    }

    // Use bracket notation only for keys that can't be identifiers (after semantic naming attempt)
    const isValidIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(semanticPropName);
    const propPath = isValidIdentifier
      ? `${currentPath}.${semanticPropName}`
      : `${currentPath}['${propName}']`;
    const initializer = prop.getInitializer();
    if (!initializer) continue;

    // RESOLVE VALUE
    const resolvedValueNode = resolveValueNode(initializer);
    const valueText = resolvedValueNode.getText().replace(/['"]/g, '');

    const isInsideSpacing = isSpacingValue(currentPath) || isSpacingValue(propName);
    const isInsideRadii = isRadiiValue(currentPath) || isRadiiValue(propName);
    const isInsideShadows = isShadowValue(currentPath) || isShadowValue(propName);
    
    // Semantic colors detection: if property is 'text', 'background', 'border' or contains 'color'
    const isSemanticColor = ['text', 'background', 'border', 'accent', 'secondary', 'primary'].includes(propName.toLowerCase()) || propName.toLowerCase().includes('color');

    // 1. Handle Object Literals
    if (Node.isObjectLiteralExpression(resolvedValueNode)) {
      // Check if this is a typography style (contains fontSize)
      const typoStyle = extractTypographyStyle(resolvedValueNode, propPath);
      if (typoStyle) {
        if (!tokens.typography) tokens.typography = new Map();
        tokens.typography.set(propPath, typoStyle);
        continue;
      }

      // Check for shadow objects
      if (isInsideShadows) {
        const shadowObj = extractShadowObject(resolvedValueNode);
        if (shadowObj) {
          if (!tokens.shadows) tokens.shadows = new Map();
          tokens.shadows.set(propPath, shadowObj);
          continue;
        }
      }

      // Otherwise recurse
      extractTokensRecursive(resolvedValueNode, propPath, tokens);
      continue;
    }

    // 2. Handle Call Expressions (Shadows/Scaling)
    if (Node.isCallExpression(resolvedValueNode)) {
      if (isInsideShadows) {
        const shadowObj = extractShadowFromCall(resolvedValueNode);
        if (shadowObj) {
          if (!tokens.shadows) tokens.shadows = new Map();
          tokens.shadows.set(propPath, shadowObj);
          continue;
        }
      }
    }

    // 3. Handle Colors
    if (isColorValue(valueText) || (isSemanticColor && isColorValue(valueText))) {
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
 * Uses shared normalizeHex utility for consistency
 */
function normalizeColorValue(value: string): string {
  if (value.startsWith('#')) {
    let hex = value.replace('#', '');
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    return normalizeHex(`#${hex}`);
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
 * Handles nested fontFamily structures: { regular, bold }
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
  // Track nested font family variants
  let fontFamilyRegular: string | undefined;
  let fontFamilyBold: string | undefined;

  for (const prop of properties) {
    if (!Node.isPropertyAssignment(prop)) continue;

    // Strip quotes and lowercase for comparison (handles "fontSize" vs fontSize)
    const rawPropName = prop.getName();
    const propName = rawPropName.replace(/^['"]|['"]$/g, '').toLowerCase();
    const initializer = prop.getInitializer();
    if (!initializer) continue;

    if (propName === 'fontsize' || propName === 'size') {
      const valueText = initializer.getText().replace(/['"]/g, '');
      fontSize = extractNumberFromValue(valueText);
    } else if (propName === 'lineheight' || propName === 'lineheightpx') {
      const valueText = initializer.getText().replace(/['"]/g, '');
      lineHeight = extractNumberFromValue(valueText) ?? undefined;
    } else if (propName === 'fontweight' || propName === 'weight') {
      const valueText = initializer.getText().replace(/['"]/g, '');
      fontWeight = extractNumberFromValue(valueText) ?? 400;
    } else if (propName === 'fontfamily' || propName === 'family') {
      // Check if it's a nested object with variants
      if (Node.isObjectLiteralExpression(initializer)) {
        // Handle: fontFamily: { regular: "...", bold: "..." }
        for (const variantProp of initializer.getProperties()) {
          if (!Node.isPropertyAssignment(variantProp)) continue;
          // Strip quotes from variant names too
          const variantName = variantProp.getName().replace(/^['"]|['"]$/g, '').toLowerCase();
          const variantInit = variantProp.getInitializer();
          if (variantInit) {
            const variantValue = variantInit.getText().replace(/['"]/g, '');
            if (variantName === 'regular') {
              fontFamilyRegular = variantValue;
            } else if (variantName === 'bold' || variantName === 'semibold') {
              fontFamilyBold = variantValue;
            }
          }
        }
        // Use regular as default fontFamily
        fontFamily = fontFamilyRegular || fontFamilyBold;
      } else {
        // Flat string: fontFamily: "SFProText-Regular"
        const valueText = initializer.getText().replace(/['"]/g, '');
        fontFamily = valueText;
        // Extract weight from family name
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
      }
    } else if (propName === 'letterspacing') {
      // Check if it's a nested object with variants
      if (Node.isObjectLiteralExpression(initializer)) {
        // Handle: letterSpacing: { regular: -0.41, bold: -0.41 }
        for (const variantProp of initializer.getProperties()) {
          if (!Node.isPropertyAssignment(variantProp)) continue;
          const variantName = variantProp.getName().toLowerCase();
          if (variantName === 'regular') {
            const variantInit = variantProp.getInitializer();
            if (variantInit) {
              letterSpacing = extractNumberFromValue(variantInit.getText()) ?? undefined;
            }
          }
        }
      } else {
        const valueText = initializer.getText().replace(/['"]/g, '');
        letterSpacing = extractNumberFromValue(valueText) ?? undefined;
      }
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
      // Store variant info for matcher to use
      ...(fontFamilyRegular && { fontFamilyRegular }),
      ...(fontFamilyBold && { fontFamilyBold }),
    } as TypographyStyleToken;
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
    'margins', // Unistyles uses 'margins' for spacing
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
