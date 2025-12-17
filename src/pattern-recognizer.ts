import { compareTwoStrings } from 'string-similarity';

/**
 * Interface for component matching result
 */
export interface ComponentMatch {
  figmaNode: {
    id: string;
    name: string;
    type: string;
    properties: string[];  // extracted child element names, text content
  };
  existingComponent: {
    name: string;
    confidence: number;  // 0-1
  };
  matchReason: {
    nameSimilarity: number;
    structureSimilarity: number;
    semanticSimilarity: number;
  };
  recommendation: 'USE_EXISTING' | 'CREATE_NEW' | 'EXTEND_EXISTING';
}

/**
 * Normalize string for comparison
 * @param str - source string
 * @returns normalized string (lowercase, without special characters)
 */
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

/**
 * Extract properties from Figma node
 * @param node - Figma node
 * @returns array of properties (child names, tokens from node name)
 */
function extractProperties(node: any): string[] {
  const properties = new Set<string>();

  // Tokenize node name
  const nameTokens = normalizeString(node.name || '')
    .split(/\s+/)
    .filter(token => token.length > 2);
  nameTokens.forEach(token => properties.add(token));

  // Recursively extract child element names
  function extractChildNames(n: any) {
    if (n.children && Array.isArray(n.children)) {
      n.children.forEach((child: any) => {
        if (child.name) {
          const childTokens = normalizeString(child.name)
            .split(/\s+/)
            .filter(token => token.length > 2);
          childTokens.forEach(token => properties.add(token));
        }
        extractChildNames(child);
      });
    }
  }

  extractChildNames(node);

  // Extract text content
  if (node.characters) {
    const textTokens = normalizeString(node.characters)
      .split(/\s+/)
      .filter(token => token.length > 2);
    textTokens.forEach(token => properties.add(token));
  }

  return Array.from(properties);
}

/**
 * Calculate name similarity using string-similarity algorithm
 * @param figmaName - Figma node name
 * @param compName - existing component name
 * @returns similarity score (0-1)
 */
function calculateNameSimilarity(figmaName: string, compName: string): number {
  const normalizedFigma = normalizeString(figmaName);
  const normalizedComp = normalizeString(compName);

  return compareTwoStrings(normalizedFigma, normalizedComp);
}

/**
 * Calculate structural similarity using Jaccard index
 * @param figmaProps - Figma node properties
 * @param compProps - existing component properties
 * @returns Jaccard index (0-1)
 */
function calculateStructureSimilarity(figmaProps: string[], compProps: string[]): number {
  if (figmaProps.length === 0 && compProps.length === 0) {
    return 1.0;
  }

  if (figmaProps.length === 0 || compProps.length === 0) {
    return 0.0;
  }

  const setA = new Set(figmaProps.map(p => normalizeString(p)));
  const setB = new Set(compProps.map(p => normalizeString(p)));

  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);

  return intersection.size / union.size;
}

/**
 * Calculate semantic similarity through simple keyword matching
 * @param figmaNode - Figma node
 * @param compName - existing component name
 * @returns semantic similarity score (0-1)
 */
function calculateSemanticSimilarity(figmaNode: any, compName: string): number {
  // Keywords for common components
  const componentKeywords: Record<string, string[]> = {
    button: ['button', 'btn', 'action', 'submit', 'click'],
    card: ['card', 'item', 'tile', 'panel'],
    input: ['input', 'field', 'textfield', 'text', 'form'],
    avatar: ['avatar', 'profile', 'photo', 'picture', 'user'],
    badge: ['badge', 'tag', 'label', 'chip'],
    modal: ['modal', 'dialog', 'popup', 'overlay'],
    header: ['header', 'nav', 'navigation', 'menu'],
    footer: ['footer', 'bottom'],
    list: ['list', 'items', 'collection'],
    icon: ['icon', 'symbol', 'glyph'],
  };

  const normalizedCompName = normalizeString(compName);
  const normalizedNodeName = normalizeString(figmaNode.name || '');

  let maxScore = 0;

  // Check keyword matches
  for (const [category, keywords] of Object.entries(componentKeywords)) {
    const compContainsCategory = keywords.some(kw => normalizedCompName.includes(kw));
    const nodeContainsCategory = keywords.some(kw => normalizedNodeName.includes(kw));

    if (compContainsCategory && nodeContainsCategory) {
      maxScore = Math.max(maxScore, 0.8);
    } else if (compContainsCategory || nodeContainsCategory) {
      // Partial match
      const partialScore = keywords.some(kw =>
        normalizedCompName.includes(kw) && normalizedNodeName.includes(kw)
      ) ? 0.5 : 0.2;
      maxScore = Math.max(maxScore, partialScore);
    }
  }

  // Additional check: direct inclusion of component name in node name or vice versa
  if (normalizedNodeName.includes(normalizedCompName) ||
      normalizedCompName.includes(normalizedNodeName)) {
    maxScore = Math.max(maxScore, 0.6);
  }

  return maxScore;
}

/**
 * Recognize component patterns using multi-algorithm
 * similarity matching
 *
 * @param figmaNode - Figma node to analyze
 * @param existingComponents - array of existing component names
 * @returns array of matches sorted by confidence (descending)
 */
export function recognizeComponentPatterns(
  figmaNode: any,
  existingComponents: string[]
): ComponentMatch[] {
  const figmaProperties = extractProperties(figmaNode);
  const matches: ComponentMatch[] = [];

  // Calculate similarity for each existing component
  for (const existingComp of existingComponents) {
    // Extract properties from existing component name
    // (in real scenario we could parse the component itself, but for now use only the name)
    const compProperties = normalizeString(existingComp)
      .split(/\s+/)
      .filter(token => token.length > 2);

    // a. Name similarity
    const nameSimilarity = calculateNameSimilarity(figmaNode.name || '', existingComp);

    // b. Structural similarity
    const structureSimilarity = calculateStructureSimilarity(figmaProperties, compProperties);

    // c. Semantic similarity
    const semanticSimilarity = calculateSemanticSimilarity(figmaNode, existingComp);

    // Combined confidence: weighted sum
    const confidence = (nameSimilarity * 0.4) + (structureSimilarity * 0.4) + (semanticSimilarity * 0.2);

    // Determine recommendation based on confidence
    let recommendation: 'USE_EXISTING' | 'CREATE_NEW' | 'EXTEND_EXISTING';
    if (confidence > 0.85 && structureSimilarity > 0.7) {
      recommendation = 'USE_EXISTING';
    } else if (confidence > 0.65) {
      recommendation = 'EXTEND_EXISTING';
    } else {
      recommendation = 'CREATE_NEW';
    }

    matches.push({
      figmaNode: {
        id: figmaNode.id || '',
        name: figmaNode.name || '',
        type: figmaNode.type || '',
        properties: figmaProperties,
      },
      existingComponent: {
        name: existingComp,
        confidence,
      },
      matchReason: {
        nameSimilarity,
        structureSimilarity,
        semanticSimilarity,
      },
      recommendation,
    });
  }

  // Filter matches with confidence > 0.5
  const filteredMatches = matches.filter(match => match.existingComponent.confidence > 0.5);

  // Sort by confidence (descending)
  filteredMatches.sort((a, b) => b.existingComponent.confidence - a.existingComponent.confidence);

  return filteredMatches;
}
