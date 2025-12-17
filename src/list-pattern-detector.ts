import { compareTwoStrings } from 'string-similarity';
import { toCamelCase, capitalize } from './smart-namer.js';

/**
 * Interface for list pattern detection result
 */
export interface ListPatternDetection {
  /** List type: FlatList, ScrollView, SectionList or none */
  type: 'FlatList' | 'ScrollView' | 'SectionList' | 'none';
  /** Detection confidence (0-1) */
  confidence: number;
  /** Number of items in repeating pattern */
  itemCount: number;
  /** List item structure (extracted properties) */
  itemStructure: Record<string, any>;
  /** List orientation: vertical or horizontal */
  orientation: 'vertical' | 'horizontal';
  /** Has list header */
  hasHeader: boolean;
  /** Has list footer */
  hasFooter: boolean;
  /** Gap between items */
  gap: number | null;
  /** Suggested item type name for TypeScript */
  suggestedItemTypeName: string;
  /** Nodes identified as list items */
  itemNodes: any[];
  /** Header node (if exists) */
  headerNode?: any;
  /** Footer node (if exists) */
  footerNode?: any;
}

/**
 * Interface for pattern detection settings
 */
export interface DetectionOptions {
  /** Minimum number of items to define a pattern (default 3) */
  minItemCount?: number;
  /** Minimum confidence in structural similarity (default 0.7) */
  minConfidence?: number;
  /** Consider item order when detecting pattern */
  strictOrder?: boolean;
}

/**
 * Detects repeating patterns in Figma nodes
 *
 * @param node - Figma node to analyze
 * @param options - Detection settings
 * @returns List pattern detection result
 */
export function detectListPattern(
  node: any,
  options: DetectionOptions = {}
): ListPatternDetection {
  const {
    minItemCount = 3,
    minConfidence = 0.7,
    strictOrder = false,
  } = options;

  // Initialize default result
  const defaultResult: ListPatternDetection = {
    type: 'none',
    confidence: 0,
    itemCount: 0,
    itemStructure: {},
    orientation: 'vertical',
    hasHeader: false,
    hasFooter: false,
    gap: null,
    suggestedItemTypeName: 'Item',
    itemNodes: [],
  };

  // Check for children
  if (!node.children || !Array.isArray(node.children) || node.children.length < minItemCount) {
    return defaultResult;
  }

  const children = node.children;

  // Determine orientation based on layoutMode
  const orientation: 'vertical' | 'horizontal' =
    node.layoutMode === 'HORIZONTAL' ? 'horizontal' : 'vertical';

  // Extract gap from itemSpacing
  const gap = node.itemSpacing !== undefined ? node.itemSpacing : null;

  // Analyze children structure
  const childStructures = children.map((child: any) => extractNodeStructure(child));

  // Find repeating pattern
  const patternAnalysis = analyzeRepeatingPattern(
    children,
    childStructures,
    minItemCount,
    minConfidence,
    strictOrder
  );

  if (!patternAnalysis.found) {
    return defaultResult;
  }

  // Determine header and footer
  const { headerNode, footerNode, itemNodes } = identifyHeaderFooter(
    children,
    patternAnalysis.itemIndices
  );

  // Determine list type
  const listType = determineListType(
    node,
    itemNodes,
    patternAnalysis.hasSectionHeaders
  );

  // Generate item type name
  const suggestedItemTypeName = generateItemTypeName(node, itemNodes[0]);

  return {
    type: listType,
    confidence: patternAnalysis.confidence,
    itemCount: itemNodes.length,
    itemStructure: patternAnalysis.commonStructure,
    orientation,
    hasHeader: headerNode !== undefined,
    hasFooter: footerNode !== undefined,
    gap,
    suggestedItemTypeName,
    itemNodes,
    headerNode,
    footerNode,
  };
}

/**
 * Extracts node structure for comparison
 *
 * @param node - Figma node
 * @returns Object with key structure properties
 */
function extractNodeStructure(node: any): Record<string, any> {
  const structure: Record<string, any> = {
    type: node.type || 'UNKNOWN',
    childCount: node.children ? node.children.length : 0,
    hasText: node.type === 'TEXT' || hasTextChildren(node),
    hasImage: hasImageFills(node),
    layoutMode: node.layoutMode || 'NONE',
  };

  // Add child types information
  if (node.children && node.children.length > 0) {
    structure.childTypes = node.children.map((child: any) => child.type).sort();
    structure.childNames = node.children.map((child: any) =>
      normalizeNodeName(child.name || '')
    ).sort();
  }

  return structure;
}

/**
 * Analyzes children for repeating pattern
 *
 * @param children - Array of child nodes
 * @param structures - Array of node structures
 * @param minItemCount - Minimum number of items
 * @param minConfidence - Minimum confidence
 * @param strictOrder - Strict order
 * @returns Pattern analysis result
 */
function analyzeRepeatingPattern(
  children: any[],
  structures: Record<string, any>[],
  minItemCount: number,
  minConfidence: number,
  strictOrder: boolean
): {
  found: boolean;
  confidence: number;
  commonStructure: Record<string, any>;
  itemIndices: number[];
  hasSectionHeaders: boolean;
} {
  const result = {
    found: false,
    confidence: 0,
    commonStructure: {},
    itemIndices: [] as number[],
    hasSectionHeaders: false,
  };

  // Check name similarity patterns (Item 1, Item 2, Card, Card Copy, etc.)
  const nameSimilarity = analyzeNamePatterns(children);

  // Group similar structures
  const groups = groupSimilarStructures(structures, minConfidence);

  // Find the largest group
  const largestGroup = groups.reduce(
    (max, group) => (group.indices.length > max.indices.length ? group : max),
    { indices: [], confidence: 0 }
  );

  // Check if group has enough items
  if (largestGroup.indices.length < minItemCount) {
    return result;
  }

  // Check for section headers
  const hasSectionHeaders = detectSectionHeaders(children, largestGroup.indices);

  // Calculate final confidence
  const structureConfidence = largestGroup.confidence;
  const nameConfidence = nameSimilarity.confidence;
  const finalConfidence = structureConfidence * 0.7 + nameConfidence * 0.3;

  if (finalConfidence < minConfidence) {
    return result;
  }

  result.found = true;
  result.confidence = finalConfidence;
  result.commonStructure = structures[largestGroup.indices[0]];
  result.itemIndices = largestGroup.indices;
  result.hasSectionHeaders = hasSectionHeaders;

  return result;
}

/**
 * Groups structures by similarity
 *
 * @param structures - Array of node structures
 * @param minConfidence - Minimum confidence for grouping
 * @returns Array of groups with indices and confidence
 */
function groupSimilarStructures(
  structures: Record<string, any>[],
  minConfidence: number
): Array<{ indices: number[]; confidence: number }> {
  const groups: Array<{ indices: number[]; confidence: number }> = [];

  for (let i = 0; i < structures.length; i++) {
    let addedToGroup = false;

    // Check existing groups
    for (const group of groups) {
      const referenceStructure = structures[group.indices[0]];
      const similarity = calculateStructureSimilarity(structures[i], referenceStructure);

      if (similarity >= minConfidence) {
        group.indices.push(i);
        group.confidence = (group.confidence + similarity) / 2; // Average confidence
        addedToGroup = true;
        break;
      }
    }

    // Create new group if item doesn't fit any existing group
    if (!addedToGroup) {
      groups.push({ indices: [i], confidence: 1.0 });
    }
  }

  return groups;
}

/**
 * Calculates similarity between two structures
 *
 * @param struct1 - First structure
 * @param struct2 - Second structure
 * @returns Similarity coefficient (0-1)
 */
function calculateStructureSimilarity(
  struct1: Record<string, any>,
  struct2: Record<string, any>
): number {
  let matches = 0;
  let total = 0;

  // Compare basic properties
  const keys = Array.from(new Set([...Object.keys(struct1), ...Object.keys(struct2)]));

  for (const key of keys) {
    total++;

    if (key === 'childTypes' || key === 'childNames') {
      // Special handling for arrays
      if (
        Array.isArray(struct1[key]) &&
        Array.isArray(struct2[key]) &&
        arraysEqual(struct1[key], struct2[key])
      ) {
        matches++;
      }
    } else if (struct1[key] === struct2[key]) {
      matches++;
    }
  }

  return total > 0 ? matches / total : 0;
}

/**
 * Analyzes patterns in node names
 *
 * @param nodes - Array of nodes
 * @returns Analysis result with confidence
 */
function analyzeNamePatterns(nodes: any[]): { confidence: number } {
  const names = nodes.map((node) => node.name || '').filter((name) => name.length > 0);

  if (names.length < 2) {
    return { confidence: 0 };
  }

  // Check for numeric suffixes (Item 1, Item 2, Item 3)
  const numericPattern = /^(.+?)\s*(\d+)$/;
  const numericMatches = names.filter((name) => numericPattern.test(name));

  if (numericMatches.length >= names.length * 0.7) {
    return { confidence: 0.9 };
  }

  // Check for "Copy" pattern (Card, Card Copy, Card Copy 2)
  const copyPattern = /^(.+?)(\s+Copy(\s+\d+)?)?$/;
  const copyMatches = names.filter((name) => {
    const match = name.match(copyPattern);
    return match && match[1];
  });

  if (copyMatches.length >= names.length * 0.7) {
    return { confidence: 0.8 };
  }

  // Check general name similarity
  const baseName = names[0];
  let totalSimilarity = 0;

  for (let i = 1; i < names.length; i++) {
    totalSimilarity += compareTwoStrings(baseName, names[i]);
  }

  const avgSimilarity = names.length > 1 ? totalSimilarity / (names.length - 1) : 0;

  if (avgSimilarity > 0.6) {
    return { confidence: avgSimilarity * 0.7 };
  }

  return { confidence: 0 };
}

/**
 * Detects section headers in list
 *
 * @param children - Array of child nodes
 * @param itemIndices - List item indices
 * @returns true if section headers found
 */
function detectSectionHeaders(children: any[], itemIndices: number[]): boolean {
  // Look for nodes between list items that could be section headers
  const nonItemIndices = children
    .map((_, index) => index)
    .filter((index) => !itemIndices.includes(index));

  if (nonItemIndices.length === 0) {
    return false;
  }

  // Check if these nodes are text and have header characteristics
  const potentialHeaders = nonItemIndices.filter((index) => {
    const node = children[index];
    const name = (node.name || '').toLowerCase();

    return (
      node.type === 'TEXT' ||
      name.includes('header') ||
      name.includes('title') ||
      name.includes('section')
    );
  });

  // If more than one potential header found, consider it a SectionList
  return potentialHeaders.length > 1;
}

/**
 * Identifies list header and footer
 *
 * @param children - Array of child nodes
 * @param itemIndices - List item indices
 * @returns Object with header, footer and list items
 */
function identifyHeaderFooter(
  children: any[],
  itemIndices: number[]
): {
  headerNode?: any;
  footerNode?: any;
  itemNodes: any[];
} {
  const result = {
    itemNodes: itemIndices.map((index) => children[index]),
  } as { headerNode?: any; footerNode?: any; itemNodes: any[] };

  // Check if there's a node before the first list item
  const firstItemIndex = Math.min(...itemIndices);
  if (firstItemIndex > 0) {
    const potentialHeader = children[firstItemIndex - 1];
    if (isLikelyHeader(potentialHeader)) {
      result.headerNode = potentialHeader;
    }
  }

  // Check if there's a node after the last list item
  const lastItemIndex = Math.max(...itemIndices);
  if (lastItemIndex < children.length - 1) {
    const potentialFooter = children[lastItemIndex + 1];
    if (isLikelyFooter(potentialFooter)) {
      result.footerNode = potentialFooter;
    }
  }

  return result;
}

/**
 * Determines if node is likely a header
 *
 * @param node - Node to check
 * @returns true if node looks like a header
 */
function isLikelyHeader(node: any): boolean {
  const name = (node.name || '').toLowerCase();
  return (
    name.includes('header') ||
    name.includes('title') ||
    name.includes('top') ||
    (node.type === 'TEXT' && node.style?.fontSize > 16)
  );
}

/**
 * Determines if node is likely a footer
 *
 * @param node - Node to check
 * @returns true if node looks like a footer
 */
function isLikelyFooter(node: any): boolean {
  const name = (node.name || '').toLowerCase();
  return (
    name.includes('footer') ||
    name.includes('bottom') ||
    name.includes('pagination') ||
    name.includes('load more')
  );
}

/**
 * Determines list type based on node analysis
 *
 * @param parentNode - Parent node
 * @param itemNodes - List items
 * @param hasSectionHeaders - Has section headers
 * @returns List type
 */
function determineListType(
  parentNode: any,
  itemNodes: any[],
  hasSectionHeaders: boolean
): 'FlatList' | 'ScrollView' | 'SectionList' {
  // If section headers exist, it's a SectionList
  if (hasSectionHeaders) {
    return 'SectionList';
  }

  // If few items (< 5), ScrollView can be used
  if (itemNodes.length < 5) {
    return 'ScrollView';
  }

  // Default to FlatList for optimal performance
  return 'FlatList';
}

/**
 * Generates item type name based on node
 *
 * @param parentNode - Parent node
 * @param itemNode - Item node
 * @returns Type name in PascalCase
 */
function generateItemTypeName(parentNode: any, itemNode: any): string {
  const parentName = parentNode.name || '';
  const itemName = itemNode.name || '';

  // Try to extract base name from item name
  const baseNameMatch = itemName.match(/^([A-Za-z]+)/);
  if (baseNameMatch) {
    const baseName = baseNameMatch[1];
    return capitalize(toCamelCase(baseName));
  }

  // Use parent name if available
  if (parentName) {
    const cleanName = parentName.replace(/list|items|collection/gi, '').trim();
    if (cleanName) {
      return capitalize(toCamelCase(cleanName)) + 'Item';
    }
  }

  return 'Item';
}

/**
 * Generates React Native code for list
 *
 * @param detection - Pattern detection result
 * @param itemCode - Code for rendering item
 * @param screenName - Screen/component name
 * @returns Generated code
 */
export function generateListCode(
  detection: ListPatternDetection,
  itemCode: string,
  screenName: string
): string {
  if (detection.type === 'none') {
    return '// No list pattern detected';
  }

  const listName = toCamelCase(screenName + 'Data');
  const itemTypeName = detection.suggestedItemTypeName;

  let code = '';

  // Generate TypeScript interface for item
  code += `interface ${itemTypeName} {\n`;
  code += `  id: string;\n`;
  code += `  // TODO: Add properties based on your data model\n`;
  code += `}\n\n`;

  // Generate mock data
  code += `const ${listName}: ${itemTypeName}[] = [\n`;
  for (let i = 0; i < Math.min(3, detection.itemCount); i++) {
    code += `  { id: '${i + 1}' },\n`;
  }
  code += `];\n\n`;

  // Generate renderItem function
  code += `const renderItem = ({ item }: { item: ${itemTypeName} }) => (\n`;
  code += `  ${itemCode}\n`;
  code += `);\n\n`;

  // Generate keyExtractor
  code += `const keyExtractor = (item: ${itemTypeName}) => item.id;\n\n`;

  // Generate ItemSeparatorComponent if gap exists
  if (detection.gap !== null && detection.gap > 0) {
    code += `const ItemSeparator = () => (\n`;
    code += `  <View style={{ height: scale(${detection.gap}) }} />\n`;
    code += `);\n\n`;
  }

  // Generate ListEmptyComponent
  code += `const ListEmptyComponent = () => (\n`;
  code += `  <View style={styles.emptyContainer}>\n`;
  code += `    <Text style={styles.emptyText}>No data to display</Text>\n`;
  code += `  </View>\n`;
  code += `);\n\n`;

  // Generate main list component
  if (detection.type === 'FlatList') {
    code += `<FlatList\n`;
    code += `  data={${listName}}\n`;
    code += `  renderItem={renderItem}\n`;
    code += `  keyExtractor={keyExtractor}\n`;

    if (detection.orientation === 'horizontal') {
      code += `  horizontal\n`;
    }

    if (detection.gap !== null && detection.gap > 0) {
      code += `  ItemSeparatorComponent={ItemSeparator}\n`;
    }

    code += `  ListEmptyComponent={ListEmptyComponent}\n`;

    // Add pull-to-refresh pattern
    code += `  refreshing={false} // TODO: Connect loading state\n`;
    code += `  onRefresh={() => {}} // TODO: Implement refresh logic\n`;

    // Add pagination hints
    code += `  onEndReached={() => {}} // TODO: Implement next page loading\n`;
    code += `  onEndReachedThreshold={0.5}\n`;

    if (detection.hasHeader && detection.headerNode) {
      code += `  ListHeaderComponent={() => (\n`;
      code += `    // TODO: Implement header component\n`;
      code += `    <View />\n`;
      code += `  )}\n`;
    }

    if (detection.hasFooter && detection.footerNode) {
      code += `  ListFooterComponent={() => (\n`;
      code += `    // TODO: Implement footer component\n`;
      code += `    <View />\n`;
      code += `  )}\n`;
    }

    code += `/>\n`;
  } else if (detection.type === 'SectionList') {
    code += `// TODO: Implement SectionList with sectioned data\n`;
    code += `<SectionList\n`;
    code += `  sections={[]} // TODO: Structure data by sections\n`;
    code += `  renderItem={renderItem}\n`;
    code += `  renderSectionHeader={({ section }) => (\n`;
    code += `    <Text style={styles.sectionHeader}>{section.title}</Text>\n`;
    code += `  )}\n`;
    code += `  keyExtractor={keyExtractor}\n`;
    code += `/>\n`;
  } else if (detection.type === 'ScrollView') {
    code += `<ScrollView>\n`;
    code += `  {${listName}.map((item) => (\n`;
    code += `    <View key={item.id}>\n`;
    code += `      {renderItem({ item })}\n`;
    code += `    </View>\n`;
    code += `  ))}\n`;
    code += `</ScrollView>\n`;
  }

  return code;
}

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Checks for text children
 */
function hasTextChildren(node: any): boolean {
  if (!node.children) return false;
  return node.children.some((child: any) => child.type === 'TEXT' || hasTextChildren(child));
}

/**
 * Checks for images in fills
 */
function hasImageFills(node: any): boolean {
  if (!node.fills || !Array.isArray(node.fills)) return false;
  return node.fills.some((fill: any) => fill.type === 'IMAGE');
}

/**
 * Normalizes node name for comparison
 */
function normalizeNodeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+\d+$/g, '') // Remove numeric suffixes
    .replace(/\s+copy(\s+\d+)?$/gi, '') // Remove "Copy" suffixes
    .trim();
}

/**
 * Checks equality of two arrays
 */
function arraysEqual(arr1: any[], arr2: any[]): boolean {
  if (arr1.length !== arr2.length) return false;
  return arr1.every((val, index) => val === arr2[index]);
}
