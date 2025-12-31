/**
 * Test Figma URLs for e2e tests
 *
 * Token is loaded from .env file automatically
 * Get token: https://www.figma.com/developers/api#access-tokens
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ES Module compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root
config({ path: resolve(__dirname, '../../.env') });

// Base URL for test file
export const TEST_FILE_KEY = 'BlgBBt56cEbSVY2xiSXqkp';
export const TEST_FILE_NAME = 'MARAFET-dev2';
export const BASE_URL = `https://www.figma.com/design/${TEST_FILE_KEY}/${TEST_FILE_NAME}`;

/**
 * Creates full Figma URL with node-id
 */
export function createFigmaUrl(nodeId: string): string {
  return `${BASE_URL}?node-id=${nodeId}&m=dev`;
}

/**
 * Test URLs for different element types
 */
export const TEST_URLS = {
  // Main test screen
  mainScreen: createFigmaUrl('2804-44718'),

  // Alternative nodes for testing different patterns
  // TODO: Add after exploring Figma file structure
  // listScreen: createFigmaUrl('xxx-xxx'),
  // formScreen: createFigmaUrl('xxx-xxx'),
  // modal: createFigmaUrl('xxx-xxx'),
  // bottomSheet: createFigmaUrl('xxx-xxx'),
  // smallComponent: createFigmaUrl('xxx-xxx'),
};

/**
 * Invalid URLs for error tests
 */
export const INVALID_URLS = {
  // Missing node-id
  missingNodeId: `https://www.figma.com/design/${TEST_FILE_KEY}`,

  // Malformed URL
  malformed: 'not-a-valid-url',

  // Non-existent fileKey
  nonExistentFile: 'https://www.figma.com/design/XXXXXXXXXXXXXXX?node-id=1-1',

  // Non-existent nodeId
  nonExistentNode: createFigmaUrl('99999-99999'),
};

/**
 * Extracts nodeId from Figma URL
 */
export function extractNodeId(figmaUrl: string): string | null {
  const match = figmaUrl.match(/node-id=([^&]+)/);
  if (!match) return null;
  return decodeURIComponent(match[1]).replace(/-/g, ':');
}

/**
 * Extracts fileKey from Figma URL
 */
export function extractFileKey(figmaUrl: string): string | null {
  const match = figmaUrl.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

/**
 * Checks that FIGMA_TOKEN is set (loaded from .env file)
 */
export function requireFigmaToken(): string {
  const token = process.env.FIGMA_TOKEN;
  if (!token) {
    throw new Error(
      'FIGMA_TOKEN not found. Add it to .env file in project root:\n' +
      'FIGMA_TOKEN=your_token_here\n\n' +
      'Get your token from: https://www.figma.com/developers/api#access-tokens'
    );
  }
  return token;
}

/**
 * Validates Figma URL
 */
export function isValidFigmaUrl(url: string): boolean {
  // Check URL format
  const urlPattern = /^https:\/\/(www\.)?figma\.com\/(file|design)\/[a-zA-Z0-9]+/;
  if (!urlPattern.test(url)) return false;

  // Check for node-id
  if (!url.includes('node-id=')) return false;

  return true;
}
