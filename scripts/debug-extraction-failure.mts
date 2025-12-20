import { extractProjectTokens } from '../src/core/mapping/theme-extractor.js';
import * as path from 'path';

const MARAFET_ROOT = '/Users/its/Documents/Dev/code/marafet/marafet-frontend';
const tokenFile = path.join(MARAFET_ROOT, 'src/styles/generated/tokens.ts');

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
