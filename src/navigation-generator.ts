/**
 * Генератор типов навигации и структуры навигаторов для React Navigation
 * Анализирует экраны из Figma и создает типобезопасную навигационную структуру
 */

import { compareTwoStrings } from 'string-similarity';

/**
 * Интерфейс для определения экрана навигации
 */
export interface NavigationScreen {
  name: string;
  params?: Record<string, string>; // например, { userId: 'string', productId: 'string' }
  navigatorType: 'stack' | 'tab' | 'drawer' | 'root';
}

/**
 * Интерфейс для вложенных навигаторов
 */
export interface NestedNavigator {
  name: string;
  type: 'stack' | 'tab' | 'drawer';
  screens: string[];
}

/**
 * Интерфейс для структуры навигации приложения
 */
export interface NavigationStructure {
  screens: NavigationScreen[];
  rootNavigator: 'stack' | 'tab' | 'drawer';
  nestedNavigators: NestedNavigator[];
}

/**
 * Интерфейс для входных данных экрана из Figma
 */
export interface FigmaScreen {
  name: string;
  node: any;
}

/**
 * Тип элемента навигации, обнаруженного в дизайне
 */
interface NavigationElement {
  type: 'back_button' | 'tab_bar' | 'drawer_menu' | 'hamburger_icon' | 'bottom_nav';
  confidence: number;
  reason: string;
}

/**
 * Нормализация имени экрана
 * Убирает суффиксы "Screen", "Page", "View" и другие вариации
 */
function normalizeScreenName(name: string): string {
  return name
    .replace(/Screen$/i, '')
    .replace(/Page$/i, '')
    .replace(/View$/i, '')
    .replace(/Component$/i, '')
    .replace(/\s+/g, '')
    .replace(/[^a-zA-Z0-9]/g, '');
}

/**
 * Определение параметров навигации из содержимого экрана
 * Анализирует узлы Figma для поиска динамических данных
 */
function inferNavigationParams(node: any): Record<string, string> | undefined {
  const params: Record<string, string> = {};

  // Паттерны для определения типов параметров
  const paramPatterns = {
    id: /\b(id|ID|Id)\b/,
    userId: /\b(user[-_]?id|userId)\b/i,
    productId: /\b(product[-_]?id|productId|item[-_]?id)\b/i,
    orderId: /\b(order[-_]?id|orderId)\b/i,
    categoryId: /\b(category[-_]?id|categoryId)\b/i,
    masterId: /\b(master[-_]?id|masterId|specialist[-_]?id)\b/i,
    serviceId: /\b(service[-_]?id|serviceId)\b/i,
    visitId: /\b(visit[-_]?id|visitId|appointment[-_]?id)\b/i,
  };

  // Рекурсивный поиск параметров в структуре узла
  function searchForParams(n: any) {
    if (!n) return;

    // Проверка имени узла
    if (n.name) {
      for (const [paramName, pattern] of Object.entries(paramPatterns)) {
        if (pattern.test(n.name)) {
          params[paramName] = 'string';
        }
      }
    }

    // Проверка текстового содержимого на наличие плейсхолдеров
    if (n.characters) {
      const text = n.characters;
      // Поиск плейсхолдеров типа {userId}, :userId, $userId
      const placeholderMatches = text.matchAll(/[{:$](\w+)[}]?/g);
      for (const match of placeholderMatches) {
        const paramName = match[1];
        params[paramName] = 'string';
      }
    }

    // Рекурсивный поиск в дочерних элементах
    if (n.children && Array.isArray(n.children)) {
      n.children.forEach((child: any) => searchForParams(child));
    }
  }

  searchForParams(node);

  return Object.keys(params).length > 0 ? params : undefined;
}

/**
 * Определение элементов навигации в узле Figma
 */
function detectNavigationElements(node: any): NavigationElement[] {
  const elements: NavigationElement[] = [];

  function searchNode(n: any, depth: number = 0) {
    if (!n) return;

    const nodeName = (n.name || '').toLowerCase();
    const nodeType = n.type || '';

    // Определение кнопки "Назад"
    if (nodeName.includes('back') ||
        nodeName.includes('назад') ||
        nodeName.includes('arrow') && nodeName.includes('left')) {
      elements.push({
        type: 'back_button',
        confidence: 0.9,
        reason: `Обнаружена кнопка назад: "${n.name}"`
      });
    }

    // Определение Tab Bar (нижняя навигация)
    if (nodeName.includes('tab') && (nodeName.includes('bar') || nodeName.includes('navigation'))) {
      elements.push({
        type: 'tab_bar',
        confidence: 0.95,
        reason: `Обнаружена tab bar: "${n.name}"`
      });
    }

    // Определение Bottom Navigation
    if (nodeName.includes('bottom') && nodeName.includes('nav')) {
      elements.push({
        type: 'bottom_nav',
        confidence: 0.95,
        reason: `Обнаружена нижняя навигация: "${n.name}"`
      });
    }

    // Определение иконки гамбургера (drawer menu)
    if (nodeName.includes('hamburger') ||
        nodeName.includes('menu') && nodeName.includes('icon') ||
        nodeName.includes('drawer') ||
        nodeName.includes('sidebar')) {
      elements.push({
        type: 'hamburger_icon',
        confidence: 0.85,
        reason: `Обнаружено меню drawer: "${n.name}"`
      });
    }

    // Определение drawer menu по структуре
    if (nodeName.includes('drawer') ||
        nodeName.includes('side') && nodeName.includes('menu')) {
      elements.push({
        type: 'drawer_menu',
        confidence: 0.9,
        reason: `Обнаружено боковое меню: "${n.name}"`
      });
    }

    // Анализ дочерних элементов
    if (n.children && Array.isArray(n.children)) {
      n.children.forEach((child: any) => searchNode(child, depth + 1));
    }
  }

  searchNode(node);
  return elements;
}

/**
 * Определение типа навигатора на основе обнаруженных элементов
 */
function determineNavigatorType(
  elements: NavigationElement[],
  screenName: string
): 'stack' | 'tab' | 'drawer' | 'root' {

  // Приоритеты: tab > drawer > stack
  const hasTabBar = elements.some(e => e.type === 'tab_bar' || e.type === 'bottom_nav');
  const hasDrawer = elements.some(e => e.type === 'drawer_menu' || e.type === 'hamburger_icon');
  const hasBackButton = elements.some(e => e.type === 'back_button');

  // Tab навигация имеет наивысший приоритет
  if (hasTabBar) {
    return 'tab';
  }

  // Drawer навигация
  if (hasDrawer) {
    return 'drawer';
  }

  // Stack навигация (если есть кнопка назад)
  if (hasBackButton) {
    return 'stack';
  }

  // Определение по имени экрана
  const lowerName = screenName.toLowerCase();
  if (lowerName.includes('home') || lowerName.includes('main') || lowerName === 'index') {
    return 'root';
  }

  // По умолчанию stack
  return 'stack';
}

/**
 * Группировка экранов по типу навигатора для создания вложенной структуры
 */
function groupScreensByNavigator(screens: NavigationScreen[]): NestedNavigator[] {
  const navigators: NestedNavigator[] = [];

  // Группируем tab экраны
  const tabScreens = screens.filter(s => s.navigatorType === 'tab');
  if (tabScreens.length > 0) {
    navigators.push({
      name: 'TabNavigator',
      type: 'tab',
      screens: tabScreens.map(s => s.name)
    });
  }

  // Группируем drawer экраны
  const drawerScreens = screens.filter(s => s.navigatorType === 'drawer');
  if (drawerScreens.length > 0) {
    navigators.push({
      name: 'DrawerNavigator',
      type: 'drawer',
      screens: drawerScreens.map(s => s.name)
    });
  }

  // Остальные экраны идут в основной stack
  const stackScreens = screens.filter(
    s => s.navigatorType === 'stack' || s.navigatorType === 'root'
  );
  if (stackScreens.length > 0) {
    navigators.push({
      name: 'RootStackNavigator',
      type: 'stack',
      screens: stackScreens.map(s => s.name)
    });
  }

  return navigators;
}

/**
 * Определение корневого типа навигатора
 */
function determineRootNavigator(screens: NavigationScreen[]): 'stack' | 'tab' | 'drawer' {
  const navigatorCounts = {
    stack: screens.filter(s => s.navigatorType === 'stack' || s.navigatorType === 'root').length,
    tab: screens.filter(s => s.navigatorType === 'tab').length,
    drawer: screens.filter(s => s.navigatorType === 'drawer').length,
  };

  // Если есть tab экраны, корневой навигатор обычно tab
  if (navigatorCounts.tab > 0 && navigatorCounts.tab >= navigatorCounts.stack * 0.3) {
    return 'tab';
  }

  // Если есть drawer экраны, корневой навигатор может быть drawer
  if (navigatorCounts.drawer > 0 && navigatorCounts.drawer >= navigatorCounts.stack * 0.3) {
    return 'drawer';
  }

  // По умолчанию stack
  return 'stack';
}

/**
 * Анализ структуры навигации из экранов Figma
 * Главная функция для определения типов навигаторов и их структуры
 *
 * @param screens - массив экранов из Figma с их узлами
 * @returns структура навигации с типами навигаторов и экранами
 */
export function analyzeNavigationStructure(screens: FigmaScreen[]): NavigationStructure {
  const analyzedScreens: NavigationScreen[] = [];

  for (const screen of screens) {
    const normalizedName = normalizeScreenName(screen.name);
    const elements = detectNavigationElements(screen.node);
    const navigatorType = determineNavigatorType(elements, normalizedName);
    const params = inferNavigationParams(screen.node);

    analyzedScreens.push({
      name: normalizedName,
      params,
      navigatorType,
    });
  }

  const rootNavigator = determineRootNavigator(analyzedScreens);
  const nestedNavigators = groupScreensByNavigator(analyzedScreens);

  return {
    screens: analyzedScreens,
    rootNavigator,
    nestedNavigators,
  };
}

/**
 * Генерация TypeScript типов для React Navigation
 * Создает типобезопасные типы для навигации в стиле React Navigation v6+
 *
 * @param structure - проанализированная структура навигации
 * @returns строка с TypeScript кодом определений типов
 */
export function generateNavigationTypes(structure: NavigationStructure): string {
  let code = `/**
 * Типы навигации для React Navigation
 * Автоматически сгенерировано из Figma дизайна
 */

import type { NavigatorScreenParams } from '@react-navigation/native';

`;

  // Генерация типов для каждого навигатора
  for (const navigator of structure.nestedNavigators) {
    const paramList = navigator.name.replace('Navigator', 'ParamList');

    code += `export type ${paramList} = {\n`;

    for (const screenName of navigator.screens) {
      const screen = structure.screens.find(s => s.name === screenName);
      if (!screen) continue;

      if (screen.params && Object.keys(screen.params).length > 0) {
        // Экран с параметрами
        const paramsType = `{\n${Object.entries(screen.params)
          .map(([key, type]) => `    ${key}: ${type};`)
          .join('\n')}\n  }`;
        code += `  ${screen.name}: ${paramsType};\n`;
      } else {
        // Экран без параметров
        code += `  ${screen.name}: undefined;\n`;
      }
    }

    code += `};\n\n`;
  }

  // Генерация корневого типа, если есть вложенные навигаторы
  if (structure.nestedNavigators.length > 1) {
    const rootParamList = `RootParamList`;
    code += `export type ${rootParamList} = {\n`;

    for (const navigator of structure.nestedNavigators) {
      const paramList = navigator.name.replace('Navigator', 'ParamList');
      code += `  ${navigator.name}: NavigatorScreenParams<${paramList}>;\n`;
    }

    code += `};\n\n`;
  }

  // Добавление declare global для типобезопасности
  const mainParamList = structure.nestedNavigators.length > 1
    ? 'RootParamList'
    : structure.nestedNavigators[0]?.name.replace('Navigator', 'ParamList') || 'RootStackParamList';

  code += `declare global {
  namespace ReactNavigation {
    interface RootParamList extends ${mainParamList} {}
  }
}\n`;

  return code;
}

/**
 * Генерация кода навигаторов для React Navigation
 * Создает готовый к использованию код с навигаторами
 *
 * @param structure - проанализированная структура навигации
 * @returns строка с React компонентом навигации
 */
export function generateNavigatorCode(structure: NavigationStructure): string {
  let code = `/**
 * Конфигурация навигации
 * Автоматически сгенерировано из Figma дизайна
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
`;

  // Импорты навигаторов
  const navigatorTypes = new Set(structure.nestedNavigators.map(n => n.type));

  if (navigatorTypes.has('stack')) {
    code += `import { createNativeStackNavigator } from '@react-navigation/native-stack';\n`;
  }
  if (navigatorTypes.has('tab')) {
    code += `import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';\n`;
  }
  if (navigatorTypes.has('drawer')) {
    code += `import { createDrawerNavigator } from '@react-navigation/drawer';\n`;
  }

  code += `\n// Импорты экранов\n`;
  for (const screen of structure.screens) {
    code += `import ${screen.name}Screen from './screens/${screen.name}Screen';\n`;
  }

  code += `\n// Импорты типов\nimport type {\n`;
  for (const navigator of structure.nestedNavigators) {
    const paramList = navigator.name.replace('Navigator', 'ParamList');
    code += `  ${paramList},\n`;
  }
  code += `} from './navigation.types';\n\n`;

  // Создание навигаторов
  for (const navigator of structure.nestedNavigators) {
    const paramList = navigator.name.replace('Navigator', 'ParamList');

    if (navigator.type === 'stack') {
      code += `const ${navigator.name.replace('Navigator', '')} = createNativeStackNavigator<${paramList}>();\n`;
    } else if (navigator.type === 'tab') {
      code += `const ${navigator.name.replace('Navigator', '')} = createBottomTabNavigator<${paramList}>();\n`;
    } else if (navigator.type === 'drawer') {
      code += `const ${navigator.name.replace('Navigator', '')} = createDrawerNavigator<${paramList}>();\n`;
    }
  }

  code += `\n`;

  // Генерация компонентов навигаторов
  for (const navigator of structure.nestedNavigators) {
    const navName = navigator.name.replace('Navigator', '');
    const NavigatorComponent = `${navName}.Navigator`;
    const ScreenComponent = `${navName}.Screen`;

    code += `function ${navigator.name}() {\n`;
    code += `  return (\n`;
    code += `    <${NavigatorComponent}>\n`;

    for (const screenName of navigator.screens) {
      const screen = structure.screens.find(s => s.name === screenName);
      if (!screen) continue;

      code += `      <${ScreenComponent}\n`;
      code += `        name="${screen.name}"\n`;
      code += `        component={${screen.name}Screen}\n`;

      // Добавление опций для экрана
      if (navigator.type === 'stack') {
        code += `        options={{ title: '${screen.name}' }}\n`;
      } else if (navigator.type === 'tab') {
        code += `        options={{\n`;
        code += `          tabBarLabel: '${screen.name}',\n`;
        code += `          // tabBarIcon: ({ color, size }) => <Icon name="${screen.name.toLowerCase()}" size={size} color={color} />,\n`;
        code += `        }}\n`;
      }

      code += `      />\n`;
    }

    code += `    </${NavigatorComponent}>\n`;
    code += `  );\n`;
    code += `}\n\n`;
  }

  // Генерация корневого компонента навигации
  code += `export default function Navigation() {\n`;
  code += `  return (\n`;
  code += `    <NavigationContainer>\n`;

  if (structure.nestedNavigators.length > 0) {
    const mainNavigator = structure.nestedNavigators[0];
    code += `      <${mainNavigator.name} />\n`;
  }

  code += `    </NavigationContainer>\n`;
  code += `  );\n`;
  code += `}\n`;

  return code;
}

/**
 * Генерация примера использования навигации
 * Создает документацию с примерами навигации между экранами
 *
 * @param structure - проанализированная структура навигации
 * @returns строка с Markdown документацией
 */
export function generateNavigationDocumentation(structure: NavigationStructure): string {
  let doc = `# Документация навигации\n\n`;
  doc += `Автоматически сгенерировано из Figma дизайна.\n\n`;

  doc += `## Структура навигации\n\n`;
  doc += `- **Корневой навигатор**: ${structure.rootNavigator}\n`;
  doc += `- **Количество экранов**: ${structure.screens.length}\n`;
  doc += `- **Вложенных навигаторов**: ${structure.nestedNavigators.length}\n\n`;

  for (const navigator of structure.nestedNavigators) {
    doc += `### ${navigator.name}\n\n`;
    doc += `Тип: \`${navigator.type}\`\n\n`;
    doc += `Экраны:\n`;

    for (const screenName of navigator.screens) {
      const screen = structure.screens.find(s => s.name === screenName);
      if (!screen) continue;

      doc += `- **${screen.name}**`;
      if (screen.params) {
        doc += ` - параметры: \`${JSON.stringify(screen.params)}\``;
      }
      doc += `\n`;
    }
    doc += `\n`;
  }

  doc += `## Примеры использования\n\n`;
  doc += `### Навигация без параметров\n\n`;
  doc += `\`\`\`typescript\n`;
  doc += `navigation.navigate('${structure.screens[0]?.name || 'Home'}');\n`;
  doc += `\`\`\`\n\n`;

  const screenWithParams = structure.screens.find(s => s.params);
  if (screenWithParams) {
    doc += `### Навигация с параметрами\n\n`;
    doc += `\`\`\`typescript\n`;
    doc += `navigation.navigate('${screenWithParams.name}', {\n`;
    if (screenWithParams.params) {
      for (const [key, type] of Object.entries(screenWithParams.params)) {
        doc += `  ${key}: '123', // ${type}\n`;
      }
    }
    doc += `});\n`;
    doc += `\`\`\`\n\n`;
  }

  doc += `### Получение параметров в экране\n\n`;
  doc += `\`\`\`typescript\n`;
  if (screenWithParams) {
    doc += `import { useRoute } from '@react-navigation/native';\n`;
    doc += `import type { RouteProp } from '@react-navigation/native';\n\n`;

    const navigator = structure.nestedNavigators.find(n =>
      n.screens.includes(screenWithParams.name)
    );
    const paramList = navigator?.name.replace('Navigator', 'ParamList') || 'RootStackParamList';

    doc += `type ${screenWithParams.name}RouteProp = RouteProp<${paramList}, '${screenWithParams.name}'>;\n\n`;
    doc += `function ${screenWithParams.name}Screen() {\n`;
    doc += `  const route = useRoute<${screenWithParams.name}RouteProp>();\n`;
    if (screenWithParams.params) {
      for (const key of Object.keys(screenWithParams.params)) {
        doc += `  const ${key} = route.params.${key};\n`;
      }
    }
    doc += `  // ...\n`;
    doc += `}\n`;
  }
  doc += `\`\`\`\n`;

  return doc;
}
