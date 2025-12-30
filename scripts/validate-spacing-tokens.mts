import { extractProjectTokens } from '../src/core/mapping/theme-extractor.js';

async function main() {
  const tokens = await extractProjectTokens();

  console.log('=== PROJECT SPACING TOKENS ===');
  if (tokens.spacing) {
    const sorted = Array.from(tokens.spacing.entries()).sort((a, b) => {
      const numA = typeof a[0] === 'number' ? a[0] : parseInt(String(a[0]));
      const numB = typeof b[0] === 'number' ? b[0] : parseInt(String(b[0]));
      return numA - numB;
    });

    for (const [value, path] of sorted) {
      console.log(`  ${value} → ${path}`);
    }
  }

  console.log('\n=== CHECKING SPECIFIC VALUES ===');
  const val30 = tokens.spacing?.get(30);
  const val87 = tokens.spacing?.get(87);
  console.log(`30 mapped to: ${val30 || 'NOT FOUND'}`);
  console.log(`87 mapped to: ${val87 || 'NOT FOUND'}`);
}

main().catch(console.error);
