/**
 * Cross-layer number formatting utilities.
 */

/**
 * Format number as strict integer.
 */
export function formatInteger(value: number): string {
  return String(Math.round(value));
}

/**
 * Format number with smart rounding.
 */
export function formatSmart(value: number): string {
  if (Math.abs(value - Math.round(value)) < 0.01) {
    return String(Math.round(value));
  }

  return parseFloat(value.toFixed(2)).toString();
}

/**
 * Format number as float with precision.
 */
export function formatFloat(value: number, precision: number = 2): string {
  return parseFloat(value.toFixed(precision)).toString();
}

/**
 * Format a percentage value as a percentage string.
 */
export function formatPercent(value: number): string {
  const rounded = parseFloat(value.toFixed(2));
  return `${rounded}%`;
}
