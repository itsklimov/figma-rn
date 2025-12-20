import { describe, it, expect } from 'vitest';
import { loadAllProjectTokens, refreshFigmaConfig } from '../../src/figma-workspace';
import { join } from 'path';

describe('Marafet Integration', () => {
  const MARAFET_ROOT = '/Users/its/Documents/Dev/code/marafet/marafet-frontend';

  it('should correctly load and merge tokens from the real Marafet project', async () => {
    // 1. Refresh config to ensure we have the latest paths (semantics/tokens)
    await refreshFigmaConfig(MARAFET_ROOT);

    // 2. Load the tokens
    const tokens = await loadAllProjectTokens(MARAFET_ROOT);

    expect(tokens).toBeDefined();

    // Verify colors from src/styles/tokens/colors.palette.ts & src/styles/semantics/colors.ts
    expect(tokens.colors).toBeDefined();
    expect(tokens.colors.size).toBeGreaterThan(0);

    // Verify typography from src/styles/theme/typography.ts
    expect(tokens.typography).toBeDefined();
    expect(tokens.typography.size).toBeGreaterThan(0);

    // Verify spacing from src/styles/tokens/spacing.ts
    expect(tokens.spacing).toBeDefined();
    expect(tokens.spacing.size).toBeGreaterThan(0);

    // Verify shadows from src/styles/tokens/shadows.ts
    expect(tokens.shadows).toBeDefined();
    expect(tokens.shadows.size).toBeGreaterThan(0);

    // Verify radii from src/styles/tokens/radii.ts
    expect(tokens.radii).toBeDefined();
    expect(tokens.radii.size).toBeGreaterThan(0);

    console.log(`Successfully merged ${tokens.colors.size} colors, ${tokens.typography.size} typography, ${tokens.spacing.size} spacing, ${tokens.shadows.size} shadows, and ${tokens.radii.size} radii tokens from Marafet.`);
  });
});
