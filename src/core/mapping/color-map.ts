import type { TokenMappings } from './token-matcher.js';
import { normalizeHex } from '../utils/path-utils.js';

/**
 * Map a color value using token mappings.
 * Returns theme path if mapped, raw normalized value otherwise.
 */
export function mapColor(hex: string, mappings: TokenMappings): { value: string; mapped: boolean } {
  const colorMappings = mappings.colors || {};
  const normHex = normalizeHex(hex);

  const mapped = colorMappings[normHex];
  if (mapped && mapped !== normHex) {
    return { value: mapped, mapped: true };
  }

  return { value: `'${normHex}'`, mapped: false };
}
