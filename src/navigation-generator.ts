/**
 * Navigation types and navigator structure generator for React Navigation
 * Analyzes screens from Figma and creates type-safe navigation structure
 */

import { compareTwoStrings } from 'string-similarity';

/**
 * Interface for navigation screen definition
 */
export interface NavigationScreen {
  name: string;
  params?: Record<string, string>; // e.g., { userId: 'string', productId: 'string' }
  navigatorType: 'stack' | 'tab' | 'drawer' | 'root';
}

/**
 * Interface for nested navigators
 */
export interface NestedNavigator {
  name: string;
  type: 'stack' | 'tab' | 'drawer';
  screens: string[];
}

/**
 * Interface for application navigation structure
 */
export interface NavigationStructure {
  screens: NavigationScreen[];
  rootNavigator: 'stack' | 'tab' | 'drawer';
  nestedNavigators: NestedNavigator[];
}

/**
 * Interface for Figma screen input data
 */
export interface FigmaScreen {
  name: string;
  node: any;
}

/**
 * Navigation element type detected in design
 */
interface NavigationElement {
  type: 'back_button' | 'tab_bar' | 'drawer_menu' | 'hamburger_icon' | 'bottom_nav';
  confidence: number;
  reason: string;
}

/**
 * Screen name normalization
 * Removes suffixes "Screen", "Page", "View" and other variations
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
 * Infer navigation parameters from screen content
 * Analyzes Figma nodes to find dynamic data
 */
function inferNavigationParams(node: any): Record<string, string> | undefined {
  const params: Record<string, string> = {};

  // Patterns for parameter type detection
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

  // Recursive parameter search in node structure
  function searchForParams(n: any) {
    if (!n) return;

    // Check node name
    if (n.name) {
      for (const [paramName, pattern] of Object.entries(paramPatterns)) {
        if (pattern.test(n.name)) {
          params[paramName] = 'string';
        }
      }
    }

    // Check text content for placeholders
    if (n.characters) {
      const text = n.characters;
      // Find placeholders like {userId}, :userId, $userId
      const placeholderMatches = text.matchAll(/[{:$](\w+)[}]?/g);
      for (const match of placeholderMatches) {
        const paramName = match[1];
        params[paramName] = 'string';
      }
    }

    // Recursive search in child elements
    if (n.children && Array.isArray(n.children)) {
      n.children.forEach((child: any) => searchForParams(child));
    }
  }

  searchForParams(node);

  return Object.keys(params).length > 0 ? params : undefined;
}

/**
 * Detect navigation elements in Figma node
 */
function detectNavigationElements(node: any): NavigationElement[] {
  const elements: NavigationElement[] = [];

  function searchNode(n: any, depth: number = 0) {
    if (!n) return;

    const nodeName = (n.name || '').toLowerCase();
    const nodeType = n.type || '';

    // Detect back button
    if (nodeName.includes('back') ||
        nodeName.includes('arrow') && nodeName.includes('left')) {
      elements.push({
        type: 'back_button',
        confidence: 0.9,
        reason: `Back button detected: "${n.name}"`
      });
    }

    // Detect Tab Bar (bottom navigation)
    if (nodeName.includes('tab') && (nodeName.includes('bar') || nodeName.includes('navigation'))) {
      elements.push({
        type: 'tab_bar',
        confidence: 0.95,
        reason: `Tab bar detected: "${n.name}"`
      });
    }

    // Detect Bottom Navigation
    if (nodeName.includes('bottom') && nodeName.includes('nav')) {
      elements.push({
        type: 'bottom_nav',
        confidence: 0.95,
        reason: `Bottom navigation detected: "${n.name}"`
      });
    }

    // Detect hamburger icon (drawer menu)
    if (nodeName.includes('hamburger') ||
        nodeName.includes('menu') && nodeName.includes('icon') ||
        nodeName.includes('drawer') ||
        nodeName.includes('sidebar')) {
      elements.push({
        type: 'hamburger_icon',
        confidence: 0.85,
        reason: `Drawer menu detected: "${n.name}"`
      });
    }

    // Detect drawer menu by structure
    if (nodeName.includes('drawer') ||
        nodeName.includes('side') && nodeName.includes('menu')) {
      elements.push({
        type: 'drawer_menu',
        confidence: 0.9,
        reason: `Side menu detected: "${n.name}"`
      });
    }

    // Analyze child elements
    if (n.children && Array.isArray(n.children)) {
      n.children.forEach((child: any) => searchNode(child, depth + 1));
    }
  }

  searchNode(node);
  return elements;
}

/**
 * Determine navigator type based on detected elements
 */
function determineNavigatorType(
  elements: NavigationElement[],
  screenName: string
): 'stack' | 'tab' | 'drawer' | 'root' {

  // Priorities: tab > drawer > stack
  const hasTabBar = elements.some(e => e.type === 'tab_bar' || e.type === 'bottom_nav');
  const hasDrawer = elements.some(e => e.type === 'drawer_menu' || e.type === 'hamburger_icon');
  const hasBackButton = elements.some(e => e.type === 'back_button');

  // Tab navigation has highest priority
  if (hasTabBar) {
    return 'tab';
  }

  // Drawer navigation
  if (hasDrawer) {
    return 'drawer';
  }

  // Stack navigation (if back button exists)
  if (hasBackButton) {
    return 'stack';
  }

  // Determine by screen name
  const lowerName = screenName.toLowerCase();
  if (lowerName.includes('home') || lowerName.includes('main') || lowerName === 'index') {
    return 'root';
  }

  // Default to stack
  return 'stack';
}

/**
 * Group screens by navigator type to create nested structure
 */
function groupScreensByNavigator(screens: NavigationScreen[]): NestedNavigator[] {
  const navigators: NestedNavigator[] = [];

  // Group tab screens
  const tabScreens = screens.filter(s => s.navigatorType === 'tab');
  if (tabScreens.length > 0) {
    navigators.push({
      name: 'TabNavigator',
      type: 'tab',
      screens: tabScreens.map(s => s.name)
    });
  }

  // Group drawer screens
  const drawerScreens = screens.filter(s => s.navigatorType === 'drawer');
  if (drawerScreens.length > 0) {
    navigators.push({
      name: 'DrawerNavigator',
      type: 'drawer',
      screens: drawerScreens.map(s => s.name)
    });
  }

  // Remaining screens go to main stack
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
 * Determine root navigator type
 */
function determineRootNavigator(screens: NavigationScreen[]): 'stack' | 'tab' | 'drawer' {
  const navigatorCounts = {
    stack: screens.filter(s => s.navigatorType === 'stack' || s.navigatorType === 'root').length,
    tab: screens.filter(s => s.navigatorType === 'tab').length,
    drawer: screens.filter(s => s.navigatorType === 'drawer').length,
  };

  // If tab screens exist, root navigator is usually tab
  if (navigatorCounts.tab > 0 && navigatorCounts.tab >= navigatorCounts.stack * 0.3) {
    return 'tab';
  }

  // If drawer screens exist, root navigator can be drawer
  if (navigatorCounts.drawer > 0 && navigatorCounts.drawer >= navigatorCounts.stack * 0.3) {
    return 'drawer';
  }

  // Default to stack
  return 'stack';
}

/**
 * Analyze navigation structure from Figma screens
 * Main function for determining navigator types and their structure
 *
 * @param screens - array of screens from Figma with their nodes
 * @returns navigation structure with navigator types and screens
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
 * Generate TypeScript types for React Navigation
 * Creates type-safe navigation types in React Navigation v6+ style
 *
 * @param structure - analyzed navigation structure
 * @returns string with TypeScript type definitions code
 */
export function generateNavigationTypes(structure: NavigationStructure): string {
  let code = `/**
 * Navigation types for React Navigation
 * Auto-generated from Figma design
 */

import type { NavigatorScreenParams } from '@react-navigation/native';

`;

  // Generate types for each navigator
  for (const navigator of structure.nestedNavigators) {
    const paramList = navigator.name.replace('Navigator', 'ParamList');

    code += `export type ${paramList} = {\n`;

    for (const screenName of navigator.screens) {
      const screen = structure.screens.find(s => s.name === screenName);
      if (!screen) continue;

      if (screen.params && Object.keys(screen.params).length > 0) {
        // Screen with parameters
        const paramsType = `{\n${Object.entries(screen.params)
          .map(([key, type]) => `    ${key}: ${type};`)
          .join('\n')}\n  }`;
        code += `  ${screen.name}: ${paramsType};\n`;
      } else {
        // Screen without parameters
        code += `  ${screen.name}: undefined;\n`;
      }
    }

    code += `};\n\n`;
  }

  // Generate root type if there are nested navigators
  if (structure.nestedNavigators.length > 1) {
    const rootParamList = `RootParamList`;
    code += `export type ${rootParamList} = {\n`;

    for (const navigator of structure.nestedNavigators) {
      const paramList = navigator.name.replace('Navigator', 'ParamList');
      code += `  ${navigator.name}: NavigatorScreenParams<${paramList}>;\n`;
    }

    code += `};\n\n`;
  }

  // Add declare global for type safety
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
 * Generate navigator code for React Navigation
 * Creates ready-to-use code with navigators
 *
 * @param structure - analyzed navigation structure
 * @returns string with React navigation component
 */
export function generateNavigatorCode(structure: NavigationStructure): string {
  let code = `/**
 * Navigation configuration
 * Auto-generated from Figma design
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
`;

  // Navigator imports
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

  code += `\n// Screen imports\n`;
  for (const screen of structure.screens) {
    code += `import ${screen.name}Screen from './screens/${screen.name}Screen';\n`;
  }

  code += `\n// Type imports\nimport type {\n`;
  for (const navigator of structure.nestedNavigators) {
    const paramList = navigator.name.replace('Navigator', 'ParamList');
    code += `  ${paramList},\n`;
  }
  code += `} from './navigation.types';\n\n`;

  // Create navigators
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

  // Generate navigator components
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

      // Add screen options
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

  // Generate root navigation component
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
 * Generate navigation usage examples
 * Creates documentation with screen navigation examples
 *
 * @param structure - analyzed navigation structure
 * @returns string with Markdown documentation
 */
export function generateNavigationDocumentation(structure: NavigationStructure): string {
  let doc = `# Navigation Documentation\n\n`;
  doc += `Auto-generated from Figma design.\n\n`;

  doc += `## Navigation Structure\n\n`;
  doc += `- **Root navigator**: ${structure.rootNavigator}\n`;
  doc += `- **Screen count**: ${structure.screens.length}\n`;
  doc += `- **Nested navigators**: ${structure.nestedNavigators.length}\n\n`;

  for (const navigator of structure.nestedNavigators) {
    doc += `### ${navigator.name}\n\n`;
    doc += `Type: \`${navigator.type}\`\n\n`;
    doc += `Screens:\n`;

    for (const screenName of navigator.screens) {
      const screen = structure.screens.find(s => s.name === screenName);
      if (!screen) continue;

      doc += `- **${screen.name}**`;
      if (screen.params) {
        doc += ` - params: \`${JSON.stringify(screen.params)}\``;
      }
      doc += `\n`;
    }
    doc += `\n`;
  }

  doc += `## Usage Examples\n\n`;
  doc += `### Navigation without parameters\n\n`;
  doc += `\`\`\`typescript\n`;
  doc += `navigation.navigate('${structure.screens[0]?.name || 'Home'}');\n`;
  doc += `\`\`\`\n\n`;

  const screenWithParams = structure.screens.find(s => s.params);
  if (screenWithParams) {
    doc += `### Navigation with parameters\n\n`;
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

  doc += `### Getting parameters in screen\n\n`;
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
