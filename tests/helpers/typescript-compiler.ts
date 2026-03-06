/**
 * TypeScript Compiler for validating generated code
 * Uses ts-morph for TypeScript analysis and validation
 */

import { Project, ts, SourceFile, DiagnosticCategory } from 'ts-morph';
import { join } from 'path';

export interface CompilationResult {
  /** Compilation succeeded */
  success: boolean;
  /** List of errors */
  errors: CompilationError[];
  /** List of warnings */
  warnings: CompilationError[];
  /** File information */
  fileInfo?: {
    exports: string[];
    imports: string[];
    hasDefaultExport: boolean;
    componentName?: string;
  };
}

export interface CompilationError {
  /** Error message */
  message: string;
  /** Line number */
  line?: number;
  /** Column number */
  column?: number;
  /** Error code */
  code?: number;
}

/**
 * Compiles TypeScript code and returns result
 */
export function compileTypeScript(code: string, filename = 'test.tsx'): CompilationResult {
  const project = new Project({
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
      skipLibCheck: true,
      noEmit: true,
      strict: false,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      // Allow any imports (external dependencies don't matter for tests)
      noImplicitAny: false,
      allowSyntheticDefaultImports: true,
      // Disable automatic type resolution
      types: [],
      typeRoots: [],
    },
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });

  // Add minimal React Native types
  project.createSourceFile(
    'node_modules/@types/react/index.d.ts',
    `
declare module 'react' {
  export function useState<T>(initial: T): [T, (value: T) => void];
  export function useEffect(effect: () => void, deps?: any[]): void;
  export function useCallback<T extends Function>(callback: T, deps: any[]): T;
  export function useMemo<T>(factory: () => T, deps: any[]): T;
  export const Fragment: any;
  export type FC<P = {}> = (props: P) => JSX.Element | null;
  export type ReactNode = any;
}
declare namespace JSX {
  interface Element {}
  interface IntrinsicElements {
    [key: string]: any;
  }
}
`
  );

  project.createSourceFile(
    'node_modules/@types/react-native/index.d.ts',
    `
declare module 'react-native' {
  export const View: any;
  export const Text: any;
  export const Image: any;
  export const TouchableOpacity: any;
  export const Pressable: any;
  export const ScrollView: any;
  export const FlatList: any;
  export const TextInput: any;
  export const StyleSheet: { create: <T>(styles: T) => T };
  export type ViewStyle = any;
  export type TextStyle = any;
  export type ImageStyle = any;
  export type StyleProp<T> = T | T[];
}
`
  );

  // Add types for commonly used libraries
  project.createSourceFile(
    'node_modules/@types/gorhom-bottom-sheet/index.d.ts',
    `
declare module '@gorhom/bottom-sheet' {
  export const BottomSheet: any;
  export const BottomSheetView: any;
  export const BottomSheetScrollView: any;
  export const BottomSheetFlatList: any;
  export function useBottomSheet(): any;
}
`
  );

  project.createSourceFile(
    'node_modules/@types/react-hook-form/index.d.ts',
    `
declare module 'react-hook-form' {
  export function useForm<T = any>(options?: any): any;
  export function useController(options?: any): any;
  export const Controller: any;
}
`
  );

  project.createSourceFile(
    'node_modules/@types/zod/index.d.ts',
    `
declare module 'zod' {
  export const z: any;
  export function object(shape: any): any;
  export function string(): any;
  export function number(): any;
  export function boolean(): any;
  export type infer<T> = any;
}
`
  );

  // Add code file
  const sourceFile = project.createSourceFile(filename, code);

  // Get diagnostics
  const diagnostics = project.getPreEmitDiagnostics();

  const errors: CompilationError[] = [];
  const warnings: CompilationError[] = [];

  for (const diagnostic of diagnostics) {
    const error: CompilationError = {
      message: diagnostic.getMessageText().toString(),
      code: diagnostic.getCode(),
    };

    const start = diagnostic.getStart();
    if (start !== undefined) {
      const file = diagnostic.getSourceFile();
      if (file) {
        const pos = file.getLineAndColumnAtPos(start);
        error.line = pos.line;
        error.column = pos.column;
      }
    }

    if (diagnostic.getCategory() === DiagnosticCategory.Error) {
      errors.push(error);
    } else if (diagnostic.getCategory() === DiagnosticCategory.Warning) {
      warnings.push(error);
    }
  }

  // Extract file information
  const fileInfo = extractFileInfo(sourceFile);

  return {
    success: errors.length === 0,
    errors,
    warnings,
    fileInfo,
  };
}

/**
 * Extracts file information
 */
function extractFileInfo(sourceFile: SourceFile): CompilationResult['fileInfo'] {
  const exports: string[] = [];
  const imports: string[] = [];
  let hasDefaultExport = false;
  let componentName: string | undefined;

  // Extract imports
  for (const importDecl of sourceFile.getImportDeclarations()) {
    imports.push(importDecl.getModuleSpecifierValue());
  }

  // Extract exports
  for (const exportDecl of sourceFile.getExportDeclarations()) {
    const namedExports = exportDecl.getNamedExports();
    for (const namedExport of namedExports) {
      exports.push(namedExport.getName());
    }
  }

  // Check exported functions/variables
  for (const func of sourceFile.getFunctions()) {
    if (func.isExported()) {
      const name = func.getName();
      if (name) {
        exports.push(name);
        // Assume function with PascalCase name is a component
        if (/^[A-Z]/.test(name)) {
          componentName = name;
        }
      }
    }
    if (func.isDefaultExport()) {
      hasDefaultExport = true;
    }
  }

  for (const varDecl of sourceFile.getVariableDeclarations()) {
    const varStatement = varDecl.getVariableStatement();
    if (varStatement?.isExported()) {
      const name = varDecl.getName();
      exports.push(name);
      // Assume variable with PascalCase name is a component
      if (/^[A-Z]/.test(name)) {
        componentName = name;
      }
    }
  }

  // Check exported interfaces/types
  for (const iface of sourceFile.getInterfaces()) {
    if (iface.isExported()) {
      exports.push(iface.getName());
    }
  }

  for (const typeAlias of sourceFile.getTypeAliases()) {
    if (typeAlias.isExported()) {
      exports.push(typeAlias.getName());
    }
  }

  return {
    exports,
    imports,
    hasDefaultExport,
    componentName,
  };
}

/**
 * Validates that code contains expected React Native component elements
 */
export function validateReactNativeComponent(code: string): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Check React imports
  if (!code.includes("from 'react'") && !code.includes('from "react"')) {
    issues.push('Missing React import');
  }

  // Check React Native imports
  if (!code.includes("from 'react-native'") && !code.includes('from "react-native"')) {
    issues.push('Missing React Native import');
  }

  // Check for JSX
  if (!code.includes('<View') && !code.includes('<Text') && !code.includes('<ScrollView')) {
    issues.push('No JSX elements found (View, Text, ScrollView)');
  }

  // Check component export
  if (!code.match(/export\s+(const|function)\s+[A-Z]/)) {
    issues.push('No exported component found (should start with capital letter)');
  }

  // Check for styles
  if (!code.includes('styles') && !code.includes('createStyles')) {
    issues.push('No styles definition found');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Compiles file and validates it as React Native component
 */
export function compileAndValidate(code: string, filename = 'test.tsx'): {
  compilation: CompilationResult;
  validation: ReturnType<typeof validateReactNativeComponent>;
} {
  const compilation = compileTypeScript(code, filename);
  const validation = validateReactNativeComponent(code);

  return { compilation, validation };
}
