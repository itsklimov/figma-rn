/**
 * Экстрактор анимаций и жестов из прототипов Figma
 * Анализирует интерактивные переходы в Figma и генерирует код для React Native Reanimated v3
 */

/**
 * Интерфейс для описания перехода в Figma
 */
export interface FigmaTransition {
  trigger: 'tap' | 'drag' | 'longPress' | 'hover' | 'swipe';
  duration: number; // ms
  easing: string; // e.g., 'ease-in-out', 'spring'
  targetNodeId?: string;
  actionType: 'navigate' | 'back' | 'open-overlay' | 'close-overlay' | 'swap';
}

/**
 * Интерфейс для описания области жестов
 */
export interface GestureArea {
  nodeId: string;
  nodeName: string;
  gestures: Array<'tap' | 'doubleTap' | 'longPress' | 'swipe' | 'pan' | 'pinch'>;
  swipeDirection?: 'left' | 'right' | 'up' | 'down';
}

/**
 * Интерфейс для подсказок по анимациям
 */
export interface AnimationHint {
  transitions: FigmaTransition[];
  gestureAreas: GestureArea[];
  sharedElements: Array<{ sourceId: string; targetId: string; elementName: string }>;
  suggestedAnimations: string[]; // Reanimated code suggestions
}

/**
 * Маппинг Figma easing функций на React Native Reanimated
 */
const EASING_MAP: Record<string, string> = {
  'LINEAR': 'Easing.linear',
  'EASE_IN': 'Easing.in(Easing.ease)',
  'EASE_OUT': 'Easing.out(Easing.ease)',
  'EASE_IN_OUT': 'Easing.inOut(Easing.ease)',
  'EASE_IN_BACK': 'Easing.in(Easing.back(1.5))',
  'EASE_OUT_BACK': 'Easing.out(Easing.back(1.5))',
  'EASE_IN_OUT_BACK': 'Easing.inOut(Easing.back(1.5))',
  'CUSTOM_SPRING': 'withSpring', // специальный маркер для spring анимации
  'CUSTOM_BEZIER': 'Easing.bezier', // специальный маркер для кастомных кривых
};

/**
 * Маппинг типов действий в Figma API
 */
const ACTION_TYPE_MAP: Record<string, FigmaTransition['actionType']> = {
  'NODE': 'navigate',
  'BACK': 'back',
  'CLOSE': 'close-overlay',
  'OPEN_OVERLAY': 'open-overlay',
  'SWAP': 'swap',
  'NAVIGATE': 'navigate',
};

/**
 * Маппинг типов триггеров в Figma API
 */
const TRIGGER_MAP: Record<string, FigmaTransition['trigger']> = {
  'ON_CLICK': 'tap',
  'ON_PRESS': 'tap',
  'ON_DRAG': 'drag',
  'ON_HOVER': 'hover',
  'MOUSE_ENTER': 'hover',
  'MOUSE_LEAVE': 'hover',
  'AFTER_TIMEOUT': 'tap', // fallback
};

/**
 * Определение направления свайпа на основе координат перехода
 */
function determineSwipeDirection(
  sourceNode: any,
  targetNode: any
): 'left' | 'right' | 'up' | 'down' | undefined {
  if (!sourceNode?.absoluteBoundingBox || !targetNode?.absoluteBoundingBox) {
    return undefined;
  }

  const dx = targetNode.absoluteBoundingBox.x - sourceNode.absoluteBoundingBox.x;
  const dy = targetNode.absoluteBoundingBox.y - sourceNode.absoluteBoundingBox.y;

  // Определяем основное направление на основе большей разницы
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'right' : 'left';
  } else {
    return dy > 0 ? 'down' : 'up';
  }
}

/**
 * Нормализация значения easing из Figma API
 */
function normalizeEasing(easingType: string, easingCurve?: number[]): string {
  // Если есть кастомная кривая Безье
  if (easingCurve && easingCurve.length === 4) {
    return `Easing.bezier(${easingCurve.join(', ')})`;
  }

  // Определение spring анимации по типу
  if (easingType && (easingType.includes('SPRING') || easingType.includes('BOUNCE'))) {
    return 'withSpring';
  }

  // Маппинг стандартных easing функций
  return EASING_MAP[easingType] || 'Easing.inOut(Easing.ease)';
}

/**
 * Извлечение данных о переходах из reactions узла Figma
 */
function extractTransitionsFromReactions(node: any, allNodes: Map<string, any>): FigmaTransition[] {
  const transitions: FigmaTransition[] = [];

  if (!node.reactions || !Array.isArray(node.reactions)) {
    return transitions;
  }

  for (const reaction of node.reactions) {
    const trigger = reaction.trigger?.type;
    const action = reaction.action;

    if (!trigger || !action) continue;

    // Определение типа триггера
    const mappedTrigger = TRIGGER_MAP[trigger] || 'tap';

    // Определение типа действия
    const actionType = ACTION_TYPE_MAP[action.type] || 'navigate';

    // Извлечение параметров перехода
    const transition = action.transition || {};
    const duration = transition.duration ? transition.duration * 1000 : 300; // convert to ms
    const easingType = transition.easing?.type || 'EASE_IN_OUT';
    const easingCurve = transition.easing?.easingFunctionCubicBezier;

    // Целевой узел перехода
    const targetNodeId = action.destinationId || action.navigation?.destinationId;

    // Определение направления свайпа для drag триггеров
    let swipeDirection: 'left' | 'right' | 'up' | 'down' | undefined;
    if (mappedTrigger === 'drag' && targetNodeId) {
      const targetNode = allNodes.get(targetNodeId);
      swipeDirection = determineSwipeDirection(node, targetNode);
    }

    transitions.push({
      trigger: mappedTrigger === 'drag' && swipeDirection ? 'swipe' : mappedTrigger,
      duration,
      easing: normalizeEasing(easingType, easingCurve),
      targetNodeId,
      actionType,
    });
  }

  return transitions;
}

/**
 * Рекурсивное извлечение всех узлов в карту для быстрого доступа
 */
function buildNodeMap(node: any, nodeMap: Map<string, any> = new Map()): Map<string, any> {
  if (!node || !node.id) return nodeMap;

  nodeMap.set(node.id, node);

  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      buildNodeMap(child, nodeMap);
    }
  }

  return nodeMap;
}

/**
 * Определение типов жестов на основе триггеров
 */
function inferGestureTypes(transitions: FigmaTransition[]): GestureArea['gestures'] {
  const gestures = new Set<GestureArea['gestures'][number]>();

  for (const transition of transitions) {
    switch (transition.trigger) {
      case 'tap':
        gestures.add('tap');
        break;
      case 'drag':
      case 'swipe':
        gestures.add('swipe');
        gestures.add('pan');
        break;
      case 'longPress':
        gestures.add('longPress');
        break;
    }
  }

  // Если нет специфических жестов, добавляем tap по умолчанию
  if (gestures.size === 0 && transitions.length > 0) {
    gestures.add('tap');
  }

  return Array.from(gestures);
}

/**
 * Поиск областей с жестами в дереве узлов
 */
function findGestureAreas(node: any, allNodes: Map<string, any>): GestureArea[] {
  const gestureAreas: GestureArea[] = [];

  function traverse(n: any) {
    if (!n) return;

    const transitions = extractTransitionsFromReactions(n, allNodes);

    if (transitions.length > 0) {
      const gestures = inferGestureTypes(transitions);
      const swipeTransition = transitions.find(t => t.trigger === 'swipe');

      // Определение направления свайпа
      let swipeDirection: GestureArea['swipeDirection'];
      if (swipeTransition && swipeTransition.targetNodeId) {
        const targetNode = allNodes.get(swipeTransition.targetNodeId);
        swipeDirection = determineSwipeDirection(n, targetNode);
      }

      gestureAreas.push({
        nodeId: n.id,
        nodeName: n.name || 'Unnamed',
        gestures,
        swipeDirection,
      });
    }

    // Рекурсивный обход дочерних элементов
    if (n.children && Array.isArray(n.children)) {
      for (const child of n.children) {
        traverse(child);
      }
    }
  }

  traverse(node);
  return gestureAreas;
}

/**
 * Поиск потенциальных shared elements между экранами
 * Использует эвристику на основе имен, типов и размеров элементов
 */
function findSharedElements(
  sourceNode: any,
  targetNodeId: string,
  allNodes: Map<string, any>
): Array<{ sourceId: string; targetId: string; elementName: string }> {
  const sharedElements: Array<{ sourceId: string; targetId: string; elementName: string }> = [];
  const targetNode = allNodes.get(targetNodeId);

  if (!targetNode) return sharedElements;

  // Сбор всех элементов из исходного узла
  const sourceElements = new Map<string, any>();
  function collectSourceElements(n: any) {
    if (!n) return;
    if (n.id && n.name) {
      sourceElements.set(n.id, n);
    }
    if (n.children) {
      n.children.forEach((child: any) => collectSourceElements(child));
    }
  }
  collectSourceElements(sourceNode);

  // Сбор всех элементов из целевого узла
  const targetElements = new Map<string, any>();
  function collectTargetElements(n: any) {
    if (!n) return;
    if (n.id && n.name) {
      targetElements.set(n.id, n);
    }
    if (n.children) {
      n.children.forEach((child: any) => collectTargetElements(child));
    }
  }
  collectTargetElements(targetNode);

  // Поиск совпадений по имени и типу
  for (const [sourceId, sourceEl] of sourceElements.entries()) {
    for (const [targetId, targetEl] of targetElements.entries()) {
      // Совпадение по имени (частичное или полное)
      const nameMatch =
        sourceEl.name &&
        targetEl.name &&
        (sourceEl.name === targetEl.name ||
          sourceEl.name.includes(targetEl.name) ||
          targetEl.name.includes(sourceEl.name));

      // Совпадение по типу узла
      const typeMatch = sourceEl.type === targetEl.type;

      // Совпадение по размеру (с допуском 20%)
      let sizeMatch = false;
      if (
        sourceEl.absoluteBoundingBox &&
        targetEl.absoluteBoundingBox
      ) {
        const sourceArea =
          sourceEl.absoluteBoundingBox.width * sourceEl.absoluteBoundingBox.height;
        const targetArea =
          targetEl.absoluteBoundingBox.width * targetEl.absoluteBoundingBox.height;

        const ratio = Math.min(sourceArea, targetArea) / Math.max(sourceArea, targetArea);
        sizeMatch = ratio >= 0.8; // 80% similarity threshold
      }

      // Если есть совпадения, добавляем в shared elements
      if (nameMatch && typeMatch && sizeMatch) {
        sharedElements.push({
          sourceId,
          targetId,
          elementName: sourceEl.name,
        });
      }
    }
  }

  return sharedElements;
}

/**
 * Главная функция: извлечение подсказок по анимациям из узла Figma
 */
export function extractAnimationHints(node: any): AnimationHint {
  // Построение карты всех узлов для быстрого доступа
  const allNodes = buildNodeMap(node);

  // Извлечение переходов
  const transitions: FigmaTransition[] = [];
  const sharedElements: AnimationHint['sharedElements'] = [];

  function collectTransitions(n: any) {
    if (!n) return;

    const nodeTransitions = extractTransitionsFromReactions(n, allNodes);
    transitions.push(...nodeTransitions);

    // Поиск shared elements для каждого перехода с навигацией
    for (const transition of nodeTransitions) {
      if (transition.targetNodeId && transition.actionType === 'navigate') {
        const shared = findSharedElements(n, transition.targetNodeId, allNodes);
        sharedElements.push(...shared);
      }
    }

    if (n.children) {
      n.children.forEach((child: any) => collectTransitions(child));
    }
  }

  collectTransitions(node);

  // Поиск областей с жестами
  const gestureAreas = findGestureAreas(node, allNodes);

  // Генерация подсказок для анимаций
  const suggestedAnimations = generateAnimationSuggestions(
    transitions,
    gestureAreas,
    sharedElements
  );

  return {
    transitions,
    gestureAreas,
    sharedElements,
    suggestedAnimations,
  };
}

/**
 * Генерация подсказок для кода анимаций
 */
function generateAnimationSuggestions(
  transitions: FigmaTransition[],
  gestureAreas: GestureArea[],
  sharedElements: AnimationHint['sharedElements']
): string[] {
  const suggestions: string[] = [];

  // Подсказки для переходов
  if (transitions.length > 0) {
    const hasSpring = transitions.some(t => t.easing === 'withSpring');
    const hasTiming = transitions.some(t => t.easing !== 'withSpring');

    if (hasSpring) {
      suggestions.push('Используйте withSpring для естественных анимаций');
    }
    if (hasTiming) {
      suggestions.push('Используйте withTiming для контролируемых переходов');
    }
  }

  // Подсказки для жестов
  if (gestureAreas.some(area => area.gestures.includes('swipe'))) {
    suggestions.push('Рассмотрите использование PanGestureHandler для свайпов');
  }
  if (gestureAreas.some(area => area.gestures.includes('longPress'))) {
    suggestions.push('Используйте LongPressGestureHandler для длинных нажатий');
  }
  if (gestureAreas.some(area => area.gestures.includes('pinch'))) {
    suggestions.push('Используйте PinchGestureHandler для масштабирования');
  }

  // Подсказки для shared elements
  if (sharedElements.length > 0) {
    suggestions.push(
      `Найдено ${sharedElements.length} потенциальных shared element(s) для Hero анимаций`
    );
  }

  return suggestions;
}

/**
 * Генерация кода Reanimated на основе подсказок
 */
export function generateReanimatedCode(hint: AnimationHint): string {
  let code = `/**\n * Анимации сгенерированы на основе Figma прототипа\n */\n\n`;
  code += `import { useSharedValue, useAnimatedStyle, withTiming, withSpring } from 'react-native-reanimated';\n`;
  code += `import { Easing } from 'react-native-reanimated';\n\n`;

  // Генерация примеров анимаций для каждого типа перехода
  const uniqueTransitions = new Map<string, FigmaTransition>();
  hint.transitions.forEach((t, index) => {
    const key = `${t.trigger}_${t.actionType}_${t.easing}`;
    if (!uniqueTransitions.has(key)) {
      uniqueTransitions.set(key, t);
    }
  });

  let animationIndex = 0;
  for (const [key, transition] of uniqueTransitions) {
    animationIndex++;
    const animName = `use${transition.actionType.charAt(0).toUpperCase() + transition.actionType.slice(1).replace('-', '')}Animation${animationIndex}`;

    code += `/**\n * Анимация для ${transition.actionType} (trigger: ${transition.trigger})\n`;
    code += ` * Длительность: ${transition.duration}ms\n`;
    code += ` * Easing: ${transition.easing}\n */\n`;
    code += `export function ${animName}() {\n`;
    code += `  const progress = useSharedValue(0);\n\n`;

    code += `  const animatedStyle = useAnimatedStyle(() => {\n`;
    code += `    return {\n`;

    // Генерация стиля в зависимости от типа действия
    switch (transition.actionType) {
      case 'navigate':
      case 'swap':
        code += `      opacity: progress.value,\n`;
        code += `      transform: [{ translateX: (1 - progress.value) * 300 }],\n`;
        break;
      case 'open-overlay':
        code += `      opacity: progress.value,\n`;
        code += `      transform: [{ scale: 0.8 + progress.value * 0.2 }],\n`;
        break;
      case 'close-overlay':
        code += `      opacity: 1 - progress.value,\n`;
        code += `      transform: [{ scale: 1 - progress.value * 0.2 }],\n`;
        break;
      case 'back':
        code += `      opacity: 1 - progress.value,\n`;
        code += `      transform: [{ translateX: progress.value * -300 }],\n`;
        break;
    }

    code += `    };\n`;
    code += `  });\n\n`;

    code += `  const startAnimation = () => {\n`;
    if (transition.easing === 'withSpring') {
      code += `    progress.value = withSpring(1, {\n`;
      code += `      damping: 15,\n`;
      code += `      stiffness: 150,\n`;
      code += `    });\n`;
    } else {
      code += `    progress.value = withTiming(1, {\n`;
      code += `      duration: ${transition.duration},\n`;
      code += `      easing: ${transition.easing},\n`;
      code += `    });\n`;
    }
    code += `  };\n\n`;

    code += `  return { animatedStyle, startAnimation, progress };\n`;
    code += `}\n\n`;
  }

  // Генерация shared element transitions
  if (hint.sharedElements.length > 0) {
    code += `/**\n * Shared Element Transitions\n */\n`;
    for (const shared of hint.sharedElements) {
      const elementName = shared.elementName.replace(/[^a-zA-Z0-9]/g, '');
      code += `// Shared element: ${shared.elementName}\n`;
      code += `// Source: ${shared.sourceId}\n`;
      code += `// Target: ${shared.targetId}\n`;
      code += `export const ${elementName}SharedTransitionTag = '${elementName}Transition';\n\n`;
    }
  }

  return code;
}

/**
 * Генерация кода gesture handlers
 */
export function generateGestureHandlerCode(areas: GestureArea[]): string {
  let code = `/**\n * Gesture handlers сгенерированы на основе Figma прототипа\n */\n\n`;
  code += `import { Gesture, GestureDetector } from 'react-native-gesture-handler';\n`;
  code += `import { useSharedValue, withSpring } from 'react-native-reanimated';\n\n`;

  for (const area of areas) {
    const areaName = area.nodeName.replace(/[^a-zA-Z0-9]/g, '');
    const hasSwipe = area.gestures.includes('swipe') || area.gestures.includes('pan');
    const hasTap = area.gestures.includes('tap');
    const hasLongPress = area.gestures.includes('longPress');

    if (hasSwipe) {
      code += `/**\n * Swipe gesture для ${area.nodeName}\n`;
      if (area.swipeDirection) {
        code += ` * Направление: ${area.swipeDirection}\n`;
      }
      code += ` */\n`;
      code += `export function use${areaName}SwipeGesture() {\n`;
      code += `  const translateX = useSharedValue(0);\n`;
      code += `  const translateY = useSharedValue(0);\n\n`;

      code += `  const panGesture = Gesture.Pan()\n`;
      code += `    .onChange((event) => {\n`;

      if (area.swipeDirection === 'left' || area.swipeDirection === 'right') {
        code += `      translateX.value = event.translationX;\n`;
      } else if (area.swipeDirection === 'up' || area.swipeDirection === 'down') {
        code += `      translateY.value = event.translationY;\n`;
      } else {
        code += `      translateX.value = event.translationX;\n`;
        code += `      translateY.value = event.translationY;\n`;
      }

      code += `    })\n`;
      code += `    .onEnd((event) => {\n`;
      code += `      const threshold = 100; // Порог для срабатывания свайпа\n\n`;

      if (area.swipeDirection === 'left') {
        code += `      if (event.translationX < -threshold) {\n`;
        code += `        // Свайп влево обнаружен\n`;
        code += `        console.log('Swiped left');\n`;
        code += `      }\n`;
      } else if (area.swipeDirection === 'right') {
        code += `      if (event.translationX > threshold) {\n`;
        code += `        // Свайп вправо обнаружен\n`;
        code += `        console.log('Swiped right');\n`;
        code += `      }\n`;
      } else if (area.swipeDirection === 'up') {
        code += `      if (event.translationY < -threshold) {\n`;
        code += `        // Свайп вверх обнаружен\n`;
        code += `        console.log('Swiped up');\n`;
        code += `      }\n`;
      } else if (area.swipeDirection === 'down') {
        code += `      if (event.translationY > threshold) {\n`;
        code += `        // Свайп вниз обнаружен\n`;
        code += `        console.log('Swiped down');\n`;
        code += `      }\n`;
      } else {
        code += `      if (Math.abs(event.translationX) > threshold) {\n`;
        code += `        // Горизонтальный свайп\n`;
        code += `        console.log('Horizontal swipe');\n`;
        code += `      } else if (Math.abs(event.translationY) > threshold) {\n`;
        code += `        // Вертикальный свайп\n`;
        code += `        console.log('Vertical swipe');\n`;
        code += `      }\n`;
      }

      code += `\n      // Возврат в начальную позицию\n`;
      code += `      translateX.value = withSpring(0);\n`;
      code += `      translateY.value = withSpring(0);\n`;
      code += `    });\n\n`;

      code += `  return { panGesture, translateX, translateY };\n`;
      code += `}\n\n`;
    }

    if (hasTap) {
      code += `/**\n * Tap gesture для ${area.nodeName}\n */\n`;
      code += `export function use${areaName}TapGesture(onTap: () => void) {\n`;
      code += `  const tapGesture = Gesture.Tap()\n`;
      code += `    .onEnd(() => {\n`;
      code += `      onTap();\n`;
      code += `    });\n\n`;
      code += `  return tapGesture;\n`;
      code += `}\n\n`;
    }

    if (hasLongPress) {
      code += `/**\n * Long press gesture для ${area.nodeName}\n */\n`;
      code += `export function use${areaName}LongPressGesture(onLongPress: () => void) {\n`;
      code += `  const longPressGesture = Gesture.LongPress()\n`;
      code += `    .minDuration(500)\n`;
      code += `    .onEnd(() => {\n`;
      code += `      onLongPress();\n`;
      code += `    });\n\n`;
      code += `  return longPressGesture;\n`;
      code += `}\n\n`;
    }
  }

  return code;
}
