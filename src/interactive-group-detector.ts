/**
 * Interactive Component Group Detector
 *
 * Detects when multiple sibling nodes form a single logical component
 * based on interaction patterns (e.g., star ratings, tab bars, toggles).
 */

/**
 * Detected component group
 */
export interface ComponentGroupDetection {
  /** Parent node ID containing the group */
  nodeId: string;
  /** Parent node name */
  nodeName: string;
  /** Type of detection */
  type: 'interactive-group';
  /** Inferred pattern type */
  pattern: 'rating' | 'tabs' | 'segmented-control' | 'stepper' | 'toggle-group' | 'pagination' | 'unknown';
  /** Number of interactive children */
  childCount: number;
  /** Child node IDs */
  childNodeIds: string[];
  /** Destination node IDs (for variant navigation) */
  destinations: string[];
  /** Suggested React Native component */
  inferredComponent: string;
  /** Detection confidence (0-1) */
  confidence: number;
  /** Additional metadata */
  metadata: {
    /** Whether all children have same trigger type */
    uniformTrigger: boolean;
    /** Common trigger type */
    triggerType?: string;
    /** Whether destinations are variants of same component */
    destinationsAreVariants: boolean;
  };
}

/**
 * Interaction extracted from Figma node
 */
interface FigmaInteraction {
  nodeId: string;
  nodeName: string;
  trigger: string;
  action: string;
  destinationId?: string;
}

/**
 * Detects interactive component groups from Figma node and interactions
 *
 * @param node - Root Figma node
 * @param interactions - Extracted interactions from the node tree
 * @returns Array of detected component groups
 */
export function detectComponentGroups(
  node: any,
  interactions: FigmaInteraction[]
): ComponentGroupDetection[] {
  const groups: ComponentGroupDetection[] = [];

  if (!interactions || interactions.length === 0) {
    return groups;
  }

  // Group interactions by parent node (siblings)
  const siblingGroups = groupInteractionsBySiblings(interactions);

  for (const [parentId, siblingInteractions] of Object.entries(siblingGroups)) {
    const group = analyzeInteractionGroup(parentId, siblingInteractions, node);
    if (group && group.confidence >= 0.6) {
      groups.push(group);
    }
  }

  return groups;
}

/**
 * Groups interactions by their parent node (to find siblings)
 */
function groupInteractionsBySiblings(
  interactions: FigmaInteraction[]
): Record<string, FigmaInteraction[]> {
  const groups: Record<string, FigmaInteraction[]> = {};

  for (const interaction of interactions) {
    // Extract parent ID from node ID
    // Format: "I2726:74547;273:1293" -> parent is "2726:74547" or the part before last semicolon
    const parentId = extractParentId(interaction.nodeId);

    if (!groups[parentId]) {
      groups[parentId] = [];
    }
    groups[parentId].push(interaction);
  }

  return groups;
}

/**
 * Extracts parent node ID from a Figma node ID
 * Handles instance IDs like "I2726:74547;273:1293"
 */
function extractParentId(nodeId: string): string {
  // If it's an instance ID (starts with I and has semicolons)
  if (nodeId.startsWith('I') && nodeId.includes(';')) {
    // Get the instance root: "I2726:74547;273:1293" -> "2726:74547"
    const parts = nodeId.substring(1).split(';');
    return parts[0];
  }

  // For regular IDs, extract parent by removing last segment
  const colonIndex = nodeId.lastIndexOf(':');
  if (colonIndex > 0) {
    // This is a simplification - in real Figma, parent relationship is in the tree
    return nodeId;
  }

  return nodeId;
}

/**
 * Analyzes a group of sibling interactions to detect patterns
 */
function analyzeInteractionGroup(
  parentId: string,
  interactions: FigmaInteraction[],
  rootNode: any
): ComponentGroupDetection | null {
  // Need at least 2 siblings with interactions
  if (interactions.length < 2) {
    return null;
  }

  // Check if all have same trigger type
  const triggers = new Set(interactions.map(i => i.trigger));
  const uniformTrigger = triggers.size === 1;
  const triggerType = uniformTrigger ? interactions[0].trigger : undefined;

  // Check if all have NODE action (variant navigation)
  const allNodeActions = interactions.every(i => i.action === 'NODE');

  // Check destinations
  const destinations = interactions
    .map(i => i.destinationId)
    .filter((d): d is string => !!d);

  // Check if destinations seem to be variants (similar IDs)
  const destinationsAreVariants = checkIfVariants(destinations);

  // Find parent node info
  const parentNode = findNodeById(rootNode, parentId);
  const parentName = parentNode?.name || 'Unknown';

  // Determine pattern and confidence
  const { pattern, confidence, inferredComponent } = inferPattern(
    interactions.length,
    uniformTrigger,
    triggerType,
    allNodeActions,
    destinationsAreVariants,
    parentName
  );

  if (confidence < 0.5) {
    return null;
  }

  return {
    nodeId: parentId,
    nodeName: parentName,
    type: 'interactive-group',
    pattern,
    childCount: interactions.length,
    childNodeIds: interactions.map(i => i.nodeId),
    destinations,
    inferredComponent,
    confidence,
    metadata: {
      uniformTrigger,
      triggerType,
      destinationsAreVariants
    }
  };
}

/**
 * Checks if destination IDs appear to be variants of the same component
 */
function checkIfVariants(destinations: string[]): boolean {
  if (destinations.length < 2) return false;

  // Extract the base part of each ID (before the last colon segment)
  const baseParts = destinations.map(d => {
    const colonIndex = d.lastIndexOf(':');
    return colonIndex > 0 ? d.substring(0, colonIndex) : d;
  });

  // Check if all have same base (same component, different variants)
  const uniqueBases = new Set(baseParts);
  return uniqueBases.size === 1;
}

/**
 * Finds a node by ID in the tree
 */
function findNodeById(node: any, targetId: string): any | null {
  if (!node) return null;

  if (node.id === targetId) {
    return node;
  }

  if (node.children) {
    for (const child of node.children) {
      const found = findNodeById(child, targetId);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Infers the pattern type and suggested component based on signals
 */
function inferPattern(
  childCount: number,
  uniformTrigger: boolean,
  triggerType: string | undefined,
  allNodeActions: boolean,
  destinationsAreVariants: boolean,
  parentName: string
): { pattern: ComponentGroupDetection['pattern']; confidence: number; inferredComponent: string } {
  const nameLower = parentName.toLowerCase();

  // Rating pattern: 3-5 items, all clickable, variants of same component
  if (childCount >= 3 && childCount <= 5 && allNodeActions && destinationsAreVariants) {
    // Strong signal for rating
    if (nameLower.includes('star') || nameLower.includes('rating')) {
      return { pattern: 'rating', confidence: 0.95, inferredComponent: 'Rating' };
    }
    // 5 siblings with variant navigation is very likely a rating
    if (childCount === 5) {
      return { pattern: 'rating', confidence: 0.85, inferredComponent: 'Rating' };
    }
    return { pattern: 'rating', confidence: 0.7, inferredComponent: 'Rating' };
  }

  // Tab pattern: 2-6 items, click triggers, navigate to different screens
  if (childCount >= 2 && childCount <= 6 && triggerType === 'ON_CLICK' && !destinationsAreVariants) {
    if (nameLower.includes('tab') || nameLower.includes('nav') || nameLower.includes('menu')) {
      return { pattern: 'tabs', confidence: 0.9, inferredComponent: 'TabBar' };
    }
    return { pattern: 'tabs', confidence: 0.6, inferredComponent: 'TabBar' };
  }

  // Segmented control: 2-4 items, variants of same component
  if (childCount >= 2 && childCount <= 4 && destinationsAreVariants) {
    if (nameLower.includes('segment') || nameLower.includes('toggle') || nameLower.includes('switch')) {
      return { pattern: 'segmented-control', confidence: 0.85, inferredComponent: 'SegmentedControl' };
    }
    return { pattern: 'segmented-control', confidence: 0.6, inferredComponent: 'SegmentedControl' };
  }

  // Stepper pattern: exactly 2 items (increment/decrement)
  if (childCount === 2 && uniformTrigger) {
    if (nameLower.includes('stepper') || nameLower.includes('quantity') || nameLower.includes('counter')) {
      return { pattern: 'stepper', confidence: 0.85, inferredComponent: 'Stepper' };
    }
  }

  // Pagination: many small items
  if (childCount >= 3 && childCount <= 10) {
    if (nameLower.includes('page') || nameLower.includes('dot') || nameLower.includes('indicator')) {
      return { pattern: 'pagination', confidence: 0.8, inferredComponent: 'PageIndicator' };
    }
  }

  // Unknown pattern but still a group
  if (uniformTrigger && childCount >= 2) {
    return { pattern: 'unknown', confidence: 0.5, inferredComponent: 'InteractiveGroup' };
  }

  return { pattern: 'unknown', confidence: 0.3, inferredComponent: 'View' };
}

/**
 * Helper to check if a node ID is part of any detected group
 */
export function isNodeInGroup(
  nodeId: string,
  groups: ComponentGroupDetection[]
): ComponentGroupDetection | null {
  for (const group of groups) {
    if (group.nodeId === nodeId || group.childNodeIds.includes(nodeId)) {
      return group;
    }
  }
  return null;
}

/**
 * Helper to check if a node is a group parent
 */
export function isGroupParent(
  nodeId: string,
  groups: ComponentGroupDetection[]
): ComponentGroupDetection | null {
  return groups.find(g => g.nodeId === nodeId) || null;
}

/**
 * Helper to check if a node is a group child (should be skipped in generation)
 */
export function isGroupChild(
  nodeId: string,
  groups: ComponentGroupDetection[]
): boolean {
  return groups.some(g => g.childNodeIds.includes(nodeId));
}
