import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { loadAllProjectTokens, refreshFigmaConfig } from '../../src/figma-workspace';

describe('Marafet Integration', () => {
  const MARAFET_ROOT = '/Users/its/Documents/Dev/code/marafet/marafet-frontend';

  it('should correctly load and merge tokens from the real Marafet project', async () => {
    // Skip if Marafet project doesn't exist on this machine
    if (!existsSync(MARAFET_ROOT)) {
      console.log('Skipping: Marafet project not found at', MARAFET_ROOT);
      return;
    }

    // 1. Refresh config to ensure we have the latest paths
    await refreshFigmaConfig(MARAFET_ROOT);

    // 2. Load the tokens
    const tokens = await loadAllProjectTokens(MARAFET_ROOT);

    expect(tokens).toBeDefined();

    // Verify we extracted at least some tokens
    // Note: Not all categories may be present depending on project structure
    const colorsCount = tokens.colors?.size || 0;
    const typographyCount = tokens.typography?.size || 0;
    const spacingCount = tokens.spacing?.size || 0;
    const shadowsCount = tokens.shadows?.size || 0;
    const radiiCount = tokens.radii?.size || 0;

    const totalTokens = colorsCount + typographyCount + spacingCount + shadowsCount + radiiCount;

    // We should have extracted at least some tokens
    expect(totalTokens).toBeGreaterThan(0);

    // Colors and spacing are typically always present
    expect(colorsCount).toBeGreaterThan(0);
    expect(spacingCount).toBeGreaterThan(0);

    console.log(`Successfully merged ${colorsCount} colors, ${typographyCount} typography, ${spacingCount} spacing, ${shadowsCount} shadows, and ${radiiCount} radii tokens from Marafet.`);
  });
});
