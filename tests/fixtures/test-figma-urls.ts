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
const DEFAULT_TEST_FILE_KEY = 'TESTFILEKEY1234567890AB';
const DEFAULT_TEST_FILE_NAME = 'E2E-Design-File';
export const TEST_FILE_KEY = process.env.FIGMA_E2E_FILE_KEY || DEFAULT_TEST_FILE_KEY;
export const TEST_FILE_NAME = process.env.FIGMA_E2E_FILE_NAME || DEFAULT_TEST_FILE_NAME;
export const MAIN_SCREEN_NODE_ID = '7621-71846';
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
  mainScreen: createFigmaUrl(MAIN_SCREEN_NODE_ID),

  // Alternative nodes for testing different patterns
  // TODO: Add after exploring Figma file structure
  // listScreen: createFigmaUrl('xxx-xxx'),
  // formScreen: createFigmaUrl('xxx-xxx'),
  // modal: createFigmaUrl('xxx-xxx'),
  // bottomSheet: createFigmaUrl('xxx-xxx'),
  // smallComponent: createFigmaUrl('xxx-xxx'),
};

export interface LiveE2ECase {
  id: string;
  figmaUrl: string;
  componentName?: string;
  expectedResolvedName: string;
  category: 'screens' | 'modals' | 'sheets' | 'components' | 'icons';
  minAssets: number;
  maxTodos: number;
  maxPlaceholders: number;
}

/**
 * Curated live E2E matrix used for end-to-end quality validation.
 * These URLs are expected to be stable enough for repeatable checks.
 */
export const LIVE_E2E_CASES: LiveE2ECase[] = [
  {
    id: 'screen-main',
    figmaUrl: createFigmaUrl('7621-71846'),
    expectedResolvedName: 'GlavnayaKlient',
    category: 'screens',
    minAssets: 8,
    maxTodos: 8,
    maxPlaceholders: 10,
  },
  {
    id: 'screen-1669-21091',
    figmaUrl: createFigmaUrl('1669-21091'),
    expectedResolvedName: 'Session',
    category: 'screens',
    minAssets: 10,
    maxTodos: 20,
    maxPlaceholders: 35,
  },
  {
    id: 'screen-2453-67667',
    figmaUrl: createFigmaUrl('2453-67667'),
    expectedResolvedName: 'Notifications',
    category: 'screens',
    minAssets: 1,
    maxTodos: 6,
    maxPlaceholders: 2,
  },
  {
    id: 'screen-868-33060',
    figmaUrl: createFigmaUrl('868-33060'),
    expectedResolvedName: 'HomeWithoutVisit',
    category: 'screens',
    minAssets: 8,
    maxTodos: 8,
    maxPlaceholders: 12,
  },
  {
    id: 'component-868-33071',
    figmaUrl: createFigmaUrl('868-33071'),
    expectedResolvedName: 'CardMaster',
    category: 'components',
    minAssets: 4,
    maxTodos: 8,
    maxPlaceholders: 8,
  },
  {
    id: 'modal-866-30573',
    figmaUrl: createFigmaUrl('866-30573'),
    expectedResolvedName: 'SummarySheetLocation',
    category: 'modals',
    minAssets: 2,
    maxTodos: 6,
    maxPlaceholders: 2,
  },
];

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

export function requireLiveE2EConfig(): void {
  if (!process.env.FIGMA_E2E_FILE_KEY) {
    throw new Error(
      'FIGMA_E2E_FILE_KEY not found.\n' +
      'Set it in .env to run live E2E:\n' +
      'FIGMA_E2E_FILE_KEY=your_figma_file_key'
    );
  }
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
