import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { loadAllProjectTokens, refreshFigmaConfig } from '../../src/figma-workspace';

describe('Project Integration', () => {
  const INTEGRATION_PROJECT_ROOT = process.env.FIGMA_INTEGRATION_PROJECT_ROOT;

  it('should correctly load and merge tokens from the target project', async () => {
    // Optional integration test: only runs when a project root is provided.
    if (!INTEGRATION_PROJECT_ROOT) {
      console.log(
        'Skipping: set FIGMA_INTEGRATION_PROJECT_ROOT to run project integration test'
      );
      return;
    }

    if (!existsSync(INTEGRATION_PROJECT_ROOT)) {
      console.log(
        'Skipping: integration project not found at',
        INTEGRATION_PROJECT_ROOT
      );
      return;
    }

    // 1. Refresh config to ensure we have the latest paths
    await refreshFigmaConfig(INTEGRATION_PROJECT_ROOT);

    // 2. Load the tokens
    const tokens = await loadAllProjectTokens(INTEGRATION_PROJECT_ROOT);

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

    console.log(
      `Successfully merged ${colorsCount} colors, ${typographyCount} typography, ${spacingCount} spacing, ${shadowsCount} shadows, and ${radiiCount} radii tokens from integration project.`
    );
  });
});
