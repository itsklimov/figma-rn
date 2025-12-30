
import { readFileSync } from 'fs';
import { join } from 'path';

const envPath = join(process.cwd(), '.env');
const envContent = readFileSync(envPath, 'utf8');
const tokenMatch = envContent.match(/FIGMA_TOKEN\s*=\s*["']?([^"'\n]+)["']?/);
const token = tokenMatch ? tokenMatch[1] : process.env.FIGMA_TOKEN;

if (!token) {
  console.error('No token found');
  process.exit(1);
}

const FILE_KEY = 'urlmcU7w44JTXsaN7K5lHZ';
const NODE_ID = '3600:93864';

async function testUrl() {
  console.log(`Testing token with URL: https://www.figma.com/design/${FILE_KEY}/...?node-id=${NODE_ID}`);
  try {
    // 1. Test /v1/me first
    const meResponse = await fetch('https://api.figma.com/v1/me', {
      headers: { 'X-Figma-Token': token }
    });
    
    if (!meResponse.ok) {
        console.error(`Token check (/v1/me) failed: ${meResponse.status} ${meResponse.statusText}`);
    } else {
        const meData = await meResponse.json();
        console.log(`Token is valid for user: ${meData.handle}`);
    }

    // 2. Test fetching the specific node
    const nodeResponse = await fetch(`https://api.figma.com/v1/files/${FILE_KEY}/nodes?ids=${NODE_ID}`, {
      headers: { 'X-Figma-Token': token }
    });
    
    if (nodeResponse.ok) {
      console.log('✅ Success: Node data fetched!');
    } else {
      console.error(`❌ Node fetch failed: ${nodeResponse.status} ${nodeResponse.statusText}`);
      if (nodeResponse.status === 403) {
        console.error('Forbidden: This usually means the token lacks "Read" access to this specific file, or the file is private.');
      }
    }
  } catch (error) {
    console.error('Error testing URL:', error);
  }
}

testUrl();
