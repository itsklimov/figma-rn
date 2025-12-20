import { describe, it, expect, beforeAll } from 'vitest';
import { createTempWorkspace } from '../helpers/temp-workspace';
import { getOrCreateManifest } from '../../src/figma-workspace';
import { join } from 'path';

describe('Project Configuration Automation', () => {
  it('should auto-detect framework and style patterns from project structure', async () => {
    const workspace = await createTempWorkspace('config-auto-');
    
    // 1. Setup a dummy Expo project with useTheme and a scale function
    await workspace.writeFile('package.json', JSON.stringify({
      dependencies: {
        'expo': '^50.0.0',
        '@react-navigation/native': '^6.0.0'
      }
    }));
    
    await workspace.mkdir('src/components');
    await workspace.mkdir('src/utils');
    
    // File with useTheme
    await workspace.writeFile('src/components/MyButton.tsx', `
      import React from 'react';
      import { useTheme } from '@react-navigation/native';
      export const MyButton = () => {
        const theme = useTheme();
        return <View style={{ backgroundColor: theme.colors.primary }} />;
      }
    `);
    
    // File with scale function
    await workspace.writeFile('src/utils/scaling.ts', `
      export const scale = (size: number) => size * 1.1;
    `);
    
    await workspace.writeFile('src/components/ScaledView.tsx', `
      import { scale } from '../utils/scaling';
      export const ScaledView = () => <View style={{ width: scale(100) }} />;
    `);

    // 2. Trigger auto-detection
    const manifest = await getOrCreateManifest(workspace.root);

    // 3. Verify detected config in manifest
    expect(manifest.config.framework).toBe('expo');
    expect(manifest.config.stylePattern).toBe('useTheme');
    expect(manifest.config.scaleFunction).toBe('scale');

    // 4. Verify manifest.json was saved
    const savedManifest = await workspace.readJson<any>('.figma/manifest.json');
    expect(savedManifest.config.framework).toBe('expo');
    
    await workspace.cleanup();
  });

  it('should detect import prefix from tsconfig.json', async () => {
    const workspace = await createTempWorkspace('config-alias-');
    
    await workspace.writeFile('tsconfig.json', JSON.stringify({
      compilerOptions: {
        paths: {
          "@app/*": ["./src/*"]
        }
      }
    }));

    const manifest = await getOrCreateManifest(workspace.root);
    expect(manifest.config.importPrefix).toBe('@app');

    await workspace.cleanup();
  });

  it('should auto-detect theme files (colors, typography, etc.)', async () => {
    const workspace = await createTempWorkspace('config-theme-');
    
    // Setup typical theme structure
    await workspace.mkdir('src/styles/theme');
    await workspace.writeFile('src/styles/theme/colors.ts', 'export const colors = { primary: "#000" };');
    await workspace.writeFile('src/styles/theme/typography.ts', 'export const fonts = { body: "Inter" };');
    await workspace.writeFile('src/styles/theme/spacing.ts', 'export const spacing = { m: 16 };');

    // Trigger config generation (this is what generate_screen uses)
    const { getOrCreateFigmaConfig } = await import('../../src/figma-workspace');
    const config = await getOrCreateFigmaConfig(workspace.root);

    // Verify token files are discovered
    const tokenFilesJoined = config.tokenFiles.join(',');
    expect(tokenFilesJoined).toContain('colors.ts');
    expect(tokenFilesJoined).toContain('typography.ts');
    expect(tokenFilesJoined).toContain('spacing.ts');

    await workspace.cleanup();
  });

  it('should load and merge semantic tokens from all configured theme files', async () => {
    const workspace = await createTempWorkspace('config-merge-');
    
    // 1. Setup split theme files
    await workspace.mkdir('src/styles');
    await workspace.writeFile('src/styles/colors.ts', `
      export const palette = {
        primary: '#FF0000',
        secondary: '#00FF00'
      };
    `);
    await workspace.writeFile('src/styles/typography.ts', `
      export const typography = {
        h1: { fontSize: 32, fontWeight: 700, fontFamily: 'Inter' },
        body: { fontSize: 16, fontWeight: 400, fontFamily: 'Inter' }
      };
    `);

    // 2. Mock config generation
    const { getOrCreateFigmaConfig, loadAllProjectTokens } = await import('../../src/figma-workspace');
    const config = await getOrCreateFigmaConfig(workspace.root);
    
    // Manually set paths if auto-discovery fails in test env (though it should find them)
    // Manually set paths if auto-discovery fails in test env (though it should find them of course)
    // Note: Theme structure is flattened now
    if (config.tokenFiles.length === 0) {
      config.tokenFiles.push('src/styles/colors.ts');
      config.tokenFiles.push('src/styles/typography.ts');
    }
    const { saveFigmaConfig } = await import('../../src/figma-workspace');
    await saveFigmaConfig(workspace.root, config);

    // 3. Load merged tokens
    const tokens = await loadAllProjectTokens(workspace.root);

    // 4. Verify merged content
    expect(tokens.colors).toBeDefined();
    expect(tokens.colors.get('#FF0000')).toContain('theme.colors.primary');
    
    expect(tokens.typography).toBeDefined();
    const h1Key = 'Inter-32-700-0'; // Deterministic key format
    expect(tokens.typography.get(h1Key)).toContain('theme.typography.h1');

    await workspace.cleanup();
  });
});
