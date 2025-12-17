/**
 * TypeScript Compiler для проверки сгенерированного кода
 * Использует ts-morph для анализа и валидации TypeScript
 */

import { Project, ts, SourceFile, DiagnosticCategory } from 'ts-morph';
import { join } from 'path';

export interface CompilationResult {
  /** Компиляция прошла успешно */
  success: boolean;
  /** Список ошибок */
  errors: CompilationError[];
  /** Список предупреждений */
  warnings: CompilationError[];
  /** Информация о файле */
  fileInfo?: {
    exports: string[];
    imports: string[];
    hasDefaultExport: boolean;
    componentName?: string;
  };
}

export interface CompilationError {
  /** Сообщение об ошибке */
  message: string;
  /** Номер строки */
  line?: number;
  /** Номер колонки */
  column?: number;
  /** Код ошибки */
  code?: number;
}

/**
 * Компилирует TypeScript код и возвращает результат
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
      // Разрешаем любые импорты (для тестов не важны внешние зависимости)
      noImplicitAny: false,
      allowSyntheticDefaultImports: true,
      // Отключаем автоматическое разрешение типов
      types: [],
      typeRoots: [],
    },
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });

  // Добавляем минимальные типы для React Native
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

  // Добавляем типы для часто используемых библиотек
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

  // Добавляем файл с кодом
  const sourceFile = project.createSourceFile(filename, code);

  // Получаем диагностику
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

  // Извлекаем информацию о файле
  const fileInfo = extractFileInfo(sourceFile);

  return {
    success: errors.length === 0,
    errors,
    warnings,
    fileInfo,
  };
}

/**
 * Извлекает информацию о файле
 */
function extractFileInfo(sourceFile: SourceFile): CompilationResult['fileInfo'] {
  const exports: string[] = [];
  const imports: string[] = [];
  let hasDefaultExport = false;
  let componentName: string | undefined;

  // Извлекаем импорты
  for (const importDecl of sourceFile.getImportDeclarations()) {
    imports.push(importDecl.getModuleSpecifierValue());
  }

  // Извлекаем экспорты
  for (const exportDecl of sourceFile.getExportDeclarations()) {
    const namedExports = exportDecl.getNamedExports();
    for (const namedExport of namedExports) {
      exports.push(namedExport.getName());
    }
  }

  // Проверяем экспортированные функции/переменные
  for (const func of sourceFile.getFunctions()) {
    if (func.isExported()) {
      const name = func.getName();
      if (name) {
        exports.push(name);
        // Предполагаем, что функция с PascalCase именем - это компонент
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
      // Предполагаем, что переменная с PascalCase именем - это компонент
      if (/^[A-Z]/.test(name)) {
        componentName = name;
      }
    }
  }

  // Проверяем экспортированные интерфейсы/типы
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
 * Проверяет, что код содержит ожидаемые элементы React Native компонента
 */
export function validateReactNativeComponent(code: string): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Проверяем импорты React
  if (!code.includes("from 'react'") && !code.includes('from "react"')) {
    issues.push('Missing React import');
  }

  // Проверяем импорты React Native
  if (!code.includes("from 'react-native'") && !code.includes('from "react-native"')) {
    issues.push('Missing React Native import');
  }

  // Проверяем наличие JSX
  if (!code.includes('<View') && !code.includes('<Text') && !code.includes('<ScrollView')) {
    issues.push('No JSX elements found (View, Text, ScrollView)');
  }

  // Проверяем экспорт компонента
  if (!code.match(/export\s+(const|function)\s+[A-Z]/)) {
    issues.push('No exported component found (should start with capital letter)');
  }

  // Проверяем наличие стилей
  if (!code.includes('styles') && !code.includes('createStyles')) {
    issues.push('No styles definition found');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Компилирует файл и проверяет его как React Native компонент
 */
export function compileAndValidate(code: string, filename = 'test.tsx'): {
  compilation: CompilationResult;
  validation: ReturnType<typeof validateReactNativeComponent>;
} {
  const compilation = compileTypeScript(code, filename);
  const validation = validateReactNativeComponent(code);

  return { compilation, validation };
}
