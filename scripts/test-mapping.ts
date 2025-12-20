/**
 * Manual test script for the mapping layer
 */
import { findClosestColor, hexToLab, labDistance } from '../src/core/mapping/color-matcher.js';
import { extractProjectTokens } from '../src/core/mapping/theme-extractor.js';
import { matchTokens } from '../src/core/mapping/token-matcher.js';
import type { DesignTokens } from '../src/core/types.js';

async function testColorMatching() {
  console.log('=== Color Matching Tests ===\n');

  // Test LAB conversion
  console.log('LAB Conversions:');
  console.log('  Black #000000 →', hexToLab('#000000'));
  console.log('  White #FFFFFF →', hexToLab('#FFFFFF'));
  console.log('  Blue  #3B82F6 →', hexToLab('#3B82F6'));

  // Test color matching
  const themeColors = new Map([
    ['#3B82F6', 'theme.colors.primary'],
    ['#10B981', 'theme.colors.success'],
    ['#EF4444', 'theme.colors.error'],
  ]);

  console.log('\nColor Matching:');
  console.log('  #3B82F6 (exact)  →', findClosestColor('#3B82F6', themeColors));
  console.log('  #3B83F7 (fuzzy)  →', findClosestColor('#3B83F7', themeColors));
  console.log('  #FF0000 (no match) →', findClosestColor('#FF0000', themeColors));
}

async function testThemeExtraction() {
  console.log('\n=== Theme Extraction Tests ===\n');

  const themePath = './tests/core/mapping/fixtures/test-theme.json';

  try {
    const tokens = await extractProjectTokens(themePath);

    console.log('Extracted tokens from:', themePath);
    for (const [category, map] of Object.entries(tokens)) {
      console.log(`\n  ${category}: ${map.size} tokens`);
      for (const [value, path] of map) {
        console.log(`    ${value} → ${path}`);
      }
    }
  } catch (err) {
    console.log('Theme file not found, skipping extraction test');
  }
}

async function testTokenMatching() {
  console.log('\n=== Token Matching Tests ===\n');

  // Mock Figma tokens (simulating ScreenIR.stylesBundle.tokens)
  const figmaTokens: DesignTokens = {
    colors: {
      color_0: '#3B82F6',  // Should match primary
      color_1: '#10B981',  // Should match success
      color_2: '#FF5733',  // No match
    },
    spacing: {
      spacing_0: 16,  // Should match md
      spacing_1: 8,   // Should match sm
      spacing_2: 18,  // No exact match
    },
    radii: {
      radius_0: 8,   // Should match md
      radius_1: 12,  // No match
    },
    typography: {},
    shadows: {},
  };

  // Project tokens (simulating extractProjectTokens output)
  const projectTokens = {
    colors: new Map([
      ['#3B82F6', 'theme.colors.primary'],
      ['#10B981', 'theme.colors.success'],
      ['#EF4444', 'theme.colors.error'],
    ]),
    spacing: new Map<string | number, string>([
      [8, 'theme.spacing.sm'],
      [16, 'theme.spacing.md'],
      [24, 'theme.spacing.lg'],
    ]),
    radii: new Map<string | number, string>([
      [4, 'theme.radii.sm'],
      [8, 'theme.radii.md'],
      [16, 'theme.radii.lg'],
    ]),
  };

  const mappings = matchTokens(figmaTokens, projectTokens);

  console.log('Figma → Project Token Mappings:\n');

  console.log('Colors:');
  for (const [key, value] of Object.entries(mappings.colors)) {
    const original = figmaTokens.colors[key];
    const matched = value !== original;
    console.log(`  ${key}: ${original} → ${value} ${matched ? '✓' : '(no match)'}`);
  }

  console.log('\nSpacing:');
  for (const [key, value] of Object.entries(mappings.spacing)) {
    const original = figmaTokens.spacing[key];
    const matched = value.startsWith('theme.');
    console.log(`  ${key}: ${original} → ${value} ${matched ? '✓' : '(no match)'}`);
  }

  console.log('\nRadii:');
  for (const [key, value] of Object.entries(mappings.radii)) {
    const original = figmaTokens.radii[key];
    const matched = value.startsWith('theme.');
    console.log(`  ${key}: ${original} → ${value} ${matched ? '✓' : '(no match)'}`);
  }
}

// Run all tests
async function main() {
  await testColorMatching();
  await testThemeExtraction();
  await testTokenMatching();
  console.log('\n=== All Tests Complete ===');
}

main().catch(console.error);
