/**
 * Test theme extraction from different file types
 *
 * Usage: npx tsx scripts/test-theme-files.ts [theme-directory]
 */
import { extractProjectTokens } from '../src/core/mapping/theme-extractor.js';

const THEME_DIR = process.argv[2];
if (!THEME_DIR) {
  console.error('Usage: npx tsx scripts/test-theme-files.ts <theme-directory>');
  console.error('Example: npx tsx scripts/test-theme-files.ts ./path/to/theme');
  process.exit(1);
}

const files = [
  'colors.ts',
  'masterColors.ts',
  'typography.ts',
  'defaultTheme.ts',
  'index.ts',
];

async function testFile(filename: string) {
  const path = `${THEME_DIR}/${filename}`;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${filename}`);
  console.log('='.repeat(60));

  try {
    const tokens = await extractProjectTokens(path);

    const categories = Object.keys(tokens);
    if (categories.length === 0) {
      console.log('  ⚠ No tokens extracted');
      console.log('  (File may use function calls or spreads that need runtime)');
      return;
    }

    for (const category of categories) {
      const map = tokens[category];
      console.log(`\n  ${category}: ${map.size} tokens`);

      // Show first 5 tokens
      let count = 0;
      for (const [value, path] of map) {
        if (count >= 5) {
          console.log(`    ... and ${map.size - 5} more`);
          break;
        }
        const displayValue = typeof value === 'string' && value.length > 30
          ? value.slice(0, 30) + '...'
          : value;
        console.log(`    ${displayValue} → ${path}`);
        count++;
      }
    }
  } catch (err: any) {
    console.log(`  ✗ Error: ${err.message}`);
  }
}

async function main() {
  console.log('Theme File Extraction Test');
  console.log(`Directory: ${THEME_DIR}`);

  for (const file of files) {
    await testFile(file);
  }

  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`
Current Limitations:
- Files using scale() or other function calls → values not extractable
- Files using spread operators (...obj) → needs runtime execution
- Files importing from other files → partial extraction only

What Works:
- Plain object literals with hex color strings
- Direct numeric values (not wrapped in functions)
- JSON files (fully supported)
`);
}

main().catch(console.error);
