import { extractProjectTokens } from '../src/core/mapping/theme-extractor.js';
import * as path from 'path';

const projectRoot = process.argv[2] || process.env.DEBUG_PROJECT_ROOT;
if (!projectRoot) {
  console.error(
    'Usage: npx tsx scripts/debug-extraction-failure.mts <project-root>\n' +
      'Or set DEBUG_PROJECT_ROOT=/path/to/project'
  );
  process.exit(1);
}

const tokenFile = path.join(projectRoot, 'src/styles/generated/tokens.ts');

console.log('Testing extraction from:', tokenFile);
try {
  const tokens = await extractProjectTokens(tokenFile);
  console.log('Colors extracted:', tokens.colors.size);
  console.log('Spacing extracted:', tokens.spacing.size);
  if (tokens.colors.size > 0) {
    console.log('Sample color:', [...tokens.colors.entries()][0]);
  }
} catch (e) {
  console.error('Extraction failed:', e);
}
