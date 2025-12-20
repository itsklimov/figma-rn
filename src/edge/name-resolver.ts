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
  previousName?: string; // name that was previously used for this nodeId
}

/**
 * Resolve a unique component name
 *
 * @param manifest - Current manifest
 * @param category - Target category (screens, modals, etc.)
 * @param nodeId - Figma node ID
 * @param baseName - Base name from Figma (will be sanitized)
 * @param explicitName - Optional explicit name override from user
 * @returns Resolved name and whether it's an update
 */
export function resolveComponentName(
  manifest: Manifest,
  category: ManifestCategory,
  nodeId: string,
  baseName: string,
  explicitName?: string
): ResolvedName {
  const categoryEntries = manifest[category];

  // Check if nodeId already exists in this category
  const existingEntry = categoryEntries[nodeId];

  // If we have an explicit override, validate and use it
  if (explicitName) {
    const sanitizedExplicit = sanitizeComponentName(explicitName);
    
    // Check if this is a rename of an existing node
    if (existingEntry && existingEntry.name !== sanitizedExplicit) {
      return {
        name: sanitizedExplicit,
        isUpdate: false, // It's a "new" name for this node (rename)
        previousName: existingEntry.name,
      };
    }

    // New node with explicit name
    // Still need to check if name is in use by ANOTHER node
    const existingNames = new Set(
      Object.values(categoryEntries)
        .filter(entry => entry.nodeId !== nodeId)
        .map(entry => entry.name)
    );

    if (!existingNames.has(sanitizedExplicit)) {
      return {
        name: sanitizedExplicit,
        isUpdate: !!existingEntry,
      };
    }
    
    // Fallback to counter if explicit name is taken by another node
    let counter = 2;
    let uniqueExplicit = `${sanitizedExplicit}${counter}`;
    while (existingNames.has(uniqueExplicit)) {
      counter++;
      uniqueExplicit = `${sanitizedExplicit}${counter}`;
    }
    return {
      name: uniqueExplicit,
      isUpdate: !!existingEntry,
    };
  }

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
