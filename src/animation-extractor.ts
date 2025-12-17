/**
 * Animation and gesture extractor from Figma prototypes
 * Analyzes interactive Figma transitions and generates code for React Native Reanimated v3
 */

/**
 * Interface for Figma transition description
 */
export interface FigmaTransition {
  trigger: 'tap' | 'drag' | 'longPress' | 'hover' | 'swipe';
  duration: number; // ms
  easing: string; // e.g., 'ease-in-out', 'spring'
  targetNodeId?: string;
  actionType: 'navigate' | 'back' | 'open-overlay' | 'close-overlay' | 'swap';
}

/**
 * Interface for gesture area description
 */
export interface GestureArea {
  nodeId: string;
  nodeName: string;
  gestures: Array<'tap' | 'doubleTap' | 'longPress' | 'swipe' | 'pan' | 'pinch'>;
  swipeDirection?: 'left' | 'right' | 'up' | 'down';
}

/**
 * Interface for animation hints
 */
export interface AnimationHint {
  transitions: FigmaTransition[];
  gestureAreas: GestureArea[];
  sharedElements: Array<{ sourceId: string; targetId: string; elementName: string }>;
  suggestedAnimations: string[]; // Reanimated code suggestions
}

/**
 * Map Figma easing functions to React Native Reanimated
 */
const EASING_MAP: Record<string, string> = {
  'LINEAR': 'Easing.linear',
  'EASE_IN': 'Easing.in(Easing.ease)',
  'EASE_OUT': 'Easing.out(Easing.ease)',
  'EASE_IN_OUT': 'Easing.inOut(Easing.ease)',
  'EASE_IN_BACK': 'Easing.in(Easing.back(1.5))',
  'EASE_OUT_BACK': 'Easing.out(Easing.back(1.5))',
  'EASE_IN_OUT_BACK': 'Easing.inOut(Easing.back(1.5))',
  'CUSTOM_SPRING': 'withSpring', // special marker for spring animation
  'CUSTOM_BEZIER': 'Easing.bezier', // special marker for custom curves
};

/**
 * Map Figma API action types
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
 * Map Figma API trigger types
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
 * Determine swipe direction based on transition coordinates
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

  // Determine primary direction based on larger difference
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'right' : 'left';
  } else {
    return dy > 0 ? 'down' : 'up';
  }
}

/**
 * Normalize easing value from Figma API
 */
function normalizeEasing(easingType: string, easingCurve?: number[]): string {
  // If there's a custom Bezier curve
  if (easingCurve && easingCurve.length === 4) {
    return `Easing.bezier(${easingCurve.join(', ')})`;
  }

  // Identify spring animation by type
  if (easingType && (easingType.includes('SPRING') || easingType.includes('BOUNCE'))) {
    return 'withSpring';
  }

  // Map standard easing functions
  return EASING_MAP[easingType] || 'Easing.inOut(Easing.ease)';
}

/**
 * Extract transition data from Figma node reactions
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

    // Determine trigger type
    const mappedTrigger = TRIGGER_MAP[trigger] || 'tap';

    // Determine action type
    const actionType = ACTION_TYPE_MAP[action.type] || 'navigate';

    // Extract transition parameters
    const transition = action.transition || {};
    const duration = transition.duration ? transition.duration * 1000 : 300; // convert to ms
    const easingType = transition.easing?.type || 'EASE_IN_OUT';
    const easingCurve = transition.easing?.easingFunctionCubicBezier;

    // Target transition node
    const targetNodeId = action.destinationId || action.navigation?.destinationId;

    // Determine swipe direction for drag triggers
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
 * Recursively extract all nodes into map for fast access
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
 * Determine gesture types based on triggers
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

  // If no specific gestures, add tap by default
  if (gestures.size === 0 && transitions.length > 0) {
    gestures.add('tap');
  }

  return Array.from(gestures);
}

/**
 * Find gesture areas in node tree
 */
function findGestureAreas(node: any, allNodes: Map<string, any>): GestureArea[] {
  const gestureAreas: GestureArea[] = [];

  function traverse(n: any) {
    if (!n) return;

    const transitions = extractTransitionsFromReactions(n, allNodes);

    if (transitions.length > 0) {
      const gestures = inferGestureTypes(transitions);
      const swipeTransition = transitions.find(t => t.trigger === 'swipe');

      // Determine swipe direction
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

    // Recursive traversal of child elements
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
 * Find potential shared elements between screens
 * Uses heuristics based on element names, types and sizes
 */
function findSharedElements(
  sourceNode: any,
  targetNodeId: string,
  allNodes: Map<string, any>
): Array<{ sourceId: string; targetId: string; elementName: string }> {
  const sharedElements: Array<{ sourceId: string; targetId: string; elementName: string }> = [];
  const targetNode = allNodes.get(targetNodeId);

  if (!targetNode) return sharedElements;

  // Collect all elements from source node
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

  // Collect all elements from target node
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

  // Find matches by name and type
  for (const [sourceId, sourceEl] of sourceElements.entries()) {
    for (const [targetId, targetEl] of targetElements.entries()) {
      // Name match (partial or complete)
      const nameMatch =
        sourceEl.name &&
        targetEl.name &&
        (sourceEl.name === targetEl.name ||
          sourceEl.name.includes(targetEl.name) ||
          targetEl.name.includes(sourceEl.name));

      // Node type match
      const typeMatch = sourceEl.type === targetEl.type;

      // Size match (with 20% tolerance)
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

      // If matches found, add to shared elements
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
 * Main function: extract animation hints from Figma node
 */
export function extractAnimationHints(node: any): AnimationHint {
  // Build map of all nodes for fast access
  const allNodes = buildNodeMap(node);

  // Extract transitions
  const transitions: FigmaTransition[] = [];
  const sharedElements: AnimationHint['sharedElements'] = [];

  function collectTransitions(n: any) {
    if (!n) return;

    const nodeTransitions = extractTransitionsFromReactions(n, allNodes);
    transitions.push(...nodeTransitions);

    // Find shared elements for each navigation transition
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

  // Find gesture areas
  const gestureAreas = findGestureAreas(node, allNodes);

  // Generate animation suggestions
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
 * Generate animation code suggestions
 */
function generateAnimationSuggestions(
  transitions: FigmaTransition[],
  gestureAreas: GestureArea[],
  sharedElements: AnimationHint['sharedElements']
): string[] {
  const suggestions: string[] = [];

  // Transition suggestions
  if (transitions.length > 0) {
    const hasSpring = transitions.some(t => t.easing === 'withSpring');
    const hasTiming = transitions.some(t => t.easing !== 'withSpring');

    if (hasSpring) {
      suggestions.push('Use withSpring for natural animations');
    }
    if (hasTiming) {
      suggestions.push('Use withTiming for controlled transitions');
    }
  }

  // Gesture suggestions
  if (gestureAreas.some(area => area.gestures.includes('swipe'))) {
    suggestions.push('Consider using PanGestureHandler for swipes');
  }
  if (gestureAreas.some(area => area.gestures.includes('longPress'))) {
    suggestions.push('Use LongPressGestureHandler for long presses');
  }
  if (gestureAreas.some(area => area.gestures.includes('pinch'))) {
    suggestions.push('Use PinchGestureHandler for scaling');
  }

  // Shared element suggestions
  if (sharedElements.length > 0) {
    suggestions.push(
      `Found ${sharedElements.length} potential shared element(s) for Hero animations`
    );
  }

  return suggestions;
}

/**
 * Generate Reanimated code based on hints
 */
export function generateReanimatedCode(hint: AnimationHint): string {
  let code = `/**\n * Animations generated from Figma prototype\n */\n\n`;
  code += `import { useSharedValue, useAnimatedStyle, withTiming, withSpring } from 'react-native-reanimated';\n`;
  code += `import { Easing } from 'react-native-reanimated';\n\n`;

  // Generate animation examples for each transition type
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

    code += `/**\n * Animation for ${transition.actionType} (trigger: ${transition.trigger})\n`;
    code += ` * Duration: ${transition.duration}ms\n`;
    code += ` * Easing: ${transition.easing}\n */\n`;
    code += `export function ${animName}() {\n`;
    code += `  const progress = useSharedValue(0);\n\n`;

    code += `  const animatedStyle = useAnimatedStyle(() => {\n`;
    code += `    return {\n`;

    // Generate style based on action type
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

  // Generate shared element transitions
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
 * Generate gesture handler code
 */
export function generateGestureHandlerCode(areas: GestureArea[]): string {
  let code = `/**\n * Gesture handlers generated from Figma prototype\n */\n\n`;
  code += `import { Gesture, GestureDetector } from 'react-native-gesture-handler';\n`;
  code += `import { useSharedValue, withSpring } from 'react-native-reanimated';\n\n`;

  for (const area of areas) {
    const areaName = area.nodeName.replace(/[^a-zA-Z0-9]/g, '');
    const hasSwipe = area.gestures.includes('swipe') || area.gestures.includes('pan');
    const hasTap = area.gestures.includes('tap');
    const hasLongPress = area.gestures.includes('longPress');

    if (hasSwipe) {
      code += `/**\n * Swipe gesture for ${area.nodeName}\n`;
      if (area.swipeDirection) {
        code += ` * Direction: ${area.swipeDirection}\n`;
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
      code += `      const threshold = 100; // Swipe activation threshold\n\n`;

      if (area.swipeDirection === 'left') {
        code += `      if (event.translationX < -threshold) {\n`;
        code += `        // Swiped left detected\n`;
        code += `        console.log('Swiped left');\n`;
        code += `      }\n`;
      } else if (area.swipeDirection === 'right') {
        code += `      if (event.translationX > threshold) {\n`;
        code += `        // Swiped right detected\n`;
        code += `        console.log('Swiped right');\n`;
        code += `      }\n`;
      } else if (area.swipeDirection === 'up') {
        code += `      if (event.translationY < -threshold) {\n`;
        code += `        // Swiped up detected\n`;
        code += `        console.log('Swiped up');\n`;
        code += `      }\n`;
      } else if (area.swipeDirection === 'down') {
        code += `      if (event.translationY > threshold) {\n`;
        code += `        // Swiped down detected\n`;
        code += `        console.log('Swiped down');\n`;
        code += `      }\n`;
      } else {
        code += `      if (Math.abs(event.translationX) > threshold) {\n`;
        code += `        // Horizontal swipe\n`;
        code += `        console.log('Horizontal swipe');\n`;
        code += `      } else if (Math.abs(event.translationY) > threshold) {\n`;
        code += `        // Vertical swipe\n`;
        code += `        console.log('Vertical swipe');\n`;
        code += `      }\n`;
      }

      code += `\n      // Return to initial position\n`;
      code += `      translateX.value = withSpring(0);\n`;
      code += `      translateY.value = withSpring(0);\n`;
      code += `    });\n\n`;

      code += `  return { panGesture, translateX, translateY };\n`;
      code += `}\n\n`;
    }

    if (hasTap) {
      code += `/**\n * Tap gesture for ${area.nodeName}\n */\n`;
      code += `export function use${areaName}TapGesture(onTap: () => void) {\n`;
      code += `  const tapGesture = Gesture.Tap()\n`;
      code += `    .onEnd(() => {\n`;
      code += `      onTap();\n`;
      code += `    });\n\n`;
      code += `  return tapGesture;\n`;
      code += `}\n\n`;
    }

    if (hasLongPress) {
      code += `/**\n * Long press gesture for ${area.nodeName}\n */\n`;
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
