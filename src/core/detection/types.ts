/**
 * Detection Layer Types
 * Types for pattern detection (lists, repeated components) in IR trees
 */

/**
 * Hint for FlatList generation
 * Indicates a container that should become a FlatList
 */
export interface ListHint {
  /** ID of the container that holds the list items */
  containerId: string;
  /** IDs of the items in the list */
  itemIds: string[];
  /** Scroll orientation */
  orientation: 'horizontal' | 'vertical';
  /** Inferred type name for the list item (e.g., "ProductCard") */
  itemType: string;
}

/**
 * Hint for component extraction
 * Indicates repeated blocks that should be extracted into a shared component
 */
export interface ComponentHint {
  /** Suggested component name */
  componentName: string;
  /** IDs of nodes that are instances of this component */
  instanceIds: string[];
  /** Props that vary between instances (prop name -> list of values) */
  propsVariations: Record<string, string[]>;
}

/**
 * Combined result from all detectors
 */
export interface DetectionResult {
  /** Detected lists for FlatList generation */
  lists: ListHint[];
  /** Detected repeated components for extraction */
  components: ComponentHint[];
}

/**
 * Empty detection result (no patterns found)
 */
export function createEmptyDetectionResult(): DetectionResult {
  return {
    lists: [],
    components: [],
  };
}
