/**
 * Smart element analyzer for Figma nodes - detects component types and recommends actions
 */

import { FigmaNodeFull } from './figma-api-client.js';

/**
 * Element type classification
 */
export type ElementType =
  // Primitives
  | 'icon'
  | 'illustration'
  | 'logo'
  | 'avatar'
  | 'token'

  // Basic Components (Molecules)
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

  // Composite Components (Organisms)
  | 'card'
  | 'list-item'
  | 'menu-item'
  | 'header'
  | 'tab-bar'
  | 'form-field'
  | 'section'

  // Overlays
  | 'modal'
  | 'bottom-sheet'
  | 'action-sheet'
  | 'dialog'
  | 'toast'
  | 'popover'

  // Layouts
  | 'list'
  | 'grid'
  | 'scroll-view'

  // Screens
  | 'screen'
  | 'screen-fragment'

  // System
  | 'status-bar'
  | 'keyboard'
  | 'tab-bar-system'

  // Unknown
  | 'unknown';

/**
 * Recommended action for element
 */
export type RecommendedAction =
  | 'generate_icon'        // Generate icon
  | 'generate_component'   // Generate component
  | 'generate_screen'      // Generate screen
  | 'generate_modal'       // Generate modal
  | 'generate_sheet'       // Generate bottom sheet
  | 'use_existing'         // Use existing component
  | 'skip_system'          // Skip system element
  | 'ask_llm';            // Ask LLM for decision

/**
 * Component integrity issue
 */
export interface IntegrityIssue {
  type: 'detached-instance' | 'override-breaks-component' | 'missing-component';
  nodeId: string;
  nodeName: string;
  suggestion: string;
}

/**
 * Pattern signals detected in node
 */
export interface PatternSignals {
  hasStatusBar: boolean;
  /** True modal overlay (dark, full-screen backdrop) */
  hasModalOverlay: boolean;
  /** Floating footer with button (sticky CTA area) */
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
 * Children analysis
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
 * Choice option for user
 */
export interface ChoiceOption {
  value: string;
  label: string;
  description: string;
}

/**
 * Next step instruction for LLM
 * Defines exact action that LLM should perform
 */
export interface NextStep {
  /**
   * Action type
   * - call_tool: Call MCP tool
   * - inform_user: Inform user with message
   * - ask_user: Ask user and wait for choice
   * - skip: Skip element
   */
  action: 'call_tool' | 'inform_user' | 'ask_user' | 'skip';

  /** MCP tool name to call */
  tool?: 'generate_screen' | 'generate_flow' | 'analyze_element';

  /** Parameters for tool */
  toolParams?: {
    figmaUrl?: string;
    screenName?: string;
    componentId?: string;
  };

  /** Message for user */
  message?: string;

  /** Question for user */
  question?: string;

  /** Choice options with descriptions */
  options?: ChoiceOption[];

  /** Reason for action */
  reason: string;
}

/**
 * Complete element analysis result
 */
export interface ElementAnalysis {
  elementType: ElementType;
  confidence: number;  // 0-1

  // Figma metadata
  figmaNodeType: string;
  nodeName: string;
  dimensions: { width: number; height: number };
  hasVariants: boolean;
  isInstance: boolean;
  componentId?: string;

  // Pattern signals detected
  signals: PatternSignals;

  // Integrity check
  integrityIssues: IntegrityIssue[];

  // Children analysis
  childrenAnalysis: ChildrenAnalysis;

  // Recommendation
  recommendedAction: RecommendedAction;

  // Next step for LLM
  nextStep: NextStep;

  // For LLM decision (when confidence low)
  screenshotPath?: string;
  analysisContext: string;  // Human-readable analysis
}

/**
 * Size category
 */
type SizeCategory = 'icon' | 'component' | 'screen';

/**
 * Classify by dimensions
 * Determines element category based on size
 */
function classifyByDimensions(width: number, height: number): SizeCategory {
  // Icon: < 64x64
  if (width < 64 && height < 64) {
    return 'icon';
  }

  // Screen: > 350 width AND > 600 height
  if (width > 350 && height > 600) {
    return 'screen';
  }

  // Component: intermediate size
  return 'component';
}

/**
 * Classify by Figma node type
 * Returns base type based on Figma node type
 */
function classifyByNodeType(nodeType: string): ElementType {
  switch (nodeType) {
    case 'VECTOR':
    case 'BOOLEAN_OPERATION':
      return 'icon';

    case 'COMPONENT':
    case 'COMPONENT_SET':
      return 'unknown'; // Needs further analysis

    case 'FRAME':
      return 'unknown'; // Needs further analysis

    case 'INSTANCE':
      return 'unknown'; // Needs further analysis

    case 'TEXT':
      return 'unknown'; // Usually not analyzed separately

    default:
      return 'unknown';
  }
}

// ============================================================================
// Helper functions for pattern detection
// ============================================================================

/**
 * Check if color is dark
 * Used to identify true modal overlays
 */
function isDarkColor(color: { r: number; g: number; b: number }): boolean {
  // Dark color: all RGB components < 0.3 (approximately #4D4D4D and darker)
  return color.r < 0.3 && color.g < 0.3 && color.b < 0.3;
}

/**
 * Check if element covers most of parent
 */
function isLargeCoverage(
  child: { width: number; height: number },
  parent: { width: number; height: number }
): boolean {
  const widthRatio = child.width / parent.width;
  const heightRatio = child.height / parent.height;
  // Covers > 90% width and > 50% height
  return widthRatio > 0.9 && heightRatio > 0.5;
}

/**
 * Check if element is at bottom of screen
 */
function isAtBottom(
  child: { y: number; height: number },
  parent: { height: number }
): boolean {
  const childBottom = child.y + child.height;
  // Element ends in bottom 15% of screen
  return childBottom > parent.height * 0.85;
}

/**
 * Check if element contains a button
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
 * Detect patterns in node
 * Checks various patterns to determine element type
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

  // Parent dimensions for comparisons
  const parentBounds = node.absoluteBoundingBox;

  // Check dimensions
  if (parentBounds) {
    const { width, height } = parentBounds;

    signals.isSmallIcon = width < 64 && height < 64;
    signals.isFullWidth = width > 350;
    signals.isFullHeight = height > 600;
  }

  // Check node name
  const nameLower = node.name.toLowerCase();

  // StatusBar detection
  if (nameLower.includes('statusbar') || nameLower.includes('status bar') || nameLower.includes('status-bar')) {
    signals.hasStatusBar = true;
  }

  // Drag handle detection
  if (nameLower.includes('handle') || nameLower.includes('drag') || nameLower.includes('grip')) {
    signals.hasDragHandle = true;
  }

  // Close button detection
  if (nameLower.includes('close') || nameLower.includes('dismiss') || nameLower === 'x' || nameLower.includes('×')) {
    signals.hasCloseButton = true;
  }

  // Check children for patterns
  if (node.children && node.children.length > 0 && parentBounds) {
    // Check for StatusBar in children
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
    // Detect TRUE modal overlay
    // Criteria: large, dark, semi-transparent background
    // ════════════════════════════════════════════════════════════════════════
    const hasModalOverlayChild = node.children.some(child => {
      const childName = child.name.toLowerCase();

      // Check name
      const hasOverlayName = childName.includes('overlay') ||
                             childName.includes('backdrop') ||
                             childName.includes('scrim') ||
                             childName.includes('dim');

      // Check dimensions
      let isLarge = false;
      if (child.absoluteBoundingBox) {
        isLarge = isLargeCoverage(child.absoluteBoundingBox, parentBounds);
      }

      // Check color and opacity
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

      // True overlay: named OR (large + dark + semi-transparent)
      return hasOverlayName || (isLarge && isDarkAndSemiTransparent);
    });
    if (hasModalOverlayChild) {
      signals.hasModalOverlay = true;
    }

    // ════════════════════════════════════════════════════════════════════════
    // Detect floating footer (sticky CTA)
    // Criteria: at bottom of screen, small, contains button
    // ════════════════════════════════════════════════════════════════════════
    const hasFloatingFooterChild = node.children.some(child => {
      const childName = child.name.toLowerCase();

      // Check name
      const isFooterNamed = childName.includes('footer') ||
                            childName.includes('bottom') ||
                            childName.includes('cta') ||
                            childName.includes('action') ||
                            childName.includes('floating');

      // Check position and dimensions
      let atBottom = false;
      let isSmallHeight = false;
      if (child.absoluteBoundingBox) {
        atBottom = isAtBottom(child.absoluteBoundingBox, parentBounds);
        isSmallHeight = child.absoluteBoundingBox.height < 150;
      }

      // Check for button
      const hasButton = containsButton(child as FigmaNodeFull);

      // Floating footer: at bottom + small height + (named footer OR has button)
      return atBottom && isSmallHeight && (isFooterNamed || hasButton);
    });
    if (hasFloatingFooterChild) {
      signals.hasFloatingFooter = true;
    }

    // Check for drag handle in children
    const hasDragHandleChild = node.children.some(child => {
      const childName = child.name.toLowerCase();
      const hasHandleName = childName.includes('handle') || childName.includes('drag') || childName.includes('indicator') || childName.includes('grip');

      // Check dimensions: small horizontal element
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

    // Check for close button in children
    const hasCloseButtonChild = node.children.some(child => {
      const childName = child.name.toLowerCase();
      return childName.includes('close') || childName.includes('dismiss') || childName === 'x' || childName.includes('×');
    });
    if (hasCloseButtonChild) {
      signals.hasCloseButton = true;
    }

    // Check for list (3+ similar children)
    if (node.children.length >= 3) {
      // Group children by dimensions
      const dimensionGroups: Map<string, number> = new Map();

      node.children.forEach(child => {
        if (child.absoluteBoundingBox) {
          const { width, height } = child.absoluteBoundingBox;
          const key = `${Math.round(width / 10)}_${Math.round(height / 10)}`;
          dimensionGroups.set(key, (dimensionGroups.get(key) || 0) + 1);
        }
      });

      // If there's a group of 3+ same-sized elements
      const hasLargeGroup = Array.from(dimensionGroups.values()).some(count => count >= 3);
      if (hasLargeGroup) {
        signals.isListLike = true;
      }
    }

    // Check for form elements
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
 * Check component integrity
 * Analyzes if components and instances are properly linked
 */
function checkComponentIntegrity(node: FigmaNodeFull): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];

  // Check: is INSTANCE with valid componentId
  if (node.type === 'INSTANCE') {
    if (!node.componentId) {
      issues.push({
        type: 'detached-instance',
        nodeId: node.id,
        nodeName: node.name,
        suggestion: 'Instance is detached from component. Recreate instance from component.',
      });
    }
  }

  // Check children for detached instances
  if (node.children) {
    node.children.forEach(child => {
      if (child.type === 'INSTANCE' && !child.componentId) {
        issues.push({
          type: 'detached-instance',
          nodeId: child.id,
          nodeName: child.name,
          suggestion: `Child instance "${child.name}" is detached from component / Child instance "${child.name}" is detached from component`,
        });
      }

      // Check for FRAME that should be INSTANCE
      if (child.type === 'FRAME') {
        const childName = child.name.toLowerCase();
        // If name suggests it's a component, but it's a FRAME
        if (childName.includes('component') || childName.includes('instance') || childName.includes('btn') || childName.includes('card')) {
          issues.push({
            type: 'missing-component',
            nodeId: child.id,
            nodeName: child.name,
            suggestion: `"${child.name}" looks like a component but is a FRAME. Convert to component. / "${child.name}" looks like a component but is a FRAME. Convert to component.`,
          });
        }
      }
    });
  }

  return issues;
}

/**
 * Analyze children
 * Counts number of different child node types
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
 * Calculate confidence
 * Determines confidence level in element classification
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

  // Base confidence by node type / Base confidence by node type
  if (nodeType === 'COMPONENT' || nodeType === 'COMPONENT_SET') {
    confidence += 0.4;
  } else if (nodeType === 'INSTANCE') {
    confidence += 0.35;
  } else if (nodeType === 'VECTOR' || nodeType === 'BOOLEAN_OPERATION') {
    confidence += 0.5; // Vectors are usually icons / Vectors are usually icons
  } else if (nodeType === 'FRAME') {
    confidence += 0.2; // FRAMEs need more analysis / FRAMEs need more analysis
  }

  // Confidence by dimensions / Confidence by dimensions
  const sizeCategory = classifyByDimensions(dimensions.width, dimensions.height);

  if (elementType === 'icon' && sizeCategory === 'icon') {
    confidence += 0.3;
  } else if (elementType === 'screen' && sizeCategory === 'screen') {
    confidence += 0.4; // High confidence for screen-sized elements / High confidence for screen-sized elements
  } else if (sizeCategory === 'component') {
    // Any element in component range / Any element in component range
    confidence += 0.2;
    if (elementType === 'button' || elementType === 'card' || elementType === 'input' ||
        elementType === 'list-item' || elementType === 'header') {
      confidence += 0.1;
    }
  }

  // Confidence by signals / Confidence by signals
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

  // Confidence by variants / Confidence by variants
  if (hasVariants) {
    confidence += 0.15;
    if (elementType === 'button' || elementType === 'chip' || elementType === 'badge' || elementType === 'input') {
      confidence += 0.1;
    }
  }

  // Confidence by children structure / Confidence by children structure
  if (childrenAnalysis.instanceCount > 0 && elementType !== 'icon') {
    confidence += 0.15; // Presence of instances suggests composite component / Presence of instances suggests composite component
  }
  if (childrenAnalysis.totalCount > 5 && (elementType === 'screen' || elementType === 'card' || elementType === 'section')) {
    confidence += 0.1;
  }

  // Clamp to 0-1 range / Clamp to 0-1 range
  return Math.min(Math.max(confidence, 0), 1);
}

/**
 * Determine element type
 * Complex analysis to determine specific element type
 */
function determineElementType(
  node: FigmaNodeFull,
  signals: PatternSignals,
  sizeCategory: SizeCategory,
  childrenAnalysis: ChildrenAnalysis
): ElementType {
  const nameLower = node.name.toLowerCase();

  // IMPORTANT: Check screen BEFORE system elements
  // Screen with StatusBar is a screen, not status-bar
  if (sizeCategory === 'screen') {
    // If it's screen-sized and has StatusBar as child - it's a screen
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
    // Default for large frames - screen
    return 'screen';
  }

  // System elements - only if node itself is system
  if (nameLower.includes('statusbar') || nameLower.includes('status bar') || nameLower.includes('status-bar')) {
    return 'status-bar';
  }
  if (nameLower.includes('keyboard')) {
    return 'keyboard';
  }
  if (nameLower.includes('tab bar') && nameLower.includes('system')) {
    return 'tab-bar-system';
  }

  // Overlays
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

  // By overlay signals
  if (signals.hasDragHandle) {
    return 'bottom-sheet';
  }
  if (signals.hasModalOverlay && signals.hasCloseButton) {
    return 'modal';
  }
  if (signals.hasModalOverlay) {
    return 'modal';
  }

  // Icons
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

  // Composite components
  // IMPORTANT: Check component names BEFORE layout signals
  if (nameLower.includes('card')) {
    return 'card';
  }
  // Check list-item BEFORE list
  if (nameLower.includes('listitem') || nameLower.includes('list-item') || nameLower.includes('list item') || nameLower.includes('row')) {
    return 'list-item';
  }

  // Layouts - AFTER list-item check
  if (nameLower.includes('grid')) {
    return 'grid';
  }
  if (nameLower.includes('scroll')) {
    return 'scroll-view';
  }
  // List check - only if not list-item (checked above)
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

  // Basic components
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

  // If has instance children, probably composite
  if (childrenAnalysis.instanceCount > 2) {
    return 'card';
  }

  return 'unknown';
}

/**
 * Determine recommended action
 * Based on element type and confidence
 */
function determineRecommendedAction(
  elementType: ElementType,
  confidence: number,
  isInstance: boolean,
  hasComponentId: boolean
): RecommendedAction {
  // Low confidence - ask LLM
  if (confidence < 0.5) {
    return 'ask_llm';
  }

  // System elements - skip
  if (elementType === 'status-bar' || elementType === 'keyboard' || elementType === 'tab-bar-system') {
    return 'skip_system';
  }

  // Instance with valid componentId - use existing
  if (isInstance && hasComponentId) {
    return 'use_existing';
  }

  // Overlays
  if (elementType === 'bottom-sheet' || elementType === 'action-sheet') {
    return 'generate_sheet';
  }
  if (elementType === 'modal' || elementType === 'dialog' || elementType === 'toast' || elementType === 'popover') {
    return 'generate_modal';
  }

  // Icons
  if (elementType === 'icon' || elementType === 'logo' || elementType === 'illustration') {
    return 'generate_icon';
  }

  // Screens
  if (elementType === 'screen' || elementType === 'screen-fragment') {
    return 'generate_screen';
  }

  // All other components
  return 'generate_component';
}

/**
 * Generate analysis context for LLM
 * Creates human-readable analysis description for decision making
 */
function generateAnalysisContext(analysis: ElementAnalysis): string {
  let context = `## Element Analysis: ${analysis.nodeName}\n\n`;

  context += `**Figma Type**: ${analysis.figmaNodeType}\n`;
  context += `**Dimensions**: ${analysis.dimensions.width}x${analysis.dimensions.height}px\n`;
  context += `**Detected Type**: ${analysis.elementType} (confidence: ${Math.round(analysis.confidence * 100)}%)\n`;
  context += `**Recommended Action**: ${analysis.recommendedAction}\n\n`;

  // Component info
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

  // Pattern signals
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

  // Children analysis
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

  // Integrity issues
  if (analysis.integrityIssues.length > 0) {
    context += `### ⚠️ Integrity Issues\n\n`;
    analysis.integrityIssues.forEach((issue, index) => {
      context += `${index + 1}. **${issue.type}** in "${issue.nodeName}"\n`;
      context += `   ${issue.suggestion}\n\n`;
    });
  }

  // Screenshot
  if (analysis.screenshotPath) {
    context += `### Screenshot\n\n`;
    context += `![${analysis.nodeName}](${analysis.screenshotPath})\n\n`;
  }

  return context;
}

// ============================================================================
// Smart Name Conversion
// ============================================================================

/**
 * Word classification dictionaries for UI context
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
  // States
  'empty', 'full', 'loading', 'loaded', 'active', 'inactive', 'disabled',
  'enabled', 'selected', 'unselected', 'checked', 'unchecked', 'open', 'closed',
  'expanded', 'collapsed', 'visible', 'hidden', 'focused', 'blurred',
  'valid', 'invalid', 'error', 'success', 'warning', 'pending', 'complete',
  'done', 'failed', 'cancelled', 'locked', 'unlocked',
  // Sizes
  'large', 'small', 'medium', 'mini', 'tiny', 'big', 'compact', 'wide', 'narrow',
  // Positions
  'top', 'bottom', 'left', 'right', 'center', 'middle', 'start', 'end',
  'first', 'last', 'next', 'prev', 'previous',
  // Priorities
  'primary', 'secondary', 'tertiary', 'main', 'default', 'alt', 'alternative',
  // UI states
  'new', 'old', 'recent', 'featured', 'popular', 'trending', 'hot', 'premium',
  // Specific
  'master', 'detail', 'overview', 'summary', 'preview', 'draft', 'final',
]);

const UI_TYPES = new Set([
  // Screens
  'screen', 'page', 'view', 'fragment',
  // Overlays
  'modal', 'dialog', 'sheet', 'popup', 'popover', 'tooltip', 'toast', 'alert',
  // Components
  'card', 'button', 'btn', 'input', 'field', 'form', 'list', 'item', 'row',
  'cell', 'header', 'footer', 'nav', 'navbar', 'sidebar', 'tab', 'tabs',
  'menu', 'dropdown', 'select', 'picker', 'slider', 'switch', 'toggle',
  'checkbox', 'radio', 'badge', 'chip', 'tag', 'label', 'icon', 'avatar',
  'image', 'banner', 'section', 'container', 'wrapper', 'group', 'panel',
  'bar', 'toolbar', 'action', 'fab',
]);

/**
 * Word type for classification
 */
type WordType = 'verb' | 'adjective' | 'noun' | 'type';

/**
 * Classify a word
 */
function classifyWord(word: string): WordType {
  const lower = word.toLowerCase();

  if (UI_VERBS.has(lower)) return 'verb';
  if (UI_ADJECTIVES.has(lower)) return 'adjective';
  if (UI_TYPES.has(lower)) return 'type';

  // Default - noun (entity)
  return 'noun';
}

/**
 * Smart component name conversion
 *
 * Word order: [Adjective] + [Verb] + [Noun] + [Type]
 *
 * Examples:
 * - "Search/emty" → "EmptySearchScreen"
 * - "Profile master" → "MasterProfileScreen"
 * - "edit_profile" → "EditProfileScreen"
 * - "Card_Visit" → "VisitCard"
 */
function toSmartPascalCase(name: string, elementType?: ElementType): string {
  // Clean and split into words
  const words = name
    .replace(/[^a-zA-Z0-9\s_\-/]/g, '')
    .split(/[\s_\-/]+/)
    .filter(w => w.length > 0)
    .map(w => w.toLowerCase());

  if (words.length === 0) return 'Unknown';

  // Classify each word
  const classified = words.map(word => ({
    word,
    type: classifyWord(word),
  }));

  // Group by types
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

  // Determine type suffix based on elementType
  let typeSuffix = '';
  if (types.length === 0 && elementType) {
    // Add suffix only for certain types
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
      // No suffix for other types
    }
  }

  // Assemble name in correct order
  // [Adjective] + [Verb] + [Noun] + [Type]
  const orderedWords = [
    ...adjectives,
    ...verbs,
    ...nouns,
    ...types,
  ];

  // Convert to PascalCase
  const pascalName = orderedWords
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');

  // Add suffix if needed
  if (typeSuffix && !pascalName.toLowerCase().includes(typeSuffix.toLowerCase())) {
    return pascalName + typeSuffix;
  }

  return pascalName || 'Unknown';
}

/**
 * Build URL for component
 * Replaces node-id in URL with component ID, preserving other params (m=dev etc.)
 * Replaces node-id in URL with component ID, preserving other params (m=dev etc.)
 */
function buildComponentUrl(figmaUrl: string | undefined, componentId: string): string {
  if (!figmaUrl) {
    // If URL not provided, create placeholder
    return `[Figma URL with node-id=${componentId.replace(':', '-')}]`;
  }

  // Normalize component ID (: → -)
  const normalizedComponentId = componentId.replace(':', '-');

  try {
    const url = new URL(figmaUrl);

    // Replace or add node-id
    url.searchParams.set('node-id', normalizedComponentId);

    // Ensure m=dev is present
    if (!url.searchParams.has('m')) {
      url.searchParams.set('m', 'dev');
    }

    return url.toString();
  } catch {
    // Fallback for invalid URLs
    if (figmaUrl.includes('node-id=')) {
      return figmaUrl.replace(/node-id=[^&]+/, `node-id=${normalizedComponentId}`);
    }
    const separator = figmaUrl.includes('?') ? '&' : '?';
    return `${figmaUrl}${separator}node-id=${normalizedComponentId}&m=dev`;
  }
}

/**
 * Generate next step for LLM
 * Determines exact action based on analysis
 */
function generateNextStep(
  analysis: Omit<ElementAnalysis, 'nextStep' | 'analysisContext'>,
  figmaUrl?: string
): NextStep {
  const { elementType, confidence, recommendedAction, isInstance, componentId, nodeName, signals } = analysis;

  // Convert name to PascalCase with word type awareness
  const screenName = toSmartPascalCase(nodeName, elementType);

  // 1. System elements - skip
  if (recommendedAction === 'skip_system') {
    return {
      action: 'skip',
      reason: `${elementType} is a system UI element (StatusBar, Keyboard, etc.) that is provided by the OS. No code generation needed.`,
      message: `⏭️ Skipping "${nodeName}" - this is a system UI element provided by iOS/Android.`,
    };
  }

  // 2. Component instance - redirect to analyze parent component
  // Component instance - redirect to analyze parent component
  if (recommendedAction === 'use_existing' && isInstance && componentId) {
    const componentUrl = buildComponentUrl(figmaUrl, componentId);
    const componentName = toSmartPascalCase(nodeName, undefined); // Without type suffix for component

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

  // 3. Low confidence - ask user
  if (recommendedAction === 'ask_llm' || confidence < 0.5) {
    // Determine options based on signals
    const options: ChoiceOption[] = [];

    if (signals.hasModalOverlay || signals.hasDragHandle) {
      options.push({
        value: 'bottom-sheet',
        label: 'Bottom Sheet',
        description: 'Bottom drawer with drag handle. Used for filters, details, option selection.',
      });
      options.push({
        value: 'modal',
        label: 'Modal Dialog',
        description: 'Modal dialog centered on screen. Used for confirmations, alerts, forms.',
      });
    }

    if (signals.hasFormElements) {
      options.push({
        value: 'form',
        label: 'Form Component',
        description: 'Form with input fields and validation. Generated with react-hook-form + Zod.',
      });
    }

    options.push({
      value: 'screen',
      label: 'Full Screen',
      description: 'Full application screen with navigation.',
    });

    options.push({
      value: 'component',
      label: 'Reusable Component',
      description: 'Reusable component for use on other screens.',
    });

    return {
      action: 'ask_user',
      reason: `Low confidence (${Math.round(confidence * 100)}%) in element type detection. Multiple interpretations possible.`,
      question: `🤔 Element "${nodeName}" could be interpreted differently.\n\n**Detected signals:**\n${signals.hasModalOverlay ? '• Has modal overlay/backdrop\n' : ''}${signals.hasFloatingFooter ? '• Has floating footer (sticky CTA)\n' : ''}${signals.hasDragHandle ? '• Has drag handle\n' : ''}${signals.hasFormElements ? '• Contains form elements\n' : ''}${signals.hasCloseButton ? '• Has close button\n' : ''}\n**What type of element is this?**`,
      options,
    };
  }

  // 4. High confidence - call appropriate tool
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

  // 5. Default component
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
 * Main element analysis function
 * Performs full Figma node analysis and returns recommendations
 */
export async function analyzeElement(
  node: FigmaNodeFull,
  includeScreenshot?: boolean,
  screenshotPath?: string,
  figmaUrl?: string
): Promise<ElementAnalysis> {
  // Get dimensions
  const dimensions = node.absoluteBoundingBox
    ? { width: node.absoluteBoundingBox.width, height: node.absoluteBoundingBox.height }
    : { width: 0, height: 0 };

  // Determine if has variants
  const hasVariants = !!(node.componentPropertyDefinitions && Object.keys(node.componentPropertyDefinitions).length > 0);

  // Determine if is instance
  const isInstance = node.type === 'INSTANCE';
  const componentId = node.componentId;

  // Detect patterns
  const signals = detectPatterns(node);

  // Analyze children
  const childrenAnalysis = analyzeChildren(node);

  // Check integrity
  const integrityIssues = checkComponentIntegrity(node);

  // Classify by dimensions
  const sizeCategory = classifyByDimensions(dimensions.width, dimensions.height);

  // Determine element type
  const elementType = determineElementType(node, signals, sizeCategory, childrenAnalysis);

  // Calculate confidence
  const confidence = calculateConfidence(
    elementType,
    signals,
    node.type,
    dimensions,
    hasVariants,
    childrenAnalysis
  );

  // Determine recommended action
  const recommendedAction = determineRecommendedAction(
    elementType,
    confidence,
    isInstance,
    !!componentId
  );

  // Create partial result for nextStep generation
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

  // Generate next step
  const nextStep = generateNextStep(partialAnalysis, figmaUrl);

  // Create complete analysis result
  const analysis: ElementAnalysis = {
    ...partialAnalysis,
    nextStep,
    analysisContext: '', // Will be filled below
  };

  // Generate analysis context
  analysis.analysisContext = generateAnalysisContext(analysis);

  return analysis;
}
