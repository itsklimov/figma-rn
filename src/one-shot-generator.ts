/**
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
 * Checks if node is a system component
 *
 * @param name - Node name
 * @returns true if it's a system component
 */
function isSystemComponent(name: string): boolean {
  const lowerName = name.toLowerCase();
  return SYSTEM_COMPONENT_PATTERNS.some(pattern => lowerName.includes(pattern));
}

/**
 * Signals for element categorization
 */
export interface CategorizationSignals {
  // Dimensions
  width: number;
  height: number;
  isFullWidth: boolean;   // 350-430px (iPhone widths)
  isFullHeight: boolean;  // 700-950px (iPhone heights)

  // Navigation
  hasNavigationBar: boolean;  // Top bar 44-56px with title
  hasBackButton: boolean;     // Arrow back icon in top area
  hasCloseButton: boolean;    // X close icon
  hasStatusBar: boolean;      // Device status bar

  // Modal signals
  hasOverlay: boolean;        // Semi-transparent background (opacity 0.3-0.7)
  hasDragHandle: boolean;     // Pill shape at top (~36x5px)
  isCentered: boolean;        // Centered in parent, not full size
  isBottomAligned: boolean;   // Positioned at bottom of parent

  // Content
  hasActionList: boolean;     // Vertical stack of tappable items
  hasCancelButton: boolean;   // "Cancel" text
}

/**
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

  // Recursively analyze children
  if (node.children && Array.isArray(node.children)) {
    analyzeChildren(node.children, signals, node);
  }

  // Check position relative to parent
  if (parentNode?.absoluteBoundingBox && node.absoluteBoundingBox) {
    const parentHeight = parentNode.absoluteBoundingBox.height;
    const nodeY = node.absoluteBoundingBox.y - parentNode.absoluteBoundingBox.y;
    const nodeBottom = nodeY + height;

    // Bottom aligned if bottom edge is close to parent bottom
    signals.isBottomAligned = Math.abs(nodeBottom - parentHeight) < 20;

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
 * Analyzes children to extract signals
 */
function analyzeChildren(children: any[], signals: CategorizationSignals, rootNode: any, depth = 0): void {
  if (depth > 5) return; // Limit depth

  for (const child of children) {
    const name = (child.name || '').toLowerCase();
    const type = child.type || '';
    const childWidth = child.absoluteBoundingBox?.width || 0;
    const childHeight = child.absoluteBoundingBox?.height || 0;

    // Child position relative to root
    const rootBox = rootNode.absoluteBoundingBox;
    const childBox = child.absoluteBoundingBox;
    let relativeY = 0;
    let relativeX = 0;
    if (rootBox && childBox) {
      relativeY = childBox.y - rootBox.y;
      relativeX = childBox.x - rootBox.x;
    }
    const isAtTop = relativeY < 100; // In top 100px
    const isAtLeft = relativeX < 60;  // In left 60px
    const isAtRight = rootBox && (relativeX + childWidth > rootBox.width - 60);

    // StatusBar check
    if (name.includes('status') || name.includes('statusbar') || name.includes('status bar')) {
      signals.hasStatusBar = true;
    }

    // Navigation bar check
    // Usually 44-56px tall, at top
    if (isAtTop && childHeight >= 40 && childHeight <= 60 && childWidth > 300) {
      if (name.includes('nav') || name.includes('header') || name.includes('toolbar') || name.includes('appbar')) {
        signals.hasNavigationBar = true;
      }
      // Also check by structure - if has title text
      if (child.children?.some((c: any) => c.type === 'TEXT' && c.style?.fontSize >= 16)) {
        signals.hasNavigationBar = true;
      }
    }

    // Back button check
    if (isAtTop && isAtLeft) {
      if (name.includes('back') || name.includes('arrow') || name.includes('chevron') || name.includes('')) {
        signals.hasBackButton = true;
      }
    }

    // Close button check
    if (isAtTop && (isAtLeft || isAtRight)) {
      if (name.includes('close') || name.includes('x') || name.includes('dismiss') || name.includes('')) {
        signals.hasCloseButton = true;
      }
      // Also check by shape - small square with X
      if (childWidth >= 20 && childWidth <= 50 && childHeight >= 20 && childHeight <= 50) {
        if (name === 'x' || name === 'close' || name.includes('icon') && name.includes('close')) {
          signals.hasCloseButton = true;
        }
      }
    }

    // Drag handle check
    // Usually small pill at top
    if (isAtTop && relativeY < 30) {
      if (childWidth >= 30 && childWidth <= 50 && childHeight >= 3 && childHeight <= 8) {
        signals.hasDragHandle = true;
      }
      if (name.includes('handle') || name.includes('drag') || name.includes('pill') || name.includes('indicator')) {
        signals.hasDragHandle = true;
      }
    }

    // Overlay check
    // Semi-transparent background
    if (child.fills && Array.isArray(child.fills)) {
      for (const fill of child.fills) {
        if (fill.type === 'SOLID' && fill.opacity !== undefined) {
          if (fill.opacity >= 0.2 && fill.opacity <= 0.8) {
            // If covers most area and dark color
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

    // Cancel button check
    if (type === 'TEXT') {
      const textContent = child.characters || '';
      if (textContent.toLowerCase().includes('cancel') || textContent.toLowerCase().includes('')) {
        signals.hasCancelButton = true;
      }
    }

    // Action list check
    // Vertical list of text elements
    if (child.children && child.children.length >= 2) {
      const textChildren = child.children.filter((c: any) => c.type === 'TEXT' ||
        (c.children && c.children.some((gc: any) => gc.type === 'TEXT')));
      if (textChildren.length >= 3 && child.layoutMode === 'VERTICAL') {
        signals.hasActionList = true;
      }
    }

    // Recurse
    if (child.children && Array.isArray(child.children)) {
      analyzeChildren(child.children, signals, rootNode, depth + 1);
    }
  }
}

/**
 * Determines category based on signals
 */
export function categorizeBySignals(signals: CategorizationSignals): 'screens' | 'modals' | 'sheets' | 'components' {
  const isFullScreen = signals.isFullWidth && signals.isFullHeight;

  // 1. Sheets: drag handle or bottom-aligned action sheet
  if (signals.hasDragHandle) {
    return 'sheets';
  }

  if (signals.isBottomAligned && signals.hasActionList) {
    return 'sheets';
  }

  // 2. Modals: overlay or close button without nav bar
  if (signals.hasOverlay) {
    return 'modals';
  }

  if (signals.hasCloseButton && !signals.hasNavigationBar && !signals.hasBackButton) {
    return 'modals';
  }

  // 3. Screens: full size with navigation
  if (isFullScreen && (signals.hasNavigationBar || signals.hasBackButton || signals.hasStatusBar)) {
    return 'screens';
  }

  // 4. Modals: centered, not full size
  if (signals.isCentered && !isFullScreen) {
    return 'modals';
  }

  // 5. Components: not full size
  if (!isFullScreen) {
    return 'components';
  }

  // 6. Default: full size without clear signals = screen
  return 'screens';
}

/**
 * Interface for generated file
 */
export interface GeneratedFile {
  /** File path relative to project root */
  path: string;
  /** File content */
  content: string;
  /** File type */
  type: 'screen' | 'types' | 'hooks' | 'form' | 'styles' | 'animations' | 'gestures' | 'image';
}

/**
 * Interface for extracted image
 */
export interface ExtractedImage {
  /** Figma node ID */
  nodeId: string;
  /** Component ID (used for export) */
  componentId?: string;
  /** Node name */
  nodeName: string;
  /** Type: image or icon */
  category: 'image' | 'icon';
  /** Downloaded file path (temporary) */
  downloadedPath?: string;
  /** Figma download URL */
  figmaUrl?: string;
  /** Suggested import path */
  suggestedPath: string;
  /** Suggested filename */
  suggestedFilename: string;
  /** File format */
  format: 'png' | 'svg' | 'jpg';
  /** Dimensions (if known) */
  dimensions?: { width: number; height: number };
}

/**
 * Detection results for all patterns
 */
export interface DetectionResults {
  /** List pattern detection */
  list: ListPatternDetection | null;
  /** Form detection */
  form: FormDetection | null;
  /** Sheet/modal detection */
  sheet: SheetDetection | null;
  /** Variants detection */
  variants: VariantDetection | null;
  /** Animation hints */
  animations: AnimationHint | null;
  /** Data models */
  dataModels: DataModel[];
}

/**
 * Generation result summary
 */
export interface GenerationSummary {
  screenType: 'list' | 'form' | 'sheet' | 'modal' | 'action-sheet' | 'regular';
  /** Has animations */
  hasAnimations: boolean;
  /** Has data models */
  hasDataModels: boolean;
  /** Component matches */
  componentMatches: string[];
  metadata: {
    /** Form fields count */
    formFieldsCount?: number;
    /** List items count */
    listItemsCount?: number;
    /** Detection confidence (0-1) */
    confidence: number;
  };
}

/**
 * Hierarchy node for meta.json
 */
export interface HierarchyNode {
  /** Node ID */
  id: string;
  /** Node name */
  name: string;
  /** Node type */
  type: string;
  /** X position relative to parent */
  x?: number;
  /** Y position relative to parent */
  y?: number;
  /** Element width */
  width?: number;
  /** Element height */
  height?: number;
  /** Layout direction (auto-layout only) */
  layout?: 'row' | 'column';
  /** Gap between children */
  gap?: number;
  /** Component ID (INSTANCE only) */
  componentId?: string;
  /** Is node hidden */
  hidden?: boolean;
  /** Text content (TEXT only) */
  characters?: string;
  /** Child nodes */
  children?: HierarchyNode[];
}

/**
 * Complete ONE-SHOT generation result
 */
export interface OneShotResult {
  screenName: string;
  /** Canonical nodeId from Figma API */
  nodeId: string;
  /** Generated files */
  files: GeneratedFile[];
  /** Detection results */
  detections: DetectionResults;
  /** Generation summary */
  summary: GenerationSummary;
  /** Extracted images */
  images: ExtractedImage[];
  screenshotPath?: string;
  /** Hidden node IDs */
  hiddenNodes?: string[];
  /** Total node count */
  totalNodes?: number;
  /** Instance count */
  instanceCount?: number;
  /** Full node hierarchy */
  hierarchy?: HierarchyNode;
  /** Extracted interactions */
  interactions?: ExtractedInteraction[];
  /** Extracted scrolls */
  scrolls?: ScrollInfo[];
}

/**
 * Options for ONE-SHOT generation
 */
export interface OneShotOptions {
  /** Generate TypeScript types (default: true) */
  generateTypes?: boolean;
  /** Generate React Query hooks (default: true) */
  generateHooks?: boolean;
  /** Detect animations (default: false, may be slow) */
  detectAnimations?: boolean;
  /** Custom project config */
  config?: ProjectConfig;
  /** Generate extras (form schemas, gesture handlers) */
  generateExtras?: boolean;
  /** Folder for screenshot and assets */
  outputFolder?: string;
}

/**
 * Parses Figma URL to extract fileKey and nodeId
 *
 * @param figmaUrl - Figma URL
 */
function parseFigmaUrl(figmaUrl: string): { fileKey: string; nodeId: string } | null {
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
 * Extracts images and icons from Figma node
 */
function extractImageNodes(node: any, config?: ProjectConfig): ExtractedImage[] {
  const images: ExtractedImage[] = [];
  const seenComponentIds = new Set<string>();

  // Icon pattern: Icon*, ic/*, ic, *_icon
  const iconPattern = /^Icon|^ic\/|^ic$|_icon$/i;

  // Image pattern: photo*, img*, image*, *_image
  const imagePattern = /^photo|^img$|^image|_image$/i;

  // System components pattern (exclude)
  const systemPattern = /StatusBar|HomeIndicator|_StatusBar/i;

  // Checks for image fill in node
  function hasImageFill(n: any): boolean {
    if (!n.fills || !Array.isArray(n.fills)) return false;
    return n.fills.some((f: any) => f.type === 'IMAGE' && f.visible !== false);
  }

  // Assets config
  const assetsConfig = {
    defaultIconFormat: config?.assets?.defaultIconFormat || 'svg',
    defaultImageFormat: config?.assets?.defaultImageFormat || 'png',
    iconsDir: config?.assets?.iconsDir || 'assets/icons',
    imagesDir: config?.assets?.imagesDir || 'assets/images',
    importPrefix: config?.assets?.importPrefix || '@assets'
  };

  // Counter for unique filenames
  const filenameCount = new Map<string, number>();

  function traverse(n: any): void {
    if (!n) return;

    const name = n.name || '';
    const type = n.type || '';

    // Determine asset type
    const isIcon = type === 'INSTANCE' && iconPattern.test(name) && !systemPattern.test(name);
    const isImageByName = type === 'INSTANCE' && imagePattern.test(name) && !systemPattern.test(name);
    const isImageByFill = (type === 'RECTANGLE' || type === 'FRAME') && hasImageFill(n) && !systemPattern.test(name);

    if (isIcon || isImageByName || isImageByFill) {
      // Deduplicate by componentId or nodeId
      const uniqueKey = n.componentId || n.id;
      if (seenComponentIds.has(uniqueKey)) {
        // Already seen this component, skip
      } else {
        seenComponentIds.add(uniqueKey);

        // Determine category
        const category: 'icon' | 'image' = isIcon ? 'icon' : 'image';
        const format = category === 'icon' ? assetsConfig.defaultIconFormat : assetsConfig.defaultImageFormat;

        // Generate filename
        const cleanName = name
          .toLowerCase()
          .replace(/[^a-z0-9]+/gi, '-')
          .replace(/^-|-$/g, '')
          .replace(/--+/g, '-') || 'asset';

        // Add number if name already used
        const baseFilename = `${cleanName}.${format}`;
        const count = filenameCount.get(baseFilename) || 0;
        filenameCount.set(baseFilename, count + 1);
        const suggestedFilename = count === 0 ? baseFilename : `${cleanName}-${count + 1}.${format}`;

        const dir = category === 'icon' ? 'icons' : 'images';
        const suggestedPath = `${assetsConfig.importPrefix}/${dir}/${suggestedFilename}`;

        images.push({
          nodeId: n.id,
          componentId: n.componentId, // Use componentId for export
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

    // Recursively traverse children
    if (n.children && Array.isArray(n.children)) {
      for (const child of n.children) {
        traverse(child);
      }
    }
  }

  traverse(node);

  console.error(`[ONE-SHOT] Found ${images.length} assets (${seenComponentIds.size} unique components)`);

  return images;
}

/**
 * Extracts IDs of hidden nodes from Figma tree
 */
function extractHiddenNodes(node: any): string[] {
  const hiddenNodes: string[] = [];

  function traverse(n: any) {
    if (!n) return;

    // Check if node is hidden
    if (n.visible === false) {
      hiddenNodes.push(n.id);
      // Don't traverse into hidden node, all children are also hidden
      return;
    }

    // Recursively traverse children
    if (n.children && Array.isArray(n.children)) {
      n.children.forEach(traverse);
    }
  }

  traverse(node);
  return hiddenNodes;
}

/**
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
 * Extracts full hierarchy from Figma tree with positioning
 */
function extractHierarchy(node: any, parentBounds?: { x: number; y: number }): HierarchyNode {
  const hierarchyNode: HierarchyNode = {
    id: node.id,
    name: node.name || '',
    type: node.type || 'UNKNOWN',
  };

  // Positioning relative to parent
  if (node.absoluteBoundingBox) {
    const { x, y, width, height } = node.absoluteBoundingBox;
    hierarchyNode.x = parentBounds ? Math.round(x - parentBounds.x) : 0;
    hierarchyNode.y = parentBounds ? Math.round(y - parentBounds.y) : 0;
    hierarchyNode.width = Math.round(width);
    hierarchyNode.height = Math.round(height);
  }

  // Layout direction (only for auto-layout)
  if (node.layoutMode === 'HORIZONTAL') {
    hierarchyNode.layout = 'row';
  } else if (node.layoutMode === 'VERTICAL') {
    hierarchyNode.layout = 'column';
  }

  // Gap between children
  if (node.itemSpacing > 0) {
    hierarchyNode.gap = node.itemSpacing;
  }

  // Add componentId for INSTANCE
  if (node.type === 'INSTANCE' && node.componentId) {
    hierarchyNode.componentId = node.componentId;
  }

  // Add hidden if true
  if (node.visible === false) {
    hierarchyNode.hidden = true;
  }

  // Add text for TEXT nodes
  if (node.type === 'TEXT' && node.characters) {
    hierarchyNode.characters = node.characters;
  }

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
 * Extracted interaction
 */
export interface ExtractedInteraction {
  /** Node ID */
  nodeId: string;
  /** Node name */
  nodeName: string;
  /** Interaction trigger */
  trigger: string;
  /** Action */
  action: string;
  /** Destination ID (for navigation) */
  destinationId?: string;
}

/**
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
 * Scroll information
 */
export interface ScrollInfo {
  /** Node ID */
  nodeId: string;
  /** Node name */
  nodeName: string;
  /** Scroll direction */
  direction: 'HORIZONTAL' | 'VERTICAL' | 'BOTH';
}

/**
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
 * Downloads images directly to local assets folder
 *
 * @param token - Figma API token
 * @param fileKey - File key
 * @param images - Images array to download
 * @returns Updated array with downloaded file paths
 */
async function downloadExtractedImages(
  token: string,
  fileKey: string,
  images: ExtractedImage[],
  assetsDir: string
): Promise<ExtractedImage[]> {
  if (images.length === 0) return [];

  // Deduplicate images by nodeId
  const uniqueImages = Array.from(
    new Map(images.map(img => [img.nodeId, img])).values()
  );
  console.error(`[ONE-SHOT] Deduplication: ${images.length} → ${uniqueImages.length} unique`);

  // Ensure assets folder exists
  await mkdir(assetsDir, { recursive: true });

  // Group by format to optimize API calls
  const pngImages = uniqueImages.filter(img => img.format === 'png');
  const svgImages = uniqueImages.filter(img => img.format === 'svg');

  const results: ExtractedImage[] = [...uniqueImages];

  try {
    // Download PNG images directly to assets folder
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

    // Download SVG icons directly to assets folder
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
    console.error('[ONE-SHOT] ❌ Critical error downloading images:', error);
    // Don't break generation, just log the error
  }

  return results;
}

/**
 * Downloads screen screenshot directly to local folder
 *
 * @param token - Figma API token
 * @param fileKey - File key
 * @param outputPath - Full output path / Full output path
 */
async function downloadScreenshot(
  token: string,
  fileKey: string,
  nodeId: string,
  outputPath: string
): Promise<boolean> {
  try {
    const screenshotUrl = await fetchFigmaScreenshot(token, fileKey, nodeId, 2);

    if (!screenshotUrl) {
      console.error('[ONE-SHOT] Failed to get screenshot URL');
      return false;
    }

    // Ensure parent directory exists
    const parentDir = dirname(outputPath);
    await mkdir(parentDir, { recursive: true });

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

    return true;
  } catch (error) {
    console.error('[ONE-SHOT] Screenshot export error:', error);
    return false;
  }
}

/**
 * Determines primary screen type based on detections
 *
 * @param detections - Detection results
 */
function determineScreenType(detections: DetectionResults): GenerationSummary['screenType'] {
  // Priority 1: Form - ONLY if there are 2+ real input fields
  if (detections.form && detections.form.fields.length >= 2) {
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

  // Priority 2: Action Sheet
  if (detections.sheet && detections.sheet.type === 'action-sheet' && detections.sheet.confidence > 0.7) {
    return 'action-sheet';
  }

  // Priority 3: Bottom Sheet
  if (detections.sheet && detections.sheet.type === 'bottom-sheet' && detections.sheet.confidence > 0.7) {
    return 'sheet';
  }

  // Priority 4: Modal
  if (detections.sheet && detections.sheet.type === 'modal' && detections.sheet.confidence > 0.7) {
    return 'modal';
  }

  // Priority 5: List - with high confidence
  if (detections.list && detections.list.type !== 'none' && detections.list.confidence > 0.75) {
    return 'list';
  }

  // Default: regular screen
  return 'regular';
}

/**
 * Calculates overall detection confidence
 *
 * @param detections - Detection results
 * @returns Confidence from 0 to 1
 */
function calculateOverallConfidence(detections: DetectionResults): number {
  const confidences: number[] = [];

  if (detections.list && detections.list.type !== 'none') {
    confidences.push(detections.list.confidence);
  }

  if (detections.form && detections.form.fields.length > 0) {
    confidences.push(0.9); // High confidence for forms
  }

  if (detections.sheet && detections.sheet.type !== 'none') {
    confidences.push(detections.sheet.confidence);
  }

  if (confidences.length === 0) {
  }

  // Return maximum confidence
  return Math.max(...confidences);
}

/**
 * ONE-SHOT complete screen generator
 *
 * Performs all detections in parallel and generates complete file set
 *
 * @param figmaToken - Figma API access token
 * @param figmaUrl - Figma URL
 * @param options - Generation options
 * @returns Complete result with files and detections
 */
export async function generateCompleteScreen(
  figmaToken: string,
  figmaUrl: string,
  screenName: string,
  options: OneShotOptions = {}
): Promise<OneShotResult> {
  // Set default options
  const {
    generateTypes = true,
    generateHooks = true,
    detectAnimations = false,
    config,
    generateExtras = true,
    outputFolder,
  } = options;

  // 1. Parse Figma URL
  const parsedUrl = parseFigmaUrl(figmaUrl);
  if (!parsedUrl) {
  }

  const { fileKey, nodeId } = parsedUrl;

  // 2. Fetch node from Figma ONCE
  const response = await fetchFigmaNodes(figmaToken, fileKey, [nodeId]);
  const node = response.nodes[nodeId]?.document;

  if (!node) {
    throw new Error(`Node ${nodeId} not found in file ${fileKey}`);
  }

  // Build style name lookup map from full file endpoint
  // (styles are not included in /nodes response, must use /files endpoint)
  const styleMap = new Map<string, string>();
  try {
    const styles = await fetchFigmaStyles(figmaToken, fileKey);
    for (const [styleId, styleDef] of Object.entries(styles)) {
      if (styleDef.name) {
        styleMap.set(styleId, styleDef.name);
      }
    }
  } catch (error) {
  }

  // 3. Load project config (if not provided)
  const projectConfig = config || await loadProjectConfig() || undefined;


  // 4. Run ALL detectors in PARALLEL + image extraction
  const [listDetection, formDetection, sheetDetection, variantsDetection, animationHints, dataModels, extractedImages] = await Promise.all([
    // List pattern detection
    Promise.resolve(detectListPattern(node)),

    // Form elements detection
    Promise.resolve(detectFormElements(node)),

    // Sheet/modal detection
    Promise.resolve(detectSheetOrModal(node)),

    // Variants and states detection
    Promise.resolve(detectVariantsAndStates(node)),

    // Animation hints extraction (optional)
    detectAnimations ? Promise.resolve(extractAnimationHints(node)) : Promise.resolve(null),

    // Data models inference
    Promise.resolve(inferDataModels(node, screenName)),

    // Image extraction
    Promise.resolve(extractImageNodes(node, projectConfig)),
  ]);


  // 4.1. Download images
  let downloadedImages: ExtractedImage[] = extractedImages;
  if (extractedImages.length > 0) {
    // If outputFolder is specified, download directly to local folder
    if (outputFolder) {
      const assetsDir = join(outputFolder, 'assets');
      downloadedImages = await downloadExtractedImages(figmaToken, fileKey, extractedImages, assetsDir);
    } else {
      // Legacy: without outputFolder (used in tests)
      downloadedImages = await downloadExtractedImages(figmaToken, fileKey, extractedImages, join('.', 'assets'));
    }
  }

  // 5. Form detection results
  const detections: DetectionResults = {
    list: listDetection.type !== 'none' ? listDetection : null,
    form: formDetection.fields.length > 0 ? formDetection : null,
    sheet: sheetDetection.type !== 'none' ? sheetDetection : null,
    variants: variantsDetection.isComponentSet || variantsDetection.variants.length > 0 ? variantsDetection : null,
    animations: animationHints,
    dataModels,
  };

  // 6. Determine screen type
  const screenType = determineScreenType(detections);


  // 7. Generate files based on screen type
  const files: GeneratedFile[] = [];

  // 7.1. ALWAYS use the original generator for the main component
  // This ensures proper content extraction from Figma

  // Create image map for the generator
  const imageMap = new Map<string, string>();
  downloadedImages.forEach(img => {
    imageMap.set(img.nodeId, img.suggestedPath);
  });

  let mainComponentCode: string;
  mainComponentCode = await generateReactNativeComponent(node, screenName, projectConfig, imageMap, { styleMap });

  files.push({
    path: `src/screens/${screenName}.tsx`,
    content: mainComponentCode,
    type: 'screen',
  });

  // 7.2. Additional files based on detected patterns

  // If form detected with real input fields (not just buttons)
  if (screenType === 'form' && detections.form && detections.form.fields.length >= 2) {
    // Generate Zod schema
    if (generateExtras) {
      const zodSchema = generateZodSchema(detections.form);
      files.push({
        path: `src/schemas/${screenName}Schema.ts`,
        content: zodSchema,
        type: 'form',
      });

      // Generate form hook
      const formHook = generateFormHook(detections.form, screenName);
      files.push({
        path: `src/hooks/use${screenName}.ts`,
        content: formHook,
        type: 'hooks',
      });
    }
  }

  // For lists, add comment about FlatList pattern
  if (screenType === 'list' && detections.list && detections.list.confidence > 0.7) {
    const listInfo = `
// 📋 DETECTED LIST PATTERN:
// - Type: ${detections.list.type}
// - Items: ${detections.list.itemCount}
// - Orientation: ${detections.list.orientation}
// - Gap: ${detections.list.gap ?? 'none'}px
// Consider wrapping repeated items in FlatList for better performance
`;
    mainComponentCode = listInfo + mainComponentCode;
    // Update file with comment
    files[0].content = mainComponentCode;
  }

  // For sheet/modal, we keep the generated code but note the detection
  if ((screenType === 'sheet' || screenType === 'modal' || screenType === 'action-sheet') && detections.sheet) {
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

  // 7.3. Generate TypeScript types
  if (generateTypes && dataModels.length > 0) {
    const typeDefinitions = generateTypeDefinitions(dataModels);
    files.push({
      path: `src/types/${screenName}Types.ts`,
      content: typeDefinitions,
      type: 'types',
    });
  }

  // 7.4. Generate React Query hooks
  if (generateHooks && dataModels.length > 0) {
    const reactQueryHooks = generateReactQueryHooks(dataModels, screenName);
    files.push({
      path: `src/hooks/use${screenName}Data.ts`,
      content: reactQueryHooks,
      type: 'hooks',
    });
  }

  // 7.5. Generate animations (if detected)
  if (detections.animations && generateExtras) {
    const animationCode = generateReanimatedCode(detections.animations);
    files.push({
      path: `src/animations/${screenName}Animations.ts`,
      content: animationCode,
      type: 'animations',
    });

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

  // 8. Form summary
  const summary: GenerationSummary = {
    screenType,
    hasAnimations: !!detections.animations && detections.animations.transitions.length > 0,
    hasDataModels: dataModels.length > 0,
    componentMatches: [], // TODO: add component match detection
    metadata: {
      formFieldsCount: detections.form?.fields.length,
      listItemsCount: detections.list?.itemCount,
      confidence: calculateOverallConfidence(detections),
    },
  };


  // 9. Download screenshot for validation
  let screenshotPath: string | undefined;
  if (outputFolder) {
    // Download directly to local folder
    const screenshotOutputPath = join(outputFolder, 'screenshot.png');
    const success = await downloadScreenshot(figmaToken, fileKey, nodeId, screenshotOutputPath);
    if (success) {
      screenshotPath = screenshotOutputPath;
    }
  }
  // Legacy: if outputFolder not specified, don't download screenshot

  // 10. Extract hidden nodes
  const hiddenNodes = extractHiddenNodes(node);

  // 11. Count nodes
  const nodeCounts = countNodes(node);

  // 12. Extract full hierarchy
  const hierarchy = extractHierarchy(node);

  // 13. Extract interactions
  const interactions = extractInteractions(node);

  // 14. Extract scrolls
  const scrolls = extractScrollInfo(node);

  // 15. Return complete result
  return {
    screenName,
    nodeId, // Canonical ID from Figma API
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
 * Helper function for batch generation of multiple screens
 *
 * @param figmaToken - Figma API access token
 * @param screens - Array of objects with URLs and screen names
 * @param options - Generation options
 */
export async function generateMultipleScreens(
  figmaToken: string,
  screens: Array<{ url: string; name: string }>,
  options: OneShotOptions = {}
): Promise<OneShotResult[]> {

  // Generate all screens in parallel
  const results = await Promise.all(
    screens.map(screen =>
      generateCompleteScreen(figmaToken, screen.url, screen.name, options)
    )
  );


  return results;
}

/**
 * Utility for saving generated files to disk
 *
 * @param result - ONE-SHOT generation result
 */
export async function saveGeneratedFiles(
  result: OneShotResult,
  baseDir: string = process.cwd()
): Promise<void> {
  const fs = await import('fs/promises');
  const path = await import('path');


  for (const file of result.files) {
    const fullPath = path.join(baseDir, file.path);
    const dir = path.dirname(fullPath);

    // Create directory if it doesn't exist
    await fs.mkdir(dir, { recursive: true });

    // Save file
    await fs.writeFile(fullPath, file.content, 'utf-8');

    console.error(`[ONE-SHOT] ✓ ${file.path}`);
  }

}

/**
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
