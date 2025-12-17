/**
 * Конвертер SVG в React Native компоненты
 * Преобразует SVG файлы в компоненты react-native-svg с поддержкой типизации
 */

// Интерфейсы для конвертации
export interface SVGConversionOptions {
  componentName: string;
  defaultSize?: number;
  defaultColor?: string;
  optimizeSvg?: boolean;
  exportType?: 'default' | 'named';
}

export interface IconSetOptions {
  icons: Array<{ name: string; svg: string }>;
  setName?: string; // например, 'AppIcons'
}

export interface ConversionResult {
  componentCode: string;
  imports: string[];
  propsInterface: string;
}

// SVG элементы и их React Native эквиваленты
const SVG_ELEMENT_MAP: Record<string, string> = {
  svg: 'Svg',
  circle: 'Circle',
  ellipse: 'Ellipse',
  g: 'G',
  line: 'Line',
  path: 'Path',
  polygon: 'Polygon',
  polyline: 'Polyline',
  rect: 'Rect',
  text: 'Text',
  tspan: 'TSpan',
  defs: 'Defs',
  linearGradient: 'LinearGradient',
  radialGradient: 'RadialGradient',
  stop: 'Stop',
  clipPath: 'ClipPath',
  mask: 'Mask',
  use: 'Use',
};

// Атрибуты, которые нужно удалить при оптимизации
const REMOVABLE_ATTRS = [
  'xmlns',
  'xmlns:xlink',
  'xml:space',
  'version',
  'id',
  'data-name',
  'class',
];

// Атрибуты SVG и их React Native эквиваленты
const ATTR_MAP: Record<string, string> = {
  'fill-opacity': 'fillOpacity',
  'fill-rule': 'fillRule',
  'stroke-dasharray': 'strokeDasharray',
  'stroke-dashoffset': 'strokeDashoffset',
  'stroke-linecap': 'strokeLinecap',
  'stroke-linejoin': 'strokeLinejoin',
  'stroke-miterlimit': 'strokeMiterlimit',
  'stroke-opacity': 'strokeOpacity',
  'stroke-width': 'strokeWidth',
  'clip-path': 'clipPath',
  'clip-rule': 'clipRule',
  'stop-color': 'stopColor',
  'stop-opacity': 'stopOpacity',
  'text-anchor': 'textAnchor',
  'font-family': 'fontFamily',
  'font-size': 'fontSize',
  'font-weight': 'fontWeight',
};

interface ParsedElement {
  tag: string;
  attributes: Record<string, string>;
  children: ParsedElement[];
  text?: string;
}

/**
 * Простой парсер SVG в AST (без внешних зависимостей)
 */
function parseSvgToAst(svgContent: string): ParsedElement {
  // Удаляем комментарии
  const cleaned = svgContent.replace(/<!--[\s\S]*?-->/g, '');

  const root: ParsedElement = {
    tag: 'root',
    attributes: {},
    children: [],
  };

  const stack: ParsedElement[] = [root];

  // Регулярка для разбора тегов
  const tagRegex = /<([a-zA-Z][a-zA-Z0-9]*)\s*([^>]*?)\s*(\/?)>/g;
  const closeTagRegex = /<\/([a-zA-Z][a-zA-Z0-9]*)>/g;

  let lastIndex = 0;
  let match;

  // Объединяем открывающие и закрывающие теги
  const allMatches: Array<{
    type: 'open' | 'close' | 'selfClose';
    tag: string;
    attrs?: string;
    index: number;
    length: number;
  }> = [];

  // Собираем все открывающие теги
  while ((match = tagRegex.exec(cleaned)) !== null) {
    const isSelfClosing = match[3] === '/';
    allMatches.push({
      type: isSelfClosing ? 'selfClose' : 'open',
      tag: match[1],
      attrs: match[2],
      index: match.index,
      length: match[0].length,
    });
  }

  // Собираем все закрывающие теги
  while ((match = closeTagRegex.exec(cleaned)) !== null) {
    allMatches.push({
      type: 'close',
      tag: match[1],
      index: match.index,
      length: match[0].length,
    });
  }

  // Сортируем по позиции
  allMatches.sort((a, b) => a.index - b.index);

  // Обрабатываем теги по порядку
  allMatches.forEach((item) => {
    const current = stack[stack.length - 1];

    // Извлекаем текстовый контент между тегами
    if (item.index > lastIndex) {
      const text = cleaned.substring(lastIndex, item.index).trim();
      if (text && current) {
        current.text = text;
      }
    }

    if (item.type === 'open' || item.type === 'selfClose') {
      const element: ParsedElement = {
        tag: item.tag,
        attributes: parseAttributes(item.attrs || ''),
        children: [],
      };

      current.children.push(element);

      if (item.type === 'open') {
        stack.push(element);
      }
    } else if (item.type === 'close') {
      stack.pop();
    }

    lastIndex = item.index + item.length;
  });

  return root.children[0] || root;
}

/**
 * Парсинг атрибутов из строки
 */
function parseAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([a-zA-Z][a-zA-Z0-9-:]*)\s*=\s*["']([^"']*)["']/g;
  let match;

  while ((match = attrRegex.exec(attrString)) !== null) {
    attrs[match[1]] = match[2];
  }

  return attrs;
}

/**
 * Оптимизация SVG - удаление ненужных атрибутов
 */
export function optimizeSvg(svgContent: string): string {
  let optimized = svgContent;

  // Удаляем ненужные атрибуты
  REMOVABLE_ATTRS.forEach((attr) => {
    const regex = new RegExp(`\\s${attr}="[^"]*"`, 'g');
    optimized = optimized.replace(regex, '');
  });

  // Удаляем пустые группы
  optimized = optimized.replace(/<g\s*><\/g>/g, '');

  // Удаляем лишние пробелы
  optimized = optimized.replace(/\s+/g, ' ').trim();

  return optimized;
}

/**
 * Извлечение цветов из SVG
 */
export function extractSvgColors(svgContent: string): string[] {
  const colors = new Set<string>();
  const colorRegex = /(fill|stroke)="(#[0-9a-fA-F]{3,6}|rgb[a]?\([^)]+\)|[a-z]+)"/g;
  let match;

  while ((match = colorRegex.exec(svgContent)) !== null) {
    const color = match[2];
    if (color !== 'none' && color !== 'transparent' && color !== 'currentColor') {
      colors.add(color);
    }
  }

  return Array.from(colors);
}

/**
 * Конвертация атрибутов SVG в React Native props
 */
function convertAttributes(
  attributes: Record<string, string>,
  isRoot: boolean,
  options: { replaceColor?: boolean; colorPropName?: string }
): Record<string, string> {
  const converted: Record<string, string> = {};

  Object.entries(attributes).forEach(([key, value]) => {
    // Пропускаем ненужные атрибуты
    if (REMOVABLE_ATTRS.includes(key)) {
      return;
    }

    // Конвертируем названия атрибутов
    const propName = ATTR_MAP[key] || key;

    // Специальная обработка цветов
    if (options.replaceColor && (key === 'fill' || key === 'stroke')) {
      if (value !== 'none' && value !== 'transparent') {
        converted[propName] = `{${options.colorPropName || 'color'}}`;
        return;
      }
    }

    // Конвертируем числовые значения
    if (isNumeric(value) && key !== 'd' && key !== 'viewBox') {
      converted[propName] = value;
    } else {
      converted[propName] = value;
    }
  });

  return converted;
}

/**
 * Проверка, является ли строка числом
 */
function isNumeric(str: string): boolean {
  return !isNaN(parseFloat(str)) && isFinite(Number(str));
}

/**
 * Преобразование AST в JSX код
 */
function astToJsx(
  element: ParsedElement,
  indent: number = 0,
  isRoot: boolean = false,
  options: { replaceColor?: boolean; colorPropName?: string } = {}
): string {
  const indentStr = '  '.repeat(indent);

  // Получаем React Native компонент
  const componentName = SVG_ELEMENT_MAP[element.tag] || element.tag;

  // Конвертируем атрибуты
  const attrs = convertAttributes(element.attributes, isRoot, options);

  // Формируем строку атрибутов
  const attrStrings: string[] = [];

  Object.entries(attrs).forEach(([key, value]) => {
    if (value.startsWith('{') && value.endsWith('}')) {
      // Это уже выражение
      attrStrings.push(`${key}=${value}`);
    } else if (isNumeric(value) && key !== 'd' && key !== 'viewBox') {
      attrStrings.push(`${key}={${value}}`);
    } else {
      attrStrings.push(`${key}="${value}"`);
    }
  });

  const attrStr = attrStrings.length > 0 ? ' ' + attrStrings.join(' ') : '';

  // Обрабатываем детей
  if (element.children.length === 0 && !element.text) {
    return `${indentStr}<${componentName}${attrStr} />`;
  }

  let childrenJsx = '';
  if (element.text) {
    childrenJsx = element.text;
  } else {
    childrenJsx = element.children
      .map((child) => astToJsx(child, indent + 1, false, options))
      .join('\n');
  }

  if (element.children.length === 0) {
    return `${indentStr}<${componentName}${attrStr}>${childrenJsx}</${componentName}>`;
  }

  return `${indentStr}<${componentName}${attrStr}>\n${childrenJsx}\n${indentStr}</${componentName}>`;
}

/**
 * Генерация TypeScript интерфейса для пропсов иконки
 */
function generatePropsInterface(
  componentName: string,
  hasColorProp: boolean,
  hasSizeProp: boolean
): string {
  const props: string[] = [];

  if (hasSizeProp) {
    props.push('  size?: number;');
  }
  if (hasColorProp) {
    props.push('  color?: string;');
  }
  props.push('  style?: any;');

  return `export interface ${componentName}Props {\n${props.join('\n')}\n}`;
}

/**
 * Основная функция конвертации SVG в React Native компонент
 */
export function convertSvgToComponent(
  svgContent: string,
  options: SVGConversionOptions
): ConversionResult {
  const {
    componentName,
    defaultSize = 24,
    defaultColor = '#000000',
    optimizeSvg: shouldOptimize = true,
    exportType = 'named',
  } = options;

  // Оптимизируем SVG если нужно
  const processedSvg = shouldOptimize ? optimizeSvg(svgContent) : svgContent;

  // Парсим SVG в AST
  const ast = parseSvgToAst(processedSvg);

  // Извлекаем цвета для определения, нужен ли пропс color
  const colors = extractSvgColors(processedSvg);
  const hasMultipleColors = colors.length > 1;
  const hasColors = colors.length > 0;

  // Извлекаем viewBox и размеры
  const viewBox = ast.attributes.viewBox || ast.attributes.viewbox || '0 0 24 24';
  const [, , vbWidth, vbHeight] = viewBox.split(' ').map(Number);

  // Определяем используемые компоненты
  const usedComponents = new Set<string>();
  function collectComponents(element: ParsedElement) {
    const comp = SVG_ELEMENT_MAP[element.tag];
    if (comp) usedComponents.add(comp);
    element.children.forEach(collectComponents);
  }
  collectComponents(ast);

  // Формируем импорты
  const imports = [`import React from 'react';`, `import { ${Array.from(usedComponents).join(', ')} } from 'react-native-svg';`];

  // Генерируем интерфейс пропсов
  const propsInterface = generatePropsInterface(componentName, hasColors && !hasMultipleColors, true);

  // Генерируем JSX для children
  const childrenJsx = ast.children
    .map((child) =>
      astToJsx(child, 2, false, {
        replaceColor: hasColors && !hasMultipleColors,
        colorPropName: 'color',
      })
    )
    .join('\n');

  // Генерируем код компонента
  const componentCode = `${imports.join('\n')}

${propsInterface}

${exportType === 'default' ? 'export default' : 'export'} function ${componentName}({
  size = ${defaultSize},
  color = '${defaultColor}',
  style,
}: ${componentName}Props) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="${viewBox}"
      style={style}
    >
${childrenJsx}
    </Svg>
  );
}`;

  return {
    componentCode,
    imports,
    propsInterface,
  };
}

/**
 * Генерация набора иконок из нескольких SVG
 */
export function generateIconSet(options: IconSetOptions): string {
  const { icons, setName = 'Icons' } = options;

  // Конвертируем все иконки
  const convertedIcons = icons.map((icon) => {
    const result = convertSvgToComponent(icon.svg, {
      componentName: icon.name,
      exportType: 'named',
    });
    return {
      name: icon.name,
      code: result.componentCode,
      imports: result.imports,
    };
  });

  // Собираем все уникальные импорты
  const allImports = new Set<string>();
  convertedIcons.forEach((icon) => {
    icon.imports.forEach((imp) => allImports.add(imp));
  });

  // Собираем все компоненты react-native-svg
  const svgComponents = new Set<string>();
  convertedIcons.forEach((icon) => {
    const match = icon.imports.find((imp) => imp.includes('react-native-svg'));
    if (match) {
      const componentsMatch = match.match(/\{([^}]+)\}/);
      if (componentsMatch) {
        componentsMatch[1].split(',').forEach((comp) => {
          svgComponents.add(comp.trim());
        });
      }
    }
  });

  // Генерируем общий интерфейс
  const commonInterface = `export interface IconProps {
  size?: number;
  color?: string;
  style?: any;
}`;

  // Генерируем типы для набора иконок
  const iconNames = icons.map((icon) => `'${icon.name}'`).join(' | ');
  const iconSetInterface = `export interface ${setName}Props extends IconProps {
  name: ${iconNames};
}`;

  // Генерируем отдельные компоненты
  const individualComponents = convertedIcons.map((icon) => {
    // Удаляем импорты из отдельных компонентов, т.к. они будут в начале файла
    const codeWithoutImports = icon.code
      .split('\n')
      .filter((line) => !line.startsWith('import'))
      .join('\n')
      .trim();

    return codeWithoutImports;
  }).join('\n\n');

  // Генерируем основной компонент набора
  const iconSetComponent = `export function ${setName}({ name, ...props }: ${setName}Props) {
  switch (name) {
${icons.map((icon) => `    case '${icon.name}': return <${icon.name} {...props} />;`).join('\n')}
    default: return null;
  }
}`;

  // Собираем итоговый код
  const finalCode = `import React from 'react';
import { ${Array.from(svgComponents).join(', ')} } from 'react-native-svg';

${commonInterface}

${iconSetInterface}

${individualComponents}

${iconSetComponent}

// Экспорт констант с именами иконок
export const IconNames = {
${icons.map((icon) => `  ${icon.name}: '${icon.name}' as const,`).join('\n')}
};`;

  return finalCode;
}
