/**
 * Read TypeScript interfaces from existing Marafet components
 * Enables LLM to use components with correct prop types
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

interface ComponentAPI {
  name: string;
  importPath: string;
  propsInterface?: string;
  props: Array<{
    name: string;
    type: string;
    required: boolean;
    description?: string;
  }>;
  example: string;
  fileLocation: string;
}

// Known Marafet components and their locations
const COMPONENT_PATHS: Record<string, string> = {
  Avatar: 'marafet-frontend/src/components/Avatar/Avatar.tsx',
  Button: 'marafet-frontend/src/components/Button/Button.tsx',
  GradientButton: 'marafet-frontend/src/components/GradientButton/GradientButton.tsx',
  Input: 'marafet-frontend/src/components/Input/Input.tsx',
  Area: 'marafet-frontend/src/components/Area/Area.tsx',
  LevelBadge: 'marafet-frontend/src/components/LevelBadge/LevelBadge.tsx',
  VisitCard: 'marafet-frontend/src/components/VisitCard/VisitCard.tsx',
  MasterCard: 'marafet-frontend/src/components/MasterCard/MasterCard.tsx',
  ScreenView: 'marafet-frontend/src/components/ScreenView/ScreenView.tsx',
};

/**
 * Extract props interface from TypeScript file
 */
function extractPropsInterface(code: string, componentName: string): ComponentAPI['props'] {
  const props: ComponentAPI['props'] = [];

  // Find the props interface (e.g., AvatarProps, ButtonProps, etc.)
  const interfaceRegex = new RegExp(
    `interface\\s+${componentName}Props\\s*\\{([^}]+)\\}`,
    's'
  );
  const match = code.match(interfaceRegex);

  if (!match) {
    return props;
  }

  const interfaceBody = match[1];

  // Parse each prop
  const propLines = interfaceBody.split('\n').filter((line) => line.trim());

  for (const line of propLines) {
    // Match: propName?: type; or propName: type;
    const propMatch = line.match(/^\s*(\w+)(\??)\s*:\s*([^;]+);?\s*$/);
    if (!propMatch) continue;

    const [, name, optional, type] = propMatch;

    // Extract JSDoc comment if exists (line above)
    const commentMatch = line.match(/\/\*\*\s*([^*]+)\s*\*\//);
    const description = commentMatch ? commentMatch[1].trim() : undefined;

    props.push({
      name,
      type: type.trim(),
      required: optional !== '?',
      description,
    });
  }

  return props;
}

/**
 * Generate usage example from props
 */
function generateExample(componentName: string, props: ComponentAPI['props']): string {
  const propExamples = props
    .filter((p) => p.required || ['source', 'title', 'onPress', 'children'].includes(p.name))
    .map((p) => {
      // Generate appropriate example value based on prop name/type
      if (p.name === 'source') {
        if (p.type.includes('uri')) return 'source={{uri: imageUrl}}';
        return 'source={require("@assets/image.png")}';
      }
      if (p.name === 'title' || p.name === 'text') return `${p.name}="Text"`;
      if (p.name === 'placeholder') return 'placeholder="AB"';
      if (p.name === 'onPress') return 'onPress={handlePress}';
      if (p.name === 'size') return 'size="large"';
      if (p.name === 'variant') return 'variant="primary"';
      if (p.name === 'disabled') return 'disabled={false}';
      if (p.name === 'value') return 'value={value}';
      if (p.name === 'style') return 'style={styles.custom}';

      // Default
      return `${p.name}={${p.type.includes('string') ? '"value"' : 'value'}}`;
    })
    .join(' ');

  if (props.some((p) => p.name === 'children')) {
    return `<${componentName} ${propExamples}>\n  {children}\n</${componentName}>`;
  }

  return `<${componentName} ${propExamples} />`;
}

/**
 * Read component API from source file
 */
export async function readComponentAPI(
  componentName: string,
  projectRoot: string = process.cwd()
): Promise<ComponentAPI | null> {
  const relativePath = COMPONENT_PATHS[componentName];
  if (!relativePath) {
    return null;
  }

  const fullPath = join(projectRoot, relativePath);

  if (!existsSync(fullPath)) {
    return null;
  }

  try {
    const code = await readFile(fullPath, 'utf-8');

    // Extract props
    const props = extractPropsInterface(code, componentName);

    // Find the full interface text
    const interfaceRegex = new RegExp(
      `(export\\s+)?interface\\s+${componentName}Props\\s*\\{[^}]+\\}`,
      's'
    );
    const interfaceMatch = code.match(interfaceRegex);

    const importPath = `@app/${relativePath
      .replace('marafet-frontend/src/', '')
      .replace('.tsx', '')
      .replace('.ts', '')}`;

    return {
      name: componentName,
      importPath,
      propsInterface: interfaceMatch ? interfaceMatch[0] : undefined,
      props,
      example: generateExample(componentName, props),
      fileLocation: fullPath,
    };
  } catch (error) {
    console.error(`Error reading component ${componentName}:`, error);
    return null;
  }
}

/**
 * Get APIs for all known Marafet components
 */
export async function getAllComponentAPIs(
  projectRoot?: string
): Promise<ComponentAPI[]> {
  const componentNames = Object.keys(COMPONENT_PATHS);
  const apis: ComponentAPI[] = [];

  for (const name of componentNames) {
    const api = await readComponentAPI(name, projectRoot);
    if (api) {
      apis.push(api);
    }
  }

  return apis;
}

/**
 * Format component API for LLM
 */
export function formatComponentAPI(api: ComponentAPI): string {
  let output = `# ${api.name} Component\n\n`;
  output += `**Import**: \`import ${api.name} from '${api.importPath}';\`\n\n`;

  if (api.propsInterface) {
    output += `## Props Interface\n\n\`\`\`typescript\n${api.propsInterface}\n\`\`\`\n\n`;
  }

  if (api.props.length > 0) {
    output += `## Props\n\n`;
    api.props.forEach((prop) => {
      const required = prop.required ? ' **(required)**' : ' _(optional)_';
      output += `- **${prop.name}**${required}: \`${prop.type}\`\n`;
      if (prop.description) {
        output += `  ${prop.description}\n`;
      }
    });
    output += `\n`;
  }

  output += `## Usage Example\n\n\`\`\`tsx\n${api.example}\n\`\`\`\n`;

  return output;
}

/**
 * Format all component APIs for quick reference
 */
export function formatAllComponentAPIs(apis: ComponentAPI[]): string {
  let output = `# Marafet Component Library (${apis.length} components)\n\n`;

  apis.forEach((api) => {
    output += `## ${api.name}\n`;
    output += `\`\`\`tsx\n`;
    output += `import ${api.name} from '${api.importPath}';\n\n`;
    output += `${api.example}\n`;
    output += `\`\`\`\n\n`;
  });

  return output;
}

export type { ComponentAPI };
