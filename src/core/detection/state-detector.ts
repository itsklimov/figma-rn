/**
 * State Detector - Infer semantic states from visual variations
 * 
 * Detects patterns like:
 * - 1-of-N distinct styling -> isSelected
 * - Layer names with "active/selected/on" -> use that as state name
 * - Opacity differences -> isDisabled
 * - Equal style groups -> variant enum
 */

import type { IRNode, StylesBundle } from '../types.js';
import { extractVariableProps } from './repetition-detector.js';

/**
 * Semantic state types that can be inferred
 */
export type SemanticStateType = 'selected' | 'active' | 'disabled' | 'variant';

/**
 * Detected semantic state for a group of repeated items
 */
export interface SemanticState {
  type: SemanticStateType;
  propName: string;           // e.g., "isSelected", "variant"
  propType: 'boolean' | 'enum';
  defaultValue: string | boolean;
  
  // Maps each instance ID to its state value
  instanceStates: Map<string, string | boolean>;
  
  // Style overrides for each state value (for StyleSheet generation)
  stateStyles: Record<string, {
    containerStyles: Record<string, string>;
    textStyles: Record<string, string>;
  }>;
}

/**
 * Result of semantic state detection
 */
export interface StateDetectionResult {
  hasSemanticState: boolean;
  state?: SemanticState;
  confidence: number;  // 0-1, how confident we are in the detection
}

/**
 * Fingerprint a style combination for grouping
 * Uses extractVariableProps to get actual per-instance values
 */
function getStyleFingerprint(
  instance: IRNode,
  stylesBundle?: StylesBundle
): string {
  const props = extractVariableProps(instance, stylesBundle);
  
  // Only include style-related props in fingerprint (not text content)
  const styleProps = Object.entries(props)
    .filter(([key]) => key.includes('color') || key.includes('Color') || key.includes('backgroundColor'))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value}`)
    .join('|');
  
  return styleProps;
}

/**
 * Infer semantic state name from Figma layer names
 */
function inferStateNameFromLayers(instanceNames: string[]): string | null {
  const stateKeywords = ['active', 'selected', 'on', 'pressed', 'focused', 'highlighted'];
  
  for (const name of instanceNames) {
    const lowerName = name.toLowerCase();
    for (const keyword of stateKeywords) {
      if (lowerName.includes(keyword)) {
        return keyword;
      }
    }
  }
  
  return null;
}

/**
 * Detect semantic state from variations in repeated items
 * 
 * @param instances - Array of repeated IR nodes
 * @param variations - Map of property key to array of unique values
 * @param stylesBundle - Optional styles bundle for token mapping
 */
export function detectSemanticState(
  instances: IRNode[],
  variations: Record<string, string[]>,
  stylesBundle?: StylesBundle
): StateDetectionResult {
  if (instances.length < 2) {
    return { hasSemanticState: false, confidence: 0 };
  }

  // Group instances by their style fingerprint using actual per-instance values
  const fingerprints = instances.map(inst => ({
    id: inst.id,
    name: inst.name,
    instance: inst,
    fingerprint: getStyleFingerprint(inst, stylesBundle),
  }));

  // Count occurrences of each fingerprint
  const fingerprintCounts = new Map<string, number>();
  for (const fp of fingerprints) {
    fingerprintCounts.set(fp.fingerprint, (fingerprintCounts.get(fp.fingerprint) || 0) + 1);
  }

  const uniqueFingerprints = [...fingerprintCounts.keys()];
  
  // No variations = no semantic state
  if (uniqueFingerprints.length <= 1) {
    return { hasSemanticState: false, confidence: 0 };
  }

  // Pattern: 1-of-N (one item is visually distinct)
  if (uniqueFingerprints.length === 2) {
    const counts = [...fingerprintCounts.values()].sort((a, b) => a - b);
    const minorityCount = counts[0];
    const majorityCount = counts[1];

    // 1 out of many = likely selected/active
    if (minorityCount === 1 && majorityCount >= 2) {
      const minorityFp = [...fingerprintCounts.entries()].find(([_, c]) => c === 1)?.[0];
      const majorityFp = [...fingerprintCounts.entries()].find(([_, c]) => c > 1)?.[0];
      
      
      
      // Try to infer state name from layer names
      const inferredName = inferStateNameFromLayers(instances.map(i => i.name));
      const stateName = inferredName || 'selected';
      const propName = `is${stateName.charAt(0).toUpperCase()}${stateName.slice(1)}`;

      // Build instance state map
      const instanceStates = new Map<string, boolean>();
      for (const fp of fingerprints) {
        instanceStates.set(fp.id, fp.fingerprint === minorityFp);
      }

      // Build state styles
      const stateStyles: SemanticState['stateStyles'] = {
        default: { containerStyles: {}, textStyles: {} },
        [stateName]: { containerStyles: {}, textStyles: {} },
      };

      // Extract style differences using actual instance values
      const defaultInstance = fingerprints.find(fp => fp.fingerprint === majorityFp)?.instance;
      const selectedInstance = fingerprints.find(fp => fp.fingerprint === minorityFp)?.instance;
      
      if (defaultInstance && selectedInstance) {
        const defaultProps = extractVariableProps(defaultInstance, stylesBundle);
        const selectedProps = extractVariableProps(selectedInstance, stylesBundle);
        
        for (const key of Object.keys(defaultProps)) {
          if (key.includes('text') || key === 'text') continue; // Skip text content
          
          const defaultValue = defaultProps[key];
          const selectedValue = selectedProps[key];
          
          if (defaultValue !== selectedValue) {
            const isTextStyle = key.includes('color') || key.includes('Color');
            const styleKey = key.replace(/^child\d+_/, '').replace(/_([a-z])/g, (_, c) => c.toUpperCase());
            
            if (isTextStyle) {
              stateStyles.default.textStyles[styleKey] = defaultValue;
              stateStyles[stateName].textStyles[styleKey] = selectedValue;
            } else {
              stateStyles.default.containerStyles[styleKey] = defaultValue;
              stateStyles[stateName].containerStyles[styleKey] = selectedValue;
            }
          }
        }
      }

      return {
        hasSemanticState: true,
        state: {
          type: 'selected',
          propName,
          propType: 'boolean',
          defaultValue: false,
          instanceStates,
          stateStyles,
        },
        confidence: 0.9,
      };
    }

    // 50/50 split = likely variant
    if (Math.abs(minorityCount - majorityCount) <= 1) {
      return {
        hasSemanticState: true,
        state: {
          type: 'variant',
          propName: 'variant',
          propType: 'enum',
          defaultValue: 'primary',
          instanceStates: new Map(),
          stateStyles: {},
        },
        confidence: 0.7,
      };
    }
  }

  return { hasSemanticState: false, confidence: 0 };
}

/**
 * Export for use in detection index
 */
export { detectSemanticState as detectState };
