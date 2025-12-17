/**
 * Component replacement engine
 * Determines which Views to replace with existing components
 */

/**
 * Component replacement description
 */
export interface ComponentReplacement {
  /** Node name in Figma */
  nodeName: string;
  /** Existing component name for replacement */
  componentName: string;
  /** Replacement confidence (0-1) */
  confidence: number;
}

/**
 * Component match result
 */
export interface ComponentMatch {
  figmaNode: {
    name: string;
    id: string;
    type: string;
  };
  existingComponent?: {
    name: string;
    confidence: number;
  };
  recommendation: 'USE_EXISTING' | 'EXTEND_EXISTING' | 'CREATE_NEW';
}

/**
 * Determines which nodes to replace with components
 * For Phase 2.5 - simple version, only replacement planning
 *
 * @param metadata - Figma file metadata
 * @param matches - Component recognition results
 * @returns List of planned replacements
 */
export function planComponentReplacements(
  metadata: any,
  matches: ComponentMatch[]
): ComponentReplacement[] {
  const replacements: ComponentReplacement[] = [];

  // Find high-confidence matches (>85%)
  const goodMatches = matches.filter(
    (m) =>
      m.recommendation === 'USE_EXISTING' &&
      m.existingComponent &&
      m.existingComponent.confidence > 0.85
  );

  for (const match of goodMatches) {
    if (match.existingComponent) {
      replacements.push({
        nodeName: match.figmaNode.name,
        componentName: match.existingComponent.name,
        confidence: match.existingComponent.confidence,
      });
    }
  }

  return replacements;
}

/**
 * Generates imports for components
 *
 * @param replacements - Component replacement list
 * @param importPrefix - Import path prefix (default '@app')
 * @returns String with imports
 */
export function generateComponentImports(
  replacements: ComponentReplacement[],
  importPrefix: string = '@app'
): string {
  if (replacements.length === 0) return '';

  const imports = replacements.map(
    (r) =>
      `import ${r.componentName} from '${importPrefix}/components/${r.componentName}';`
  );

  return imports.join('\n');
}

/**
 * Filters replacements by minimum confidence threshold
 *
 * @param replacements - Replacement list
 * @param minConfidence - Minimum confidence (0-1)
 * @returns Filtered replacement list
 */
export function filterByConfidence(
  replacements: ComponentReplacement[],
  minConfidence: number = 0.85
): ComponentReplacement[] {
  return replacements.filter((r) => r.confidence >= minConfidence);
}

/**
 * Groups replacements by component names
 * Useful for counting component usage
 *
 * @param replacements - Replacement list
 * @returns Map with grouping by component name
 */
export function groupByComponent(
  replacements: ComponentReplacement[]
): Map<string, ComponentReplacement[]> {
  const groups = new Map<string, ComponentReplacement[]>();

  for (const replacement of replacements) {
    const existing = groups.get(replacement.componentName) || [];
    existing.push(replacement);
    groups.set(replacement.componentName, existing);
  }

  return groups;
}

/**
 * Generates component replacement report
 *
 * @param replacements - Replacement list
 * @returns Readable report
 */
export function generateReplacementReport(
  replacements: ComponentReplacement[]
): string {
  if (replacements.length === 0) {
    return 'No components to replace';
  }

  const grouped = groupByComponent(replacements);
  const lines: string[] = [];

  lines.push(`Found ${replacements.length} replacements in ${grouped.size} components:`);
  lines.push('');

  for (const [componentName, items] of grouped.entries()) {
    const avgConfidence = (
      items.reduce((sum, item) => sum + item.confidence, 0) / items.length
    ).toFixed(2);

    lines.push(`- ${componentName} (${items.length}x, confidence: ${avgConfidence})`);
    for (const item of items) {
      lines.push(`  • ${item.nodeName} (${(item.confidence * 100).toFixed(0)}%)`);
    }
  }

  return lines.join('\n');
}
