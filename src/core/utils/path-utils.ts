/**
 * Path utility functions for design token processing
 */

/**
 * Normalize hex color to uppercase format (#RRGGBB or #RRGGBBAA)
 * Ensures consistent color comparison across the codebase
 */
export function normalizeHex(hex: string): string {
  return hex.toUpperCase();
}

export interface PathComplexityOptions {
  /** Prefer base colors over overlay/opacity variants (adds penalty) */
  deprioritizeOverlays?: boolean;
}

/**
 * Calculate path complexity score (lower = simpler = preferred)
 * Project-agnostic: prefers flat paths over nested ones
 */
export function pathComplexity(path: string, options?: PathComplexityOptions): number {
  const dots = (path.match(/\./g) || []).length;
  const brackets = (path.match(/\[/g) || []).length;
  let score = dots * 10 + brackets * 20 + path.length;

  if (options?.deprioritizeOverlays) {
    score += path.includes('overlay') ? 10 : 0;
    score += path.includes('opacity') ? 10 : 0;
    score += path.includes('Preset') ? 5 : 0;
  }

  return score;
}
