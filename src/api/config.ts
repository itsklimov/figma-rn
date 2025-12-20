/**
 * Figma conventions configuration
 * Defines what constitutes screens, components, and what to ignore
 */

export interface FigmaConventions {
  screenPatterns: string[];
  componentPrefixes: string[];
  ignorePatterns: string[];
  annotationPatterns: string[];
}

export const defaultConventions: FigmaConventions = {
  screenPatterns: ['*'],
  componentPrefixes: ['cmp/', 'ui/', 'component/', 'Component/'],
  ignorePatterns: [
    'StatusBar',
    'Home indicator',
    'Home Indicator',
    'Safe Area',
    'SafeArea',
    'Home Selector',
    'Home selectors',
    '*annotation*',
    '*measure*',
    '*measurement*',
    '*redline*',
    '*spec*',
    '*-guide',
    '*_guide',
  ],
  annotationPatterns: ['*annotation*', '*measure*', '*spec*', '_*'],
};

/**
 * Check if a node name matches any pattern (supports * wildcard)
 */
export function matchesPattern(name: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    const escapedPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    const regex = new RegExp(`^${escapedPattern}$`, 'i');
    return regex.test(name);
  });
}

/**
 * Check if node should be ignored based on conventions
 */
export function shouldIgnoreNode(
  name: string,
  conventions: FigmaConventions = defaultConventions
): boolean {
  return (
    matchesPattern(name, conventions.ignorePatterns) ||
    matchesPattern(name, conventions.annotationPatterns)
  );
}

/**
 * Check if node is a component based on conventions
 */
export function isComponent(
  name: string,
  conventions: FigmaConventions = defaultConventions
): boolean {
  return conventions.componentPrefixes.some((prefix) =>
    name.toLowerCase().startsWith(prefix.toLowerCase())
  );
}
