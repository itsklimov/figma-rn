/**
 * Name Resolution Edge Module
 *
 * Deduplicates component names against existing manifest entries
 * to avoid filename conflicts.
 */

import type { Manifest, ManifestCategory } from '../figma-workspace.js';
import { sanitizeComponentName } from '../core/generation/utils.js';

export interface ResolvedName {
  name: string;
  isUpdate: boolean;  // true if reusing existing name
}

/**
 * Resolve a unique component name
 *
 * @param manifest - Current manifest
 * @param category - Target category (screens, modals, etc.)
 * @param nodeId - Figma node ID
 * @param baseName - Base name from Figma (will be sanitized)
 * @returns Resolved name and whether it's an update
 *
 * @example
 * // First time generating "Home Screen" node
 * resolveComponentName(manifest, 'screens', '123:456', 'Home Screen')
 * // Returns: { name: 'HomeScreen', isUpdate: false }
 *
 * @example
 * // Regenerating same node
 * resolveComponentName(manifest, 'screens', '123:456', 'Home Screen')
 * // Returns: { name: 'HomeScreen', isUpdate: true }  // Reuses existing
 *
 * @example
 * // Different node with same name
 * resolveComponentName(manifest, 'screens', '789:012', 'Home Screen')
 * // Returns: { name: 'HomeScreen2', isUpdate: false }  // Appends counter
 */
export function resolveComponentName(
  manifest: Manifest,
  category: ManifestCategory,
  nodeId: string,
  baseName: string
): ResolvedName {
  const categoryEntries = manifest[category];

  // Check if nodeId already exists in this category
  const existingEntry = categoryEntries[nodeId];
  if (existingEntry) {
    // Reuse existing name for updates
    return {
      name: existingEntry.name,
      isUpdate: true,
    };
  }

  // Generate unique name
  const sanitized = sanitizeComponentName(baseName);

  // Check if name already exists in this category
  const existingNames = new Set(
    Object.values(categoryEntries).map(entry => entry.name)
  );

  if (!existingNames.has(sanitized)) {
    return {
      name: sanitized,
      isUpdate: false,
    };
  }

  // Append counter until unique
  let counter = 2;
  let uniqueName = `${sanitized}${counter}`;
  while (existingNames.has(uniqueName)) {
    counter++;
    uniqueName = `${sanitized}${counter}`;
  }

  return {
    name: uniqueName,
    isUpdate: false,
  };
}
