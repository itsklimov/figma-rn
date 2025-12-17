/**
 * Scan project for Figma Code Connect files (*.figma.tsx)
 * Returns mappings from Figma URLs to code components
 */

import { glob } from 'glob';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';

interface CodeConnectMapping {
  figmaUrl: string;
  figmaNodeId?: string;
  componentPath: string;
  componentName: string;
  props?: Record<string, string>;
}

interface ScanResult {
  mappings: CodeConnectMapping[];
  scanPath: string;
  filesFound: number;
  errors: string[];
}

/**
 * Parse Code Connect file to extract Figma URL mappings
 */
function parseCodeConnectFile(content: string, filePath: string): CodeConnectMapping[] {
  const mappings: CodeConnectMapping[] = [];

  // Find figma.connect calls
  const connectRegex = /figma\.connect\s*\(\s*(\w+)\s*,\s*['"`]([^'"`]+)['"`]/g;
  let match;

  while ((match = connectRegex.exec(content)) !== null) {
    const componentName = match[1];
    const figmaUrl = match[2];

    // Extract node ID from URL
    const nodeIdMatch = figmaUrl.match(/node-id=([^&]+)/);
    const nodeId = nodeIdMatch ? nodeIdMatch[1].replace(/-/g, ':') : undefined;

    // Find component import path
    const importRegex = new RegExp(
      `import\\s*{[^}]*\\b${componentName}\\b[^}]*}\\s*from\\s*['"\`]([^'"\`]+)['"\`]`
    );
    const importMatch = content.match(importRegex);

    let componentPath = filePath.replace('.figma.tsx', '.tsx');
    if (importMatch) {
      const importPath = importMatch[1];
      if (importPath.startsWith('.')) {
        const resolvedPath = join(dirname(filePath), importPath);

        // Validation: path should stay inside project
        // (filePath already inside projectRoot from glob results)
        const fileDir = dirname(filePath);
        const commonBase = fileDir.split('/').slice(0, -3).join('/'); // Reasonable project root

        if (!resolvedPath.startsWith(commonBase) && !resolvedPath.startsWith('/')) {
          // Skip suspicious paths
          componentPath = filePath.replace('.figma.tsx', '.tsx');
        } else {
          componentPath = resolvedPath;
          if (!componentPath.endsWith('.tsx') && !componentPath.endsWith('.ts')) {
            componentPath += '.tsx';
          }
        }
      } else {
        componentPath = importPath;
      }
    }

    // Extract props mapping
    const propsMatch = content.match(
      new RegExp(`figma\\.connect\\s*\\(\\s*${componentName}[^{]*{[^}]*props:\\s*{([^}]+)}`)
    );

    let props: Record<string, string> | undefined;
    if (propsMatch) {
      props = {};
      const propsContent = propsMatch[1];
      const propRegex = /(\w+):\s*figma\.\w+\(['"`]([^'"`]+)['"`]/g;
      let propMatch;
      while ((propMatch = propRegex.exec(propsContent)) !== null) {
        props[propMatch[1]] = propMatch[2];
      }
    }

    mappings.push({
      figmaUrl,
      figmaNodeId: nodeId,
      componentPath,
      componentName,
      props: props && Object.keys(props).length > 0 ? props : undefined,
    });
  }

  return mappings;
}

/**
 * Scan project directory for Code Connect files
 */
export async function scanForCodeConnect(projectRoot: string): Promise<ScanResult> {
  const result: ScanResult = {
    mappings: [],
    scanPath: projectRoot,
    filesFound: 0,
    errors: [],
  };

  try {
    // Find all *.figma.tsx files
    const pattern = join(projectRoot, '**/*.figma.tsx');
    const files = await glob(pattern, {
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
    });

    result.filesFound = files.length;

    for (const filePath of files) {
      try {
        const content = readFileSync(filePath, 'utf-8');
        const mappings = parseCodeConnectFile(content, filePath);
        result.mappings.push(...mappings);
      } catch (err) {
        result.errors.push(`Failed to parse ${filePath}: ${err}`);
      }
    }
  } catch (err) {
    result.errors.push(`Glob error: ${err}`);
  }

  return result;
}

/**
 * Format scan results for LLM
 */
export function formatCodeConnectResults(result: ScanResult): string {
  let output = `# Code Connect Discovery\n\n`;
  output += `**Scan Path**: ${result.scanPath}\n`;
  output += `**Files Found**: ${result.filesFound}\n`;
  output += `**Mappings Extracted**: ${result.mappings.length}\n\n`;

  if (result.errors.length > 0) {
    output += `## ⚠️ Errors\n\n`;
    result.errors.forEach((err) => {
      output += `- ${err}\n`;
    });
    output += '\n';
  }

  if (result.mappings.length === 0) {
    output += `## No Mappings Found\n\n`;
    output += `No \`*.figma.tsx\` Code Connect files found in the project.\n\n`;
    output += `**To create Code Connect files:**\n`;
    output += `1. Install: \`npm install @figma/code-connect\`\n`;
    output += `2. Create \`ComponentName.figma.tsx\` alongside your component\n`;
    output += `3. Use \`figma.connect()\` to link Figma designs to code\n`;
    return output;
  }

  output += `## Figma → Code Mappings\n\n`;

  result.mappings.forEach((mapping, i) => {
    output += `### ${i + 1}. ${mapping.componentName}\n\n`;
    output += `- **Figma URL**: ${mapping.figmaUrl}\n`;
    if (mapping.figmaNodeId) {
      output += `- **Node ID**: \`${mapping.figmaNodeId}\`\n`;
    }
    output += `- **Component**: \`${mapping.componentPath}\`\n`;

    if (mapping.props) {
      output += `- **Props Mapping**:\n`;
      for (const [codeProp, figmaProp] of Object.entries(mapping.props)) {
        output += `  - \`${codeProp}\` ← Figma "${figmaProp}"\n`;
      }
    }
    output += '\n';
  });

  output += `## Usage\n\n`;
  output += `When generating code, check if a Figma node matches any of these URLs.\n`;
  output += `If matched, import the existing component instead of generating new code.\n`;

  return output;
}

/**
 * Find mapping for specific Figma URL
 */
export function findMappingForUrl(
  mappings: CodeConnectMapping[],
  figmaUrl: string
): CodeConnectMapping | null {
  const nodeIdMatch = figmaUrl.match(/node-id=([^&]+)/);
  const nodeId = nodeIdMatch ? nodeIdMatch[1].replace(/-/g, ':') : null;

  for (const mapping of mappings) {
    if (nodeId && mapping.figmaNodeId === nodeId) {
      return mapping;
    }
    if (mapping.figmaUrl.includes(figmaUrl) || figmaUrl.includes(mapping.figmaUrl)) {
      return mapping;
    }
  }

  return null;
}
