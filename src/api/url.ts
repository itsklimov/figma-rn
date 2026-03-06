import type { ParsedFigmaUrl } from './types.js';

/**
 * Normalize Figma node-id to API format (colons instead of dashes).
 */
export function normalizeNodeId(nodeId: string): string {
  return decodeURIComponent(nodeId).replace(/-/g, ':');
}

/**
 * Parse Figma URL and extract fileKey/nodeId.
 * Supports /design/{fileKey} and /file/{fileKey} formats.
 */
export function parseFigmaUrl(url: string): ParsedFigmaUrl | null {
  try {
    const urlObj = new URL(url);
    const pathMatch = urlObj.pathname.match(/\/(file|design)\/([a-zA-Z0-9]+)/);
    if (!pathMatch) {
      return null;
    }

    const fileKey = pathMatch[2];
    const nodeIdParam = urlObj.searchParams.get('node-id');

    return {
      fileKey,
      nodeId: nodeIdParam ? normalizeNodeId(nodeIdParam) : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Extract node-id from URL with optional fallback value.
 */
export function extractNodeIdFromUrl(url: string, fallback: string = 'unknown'): string {
  const parsed = parseFigmaUrl(url);
  return parsed?.nodeId || fallback;
}

/**
 * Normalize URL for manifest keys.
 * Keeps origin/path and normalized node-id only.
 */
export function normalizeFigmaUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const parsed = parseFigmaUrl(url);
    const base = `${urlObj.origin}${urlObj.pathname}`;

    if (!parsed?.nodeId) {
      return base;
    }

    return `${base}?node-id=${parsed.nodeId}`;
  } catch {
    return url;
  }
}
