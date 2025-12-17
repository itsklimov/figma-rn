/**
 * Обнаружение вариантов и состояний компонентов Figma
 * Анализ компонентных наборов, определение интерактивных состояний и генерация TypeScript типов
 */

/**
 * Свойство варианта компонента
 */
export interface VariantProperty {
  name: string; // например, "size", "type", "state"
  values: string[]; // например, ["small", "medium", "large"]
  defaultValue: string;
}

/**
 * Стилевое переопределение для состояния
 */
export interface StateStyle {
  state: 'default' | 'pressed' | 'disabled' | 'loading' | 'error' | 'hover' | 'focused';
  styleOverrides: Record<string, any>;
  hasIndicator: boolean; // индикатор загрузки, иконка ошибки и т.д.
}

/**
 * Результат обнаружения вариантов
 */
export interface VariantDetection {
  isComponentSet: boolean;
  variants: VariantProperty[];
  states: StateStyle[];
  suggestedPropsInterface: string; // TypeScript интерфейс
  suggestedStyleVariants: string; // код вариантов createStyles
}

/**
 * Интерфейс узла Figma с поддержкой компонентных наборов
 */
interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];

  // Свойства компонентов
  componentPropertyDefinitions?: {
    [propertyName: string]: {
      type: 'VARIANT' | 'TEXT' | 'BOOLEAN' | 'INSTANCE_SWAP';
      defaultValue: any;
      variantOptions?: string[];
    };
  };

  // Визуальные свойства для обнаружения состояний
  opacity?: number;
  visible?: boolean;
  fills?: Array<{
    type: string;
    color?: {
      r: number;
      g: number;
      b: number;
      a: number;
    };
    opacity?: number;
  }>;
  effects?: Array<{
    type: string;
    visible?: boolean;
  }>;

  // Переопределения свойств для экземпляров
  variantProperties?: Record<string, string>;
}

/**
 * Нормализация строки для сравнения (lowercase, без спецсимволов)
 */
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Преобразование строки в camelCase
 */
function toCamelCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase());
}

/**
 * Преобразование строки в PascalCase
 */
function toPascalCase(str: string): string {
  const camel = toCamelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

/**
 * Проверка, является ли узел компонентным набором
 */
function isComponentSet(node: FigmaNode): boolean {
  return node.type === 'COMPONENT_SET';
}

/**
 * Парсинг имени варианта компонента для извлечения свойств
 * Примеры: "State=Pressed", "Type=Primary, Size=Large"
 */
function parseVariantName(name: string): Record<string, string> {
  const properties: Record<string, string> = {};

  // Разделение по запятой для множественных свойств
  const parts = name.split(',').map(p => p.trim());

  for (const part of parts) {
    // Поиск паттерна "Property=Value"
    const match = part.match(/^([^=]+)=(.+)$/);
    if (match) {
      const propName = match[1].trim();
      const propValue = match[2].trim();
      properties[propName] = propValue;
    }
  }

  return properties;
}

/**
 * Извлечение свойств вариантов из дочерних компонентов набора
 */
function extractVariantPropertiesFromChildren(children: FigmaNode[]): VariantProperty[] {
  const propertyMap = new Map<string, Set<string>>();

  // Обход всех дочерних компонентов
  for (const child of children) {
    if (child.type === 'COMPONENT') {
      const properties = parseVariantName(child.name);

      // Сбор всех значений для каждого свойства
      for (const [propName, propValue] of Object.entries(properties)) {
        if (!propertyMap.has(propName)) {
          propertyMap.set(propName, new Set());
        }
        propertyMap.get(propName)!.add(propValue);
      }
    }
  }

  // Преобразование в массив VariantProperty
  const variants: VariantProperty[] = [];
  for (const [name, valuesSet] of propertyMap.entries()) {
    const values = Array.from(valuesSet).sort();
    variants.push({
      name,
      values,
      defaultValue: values[0], // первое значение по умолчанию
    });
  }

  return variants;
}

/**
 * Извлечение свойств вариантов из API определений компонента
 */
function extractVariantPropertiesFromDefinitions(
  definitions: FigmaNode['componentPropertyDefinitions']
): VariantProperty[] {
  if (!definitions) {
    return [];
  }

  const variants: VariantProperty[] = [];

  for (const [propName, propDef] of Object.entries(definitions)) {
    if (propDef.type === 'VARIANT' && propDef.variantOptions) {
      variants.push({
        name: propName,
        values: propDef.variantOptions,
        defaultValue: propDef.defaultValue || propDef.variantOptions[0],
      });
    }
  }

  return variants;
}

/**
 * Определение типа состояния по имени свойства или значения
 */
function detectStateType(propName: string, propValue: string): StateStyle['state'] | null {
  const normalizedProp = normalizeString(propName);
  const normalizedValue = normalizeString(propValue);

  // Проверка по имени свойства
  if (normalizedProp === 'state' || normalizedProp === 'variant' || normalizedProp === 'status') {
    // Проверка значения
    if (normalizedValue.includes('press') || normalizedValue === 'active') {
      return 'pressed';
    }
    if (normalizedValue.includes('disable')) {
      return 'disabled';
    }
    if (normalizedValue.includes('load')) {
      return 'loading';
    }
    if (normalizedValue.includes('error') || normalizedValue.includes('invalid')) {
      return 'error';
    }
    if (normalizedValue.includes('hover')) {
      return 'hover';
    }
    if (normalizedValue.includes('focus')) {
      return 'focused';
    }
    if (normalizedValue.includes('default') || normalizedValue.includes('normal') || normalizedValue === 'idle') {
      return 'default';
    }
  }

  return null;
}

/**
 * Анализ визуальных характеристик узла для определения состояния
 */
function analyzeVisualState(node: FigmaNode): Partial<StateStyle> {
  const styleOverrides: Record<string, any> = {};
  let hasIndicator = false;

  // Проверка прозрачности (disabled часто имеет opacity: 0.5)
  if (node.opacity !== undefined && node.opacity < 1) {
    styleOverrides.opacity = node.opacity;
    if (node.opacity <= 0.6) {
      // Вероятно disabled состояние
      hasIndicator = true;
    }
  }

  // Проверка видимости
  if (node.visible === false) {
    styleOverrides.display = 'none';
  }

  // Анализ заливок для изменений цвета
  if (node.fills && node.fills.length > 0) {
    const primaryFill = node.fills[0];
    if (primaryFill.type === 'SOLID' && primaryFill.color) {
      const { r, g, b, a } = primaryFill.color;
      styleOverrides.backgroundColor = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
    }
  }

  // Поиск индикаторов (спиннеры загрузки, иконки ошибок)
  if (node.children) {
    for (const child of node.children) {
      const childName = normalizeString(child.name);

      // Индикаторы загрузки
      if (childName.includes('spinner') || childName.includes('loader') || childName.includes('loading')) {
        hasIndicator = true;
      }

      // Индикаторы ошибок
      if (childName.includes('error') || childName.includes('alert') || childName.includes('warning')) {
        hasIndicator = true;
      }

      // Индикаторы успеха
      if (childName.includes('check') || childName.includes('success')) {
        hasIndicator = true;
      }
    }
  }

  return { styleOverrides, hasIndicator };
}

/**
 * Обнаружение состояний из вариантов и дочерних узлов
 */
function detectStates(node: FigmaNode, variants: VariantProperty[]): StateStyle[] {
  const states: StateStyle[] = [];
  const stateMap = new Map<StateStyle['state'], Partial<StateStyle>>();

  // Инициализация default состояния
  stateMap.set('default', {
    state: 'default',
    styleOverrides: {},
    hasIndicator: false,
  });

  // Анализ вариантов для поиска состояний
  for (const variant of variants) {
    for (const value of variant.values) {
      const stateType = detectStateType(variant.name, value);
      if (stateType && !stateMap.has(stateType)) {
        stateMap.set(stateType, {
          state: stateType,
          styleOverrides: {},
          hasIndicator: false,
        });
      }
    }
  }

  // Анализ дочерних компонентов для извлечения стилевых переопределений
  if (node.children) {
    for (const child of node.children) {
      if (child.type === 'COMPONENT') {
        const properties = parseVariantName(child.name);

        // Определение состояния этого варианта
        let detectedState: StateStyle['state'] | null = null;
        for (const [propName, propValue] of Object.entries(properties)) {
          const state = detectStateType(propName, propValue);
          if (state) {
            detectedState = state;
            break;
          }
        }

        if (detectedState) {
          // Анализ визуальных характеристик
          const visual = analyzeVisualState(child);
          const existing = stateMap.get(detectedState);

          stateMap.set(detectedState, {
            state: detectedState,
            styleOverrides: { ...existing?.styleOverrides, ...visual.styleOverrides },
            hasIndicator: existing?.hasIndicator || visual.hasIndicator || false,
          });
        }
      }
    }
  }

  // Преобразование Map в массив
  for (const stateData of stateMap.values()) {
    states.push(stateData as StateStyle);
  }

  return states;
}

/**
 * Генерация TypeScript интерфейса для пропсов вариантов
 */
function generatePropsInterface(componentName: string, variants: VariantProperty[]): string {
  const interfaceName = `${toPascalCase(componentName)}Props`;

  let code = `interface ${interfaceName} {\n`;

  for (const variant of variants) {
    const propName = toCamelCase(variant.name);
    const propType = variant.values.map(v => `'${v}'`).join(' | ');

    code += `  /** Вариант ${variant.name} */\n`;
    code += `  ${propName}?: ${propType};\n`;
  }

  code += `}\n`;

  return code;
}

/**
 * Генерация кода стилевых вариантов для createStyles
 */
function generateStyleVariantsCode(states: StateStyle[]): string {
  let code = `const styles = StyleSheet.create({\n`;
  code += `  container: {\n`;
  code += `    // базовые стили\n`;
  code += `  },\n`;

  for (const state of states) {
    if (state.state === 'default') {
      continue; // default уже включен в container
    }

    const stateName = state.state;
    code += `  ${stateName}: {\n`;

    for (const [key, value] of Object.entries(state.styleOverrides)) {
      if (typeof value === 'string') {
        code += `    ${key}: '${value}',\n`;
      } else if (typeof value === 'number') {
        code += `    ${key}: ${value},\n`;
      } else {
        code += `    ${key}: ${JSON.stringify(value)},\n`;
      }
    }

    code += `  },\n`;
  }

  code += `});\n`;

  return code;
}

/**
 * Основная функция обнаружения вариантов и состояний
 *
 * @param node - узел Figma для анализа
 * @returns результат обнаружения вариантов и состояний
 */
export function detectVariantsAndStates(node: any): VariantDetection {
  const figmaNode = node as FigmaNode;

  // Проверка, является ли узел компонентным набором
  const isSet = isComponentSet(figmaNode);

  let variants: VariantProperty[] = [];

  if (isSet && figmaNode.children) {
    // Извлечение вариантов из дочерних компонентов
    variants = extractVariantPropertiesFromChildren(figmaNode.children);
  } else if (figmaNode.componentPropertyDefinitions) {
    // Извлечение вариантов из API определений
    variants = extractVariantPropertiesFromDefinitions(figmaNode.componentPropertyDefinitions);
  }

  // Обнаружение состояний
  const states = detectStates(figmaNode, variants);

  // Генерация TypeScript интерфейса
  const suggestedPropsInterface = variants.length > 0
    ? generatePropsInterface(figmaNode.name, variants)
    : '';

  // Генерация кода стилевых вариантов
  const suggestedStyleVariants = states.length > 0
    ? generateStyleVariantsCode(states)
    : '';

  return {
    isComponentSet: isSet,
    variants,
    states,
    suggestedPropsInterface,
    suggestedStyleVariants,
  };
}

/**
 * Генерация пропсов вариантов для компонента
 *
 * @param detection - результат обнаружения вариантов
 * @param componentName - имя компонента
 * @returns TypeScript код интерфейса пропсов
 */
export function generateVariantProps(detection: VariantDetection, componentName: string): string {
  if (detection.variants.length === 0) {
    return `// Вариантов не обнаружено для ${componentName}`;
  }

  return generatePropsInterface(componentName, detection.variants);
}

/**
 * Генерация стилевых вариантов
 *
 * @param detection - результат обнаружения вариантов
 * @returns код React Native стилей с вариантами
 */
export function generateStyleVariants(detection: VariantDetection): string {
  if (detection.states.length === 0) {
    return `// Состояний не обнаружено`;
  }

  let code = `// Обнаруженные состояния: ${detection.states.map(s => s.state).join(', ')}\n\n`;
  code += detection.suggestedStyleVariants;

  // Дополнительная информация об индикаторах
  const statesWithIndicators = detection.states.filter(s => s.hasIndicator);
  if (statesWithIndicators.length > 0) {
    code += `\n// Состояния с индикаторами: ${statesWithIndicators.map(s => s.state).join(', ')}\n`;
    code += `// Рекомендуется добавить условный рендеринг для индикаторов загрузки/ошибок\n`;
  }

  return code;
}
