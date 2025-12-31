import { parseThemeFile } from '../src/theme-parser.js';

async function test() {
  console.log('=== Parsing theme.ts ===');
  const tokens = await parseThemeFile('/Users/its/Documents/Dev/code/marafet/marafet-frontend/src/styles/theme.ts');

  console.log('\n=== Colors from theme.ts ===');
  console.log('Total colors:', tokens.colors.size);

  // Find accent10 entries
  const accent10Paths = [];
  for (const [value, token] of tokens.colors.entries()) {
    if (token.path.includes('accent10')) {
      accent10Paths.push(`${value} → ${token.path}`);
    }
  }

  console.log('\naccent10 paths found:');
  for (const p of accent10Paths) {
    console.log('  ', p);
  }

  // Check for flat paths like theme.gray10
  const flatPaths = [...tokens.colors.values()].filter(t => t.path.match(/^theme\.[a-z]+\d+$/i));
  console.log('\nFlat paths (theme.gray10, etc.):', flatPaths.length);
  for (const t of flatPaths.slice(0, 10)) {
    console.log('  ', t.path, '→', t.value);
  }
}

test().catch(console.error);
