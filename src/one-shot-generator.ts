/**
 * ONE-SHOT ORCHESTRATOR для Figma MCP Server
 * Комбинирует все обнаружения и генерации в один вызов функции
 *
 * ONE-SHOT ORCHESTRATOR for Figma MCP Server
 * Combines all detection and generation into a single function call
 */

import { fetchFigmaNodes, fetchFigmaScreenshot, fetchFigmaStyles } from './figma-api-client.js';
import https from 'https';
import { writeFile, mkdir } from 'fs/promises';
import { downloadFigmaImages } from './image-downloader.js';
import { detectListPattern, generateListCode, type ListPatternDetection } from './list-pattern-detector.js';
import { join, dirname } from 'path';
import { detectFormElements, generateFormHook, generateZodSchema, generateFormComponent, type FormDetection } from './form-hooks-generator.js';
import { detectSheetOrModal, generateBottomSheetCode, generateModalCode, generateActionSheetCode, extractActionSheetActions, type SheetDetection } from './sheet-modal-detector.js';
import { detectVariantsAndStates, type VariantDetection } from './variant-state-detector.js';
import { extractAnimationHints, generateReanimatedCode, generateGestureHandlerCode, type AnimationHint } from './animation-extractor.js';
import { inferDataModels, generateTypeDefinitions, generateReactQueryHooks, type DataModel } from './data-model-generator.js';
import { generateReactNativeComponent } from './code-generator-v2.js';
import { loadProjectConfig } from './config-loader.js';
import type { ProjectConfig } from './config-schema.js';

/**
 * Паттерны системных компонентов, которые не нужно извлекать как изображения
 * System component patterns that should not be extracted as images
 */
const SYSTEM_COMPONENT_PATTERNS = [
  'statusbar', 'status bar', 'status-bar', '_statusbar',
  'homeindicator', 'home indicator', 'home-indicator',
  'safeareaview', 'safe area', 'safearea',
  'battery', 'wifi', 'signal', 'cellular', 'mobile signal',
  'notch', 'dynamic island',
  'navigation bar', 'navbar', 'tab bar', 'tabbar',
  'time', 'carrier',
  // Battery sub-components
  'outline', 'fill', 'battery end',
  // Keyboard patterns - iOS/Android system keyboards
  'keyboard', 'keys', 'keyslayout', 'keys layout',
  'component key', 'componentkey', 'key row', 'keyrow',
  'alphabetic', 'numeric keyboard', 'numpad'
];

/**
 * Проверяет, является ли узел системным компонентом
 * Checks if node is a system component
 *
 * @param name - Имя узла
 * @returns true если это системный компонент
 */
function isSystemComponent(name: string): boolean {
  const lowerName = name.toLowerCase();
  return SYSTEM_COMPONENT_PATTERNS.some(pattern => lowerName.includes(pattern));
}

/**
 * Сигналы для категоризации элемента
 * Signals for element categorization
 */
export interface CategorizationSignals {
  // Размеры / Dimensions
  width: number;
  height: number;
  isFullWidth: boolean;   // 350-430px (iPhone widths)
  isFullHeight: boolean;  // 700-950px (iPhone heights)

  // Навигация / Navigation
  hasNavigationBar: boolean;  // Top bar 44-56px with title
  hasBackButton: boolean;     // Arrow back icon in top area
  hasCloseButton: boolean;    // X close icon
  hasStatusBar: boolean;      // Device status bar

  // Модальные сигналы / Modal signals
  hasOverlay: boolean;        // Semi-transparent background (opacity 0.3-0.7)
  hasDragHandle: boolean;     // Pill shape at top (~36x5px)
  isCentered: boolean;        // Centered in parent, not full size
  isBottomAligned: boolean;   // Positioned at bottom of parent

  // Контент / Content
  hasActionList: boolean;     // Vertical stack of tappable items
  hasCancelButton: boolean;   // "Cancel" or "Отмена" text
}

/**
 * Извлекает сигналы категоризации из Figma узла
 * Extracts categorization signals from Figma node
 */
export function extractCategorizationSignals(node: any, parentNode?: any): CategorizationSignals {
  const width = node.absoluteBoundingBox?.width || 0;
  const height = node.absoluteBoundingBox?.height || 0;

  const signals: CategorizationSignals = {
    width: Math.round(width),
    height: Math.round(height),
    isFullWidth: width >= 350 && width <= 430,
    isFullHeight: height >= 700 && height <= 950,
    hasNavigationBar: false,
    hasBackButton: false,
    hasCloseButton: false,
    hasStatusBar: false,
    hasOverlay: false,
    hasDragHandle: false,
    isCentered: false,
    isBottomAligned: false,
    hasActionList: false,
    hasCancelButton: false,
  };

  // Рекурсивно анализируем детей / Recursively analyze children
  if (node.children && Array.isArray(node.children)) {
    analyzeChildren(node.children, signals, node);
  }

  // Проверяем позицию относительно родителя / Check position relative to parent
  if (parentNode?.absoluteBoundingBox && node.absoluteBoundingBox) {
    const parentHeight = parentNode.absoluteBoundingBox.height;
    const nodeY = node.absoluteBoundingBox.y - parentNode.absoluteBoundingBox.y;
    const nodeBottom = nodeY + height;

    // Выровнен по низу если нижний край близок к низу родителя
    // Bottom aligned if bottom edge is close to parent bottom
    signals.isBottomAligned = Math.abs(nodeBottom - parentHeight) < 20;

    // Центрирован если не полноразмерный и примерно по центру
    // Centered if not full size and approximately centered
    const parentWidth = parentNode.absoluteBoundingBox.width;
    const nodeX = node.absoluteBoundingBox.x - parentNode.absoluteBoundingBox.x;
    const horizontalCenter = Math.abs((nodeX + width / 2) - (parentWidth / 2)) < 20;
    const verticalCenter = Math.abs((nodeY + height / 2) - (parentHeight / 2)) < 50;
    signals.isCentered = horizontalCenter && verticalCenter && !signals.isFullWidth;
  }

  return signals;
}

/**
 * Анализирует дочерние элементы для извлечения сигналов
 * Analyzes children to extract signals
 */
function analyzeChildren(children: any[], signals: CategorizationSignals, rootNode: any, depth = 0): void {
  if (depth > 5) return; // Ограничиваем глубину / Limit depth

  for (const child of children) {
    const name = (child.name || '').toLowerCase();
    const type = child.type || '';
    const childWidth = child.absoluteBoundingBox?.width || 0;
    const childHeight = child.absoluteBoundingBox?.height || 0;

    // Позиция ребенка относительно корня / Child position relative to root
    const rootBox = rootNode.absoluteBoundingBox;
    const childBox = child.absoluteBoundingBox;
    let relativeY = 0;
    let relativeX = 0;
    if (rootBox && childBox) {
      relativeY = childBox.y - rootBox.y;
      relativeX = childBox.x - rootBox.x;
    }
    const isAtTop = relativeY < 100; // В верхних 100px / In top 100px
    const isAtLeft = relativeX < 60;  // В левых 60px / In left 60px
    const isAtRight = rootBox && (relativeX + childWidth > rootBox.width - 60);

    // Проверка StatusBar / StatusBar check
    if (name.includes('status') || name.includes('statusbar') || name.includes('status bar')) {
      signals.hasStatusBar = true;
    }

    // Проверка Navigation Bar / Navigation bar check
    // Обычно 44-56px высотой, в верхней части / Usually 44-56px tall, at top
    if (isAtTop && childHeight >= 40 && childHeight <= 60 && childWidth > 300) {
      if (name.includes('nav') || name.includes('header') || name.includes('toolbar') || name.includes('appbar')) {
        signals.hasNavigationBar = true;
      }
      // Также проверяем по структуре - если есть title текст / Also check by structure - if has title text
      if (child.children?.some((c: any) => c.type === 'TEXT' && c.style?.fontSize >= 16)) {
        signals.hasNavigationBar = true;
      }
    }

    // Проверка Back Button / Back button check
    if (isAtTop && isAtLeft) {
      if (name.includes('back') || name.includes('arrow') || name.includes('chevron') || name.includes('назад')) {
        signals.hasBackButton = true;
      }
    }

    // Проверка Close Button / Close button check
    if (isAtTop && (isAtLeft || isAtRight)) {
      if (name.includes('close') || name.includes('x') || name.includes('dismiss') || name.includes('закрыть')) {
        signals.hasCloseButton = true;
      }
      // Также проверяем по форме - маленький квадрат с X / Also check by shape - small square with X
      if (childWidth >= 20 && childWidth <= 50 && childHeight >= 20 && childHeight <= 50) {
        if (name === 'x' || name === 'close' || name.includes('icon') && name.includes('close')) {
          signals.hasCloseButton = true;
        }
      }
    }

    // Проверка Drag Handle / Drag handle check
    // Обычно маленький pill в верхней части / Usually small pill at top
    if (isAtTop && relativeY < 30) {
      if (childWidth >= 30 && childWidth <= 50 && childHeight >= 3 && childHeight <= 8) {
        signals.hasDragHandle = true;
      }
      if (name.includes('handle') || name.includes('drag') || name.includes('pill') || name.includes('indicator')) {
        signals.hasDragHandle = true;
      }
    }

    // Проверка Overlay / Overlay check
    // Полупрозрачный фон / Semi-transparent background
    if (child.fills && Array.isArray(child.fills)) {
      for (const fill of child.fills) {
        if (fill.type === 'SOLID' && fill.opacity !== undefined) {
          if (fill.opacity >= 0.2 && fill.opacity <= 0.8) {
            // Если покрывает большую часть и темный цвет / If covers most area and dark color
            if (childWidth > 300 && childHeight > 500) {
              const color = fill.color;
              if (color && (color.r < 0.3 && color.g < 0.3 && color.b < 0.3)) {
                signals.hasOverlay = true;
              }
            }
          }
        }
      }
    }

    // Проверка Cancel Button / Cancel button check
    if (type === 'TEXT') {
      const textContent = child.characters || '';
      if (textContent.toLowerCase().includes('cancel') || textContent.toLowerCase().includes('отмена')) {
        signals.hasCancelButton = true;
      }
    }

    // Проверка Action List / Action list check
    // Вертикальный список текстовых элементов / Vertical list of text elements
    if (child.children && child.children.length >= 2) {
      const textChildren = child.children.filter((c: any) => c.type === 'TEXT' ||
        (c.children && c.children.some((gc: any) => gc.type === 'TEXT')));
      if (textChildren.length >= 3 && child.layoutMode === 'VERTICAL') {
        signals.hasActionList = true;
      }
    }

    // Рекурсия / Recurse
    if (child.children && Array.isArray(child.children)) {
      analyzeChildren(child.children, signals, rootNode, depth + 1);
    }
  }
}

/**
 * Определяет категорию на основе сигналов
 * Determines category based on signals
 */
export function categorizeBySignals(signals: CategorizationSignals): 'screens' | 'modals' | 'sheets' | 'components' {
  const isFullScreen = signals.isFullWidth && signals.isFullHeight;

  // 1. Sheets: drag handle или bottom-aligned action sheet
  // 1. Sheets: drag handle or bottom-aligned action sheet
  if (signals.hasDragHandle) {
    return 'sheets';
  }

  if (signals.isBottomAligned && signals.hasActionList) {
    return 'sheets';
  }

  // 2. Modals: overlay или close button без nav bar
  // 2. Modals: overlay or close button without nav bar
  if (signals.hasOverlay) {
    return 'modals';
  }

  if (signals.hasCloseButton && !signals.hasNavigationBar && !signals.hasBackButton) {
    return 'modals';
  }

  // 3. Screens: полноразмерный с навигацией
  // 3. Screens: full size with navigation
  if (isFullScreen && (signals.hasNavigationBar || signals.hasBackButton || signals.hasStatusBar)) {
    return 'screens';
  }

  // 4. Modals: центрированный, не полноразмерный
  // 4. Modals: centered, not full size
  if (signals.isCentered && !isFullScreen) {
    return 'modals';
  }

  // 5. Components: не полноразмерный
  // 5. Components: not full size
  if (!isFullScreen) {
    return 'components';
  }

  // 6. Default: полноразмерный без явных сигналов = screen
  // 6. Default: full size without clear signals = screen
  return 'screens';
}

/**
 * Интерфейс для генерируемого файла
 * Interface for generated file
 */
export interface GeneratedFile {
  /** Путь к файлу относительно корня проекта */
  path: string;
  /** Содержимое файла */
  content: string;
  /** Тип файла */
  type: 'screen' | 'types' | 'hooks' | 'form' | 'styles' | 'animations' | 'gestures' | 'image';
}

/**
 * Интерфейс для извлеченного изображения
 * Interface for extracted image
 */
export interface ExtractedImage {
  /** ID узла в Figma */
  nodeId: string;
  /** ID компонента (используется для экспорта) / Component ID (used for export) */
  componentId?: string;
  /** Имя узла */
  nodeName: string;
  /** Тип: изображение или иконка */
  category: 'image' | 'icon';
  /** Путь к скачанному файлу (временный) */
  downloadedPath?: string;
  /** URL для скачивания из Figma */
  figmaUrl?: string;
  /** Рекомендуемый путь для импорта */
  suggestedPath: string;
  /** Рекомендуемое имя файла */
  suggestedFilename: string;
  /** Формат файла */
  format: 'png' | 'svg' | 'jpg';
  /** Размеры (если известны) */
  dimensions?: { width: number; height: number };
}

/**
 * Результаты обнаружения всех паттернов
 * Detection results for all patterns
 */
export interface DetectionResults {
  /** Обнаружение списочного паттерна */
  list: ListPatternDetection | null;
  /** Обнаружение формы */
  form: FormDetection | null;
  /** Обнаружение sheet/modal */
  sheet: SheetDetection | null;
  /** Обнаружение вариантов */
  variants: VariantDetection | null;
  /** Подсказки по анимациям */
  animations: AnimationHint | null;
  /** Модели данных */
  dataModels: DataModel[];
}

/**
 * Резюме результата генерации
 * Generation result summary
 */
export interface GenerationSummary {
  /** Тип экрана */
  screenType: 'list' | 'form' | 'sheet' | 'modal' | 'action-sheet' | 'regular';
  /** Есть ли анимации */
  hasAnimations: boolean;
  /** Есть ли модели данных */
  hasDataModels: boolean;
  /** Совпадения компонентов */
  componentMatches: string[];
  /** Дополнительная информация */
  metadata: {
    /** Количество обнаруженных полей формы */
    formFieldsCount?: number;
    /** Количество элементов списка */
    listItemsCount?: number;
    /** Уверенность обнаружения (0-1) */
    confidence: number;
  };
}

/**
 * Узел иерархии для meta.json
 * Hierarchy node for meta.json
 */
export interface HierarchyNode {
  /** ID узла / Node ID */
  id: string;
  /** Имя узла / Node name */
  name: string;
  /** Тип узла / Node type */
  type: string;
  /** X позиция относительно родителя / X position relative to parent */
  x?: number;
  /** Y позиция относительно родителя / Y position relative to parent */
  y?: number;
  /** Ширина элемента / Element width */
  width?: number;
  /** Высота элемента / Element height */
  height?: number;
  /** Направление layout (только для auto-layout) / Layout direction (auto-layout only) */
  layout?: 'row' | 'column';
  /** Gap между дочерними элементами / Gap between children */
  gap?: number;
  /** ID компонента (только для INSTANCE) / Component ID (INSTANCE only) */
  componentId?: string;
  /** Скрыт ли узел / Is node hidden */
  hidden?: boolean;
  /** Текстовое содержимое (только для TEXT) / Text content (TEXT only) */
  characters?: string;
  /** Дочерние узлы / Child nodes */
  children?: HierarchyNode[];
}

/**
 * Полный результат ONE-SHOT генерации
 * Complete ONE-SHOT generation result
 */
export interface OneShotResult {
  /** Название экрана */
  screenName: string;
  /** Канонический nodeId из Figma API / Canonical nodeId from Figma API */
  nodeId: string;
  /** Сгенерированные файлы */
  files: GeneratedFile[];
  /** Результаты обнаружения */
  detections: DetectionResults;
  /** Резюме генерации */
  summary: GenerationSummary;
  /** Извлеченные изображения */
  images: ExtractedImage[];
  /** Путь к скриншоту экрана (для валидации) */
  screenshotPath?: string;
  /** ID скрытых узлов / Hidden node IDs */
  hiddenNodes?: string[];
  /** Общее количество узлов / Total node count */
  totalNodes?: number;
  /** Количество экземпляров / Instance count */
  instanceCount?: number;
  /** Полная иерархия узла / Full node hierarchy */
  hierarchy?: HierarchyNode;
  /** Извлеченные интерактивности / Extracted interactions */
  interactions?: ExtractedInteraction[];
  /** Извлеченные прокрутки / Extracted scrolls */
  scrolls?: ScrollInfo[];
}

/**
 * Опции для ONE-SHOT генерации
 * Options for ONE-SHOT generation
 */
export interface OneShotOptions {
  /** Генерировать TypeScript типы (по умолчанию: true) */
  generateTypes?: boolean;
  /** Генерировать React Query хуки (по умолчанию: true) */
  generateHooks?: boolean;
  /** Обнаруживать анимации (по умолчанию: false, может быть медленным) */
  detectAnimations?: boolean;
  /** Пользовательская конфигурация проекта */
  config?: ProjectConfig;
  /** Генерировать дополнительные файлы (схемы форм, gesture handlers) */
  generateExtras?: boolean;
  /** Папка для сохранения скриншота и ассетов / Folder for screenshot and assets */
  outputFolder?: string;
}

/**
 * Парсит URL Figma для извлечения fileKey и nodeId
 * Parses Figma URL to extract fileKey and nodeId
 *
 * @param figmaUrl - URL Figma узла
 * @returns Объект с fileKey и nodeId
 */
function parseFigmaUrl(figmaUrl: string): { fileKey: string; nodeId: string } | null {
  // Поддерживаемые форматы:
  // - https://www.figma.com/file/{fileKey}/...?node-id={nodeId}
  // - https://www.figma.com/design/{fileKey}/...?node-id={nodeId}
  // Supported formats above

  const fileKeyMatch = figmaUrl.match(/figma\.com\/(file|design)\/([a-zA-Z0-9]+)/);
  const nodeIdMatch = figmaUrl.match(/node-id=([^&]+)/);

  if (!fileKeyMatch || !nodeIdMatch) {
    return null;
  }

  const fileKey = fileKeyMatch[2];
  const nodeId = decodeURIComponent(nodeIdMatch[1]).replace(/-/g, ':');

  return { fileKey, nodeId };
}

/**
 * Извлекает изображения и иконки из Figma узла
 * Extracts images and icons from Figma node
 */
function extractImageNodes(node: any, config?: ProjectConfig): ExtractedImage[] {
  const images: ExtractedImage[] = [];
  const seenComponentIds = new Set<string>();

  // Паттерн для иконок: Icon*, ic/*, ic, *_icon
  // Icon pattern: Icon*, ic/*, ic, *_icon
  const iconPattern = /^Icon|^ic\/|^ic$|_icon$/i;

  // Паттерн для изображений: photo*, img*, image*, *_image
  // Image pattern: photo*, img*, image*, *_image
  const imagePattern = /^photo|^img$|^image|_image$/i;

  // Паттерн для системных компонентов (исключаем)
  // System components pattern (exclude)
  const systemPattern = /StatusBar|HomeIndicator|_StatusBar/i;

  // Проверяет наличие image fill в узле / Checks for image fill in node
  function hasImageFill(n: any): boolean {
    if (!n.fills || !Array.isArray(n.fills)) return false;
    return n.fills.some((f: any) => f.type === 'IMAGE' && f.visible !== false);
  }

  // Конфигурация ассетов / Assets config
  const assetsConfig = {
    defaultIconFormat: config?.assets?.defaultIconFormat || 'svg',
    defaultImageFormat: config?.assets?.defaultImageFormat || 'png',
    iconsDir: config?.assets?.iconsDir || 'assets/icons',
    imagesDir: config?.assets?.imagesDir || 'assets/images',
    importPrefix: config?.assets?.importPrefix || '@assets'
  };

  // Счетчик для уникальных имен файлов / Counter for unique filenames
  const filenameCount = new Map<string, number>();

  function traverse(n: any): void {
    if (!n) return;

    const name = n.name || '';
    const type = n.type || '';

    // Определяем тип ассета / Determine asset type
    const isIcon = type === 'INSTANCE' && iconPattern.test(name) && !systemPattern.test(name);
    const isImageByName = type === 'INSTANCE' && imagePattern.test(name) && !systemPattern.test(name);
    const isImageByFill = (type === 'RECTANGLE' || type === 'FRAME') && hasImageFill(n) && !systemPattern.test(name);

    if (isIcon || isImageByName || isImageByFill) {
      // Дедупликация по componentId или nodeId / Deduplicate by componentId or nodeId
      const uniqueKey = n.componentId || n.id;
      if (seenComponentIds.has(uniqueKey)) {
        // Уже видели этот компонент, пропускаем / Already seen this component, skip
      } else {
        seenComponentIds.add(uniqueKey);

        // Определяем категорию / Determine category
        const category: 'icon' | 'image' = isIcon ? 'icon' : 'image';
        const format = category === 'icon' ? assetsConfig.defaultIconFormat : assetsConfig.defaultImageFormat;

        // Генерируем имя файла / Generate filename
        const cleanName = name
          .toLowerCase()
          .replace(/[^a-z0-9]+/gi, '-')
          .replace(/^-|-$/g, '')
          .replace(/--+/g, '-') || 'asset';

        // Добавляем номер если имя уже использовано / Add number if name already used
        const baseFilename = `${cleanName}.${format}`;
        const count = filenameCount.get(baseFilename) || 0;
        filenameCount.set(baseFilename, count + 1);
        const suggestedFilename = count === 0 ? baseFilename : `${cleanName}-${count + 1}.${format}`;

        const dir = category === 'icon' ? 'icons' : 'images';
        const suggestedPath = `${assetsConfig.importPrefix}/${dir}/${suggestedFilename}`;

        images.push({
          nodeId: n.id,
          componentId: n.componentId, // Для экспорта используем componentId / Use componentId for export
          nodeName: name,
          category,
          suggestedPath,
          suggestedFilename,
          format: format as 'png' | 'svg' | 'jpg',
          dimensions: n.absoluteBoundingBox ? {
            width: Math.round(n.absoluteBoundingBox.width),
            height: Math.round(n.absoluteBoundingBox.height)
          } : undefined
        });
      }
    }

    // Рекурсивно обходим детей / Recursively traverse children
    if (n.children && Array.isArray(n.children)) {
      for (const child of n.children) {
        traverse(child);
      }
    }
  }

  traverse(node);

  console.error(`[ONE-SHOT] Найдено ${images.length} ассетов (${seenComponentIds.size} уникальных компонентов)`);

  return images;
}

/**
 * Извлекает ID скрытых узлов из дерева Figma
 * Extracts IDs of hidden nodes from Figma tree
 */
function extractHiddenNodes(node: any): string[] {
  const hiddenNodes: string[] = [];

  function traverse(n: any) {
    if (!n) return;

    // Проверяем, скрыт ли узел / Check if node is hidden
    if (n.visible === false) {
      hiddenNodes.push(n.id);
      // Не продолжаем вглубь скрытого узла, т.к. все дети тоже скрыты
      // Don't traverse into hidden node, all children are also hidden
      return;
    }

    // Рекурсивно обходим детей / Recursively traverse children
    if (n.children && Array.isArray(n.children)) {
      n.children.forEach(traverse);
    }
  }

  traverse(node);
  return hiddenNodes;
}

/**
 * Подсчитывает узлы и экземпляры в дереве
 * Counts nodes and instances in tree
 */
function countNodes(node: any): { total: number; instances: number } {
  let total = 0;
  let instances = 0;

  function traverse(n: any) {
    if (!n) return;
    total++;
    if (n.type === 'INSTANCE') {
      instances++;
    }
    if (n.children && Array.isArray(n.children)) {
      n.children.forEach(traverse);
    }
  }

  traverse(node);
  return { total, instances };
}

/**
 * Извлекает полную иерархию из дерева Figma с позиционированием
 * Extracts full hierarchy from Figma tree with positioning
 */
function extractHierarchy(node: any, parentBounds?: { x: number; y: number }): HierarchyNode {
  const hierarchyNode: HierarchyNode = {
    id: node.id,
    name: node.name || '',
    type: node.type || 'UNKNOWN',
  };

  // Позиционирование относительно родителя
  // Positioning relative to parent
  if (node.absoluteBoundingBox) {
    const { x, y, width, height } = node.absoluteBoundingBox;
    hierarchyNode.x = parentBounds ? Math.round(x - parentBounds.x) : 0;
    hierarchyNode.y = parentBounds ? Math.round(y - parentBounds.y) : 0;
    hierarchyNode.width = Math.round(width);
    hierarchyNode.height = Math.round(height);
  }

  // Layout direction (только для auto-layout)
  // Layout direction (only for auto-layout)
  if (node.layoutMode === 'HORIZONTAL') {
    hierarchyNode.layout = 'row';
  } else if (node.layoutMode === 'VERTICAL') {
    hierarchyNode.layout = 'column';
  }

  // Gap между дочерними элементами
  // Gap between children
  if (node.itemSpacing > 0) {
    hierarchyNode.gap = node.itemSpacing;
  }

  // Добавляем componentId для INSTANCE
  // Add componentId for INSTANCE
  if (node.type === 'INSTANCE' && node.componentId) {
    hierarchyNode.componentId = node.componentId;
  }

  // Добавляем hidden если true
  // Add hidden if true
  if (node.visible === false) {
    hierarchyNode.hidden = true;
  }

  // Добавляем текст для TEXT узлов
  // Add text for TEXT nodes
  if (node.type === 'TEXT' && node.characters) {
    hierarchyNode.characters = node.characters;
  }

  // Рекурсивно обрабатываем детей с текущими bounds как родительские
  // Recursively process children with current bounds as parent
  if (node.children && Array.isArray(node.children) && node.children.length > 0) {
    const currentBounds = node.absoluteBoundingBox;
    hierarchyNode.children = node.children.map((child: any) =>
      extractHierarchy(child, currentBounds ? { x: currentBounds.x, y: currentBounds.y } : undefined)
    );
  }

  return hierarchyNode;
}

/**
 * Извлеченная интерактивность
 * Extracted interaction
 */
export interface ExtractedInteraction {
  /** ID узла / Node ID */
  nodeId: string;
  /** Имя узла / Node name */
  nodeName: string;
  /** Триггер взаимодействия / Interaction trigger */
  trigger: string;
  /** Действие / Action */
  action: string;
  /** ID назначения (для навигации) / Destination ID (for navigation) */
  destinationId?: string;
}

/**
 * Извлекает интерактивные элементы и их действия
 * Extracts interactive elements and their actions
 */
function extractInteractions(node: any): ExtractedInteraction[] {
  const interactions: ExtractedInteraction[] = [];

  function traverse(n: any) {
    if (n.interactions && Array.isArray(n.interactions)) {
      for (const interaction of n.interactions) {
        const trigger = interaction.trigger?.type || 'UNKNOWN';
        const action = interaction.actions?.[0];
        if (action) {
          interactions.push({
            nodeId: n.id,
            nodeName: n.name || '',
            trigger,
            action: action.type,
            destinationId: action.destinationId,
          });
        }
      }
    }
    if (n.children) {
      n.children.forEach(traverse);
    }
  }

  traverse(node);
  return interactions;
}

/**
 * Информация о прокрутке
 * Scroll information
 */
export interface ScrollInfo {
  /** ID узла / Node ID */
  nodeId: string;
  /** Имя узла / Node name */
  nodeName: string;
  /** Направление прокрутки / Scroll direction */
  direction: 'HORIZONTAL' | 'VERTICAL' | 'BOTH';
}

/**
 * Извлекает scrollBehavior для ScrollView определения
 * Extracts scrollBehavior for ScrollView detection
 */
function extractScrollInfo(node: any): ScrollInfo[] {
  const scrolls: ScrollInfo[] = [];

  function traverse(n: any) {
    if (n.scrollBehavior === 'SCROLLS' || n.overflowDirection) {
      const direction = n.overflowDirection === 'HORIZONTAL' ? 'HORIZONTAL'
        : n.overflowDirection === 'VERTICAL' ? 'VERTICAL'
        : 'BOTH';
      scrolls.push({
        nodeId: n.id,
        nodeName: n.name || '',
        direction,
      });
    }
    if (n.children) {
      n.children.forEach(traverse);
    }
  }

  traverse(node);
  return scrolls;
}

/**
 * Скачивает изображения напрямую в локальную папку ассетов
 * Downloads images directly to local assets folder
 *
 * @param token - Токен Figma API
 * @param fileKey - Ключ файла
 * @param images - Массив изображений для скачивания
 * @param assetsDir - Путь к папке ассетов / Path to assets folder
 * @returns Обновленный массив с путями к скачанным файлам
 */
async function downloadExtractedImages(
  token: string,
  fileKey: string,
  images: ExtractedImage[],
  assetsDir: string
): Promise<ExtractedImage[]> {
  if (images.length === 0) return [];

  // Дедуплицируем изображения по nodeId
  // Deduplicate images by nodeId
  const uniqueImages = Array.from(
    new Map(images.map(img => [img.nodeId, img])).values()
  );
  console.error(`[ONE-SHOT] Дедупликация: ${images.length} → ${uniqueImages.length} уникальных`);

  // Убедимся, что папка ассетов существует
  // Ensure assets folder exists
  await mkdir(assetsDir, { recursive: true });

  // Группируем по формату для оптимизации API вызовов
  // Group by format to optimize API calls
  const pngImages = uniqueImages.filter(img => img.format === 'png');
  const svgImages = uniqueImages.filter(img => img.format === 'svg');

  const results: ExtractedImage[] = [...uniqueImages];

  try {
    // Скачиваем PNG изображения напрямую в папку ассетов
    // Download PNG images directly to assets folder
    // Используем componentId если доступен (лучше экспортируется), иначе nodeId
    // Use componentId if available (better export), otherwise nodeId
    if (pngImages.length > 0) {
      const pngResults = await downloadFigmaImages(
        token,
        fileKey,
        pngImages.map(img => ({ id: img.componentId || img.nodeId, name: img.nodeName })),
        assetsDir,
        'png',
        2 // scale
      );

      // Логируем успешные и неудачные загрузки
      // Log successful and failed downloads
      const downloadedIds = new Set(pngResults.map(r => r.nodeId));
      pngImages.forEach(img => {
        const exportId = img.componentId || img.nodeId;
        if (downloadedIds.has(exportId)) {
          const result = pngResults.find(r => r.nodeId === exportId);
          const resultImg = results.find(i => i.nodeId === img.nodeId);
          if (resultImg && result) {
            resultImg.downloadedPath = result.downloadedPath;
            console.error(`   ✅ PNG downloaded: ${img.nodeName} → ${result.downloadedPath}`);
          }
        } else {
          console.error(`[ONE-SHOT] ❌ PNG download failed for: ${img.nodeName} (${exportId})`);
        }
      });
    }

    // Скачиваем SVG иконки напрямую в папку ассетов
    // Download SVG icons directly to assets folder
    // Используем componentId если доступен (лучше экспортируется), иначе nodeId
    // Use componentId if available (better export), otherwise nodeId
    if (svgImages.length > 0) {
      const svgResults = await downloadFigmaImages(
        token,
        fileKey,
        svgImages.map(img => ({ id: img.componentId || img.nodeId, name: img.nodeName })),
        assetsDir,
        'svg',
        1
      );

      // Логируем успешные и неудачные загрузки
      // Log successful and failed downloads
      const downloadedIds = new Set(svgResults.map(r => r.nodeId));
      svgImages.forEach(img => {
        const exportId = img.componentId || img.nodeId;
        if (downloadedIds.has(exportId)) {
          const result = svgResults.find(r => r.nodeId === exportId);
          const resultImg = results.find(i => i.nodeId === img.nodeId);
          if (resultImg && result) {
            resultImg.downloadedPath = result.downloadedPath;
            console.error(`   ✅ SVG downloaded: ${img.nodeName} → ${result.downloadedPath}`);
          }
        } else {
          console.error(`[ONE-SHOT] ❌ SVG download failed for: ${img.nodeName} (${exportId})`);
        }
      });
    }
  } catch (error) {
    console.error('[ONE-SHOT] ❌ Критическая ошибка при скачивании изображений:', error);
    // Не прерываем генерацию, просто логируем ошибку
    // Don't break generation, just log the error
  }

  return results;
}

/**
 * Скачивает скриншот экрана напрямую в локальную папку
 * Downloads screen screenshot directly to local folder
 *
 * @param token - Токен Figma API
 * @param fileKey - Ключ файла
 * @param nodeId - ID узла экрана
 * @param outputPath - Полный путь для сохранения скриншота / Full output path
 * @returns true если успешно, false при ошибке / true if successful, false on error
 */
async function downloadScreenshot(
  token: string,
  fileKey: string,
  nodeId: string,
  outputPath: string
): Promise<boolean> {
  try {
    console.error('[ONE-SHOT] Экспорт скриншота экрана...');
    const screenshotUrl = await fetchFigmaScreenshot(token, fileKey, nodeId, 2);

    if (!screenshotUrl) {
      console.error('[ONE-SHOT] Не удалось получить URL скриншота');
      return false;
    }

    // Убедимся, что родительская директория существует
    // Ensure parent directory exists
    const parentDir = dirname(outputPath);
    await mkdir(parentDir, { recursive: true });

    // Скачиваем скриншот напрямую в локальную папку
    // Download screenshot directly to local folder
    await new Promise<void>((resolve, reject) => {
      https.get(screenshotUrl, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', async () => {
          try {
            const buffer = Buffer.concat(chunks);
            await writeFile(outputPath, buffer);
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      }).on('error', reject);
    });

    console.error(`[ONE-SHOT] Скриншот сохранен: ${outputPath}`);
    return true;
  } catch (error) {
    console.error('[ONE-SHOT] Ошибка при экспорте скриншота:', error);
    return false;
  }
}

/**
 * Определяет приоритетный тип экрана на основе обнаружений
 * Determines primary screen type based on detections
 *
 * @param detections - Результаты обнаружения
 * @returns Тип экрана
 */
function determineScreenType(detections: DetectionResults): GenerationSummary['screenType'] {
  // Приоритет 1: Форма - ТОЛЬКО если есть 2+ реальных полей ввода
  // Priority 1: Form - ONLY if there are 2+ real input fields
  if (detections.form && detections.form.fields.length >= 2) {
    // Проверяем, что это реальные поля ввода, а не просто кнопки
    // Check that these are real input fields, not just buttons
    const realInputFields = detections.form.fields.filter(f =>
      f.type === 'text' || f.type === 'email' || f.type === 'password' ||
      f.type === 'phone' || f.type === 'number' || f.type === 'textarea' ||
      f.type === 'checkbox' || f.type === 'radio' || f.type === 'select'
    );

    if (realInputFields.length >= 2) {
      return 'form';
    }
  }

  // Приоритет 2: Action Sheet
  // Priority 2: Action Sheet
  if (detections.sheet && detections.sheet.type === 'action-sheet' && detections.sheet.confidence > 0.7) {
    return 'action-sheet';
  }

  // Приоритет 3: Bottom Sheet
  // Priority 3: Bottom Sheet
  if (detections.sheet && detections.sheet.type === 'bottom-sheet' && detections.sheet.confidence > 0.7) {
    return 'sheet';
  }

  // Приоритет 4: Modal
  // Priority 4: Modal
  if (detections.sheet && detections.sheet.type === 'modal' && detections.sheet.confidence > 0.7) {
    return 'modal';
  }

  // Приоритет 5: Список - с высокой уверенностью
  // Priority 5: List - with high confidence
  if (detections.list && detections.list.type !== 'none' && detections.list.confidence > 0.75) {
    return 'list';
  }

  // По умолчанию: обычный экран
  // Default: regular screen
  return 'regular';
}

/**
 * Вычисляет общую уверенность обнаружения
 * Calculates overall detection confidence
 *
 * @param detections - Результаты обнаружения
 * @returns Уверенность от 0 до 1
 */
function calculateOverallConfidence(detections: DetectionResults): number {
  const confidences: number[] = [];

  if (detections.list && detections.list.type !== 'none') {
    confidences.push(detections.list.confidence);
  }

  if (detections.form && detections.form.fields.length > 0) {
    confidences.push(0.9); // Высокая уверенность для форм
  }

  if (detections.sheet && detections.sheet.type !== 'none') {
    confidences.push(detections.sheet.confidence);
  }

  if (confidences.length === 0) {
    return 0.5; // Средняя уверенность для обычных экранов
  }

  // Возвращаем максимальную уверенность
  // Return maximum confidence
  return Math.max(...confidences);
}

/**
 * ONE-SHOT генератор полного экрана
 * ONE-SHOT complete screen generator
 *
 * Выполняет все обнаружения параллельно и генерирует полный набор файлов
 * Performs all detections in parallel and generates complete file set
 *
 * @param figmaToken - Токен доступа Figma API
 * @param figmaUrl - URL Figma узла
 * @param screenName - Название экрана
 * @param options - Опции генерации
 * @returns Полный результат с файлами и обнаружениями
 */
export async function generateCompleteScreen(
  figmaToken: string,
  figmaUrl: string,
  screenName: string,
  options: OneShotOptions = {}
): Promise<OneShotResult> {
  // Устанавливаем опции по умолчанию
  // Set default options
  const {
    generateTypes = true,
    generateHooks = true,
    detectAnimations = false,
    config,
    generateExtras = true,
    outputFolder,
  } = options;

  // 1. Парсим URL Figma
  // 1. Parse Figma URL
  const parsedUrl = parseFigmaUrl(figmaUrl);
  if (!parsedUrl) {
    throw new Error(`Неверный формат URL Figma: ${figmaUrl}`);
  }

  const { fileKey, nodeId } = parsedUrl;

  // 2. Загружаем узел из Figma ОДИН РАЗ
  // 2. Fetch node from Figma ONCE
  console.error(`[ONE-SHOT] Загрузка узла из Figma: ${nodeId}`);
  const response = await fetchFigmaNodes(figmaToken, fileKey, [nodeId]);
  const node = response.nodes[nodeId]?.document;

  if (!node) {
    throw new Error(`Узел ${nodeId} не найден в файле ${fileKey}`);
  }

  // Build style name lookup map from full file endpoint
  // (styles are not included in /nodes response, must use /files endpoint)
  console.error(`[ONE-SHOT] Загрузка стилей из Figma...`);
  const styleMap = new Map<string, string>();
  try {
    const styles = await fetchFigmaStyles(figmaToken, fileKey);
    for (const [styleId, styleDef] of Object.entries(styles)) {
      if (styleDef.name) {
        styleMap.set(styleId, styleDef.name);
      }
    }
    console.error(`[ONE-SHOT] Загружено ${styleMap.size} стилей`);
  } catch (error) {
    console.error(`[ONE-SHOT] Ошибка загрузки стилей:`, error);
  }

  // 3. Загружаем конфигурацию проекта (если не предоставлена)
  // 3. Load project config (if not provided)
  const projectConfig = config || await loadProjectConfig() || undefined;

  console.error('[ONE-SHOT] Запуск параллельных обнаружений...');

  // 4. Запускаем ВСЕ детекторы ПАРАЛЛЕЛЬНО + извлечение изображений
  // 4. Run ALL detectors in PARALLEL + image extraction
  const [listDetection, formDetection, sheetDetection, variantsDetection, animationHints, dataModels, extractedImages] = await Promise.all([
    // Обнаружение списочного паттерна
    // List pattern detection
    Promise.resolve(detectListPattern(node)),

    // Обнаружение элементов формы
    // Form elements detection
    Promise.resolve(detectFormElements(node)),

    // Обнаружение sheet/modal
    // Sheet/modal detection
    Promise.resolve(detectSheetOrModal(node)),

    // Обнаружение вариантов и состояний
    // Variants and states detection
    Promise.resolve(detectVariantsAndStates(node)),

    // Извлечение подсказок по анимациям (опционально)
    // Animation hints extraction (optional)
    detectAnimations ? Promise.resolve(extractAnimationHints(node)) : Promise.resolve(null),

    // Вывод моделей данных
    // Data models inference
    Promise.resolve(inferDataModels(node, screenName)),

    // Извлечение изображений
    // Image extraction
    Promise.resolve(extractImageNodes(node, projectConfig)),
  ]);

  console.error('[ONE-SHOT] Обнаружения завершены');
  console.error(`[ONE-SHOT] Найдено изображений: ${extractedImages.length}`);

  // 4.1. Скачиваем изображения
  // 4.1. Download images
  let downloadedImages: ExtractedImage[] = extractedImages;
  if (extractedImages.length > 0) {
    console.error('[ONE-SHOT] Скачивание изображений...');
    // Если указана outputFolder, скачиваем напрямую в локальную папку
    // If outputFolder is specified, download directly to local folder
    if (outputFolder) {
      const assetsDir = join(outputFolder, 'assets');
      downloadedImages = await downloadExtractedImages(figmaToken, fileKey, extractedImages, assetsDir);
    } else {
      // Legacy: без outputFolder (используется в тестах)
      // Legacy: without outputFolder (used in tests)
      downloadedImages = await downloadExtractedImages(figmaToken, fileKey, extractedImages, join('.', 'assets'));
    }
    console.error(`[ONE-SHOT] Скачано: ${downloadedImages.filter(i => i.downloadedPath).length}/${extractedImages.length}`);
  }

  // 5. Формируем результаты обнаружений
  // 5. Form detection results
  const detections: DetectionResults = {
    list: listDetection.type !== 'none' ? listDetection : null,
    form: formDetection.fields.length > 0 ? formDetection : null,
    sheet: sheetDetection.type !== 'none' ? sheetDetection : null,
    variants: variantsDetection.isComponentSet || variantsDetection.variants.length > 0 ? variantsDetection : null,
    animations: animationHints,
    dataModels,
  };

  // 6. Определяем тип экрана
  // 6. Determine screen type
  const screenType = determineScreenType(detections);

  console.error(`[ONE-SHOT] Тип экрана: ${screenType}`);

  // 7. Генерируем файлы на основе типа экрана
  // 7. Generate files based on screen type
  const files: GeneratedFile[] = [];

  // 7.1. ВСЕГДА используем оригинальный генератор для основного компонента
  // 7.1. ALWAYS use the original generator for the main component
  // Это гарантирует правильное извлечение контента из Figma
  // This ensures proper content extraction from Figma
  console.error('[ONE-SHOT] Генерация основного компонента через code-generator-v2...');

  // Создаем карту изображений для генератора
  // Create image map for the generator
  const imageMap = new Map<string, string>();
  downloadedImages.forEach(img => {
    imageMap.set(img.nodeId, img.suggestedPath);
  });
  console.error(`[ONE-SHOT] Создана карта изображений: ${imageMap.size} элементов`);

  let mainComponentCode: string;
  mainComponentCode = await generateReactNativeComponent(node, screenName, projectConfig, imageMap, { styleMap });

  files.push({
    path: `src/screens/${screenName}.tsx`,
    content: mainComponentCode,
    type: 'screen',
  });

  // 7.2. Дополнительные файлы на основе обнаруженных паттернов
  // 7.2. Additional files based on detected patterns

  // Если обнаружена форма с реальными полями ввода (не просто кнопки)
  // If form detected with real input fields (not just buttons)
  if (screenType === 'form' && detections.form && detections.form.fields.length >= 2) {
    // Генерация Zod схемы
    // Generate Zod schema
    if (generateExtras) {
      const zodSchema = generateZodSchema(detections.form);
      files.push({
        path: `src/schemas/${screenName}Schema.ts`,
        content: zodSchema,
        type: 'form',
      });

      // Генерация хука формы
      // Generate form hook
      const formHook = generateFormHook(detections.form, screenName);
      files.push({
        path: `src/hooks/use${screenName}.ts`,
        content: formHook,
        type: 'hooks',
      });
    }
  }

  // Для списков добавляем комментарий о FlatList паттерне
  // For lists, add comment about FlatList pattern
  if (screenType === 'list' && detections.list && detections.list.confidence > 0.7) {
    // Добавляем информацию о списке в комментарии
    const listInfo = `
// 📋 DETECTED LIST PATTERN:
// - Type: ${detections.list.type}
// - Items: ${detections.list.itemCount}
// - Orientation: ${detections.list.orientation}
// - Gap: ${detections.list.gap ?? 'none'}px
// Consider wrapping repeated items in FlatList for better performance
`;
    mainComponentCode = listInfo + mainComponentCode;
    // Обновляем файл с комментарием
    files[0].content = mainComponentCode;
  }

  // Для sheet/modal добавляем wrapper если уверенность высокая
  // For sheet/modal, we keep the generated code but note the detection
  if ((screenType === 'sheet' || screenType === 'modal' || screenType === 'action-sheet') && detections.sheet) {
    // Добавляем информацию о sheet/modal
    const sheetInfo = `
// 📱 DETECTED ${detections.sheet.type.toUpperCase()} PATTERN:
// - Snap points: ${detections.sheet.snapPoints.join(', ') || 'auto'}
// - Has overlay: ${detections.sheet.hasOverlay}
// - Has drag handle: ${detections.sheet.hasDragHandle}
// Consider wrapping in BottomSheet or Modal component
`;
    mainComponentCode = sheetInfo + mainComponentCode;
    files[0].content = mainComponentCode;
  }

  // 7.3. Генерация TypeScript типов
  // 7.2. Generate TypeScript types
  if (generateTypes && dataModels.length > 0) {
    const typeDefinitions = generateTypeDefinitions(dataModels);
    files.push({
      path: `src/types/${screenName}Types.ts`,
      content: typeDefinitions,
      type: 'types',
    });
  }

  // 7.3. Генерация React Query хуков
  // 7.3. Generate React Query hooks
  if (generateHooks && dataModels.length > 0) {
    const reactQueryHooks = generateReactQueryHooks(dataModels, screenName);
    files.push({
      path: `src/hooks/use${screenName}Data.ts`,
      content: reactQueryHooks,
      type: 'hooks',
    });
  }

  // 7.4. Генерация анимаций (если обнаружены)
  // 7.4. Generate animations (if detected)
  if (detections.animations && generateExtras) {
    const animationCode = generateReanimatedCode(detections.animations);
    files.push({
      path: `src/animations/${screenName}Animations.ts`,
      content: animationCode,
      type: 'animations',
    });

    // Генерация gesture handlers
    // Generate gesture handlers
    if (detections.animations.gestureAreas.length > 0) {
      const gestureCode = generateGestureHandlerCode(detections.animations.gestureAreas);
      files.push({
        path: `src/gestures/${screenName}Gestures.ts`,
        content: gestureCode,
        type: 'gestures',
      });
    }
  }

  // 8. Формируем резюме
  // 8. Form summary
  const summary: GenerationSummary = {
    screenType,
    hasAnimations: !!detections.animations && detections.animations.transitions.length > 0,
    hasDataModels: dataModels.length > 0,
    componentMatches: [], // TODO: добавить обнаружение совпадений компонентов
    metadata: {
      formFieldsCount: detections.form?.fields.length,
      listItemsCount: detections.list?.itemCount,
      confidence: calculateOverallConfidence(detections),
    },
  };

  console.error(`[ONE-SHOT] Генерация завершена. Файлов: ${files.length}`);

  // 9. Скачиваем скриншот экрана для валидации
  // 9. Download screenshot for validation
  let screenshotPath: string | undefined;
  if (outputFolder) {
    // Скачиваем напрямую в локальную папку / Download directly to local folder
    const screenshotOutputPath = join(outputFolder, 'screenshot.png');
    const success = await downloadScreenshot(figmaToken, fileKey, nodeId, screenshotOutputPath);
    if (success) {
      screenshotPath = screenshotOutputPath;
    }
  }
  // Legacy: если outputFolder не указан, скриншот не скачиваем
  // Legacy: if outputFolder not specified, don't download screenshot

  // 10. Извлекаем скрытые узлы / Extract hidden nodes
  const hiddenNodes = extractHiddenNodes(node);
  console.error(`[ONE-SHOT] Найдено скрытых узлов: ${hiddenNodes.length}`);

  // 11. Подсчитываем узлы / Count nodes
  const nodeCounts = countNodes(node);
  console.error(`[ONE-SHOT] Всего узлов: ${nodeCounts.total}, экземпляров: ${nodeCounts.instances}`);

  // 12. Извлекаем полную иерархию / Extract full hierarchy
  const hierarchy = extractHierarchy(node);
  console.error(`[ONE-SHOT] Иерархия извлечена: ${hierarchy.name} (${hierarchy.type})`);

  // 13. Извлекаем интерактивности / Extract interactions
  const interactions = extractInteractions(node);
  console.error(`[ONE-SHOT] Найдено интерактивностей: ${interactions.length}`);

  // 14. Извлекаем прокрутки / Extract scrolls
  const scrolls = extractScrollInfo(node);
  console.error(`[ONE-SHOT] Найдено прокруток: ${scrolls.length}`);

  // 15. Возвращаем полный результат / Return complete result
  return {
    screenName,
    nodeId, // Канонический ID из Figma API / Canonical ID from Figma API
    files,
    detections,
    summary,
    images: downloadedImages,
    screenshotPath,
    hiddenNodes,
    totalNodes: nodeCounts.total,
    instanceCount: nodeCounts.instances,
    hierarchy,
    interactions: interactions.length > 0 ? interactions : undefined,
    scrolls: scrolls.length > 0 ? scrolls : undefined,
  };
}

/**
 * Вспомогательная функция для пакетной генерации нескольких экранов
 * Helper function for batch generation of multiple screens
 *
 * @param figmaToken - Токен доступа Figma API
 * @param screens - Массив объектов с URL и именами экранов
 * @param options - Опции генерации
 * @returns Массив результатов для каждого экрана
 */
export async function generateMultipleScreens(
  figmaToken: string,
  screens: Array<{ url: string; name: string }>,
  options: OneShotOptions = {}
): Promise<OneShotResult[]> {
  console.error(`[ONE-SHOT] Пакетная генерация ${screens.length} экранов...`);

  // Генерируем все экраны параллельно
  // Generate all screens in parallel
  const results = await Promise.all(
    screens.map(screen =>
      generateCompleteScreen(figmaToken, screen.url, screen.name, options)
    )
  );

  console.error('[ONE-SHOT] Пакетная генерация завершена');

  return results;
}

/**
 * Утилита для сохранения сгенерированных файлов на диск
 * Utility for saving generated files to disk
 *
 * @param result - Результат ONE-SHOT генерации
 * @param baseDir - Базовая директория для сохранения (по умолчанию: процесс.cwd())
 */
export async function saveGeneratedFiles(
  result: OneShotResult,
  baseDir: string = process.cwd()
): Promise<void> {
  const fs = await import('fs/promises');
  const path = await import('path');

  console.error(`[ONE-SHOT] Сохранение ${result.files.length} файлов в ${baseDir}...`);

  for (const file of result.files) {
    const fullPath = path.join(baseDir, file.path);
    const dir = path.dirname(fullPath);

    // Создаем директорию если не существует
    // Create directory if it doesn't exist
    await fs.mkdir(dir, { recursive: true });

    // Сохраняем файл
    // Save file
    await fs.writeFile(fullPath, file.content, 'utf-8');

    console.error(`[ONE-SHOT] ✓ ${file.path}`);
  }

  console.error('[ONE-SHOT] Сохранение завершено');
}

/**
 * Экспорт всех типов для удобства
 * Export all types for convenience
 */
export type {
  ListPatternDetection,
  FormDetection,
  SheetDetection,
  VariantDetection,
  AnimationHint,
  DataModel,
};
