/**
 * Анализатор элементов Figma для умного определения типа компонента
 * Smart element analyzer for Figma nodes - detects component types and recommends actions
 */

import { FigmaNodeFull } from './figma-api-client.js';

/**
 * Тип элемента / Element type classification
 */
export type ElementType =
  // Примитивы / Primitives
  | 'icon'
  | 'illustration'
  | 'logo'
  | 'avatar'
  | 'token'

  // Базовые компоненты (Молекулы) / Basic Components (Molecules)
  | 'button'
  | 'input'
  | 'checkbox'
  | 'radio'
  | 'switch'
  | 'slider'
  | 'picker'
  | 'chip'
  | 'badge'
  | 'indicator'

  // Составные компоненты (Организмы) / Composite Components (Organisms)
  | 'card'
  | 'list-item'
  | 'menu-item'
  | 'header'
  | 'tab-bar'
  | 'form-field'
  | 'section'

  // Оверлеи / Overlays
  | 'modal'
  | 'bottom-sheet'
  | 'action-sheet'
  | 'dialog'
  | 'toast'
  | 'popover'

  // Макеты / Layouts
  | 'list'
  | 'grid'
  | 'scroll-view'

  // Экраны / Screens
  | 'screen'
  | 'screen-fragment'

  // Системные элементы / System
  | 'status-bar'
  | 'keyboard'
  | 'tab-bar-system'

  // Неизвестный тип / Unknown
  | 'unknown';

/**
 * Рекомендуемое действие для элемента / Recommended action for element
 */
export type RecommendedAction =
  | 'generate_icon'        // Сгенерировать иконку / Generate icon
  | 'generate_component'   // Сгенерировать компонент / Generate component
  | 'generate_screen'      // Сгенерировать экран / Generate screen
  | 'generate_modal'       // Сгенерировать модал / Generate modal
  | 'generate_sheet'       // Сгенерировать bottom sheet / Generate bottom sheet
  | 'use_existing'         // Использовать существующий компонент / Use existing component
  | 'skip_system'          // Пропустить системный элемент / Skip system element
  | 'ask_llm';            // Спросить LLM для принятия решения / Ask LLM for decision

/**
 * Проблема целостности компонента / Component integrity issue
 */
export interface IntegrityIssue {
  type: 'detached-instance' | 'override-breaks-component' | 'missing-component';
  nodeId: string;
  nodeName: string;
  suggestion: string;
}

/**
 * Сигналы паттернов в узле / Pattern signals detected in node
 */
export interface PatternSignals {
  hasStatusBar: boolean;
  /** Настоящий оверлей модала (тёмный, полноэкранный) / True modal overlay (dark, full-screen backdrop) */
  hasModalOverlay: boolean;
  /** Плавающий футер с кнопкой (sticky CTA) / Floating footer with button (sticky CTA area) */
  hasFloatingFooter: boolean;
  hasDragHandle: boolean;
  hasCloseButton: boolean;
  isListLike: boolean;
  hasFormElements: boolean;
  isSmallIcon: boolean;
  isFullWidth: boolean;
  isFullHeight: boolean;
}

/**
 * Анализ дочерних элементов / Children analysis
 */
export interface ChildrenAnalysis {
  totalCount: number;
  componentCount: number;
  instanceCount: number;
  textCount: number;
  vectorCount: number;
  frameCount: number;
}

/**
 * Вариант выбора для пользователя / Choice option for user
 */
export interface ChoiceOption {
  value: string;
  label: string;
  description: string;
}

/**
 * Следующий шаг для LLM / Next step instruction for LLM
 * Определяет точное действие, которое должен выполнить LLM
 */
export interface NextStep {
  /**
   * Тип действия / Action type
   * - call_tool: Вызвать MCP инструмент / Call MCP tool
   * - inform_user: Сообщить пользователю информацию / Inform user with message
   * - ask_user: Спросить пользователя и дождаться выбора / Ask user and wait for choice
   * - skip: Пропустить элемент / Skip element
   */
  action: 'call_tool' | 'inform_user' | 'ask_user' | 'skip';

  /** Имя MCP инструмента для вызова / MCP tool name to call */
  tool?: 'generate_screen' | 'generate_flow' | 'analyze_element';

  /** Параметры для инструмента / Parameters for tool */
  toolParams?: {
    figmaUrl?: string;
    screenName?: string;
    componentId?: string;
  };

  /** Сообщение для пользователя / Message for user */
  message?: string;

  /** Вопрос для пользователя / Question for user */
  question?: string;

  /** Варианты выбора с описаниями / Choice options with descriptions */
  options?: ChoiceOption[];

  /** Причина действия / Reason for action */
  reason: string;
}

/**
 * Полный результат анализа элемента / Complete element analysis result
 */
export interface ElementAnalysis {
  elementType: ElementType;
  confidence: number;  // 0-1

  // Метаданные Figma / Figma metadata
  figmaNodeType: string;
  nodeName: string;
  dimensions: { width: number; height: number };
  hasVariants: boolean;
  isInstance: boolean;
  componentId?: string;

  // Обнаруженные сигналы паттернов / Pattern signals detected
  signals: PatternSignals;

  // Проблемы целостности / Integrity check
  integrityIssues: IntegrityIssue[];

  // Анализ дочерних элементов / Children analysis
  childrenAnalysis: ChildrenAnalysis;

  // Рекомендация / Recommendation
  recommendedAction: RecommendedAction;

  // Следующий шаг для LLM / Next step for LLM
  nextStep: NextStep;

  // Для решения LLM (когда низкая уверенность) / For LLM decision (when confidence low)
  screenshotPath?: string;
  analysisContext: string;  // Human-readable analysis
}

/**
 * Категория размера элемента / Size category
 */
type SizeCategory = 'icon' | 'component' | 'screen';

/**
 * Классификация по размерам / Classify by dimensions
 * Определяет категорию элемента на основе размеров
 */
function classifyByDimensions(width: number, height: number): SizeCategory {
  // Иконка: меньше 64x64 / Icon: < 64x64
  if (width < 64 && height < 64) {
    return 'icon';
  }

  // Экран: больше 350 ширина И больше 600 высота / Screen: > 350 width AND > 600 height
  if (width > 350 && height > 600) {
    return 'screen';
  }

  // Компонент: промежуточный размер / Component: intermediate size
  return 'component';
}

/**
 * Классификация по типу узла Figma / Classify by Figma node type
 * Возвращает базовый тип на основе типа узла Figma
 */
function classifyByNodeType(nodeType: string): ElementType {
  switch (nodeType) {
    case 'VECTOR':
    case 'BOOLEAN_OPERATION':
      return 'icon';

    case 'COMPONENT':
    case 'COMPONENT_SET':
      return 'unknown'; // Нужен дополнительный анализ / Needs further analysis

    case 'FRAME':
      return 'unknown'; // Нужен дополнительный анализ / Needs further analysis

    case 'INSTANCE':
      return 'unknown'; // Нужен дополнительный анализ / Needs further analysis

    case 'TEXT':
      return 'unknown'; // Обычно не анализируем отдельно / Usually not analyzed separately

    default:
      return 'unknown';
  }
}

// ============================================================================
// Вспомогательные функции для обнаружения паттернов / Helper functions for pattern detection
// ============================================================================

/**
 * Проверка, является ли цвет тёмным / Check if color is dark
 * Используется для определения настоящего оверлея модала
 */
function isDarkColor(color: { r: number; g: number; b: number }): boolean {
  // Тёмный цвет: все компоненты RGB < 0.3 (примерно #4D4D4D и темнее)
  return color.r < 0.3 && color.g < 0.3 && color.b < 0.3;
}

/**
 * Проверка, покрывает ли элемент большую часть родителя / Check if element covers most of parent
 */
function isLargeCoverage(
  child: { width: number; height: number },
  parent: { width: number; height: number }
): boolean {
  const widthRatio = child.width / parent.width;
  const heightRatio = child.height / parent.height;
  // Покрывает > 90% ширины и > 50% высоты
  return widthRatio > 0.9 && heightRatio > 0.5;
}

/**
 * Проверка, находится ли элемент внизу экрана / Check if element is at bottom of screen
 */
function isAtBottom(
  child: { y: number; height: number },
  parent: { height: number }
): boolean {
  const childBottom = child.y + child.height;
  // Элемент заканчивается в нижних 15% экрана
  return childBottom > parent.height * 0.85;
}

/**
 * Проверка, содержит ли элемент кнопку / Check if element contains a button
 */
function containsButton(node: FigmaNodeFull): boolean {
  if (!node.children) return false;

  return node.children.some(child => {
    const childName = child.name.toLowerCase();
    return childName.includes('button') ||
           childName.includes('btn') ||
           childName.includes('cta') ||
           childName.includes('submit') ||
           childName.includes('confirm');
  });
}

/**
 * Обнаружение паттернов в узле / Detect patterns in node
 * Проверяет различные паттерны для определения типа элемента
 */
function detectPatterns(node: FigmaNodeFull): PatternSignals {
  const signals: PatternSignals = {
    hasStatusBar: false,
    hasModalOverlay: false,
    hasFloatingFooter: false,
    hasDragHandle: false,
    hasCloseButton: false,
    isListLike: false,
    hasFormElements: false,
    isSmallIcon: false,
    isFullWidth: false,
    isFullHeight: false,
  };

  // Размеры родителя для сравнений / Parent dimensions for comparisons
  const parentBounds = node.absoluteBoundingBox;

  // Проверка размеров / Check dimensions
  if (parentBounds) {
    const { width, height } = parentBounds;

    signals.isSmallIcon = width < 64 && height < 64;
    signals.isFullWidth = width > 350;
    signals.isFullHeight = height > 600;
  }

  // Проверка имени узла / Check node name
  const nameLower = node.name.toLowerCase();

  // StatusBar: имя содержит "statusbar" или "status bar" / StatusBar detection
  if (nameLower.includes('statusbar') || nameLower.includes('status bar') || nameLower.includes('status-bar')) {
    signals.hasStatusBar = true;
  }

  // DragHandle: имя содержит "handle" или "drag" / Drag handle detection
  if (nameLower.includes('handle') || nameLower.includes('drag') || nameLower.includes('grip')) {
    signals.hasDragHandle = true;
  }

  // CloseButton: имя содержит "close" или "x" / Close button detection
  if (nameLower.includes('close') || nameLower.includes('dismiss') || nameLower === 'x' || nameLower.includes('×')) {
    signals.hasCloseButton = true;
  }

  // Проверка детей на наличие паттернов / Check children for patterns
  if (node.children && node.children.length > 0 && parentBounds) {
    // Проверка на StatusBar в детях / Check for StatusBar in children
    const hasStatusBarChild = node.children.some(child => {
      const childName = child.name.toLowerCase();
      return childName.includes('statusbar') ||
             childName.includes('status bar') ||
             childName.includes('time') && childName.includes('battery');
    });
    if (hasStatusBarChild) {
      signals.hasStatusBar = true;
    }

    // ════════════════════════════════════════════════════════════════════════
    // Обнаружение НАСТОЯЩЕГО модального оверлея / Detect TRUE modal overlay
    // Критерии: большой, тёмный, полупрозрачный фон
    // ════════════════════════════════════════════════════════════════════════
    const hasModalOverlayChild = node.children.some(child => {
      const childName = child.name.toLowerCase();

      // Проверка имени / Check name
      const hasOverlayName = childName.includes('overlay') ||
                             childName.includes('backdrop') ||
                             childName.includes('scrim') ||
                             childName.includes('dim');

      // Проверка размеров / Check dimensions
      let isLarge = false;
      if (child.absoluteBoundingBox) {
        isLarge = isLargeCoverage(child.absoluteBoundingBox, parentBounds);
      }

      // Проверка цвета и прозрачности / Check color and opacity
      let isDarkAndSemiTransparent = false;
      if (child.fills && Array.isArray(child.fills)) {
        isDarkAndSemiTransparent = child.fills.some(fill => {
          if (fill.type === 'SOLID' && fill.color) {
            const opacity = fill.opacity ?? fill.color.a ?? 1.0;
            const dark = isDarkColor(fill.color);
            const semiTransparent = opacity > 0.2 && opacity < 0.8;
            return dark && semiTransparent;
          }
          return false;
        });
      }

      // Настоящий оверлей: имя ИЛИ (большой + тёмный + полупрозрачный)
      // True overlay: named OR (large + dark + semi-transparent)
      return hasOverlayName || (isLarge && isDarkAndSemiTransparent);
    });
    if (hasModalOverlayChild) {
      signals.hasModalOverlay = true;
    }

    // ════════════════════════════════════════════════════════════════════════
    // Обнаружение плавающего футера (sticky CTA) / Detect floating footer
    // Критерии: внизу экрана, небольшой, содержит кнопку
    // ════════════════════════════════════════════════════════════════════════
    const hasFloatingFooterChild = node.children.some(child => {
      const childName = child.name.toLowerCase();

      // Проверка имени / Check name
      const isFooterNamed = childName.includes('footer') ||
                            childName.includes('bottom') ||
                            childName.includes('cta') ||
                            childName.includes('action') ||
                            childName.includes('floating');

      // Проверка позиции и размеров / Check position and dimensions
      let atBottom = false;
      let isSmallHeight = false;
      if (child.absoluteBoundingBox) {
        atBottom = isAtBottom(child.absoluteBoundingBox, parentBounds);
        isSmallHeight = child.absoluteBoundingBox.height < 150;
      }

      // Проверка на наличие кнопки / Check for button
      const hasButton = containsButton(child as FigmaNodeFull);

      // Плавающий футер: внизу + небольшой высоты + (имя футера ИЛИ есть кнопка)
      return atBottom && isSmallHeight && (isFooterNamed || hasButton);
    });
    if (hasFloatingFooterChild) {
      signals.hasFloatingFooter = true;
    }

    // Проверка на DragHandle в детях / Check for drag handle in children
    const hasDragHandleChild = node.children.some(child => {
      const childName = child.name.toLowerCase();
      const hasHandleName = childName.includes('handle') || childName.includes('drag') || childName.includes('indicator') || childName.includes('grip');

      // Проверка размеров: маленький горизонтальный элемент / Check dimensions: small horizontal element
      let isHandleSize = false;
      if (child.absoluteBoundingBox) {
        const { width, height } = child.absoluteBoundingBox;
        isHandleSize = width > 20 && width < 100 && height > 2 && height < 10;
      }

      return hasHandleName || isHandleSize;
    });
    if (hasDragHandleChild) {
      signals.hasDragHandle = true;
    }

    // Проверка на CloseButton в детях / Check for close button in children
    const hasCloseButtonChild = node.children.some(child => {
      const childName = child.name.toLowerCase();
      return childName.includes('close') || childName.includes('dismiss') || childName === 'x' || childName.includes('×');
    });
    if (hasCloseButtonChild) {
      signals.hasCloseButton = true;
    }

    // Проверка на список (3+ похожих детей) / Check for list (3+ similar children)
    if (node.children.length >= 3) {
      // Группируем детей по размерам / Group children by dimensions
      const dimensionGroups: Map<string, number> = new Map();

      node.children.forEach(child => {
        if (child.absoluteBoundingBox) {
          const { width, height } = child.absoluteBoundingBox;
          const key = `${Math.round(width / 10)}_${Math.round(height / 10)}`;
          dimensionGroups.set(key, (dimensionGroups.get(key) || 0) + 1);
        }
      });

      // Если есть группа из 3+ элементов одинакового размера / If there's a group of 3+ same-sized elements
      const hasLargeGroup = Array.from(dimensionGroups.values()).some(count => count >= 3);
      if (hasLargeGroup) {
        signals.isListLike = true;
      }
    }

    // Проверка на элементы формы / Check for form elements
    const hasFormChild = node.children.some(child => {
      const childName = child.name.toLowerCase();
      return childName.includes('input') ||
             childName.includes('field') ||
             childName.includes('checkbox') ||
             childName.includes('radio') ||
             childName.includes('switch') ||
             childName.includes('button') && (childName.includes('submit') || childName.includes('send'));
    });
    if (hasFormChild) {
      signals.hasFormElements = true;
    }
  }

  return signals;
}

/**
 * Проверка целостности компонента / Check component integrity
 * Анализирует, правильно ли связаны компоненты и экземпляры
 */
function checkComponentIntegrity(node: FigmaNodeFull): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];

  // Проверка: является ли INSTANCE с валидным componentId / Check: is INSTANCE with valid componentId
  if (node.type === 'INSTANCE') {
    if (!node.componentId) {
      issues.push({
        type: 'detached-instance',
        nodeId: node.id,
        nodeName: node.name,
        suggestion: 'Экземпляр отвязан от компонента. Пересоздайте экземпляр из компонента. / Instance is detached from component. Recreate instance from component.',
      });
    }
  }

  // Проверка детей на отвязанные экземпляры / Check children for detached instances
  if (node.children) {
    node.children.forEach(child => {
      if (child.type === 'INSTANCE' && !child.componentId) {
        issues.push({
          type: 'detached-instance',
          nodeId: child.id,
          nodeName: child.name,
          suggestion: `Дочерний экземпляр "${child.name}" отвязан от компонента / Child instance "${child.name}" is detached from component`,
        });
      }

      // Проверка на FRAME, который должен быть INSTANCE / Check for FRAME that should be INSTANCE
      if (child.type === 'FRAME') {
        const childName = child.name.toLowerCase();
        // Если имя содержит признаки компонента, но это FRAME / If name suggests it's a component, but it's a FRAME
        if (childName.includes('component') || childName.includes('instance') || childName.includes('btn') || childName.includes('card')) {
          issues.push({
            type: 'missing-component',
            nodeId: child.id,
            nodeName: child.name,
            suggestion: `"${child.name}" выглядит как компонент, но это FRAME. Преобразуйте в компонент. / "${child.name}" looks like a component but is a FRAME. Convert to component.`,
          });
        }
      }
    });
  }

  return issues;
}

/**
 * Анализ дочерних элементов / Analyze children
 * Подсчитывает количество различных типов дочерних узлов
 */
function analyzeChildren(node: FigmaNodeFull): ChildrenAnalysis {
  const analysis: ChildrenAnalysis = {
    totalCount: 0,
    componentCount: 0,
    instanceCount: 0,
    textCount: 0,
    vectorCount: 0,
    frameCount: 0,
  };

  if (!node.children) {
    return analysis;
  }

  analysis.totalCount = node.children.length;

  node.children.forEach(child => {
    switch (child.type) {
      case 'COMPONENT':
      case 'COMPONENT_SET':
        analysis.componentCount++;
        break;
      case 'INSTANCE':
        analysis.instanceCount++;
        break;
      case 'TEXT':
        analysis.textCount++;
        break;
      case 'VECTOR':
      case 'BOOLEAN_OPERATION':
        analysis.vectorCount++;
        break;
      case 'FRAME':
        analysis.frameCount++;
        break;
    }
  });

  return analysis;
}

/**
 * Расчет уверенности / Calculate confidence
 * Определяет уровень уверенности в классификации элемента
 */
function calculateConfidence(
  elementType: ElementType,
  signals: PatternSignals,
  nodeType: string,
  dimensions: { width: number; height: number },
  hasVariants: boolean,
  childrenAnalysis: ChildrenAnalysis
): number {
  let confidence = 0;

  // Базовая уверенность по типу узла / Base confidence by node type
  if (nodeType === 'COMPONENT' || nodeType === 'COMPONENT_SET') {
    confidence += 0.4;
  } else if (nodeType === 'INSTANCE') {
    confidence += 0.35;
  } else if (nodeType === 'VECTOR' || nodeType === 'BOOLEAN_OPERATION') {
    confidence += 0.5; // Векторы обычно иконки / Vectors are usually icons
  } else if (nodeType === 'FRAME') {
    confidence += 0.2; // FRAMEs нуждаются в дополнительном анализе / FRAMEs need more analysis
  }

  // Уверенность по размерам / Confidence by dimensions
  const sizeCategory = classifyByDimensions(dimensions.width, dimensions.height);

  if (elementType === 'icon' && sizeCategory === 'icon') {
    confidence += 0.3;
  } else if (elementType === 'screen' && sizeCategory === 'screen') {
    confidence += 0.4; // Высокая уверенность для экранов по размерам / High confidence for screen-sized elements
  } else if (sizeCategory === 'component') {
    // Любой элемент в диапазоне компонентов / Any element in component range
    confidence += 0.2;
    if (elementType === 'button' || elementType === 'card' || elementType === 'input' ||
        elementType === 'list-item' || elementType === 'header') {
      confidence += 0.1;
    }
  }

  // Уверенность по сигналам / Confidence by signals
  if (elementType === 'bottom-sheet' && signals.hasDragHandle) {
    confidence += 0.3;
  }
  if (elementType === 'modal' && signals.hasModalOverlay) {
    confidence += 0.25;
  }
  if (elementType === 'modal' && signals.hasCloseButton) {
    confidence += 0.15;
  }
  if (elementType === 'screen' && signals.hasStatusBar) {
    confidence += 0.2;
  }
  if ((elementType === 'list' || elementType === 'list-item') && signals.isListLike) {
    confidence += 0.2;
  }
  if (signals.hasFormElements && (elementType === 'form-field' || elementType === 'section')) {
    confidence += 0.2;
  }

  // Уверенность по вариантам / Confidence by variants
  if (hasVariants) {
    confidence += 0.15;
    if (elementType === 'button' || elementType === 'chip' || elementType === 'badge' || elementType === 'input') {
      confidence += 0.1;
    }
  }

  // Уверенность по структуре детей / Confidence by children structure
  if (childrenAnalysis.instanceCount > 0 && elementType !== 'icon') {
    confidence += 0.15; // Наличие экземпляров говорит о составном компоненте / Presence of instances suggests composite component
  }
  if (childrenAnalysis.totalCount > 5 && (elementType === 'screen' || elementType === 'card' || elementType === 'section')) {
    confidence += 0.1;
  }

  // Ограничиваем в диапазоне 0-1 / Clamp to 0-1 range
  return Math.min(Math.max(confidence, 0), 1);
}

/**
 * Определение типа элемента / Determine element type
 * Комплексный анализ для определения конкретного типа элемента
 */
function determineElementType(
  node: FigmaNodeFull,
  signals: PatternSignals,
  sizeCategory: SizeCategory,
  childrenAnalysis: ChildrenAnalysis
): ElementType {
  const nameLower = node.name.toLowerCase();

  // ВАЖНО: Проверяем экран ДО системных элементов / Check screen BEFORE system elements
  // Экран с StatusBar - это экран, а не status-bar / Screen with StatusBar is a screen, not status-bar
  if (sizeCategory === 'screen') {
    // Если это экран (по размерам) и имеет StatusBar как дочерний элемент - это экран
    // If it's screen-sized and has StatusBar as child - it's a screen
    if (signals.hasStatusBar && !nameLower.includes('statusbar') && !nameLower.includes('status bar')) {
      return 'screen';
    }
    if (nameLower.includes('screen') || nameLower.includes('page')) {
      return 'screen';
    }
    if (nameLower.includes('fragment') || nameLower.includes('section')) {
      return 'screen-fragment';
    }
    // По умолчанию для больших фреймов - экран / Default for large frames - screen
    return 'screen';
  }

  // Системные элементы - только если сам узел является системным / System elements - only if node itself is system
  if (nameLower.includes('statusbar') || nameLower.includes('status bar') || nameLower.includes('status-bar')) {
    return 'status-bar';
  }
  if (nameLower.includes('keyboard')) {
    return 'keyboard';
  }
  if (nameLower.includes('tab bar') && nameLower.includes('system')) {
    return 'tab-bar-system';
  }

  // Оверлеи / Overlays
  if (nameLower.includes('bottom') && nameLower.includes('sheet')) {
    return 'bottom-sheet';
  }
  if (nameLower.includes('action') && nameLower.includes('sheet')) {
    return 'action-sheet';
  }
  if (nameLower.includes('modal') || nameLower.includes('dialog')) {
    return 'modal';
  }
  if (nameLower.includes('toast') || nameLower.includes('snackbar')) {
    return 'toast';
  }
  if (nameLower.includes('popover') || nameLower.includes('tooltip')) {
    return 'popover';
  }

  // По сигналам оверлея / By overlay signals
  if (signals.hasDragHandle) {
    return 'bottom-sheet';
  }
  if (signals.hasModalOverlay && signals.hasCloseButton) {
    return 'modal';
  }
  if (signals.hasModalOverlay) {
    return 'modal';
  }

  // Иконки / Icons
  if (sizeCategory === 'icon') {
    if (node.type === 'VECTOR' || node.type === 'BOOLEAN_OPERATION') {
      if (nameLower.includes('logo')) {
        return 'logo';
      }
      if (nameLower.includes('avatar') || nameLower.includes('profile')) {
        return 'avatar';
      }
      if (nameLower.includes('illustration') || nameLower.includes('image')) {
        return 'illustration';
      }
      return 'icon';
    }
    if (nameLower.includes('icon')) {
      return 'icon';
    }
    if (nameLower.includes('avatar')) {
      return 'avatar';
    }
    return 'token';
  }

  // Составные компоненты / Composite components
  // ВАЖНО: Проверяем имена компонентов ДО проверки сигналов макетов / Check component names BEFORE layout signals
  if (nameLower.includes('card')) {
    return 'card';
  }
  // Важно проверить list-item ДО list / Check list-item BEFORE list
  if (nameLower.includes('listitem') || nameLower.includes('list-item') || nameLower.includes('list item') || nameLower.includes('row')) {
    return 'list-item';
  }

  // Макеты / Layouts - ПОСЛЕ проверки list-item / AFTER list-item check
  if (nameLower.includes('grid')) {
    return 'grid';
  }
  if (nameLower.includes('scroll')) {
    return 'scroll-view';
  }
  // List check - только если это не list-item (проверили выше) / Only if not list-item (checked above)
  if (signals.isListLike || nameLower.includes('list')) {
    return 'list';
  }
  if (nameLower.includes('menuitem') || nameLower.includes('menu-item') || nameLower.includes('menu item')) {
    return 'menu-item';
  }
  if (nameLower.includes('header') || nameLower.includes('navbar')) {
    return 'header';
  }
  if (nameLower.includes('tab-bar') || nameLower.includes('tab bar') || nameLower.includes('tabbar')) {
    return 'tab-bar';
  }
  if (nameLower.includes('form-field') || nameLower.includes('form field') || nameLower.includes('formfield')) {
    return 'form-field';
  }
  if (nameLower.includes('form') && signals.hasFormElements) {
    return 'section';
  }
  if (nameLower.includes('section')) {
    return 'section';
  }

  // Базовые компоненты / Basic components
  if (nameLower.includes('button') || nameLower.includes('btn')) {
    return 'button';
  }
  if (nameLower.includes('input') || nameLower.includes('textfield') || nameLower.includes('text field')) {
    return 'input';
  }
  if (nameLower.includes('checkbox')) {
    return 'checkbox';
  }
  if (nameLower.includes('radio')) {
    return 'radio';
  }
  if (nameLower.includes('switch') || nameLower.includes('toggle')) {
    return 'switch';
  }
  if (nameLower.includes('slider')) {
    return 'slider';
  }
  if (nameLower.includes('picker') || nameLower.includes('select')) {
    return 'picker';
  }
  if (nameLower.includes('chip') || nameLower.includes('tag')) {
    return 'chip';
  }
  if (nameLower.includes('badge')) {
    return 'badge';
  }
  if (nameLower.includes('indicator') || nameLower.includes('dot')) {
    return 'indicator';
  }

  // Если есть дети-экземпляры, вероятно это составной компонент / If has instance children, probably composite
  if (childrenAnalysis.instanceCount > 2) {
    return 'card';
  }

  return 'unknown';
}

/**
 * Определение рекомендуемого действия / Determine recommended action
 * На основе типа элемента и уверенности
 */
function determineRecommendedAction(
  elementType: ElementType,
  confidence: number,
  isInstance: boolean,
  hasComponentId: boolean
): RecommendedAction {
  // Низкая уверенность - спросить LLM / Low confidence - ask LLM
  if (confidence < 0.5) {
    return 'ask_llm';
  }

  // Системные элементы - пропустить / System elements - skip
  if (elementType === 'status-bar' || elementType === 'keyboard' || elementType === 'tab-bar-system') {
    return 'skip_system';
  }

  // Экземпляр с валидным componentId - использовать существующий / Instance with valid componentId - use existing
  if (isInstance && hasComponentId) {
    return 'use_existing';
  }

  // Оверлеи / Overlays
  if (elementType === 'bottom-sheet' || elementType === 'action-sheet') {
    return 'generate_sheet';
  }
  if (elementType === 'modal' || elementType === 'dialog' || elementType === 'toast' || elementType === 'popover') {
    return 'generate_modal';
  }

  // Иконки / Icons
  if (elementType === 'icon' || elementType === 'logo' || elementType === 'illustration') {
    return 'generate_icon';
  }

  // Экраны / Screens
  if (elementType === 'screen' || elementType === 'screen-fragment') {
    return 'generate_screen';
  }

  // Все остальные компоненты / All other components
  return 'generate_component';
}

/**
 * Генерация контекста анализа для LLM / Generate analysis context for LLM
 * Создает читаемое описание анализа для принятия решения
 */
function generateAnalysisContext(analysis: ElementAnalysis): string {
  let context = `## Element Analysis: ${analysis.nodeName}\n\n`;

  context += `**Figma Type**: ${analysis.figmaNodeType}\n`;
  context += `**Dimensions**: ${analysis.dimensions.width}x${analysis.dimensions.height}px\n`;
  context += `**Detected Type**: ${analysis.elementType} (confidence: ${Math.round(analysis.confidence * 100)}%)\n`;
  context += `**Recommended Action**: ${analysis.recommendedAction}\n\n`;

  // Информация о компоненте / Component info
  if (analysis.isInstance) {
    context += `**Component Status**: Instance`;
    if (analysis.componentId) {
      context += ` (linked to component ${analysis.componentId})`;
    } else {
      context += ` (⚠️ detached from component!)`;
    }
    context += '\n';
  } else if (analysis.figmaNodeType === 'COMPONENT' || analysis.figmaNodeType === 'COMPONENT_SET') {
    context += `**Component Status**: Component definition\n`;
  }

  if (analysis.hasVariants) {
    context += `**Has Variants**: Yes\n`;
  }

  context += '\n';

  // Сигналы паттернов / Pattern signals
  context += `### Pattern Signals\n\n`;
  const activeSignals = Object.entries(analysis.signals)
    .filter(([_, value]) => value)
    .map(([key, _]) => key);

  if (activeSignals.length > 0) {
    activeSignals.forEach(signal => {
      context += `- ✓ ${signal}\n`;
    });
  } else {
    context += `- No special patterns detected\n`;
  }
  context += '\n';

  // Анализ детей / Children analysis
  context += `### Children Structure\n\n`;
  context += `- **Total**: ${analysis.childrenAnalysis.totalCount}\n`;
  if (analysis.childrenAnalysis.componentCount > 0) {
    context += `- **Components**: ${analysis.childrenAnalysis.componentCount}\n`;
  }
  if (analysis.childrenAnalysis.instanceCount > 0) {
    context += `- **Instances**: ${analysis.childrenAnalysis.instanceCount}\n`;
  }
  if (analysis.childrenAnalysis.textCount > 0) {
    context += `- **Text nodes**: ${analysis.childrenAnalysis.textCount}\n`;
  }
  if (analysis.childrenAnalysis.vectorCount > 0) {
    context += `- **Vector nodes**: ${analysis.childrenAnalysis.vectorCount}\n`;
  }
  if (analysis.childrenAnalysis.frameCount > 0) {
    context += `- **Frame nodes**: ${analysis.childrenAnalysis.frameCount}\n`;
  }
  context += '\n';

  // Проблемы целостности / Integrity issues
  if (analysis.integrityIssues.length > 0) {
    context += `### ⚠️ Integrity Issues\n\n`;
    analysis.integrityIssues.forEach((issue, index) => {
      context += `${index + 1}. **${issue.type}** in "${issue.nodeName}"\n`;
      context += `   ${issue.suggestion}\n\n`;
    });
  }

  // Скриншот / Screenshot
  if (analysis.screenshotPath) {
    context += `### Screenshot\n\n`;
    context += `![${analysis.nodeName}](${analysis.screenshotPath})\n\n`;
  }

  return context;
}

// ============================================================================
// Умное преобразование имён / Smart Name Conversion
// ============================================================================

/**
 * Словари для классификации слов в контексте UI / Word classification dictionaries for UI context
 */
const UI_VERBS = new Set([
  'edit', 'create', 'delete', 'add', 'remove', 'select', 'search', 'filter',
  'submit', 'cancel', 'confirm', 'save', 'load', 'update', 'view', 'show',
  'hide', 'open', 'close', 'login', 'logout', 'register', 'signup', 'signin',
  'send', 'share', 'copy', 'paste', 'cut', 'undo', 'redo', 'reset', 'clear',
  'refresh', 'sync', 'upload', 'download', 'export', 'import', 'buy', 'sell',
  'pay', 'checkout', 'book', 'reserve', 'order', 'track', 'follow', 'like',
  'comment', 'rate', 'review', 'report', 'block', 'mute', 'archive',
]);

const UI_ADJECTIVES = new Set([
  // Состояния / States
  'empty', 'full', 'loading', 'loaded', 'active', 'inactive', 'disabled',
  'enabled', 'selected', 'unselected', 'checked', 'unchecked', 'open', 'closed',
  'expanded', 'collapsed', 'visible', 'hidden', 'focused', 'blurred',
  'valid', 'invalid', 'error', 'success', 'warning', 'pending', 'complete',
  'done', 'failed', 'cancelled', 'locked', 'unlocked',
  // Размеры / Sizes
  'large', 'small', 'medium', 'mini', 'tiny', 'big', 'compact', 'wide', 'narrow',
  // Позиции / Positions
  'top', 'bottom', 'left', 'right', 'center', 'middle', 'start', 'end',
  'first', 'last', 'next', 'prev', 'previous',
  // Приоритеты / Priorities
  'primary', 'secondary', 'tertiary', 'main', 'default', 'alt', 'alternative',
  // Состояния UI / UI states
  'new', 'old', 'recent', 'featured', 'popular', 'trending', 'hot', 'premium',
  // Специфичные / Specific
  'master', 'detail', 'overview', 'summary', 'preview', 'draft', 'final',
]);

const UI_TYPES = new Set([
  // Экраны / Screens
  'screen', 'page', 'view', 'fragment',
  // Оверлеи / Overlays
  'modal', 'dialog', 'sheet', 'popup', 'popover', 'tooltip', 'toast', 'alert',
  // Компоненты / Components
  'card', 'button', 'btn', 'input', 'field', 'form', 'list', 'item', 'row',
  'cell', 'header', 'footer', 'nav', 'navbar', 'sidebar', 'tab', 'tabs',
  'menu', 'dropdown', 'select', 'picker', 'slider', 'switch', 'toggle',
  'checkbox', 'radio', 'badge', 'chip', 'tag', 'label', 'icon', 'avatar',
  'image', 'banner', 'section', 'container', 'wrapper', 'group', 'panel',
  'bar', 'toolbar', 'action', 'fab',
]);

/**
 * Тип слова для классификации / Word type for classification
 */
type WordType = 'verb' | 'adjective' | 'noun' | 'type';

/**
 * Классификация слова / Classify a word
 */
function classifyWord(word: string): WordType {
  const lower = word.toLowerCase();

  if (UI_VERBS.has(lower)) return 'verb';
  if (UI_ADJECTIVES.has(lower)) return 'adjective';
  if (UI_TYPES.has(lower)) return 'type';

  // По умолчанию - существительное (сущность) / Default - noun (entity)
  return 'noun';
}

/**
 * Умное преобразование имени компонента / Smart component name conversion
 *
 * Порядок слов: [Adjective] + [Verb] + [Noun] + [Type]
 *
 * Примеры / Examples:
 * - "Search/emty" → "EmptySearchScreen"
 * - "Profile master" → "MasterProfileScreen"
 * - "edit_profile" → "EditProfileScreen"
 * - "Card_Visit" → "VisitCard"
 */
function toSmartPascalCase(name: string, elementType?: ElementType): string {
  // Очистка и разбиение на слова / Clean and split into words
  const words = name
    .replace(/[^a-zA-Z0-9\s_\-/]/g, '')
    .split(/[\s_\-/]+/)
    .filter(w => w.length > 0)
    .map(w => w.toLowerCase());

  if (words.length === 0) return 'Unknown';

  // Классификация каждого слова / Classify each word
  const classified = words.map(word => ({
    word,
    type: classifyWord(word),
  }));

  // Группировка по типам / Group by types
  const adjectives: string[] = [];
  const verbs: string[] = [];
  const nouns: string[] = [];
  const types: string[] = [];

  classified.forEach(({ word, type }) => {
    switch (type) {
      case 'adjective':
        adjectives.push(word);
        break;
      case 'verb':
        verbs.push(word);
        break;
      case 'type':
        types.push(word);
        break;
      default:
        nouns.push(word);
    }
  });

  // Определение суффикса типа на основе elementType / Determine type suffix based on elementType
  let typeSuffix = '';
  if (types.length === 0 && elementType) {
    // Добавляем суффикс только для определённых типов / Add suffix only for certain types
    switch (elementType) {
      case 'screen':
      case 'screen-fragment':
        typeSuffix = 'Screen';
        break;
      case 'modal':
      case 'dialog':
        typeSuffix = 'Modal';
        break;
      case 'bottom-sheet':
      case 'action-sheet':
        typeSuffix = 'Sheet';
        break;
      case 'card':
        typeSuffix = 'Card';
        break;
      case 'button':
        typeSuffix = 'Button';
        break;
      case 'input':
        typeSuffix = 'Input';
        break;
      case 'list':
        typeSuffix = 'List';
        break;
      case 'list-item':
        typeSuffix = 'Item';
        break;
      // Для остальных типов суффикс не добавляем / No suffix for other types
    }
  }

  // Сборка имени в правильном порядке / Assemble name in correct order
  // [Adjective] + [Verb] + [Noun] + [Type]
  const orderedWords = [
    ...adjectives,
    ...verbs,
    ...nouns,
    ...types,
  ];

  // Преобразование в PascalCase / Convert to PascalCase
  const pascalName = orderedWords
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');

  // Добавление суффикса если нужно / Add suffix if needed
  if (typeSuffix && !pascalName.toLowerCase().includes(typeSuffix.toLowerCase())) {
    return pascalName + typeSuffix;
  }

  return pascalName || 'Unknown';
}

/**
 * Построение URL для компонента / Build URL for component
 * Заменяет node-id в URL на ID компонента, сохраняя остальные параметры (m=dev и др.)
 * Replaces node-id in URL with component ID, preserving other params (m=dev etc.)
 */
function buildComponentUrl(figmaUrl: string | undefined, componentId: string): string {
  if (!figmaUrl) {
    // Если URL не передан, создаём placeholder / If URL not provided, create placeholder
    return `[Figma URL with node-id=${componentId.replace(':', '-')}]`;
  }

  // Нормализуем ID компонента (: → -) / Normalize component ID (: → -)
  const normalizedComponentId = componentId.replace(':', '-');

  try {
    const url = new URL(figmaUrl);

    // Заменяем или добавляем node-id / Replace or add node-id
    url.searchParams.set('node-id', normalizedComponentId);

    // Убеждаемся что m=dev присутствует / Ensure m=dev is present
    if (!url.searchParams.has('m')) {
      url.searchParams.set('m', 'dev');
    }

    return url.toString();
  } catch {
    // Fallback для невалидных URL / Fallback for invalid URLs
    if (figmaUrl.includes('node-id=')) {
      return figmaUrl.replace(/node-id=[^&]+/, `node-id=${normalizedComponentId}`);
    }
    const separator = figmaUrl.includes('?') ? '&' : '?';
    return `${figmaUrl}${separator}node-id=${normalizedComponentId}&m=dev`;
  }
}

/**
 * Генерация следующего шага для LLM / Generate next step for LLM
 * Определяет точное действие на основе анализа
 */
function generateNextStep(
  analysis: Omit<ElementAnalysis, 'nextStep' | 'analysisContext'>,
  figmaUrl?: string
): NextStep {
  const { elementType, confidence, recommendedAction, isInstance, componentId, nodeName, signals } = analysis;

  // Преобразуем имя в PascalCase с учётом типа слов / Convert name to PascalCase with word type awareness
  const screenName = toSmartPascalCase(nodeName, elementType);

  // 1. Системные элементы - пропустить / System elements - skip
  if (recommendedAction === 'skip_system') {
    return {
      action: 'skip',
      reason: `${elementType} is a system UI element (StatusBar, Keyboard, etc.) that is provided by the OS. No code generation needed.`,
      message: `⏭️ Skipping "${nodeName}" - this is a system UI element provided by iOS/Android.`,
    };
  }

  // 2. Экземпляр компонента - перенаправить на анализ родительского компонента
  // Component instance - redirect to analyze parent component
  if (recommendedAction === 'use_existing' && isInstance && componentId) {
    const componentUrl = buildComponentUrl(figmaUrl, componentId);
    const componentName = toSmartPascalCase(nodeName, undefined); // Без суффикса типа для компонента

    return {
      action: 'call_tool',
      tool: 'analyze_element',
      toolParams: {
        figmaUrl: componentUrl,
        screenName: componentName,
        componentId,
      },
      reason: `This is an INSTANCE of component ${componentId}. Redirecting to analyze the parent COMPONENT to generate reusable code.`,
      message: `🔄 "${nodeName}" is an instance. Analyzing parent component...`,
    };
  }

  // 3. Низкая уверенность - спросить пользователя / Low confidence - ask user
  if (recommendedAction === 'ask_llm' || confidence < 0.5) {
    // Определяем возможные варианты на основе сигналов / Determine options based on signals
    const options: ChoiceOption[] = [];

    if (signals.hasModalOverlay || signals.hasDragHandle) {
      options.push({
        value: 'bottom-sheet',
        label: 'Bottom Sheet',
        description: 'Выдвижная панель снизу с drag handle. Используется для фильтров, деталей, выбора опций.',
      });
      options.push({
        value: 'modal',
        label: 'Modal Dialog',
        description: 'Модальное окно по центру экрана. Используется для подтверждений, алертов, форм.',
      });
    }

    if (signals.hasFormElements) {
      options.push({
        value: 'form',
        label: 'Form Component',
        description: 'Форма с полями ввода и валидацией. Генерируется с react-hook-form + Zod.',
      });
    }

    options.push({
      value: 'screen',
      label: 'Full Screen',
      description: 'Полноценный экран приложения с навигацией.',
    });

    options.push({
      value: 'component',
      label: 'Reusable Component',
      description: 'Переиспользуемый компонент для использования на других экранах.',
    });

    return {
      action: 'ask_user',
      reason: `Low confidence (${Math.round(confidence * 100)}%) in element type detection. Multiple interpretations possible.`,
      question: `🤔 Element "${nodeName}" could be interpreted differently.\n\n**Detected signals:**\n${signals.hasModalOverlay ? '• Has modal overlay/backdrop\n' : ''}${signals.hasFloatingFooter ? '• Has floating footer (sticky CTA)\n' : ''}${signals.hasDragHandle ? '• Has drag handle\n' : ''}${signals.hasFormElements ? '• Contains form elements\n' : ''}${signals.hasCloseButton ? '• Has close button\n' : ''}\n**What type of element is this?**`,
      options,
    };
  }

  // 4. Высокая уверенность - вызвать соответствующий инструмент / High confidence - call appropriate tool
  if (recommendedAction === 'generate_screen') {
    return {
      action: 'call_tool',
      tool: 'generate_screen',
      toolParams: {
        figmaUrl,
        screenName,
      },
      reason: `High confidence (${Math.round(confidence * 100)}%) screen detection. Dimensions: ${analysis.dimensions.width}x${analysis.dimensions.height}px, has StatusBar: ${signals.hasStatusBar}.`,
      message: `🎯 Generating screen "${screenName}"...`,
    };
  }

  if (recommendedAction === 'generate_sheet') {
    return {
      action: 'call_tool',
      tool: 'generate_screen',
      toolParams: {
        figmaUrl,
        screenName: screenName.includes('Sheet') ? screenName : `${screenName}Sheet`,
      },
      reason: `Detected bottom sheet pattern: drag handle present, overlay detected.`,
      message: `📋 Generating bottom sheet "${screenName}"...`,
    };
  }

  if (recommendedAction === 'generate_modal') {
    return {
      action: 'call_tool',
      tool: 'generate_screen',
      toolParams: {
        figmaUrl,
        screenName: screenName.includes('Modal') ? screenName : `${screenName}Modal`,
      },
      reason: `Detected modal pattern: overlay present, close button detected.`,
      message: `🪟 Generating modal "${screenName}"...`,
    };
  }

  if (recommendedAction === 'generate_icon') {
    return {
      action: 'inform_user',
      reason: `Small element (${analysis.dimensions.width}x${analysis.dimensions.height}px) detected as icon.`,
      message: `🎨 "${nodeName}" is an icon.\n\n**Export from Figma:**\n1. Select the icon in Figma\n2. Export as SVG\n3. Place in \`assets/icons/${screenName}.svg\`\n\n**Usage:**\n\`import ${screenName} from '@assets/icons/${screenName}.svg'\``,
    };
  }

  // 5. Компонент по умолчанию / Default component
  return {
    action: 'call_tool',
    tool: 'generate_screen',
    toolParams: {
      figmaUrl,
      screenName,
    },
    reason: `Detected as ${elementType} component with ${Math.round(confidence * 100)}% confidence.`,
    message: `🧩 Generating component "${screenName}"...`,
  };
}

/**
 * Основная функция анализа элемента / Main element analysis function
 * Выполняет полный анализ узла Figma и возвращает рекомендации
 */
export async function analyzeElement(
  node: FigmaNodeFull,
  includeScreenshot?: boolean,
  screenshotPath?: string,
  figmaUrl?: string
): Promise<ElementAnalysis> {
  // Получение размеров / Get dimensions
  const dimensions = node.absoluteBoundingBox
    ? { width: node.absoluteBoundingBox.width, height: node.absoluteBoundingBox.height }
    : { width: 0, height: 0 };

  // Определение, является ли вариантом / Determine if has variants
  const hasVariants = !!(node.componentPropertyDefinitions && Object.keys(node.componentPropertyDefinitions).length > 0);

  // Определение, является ли экземпляром / Determine if is instance
  const isInstance = node.type === 'INSTANCE';
  const componentId = node.componentId;

  // Обнаружение паттернов / Detect patterns
  const signals = detectPatterns(node);

  // Анализ детей / Analyze children
  const childrenAnalysis = analyzeChildren(node);

  // Проверка целостности / Check integrity
  const integrityIssues = checkComponentIntegrity(node);

  // Классификация по размерам / Classify by dimensions
  const sizeCategory = classifyByDimensions(dimensions.width, dimensions.height);

  // Определение типа элемента / Determine element type
  const elementType = determineElementType(node, signals, sizeCategory, childrenAnalysis);

  // Расчет уверенности / Calculate confidence
  const confidence = calculateConfidence(
    elementType,
    signals,
    node.type,
    dimensions,
    hasVariants,
    childrenAnalysis
  );

  // Определение рекомендуемого действия / Determine recommended action
  const recommendedAction = determineRecommendedAction(
    elementType,
    confidence,
    isInstance,
    !!componentId
  );

  // Создание частичного результата для генерации nextStep / Create partial result for nextStep generation
  const partialAnalysis = {
    elementType,
    confidence,
    figmaNodeType: node.type,
    nodeName: node.name,
    dimensions,
    hasVariants,
    isInstance,
    componentId,
    signals,
    integrityIssues,
    childrenAnalysis,
    recommendedAction,
    screenshotPath: includeScreenshot ? screenshotPath : undefined,
  };

  // Генерация следующего шага / Generate next step
  const nextStep = generateNextStep(partialAnalysis, figmaUrl);

  // Создание полного результата анализа / Create complete analysis result
  const analysis: ElementAnalysis = {
    ...partialAnalysis,
    nextStep,
    analysisContext: '', // Will be filled below
  };

  // Генерация контекста анализа / Generate analysis context
  analysis.analysisContext = generateAnalysisContext(analysis);

  return analysis;
}
