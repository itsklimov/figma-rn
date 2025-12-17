/**
 * Infer component props from hardcoded content in generated code
 * Converts static Figma content to dynamic React Native props
 */

import type { ComponentAPI } from './component-api-reader.js';

interface PropSuggestion {
  name: string;
  type: string;
  defaultValue?: string;
  reason: string;
  occurrences: number;
}

interface PropsInferenceResult {
  suggestedProps: PropSuggestion[];
  propsInterface: string;
  refactoredCode: string;
  summary: string;
}

/**
 * Detect hardcoded strings that should be props
 */
function detectHardcodedValues(code: string): Map<string, { value: string; count: number }> {
  const hardcoded = new Map<string, { value: string; count: number }>();

  // Match: {"Hardcoded text"} or {'Hardcoded text'}
  const stringRegex = /\{["']([^"']+)["']\}/g;
  const matches = [...code.matchAll(stringRegex)];

  matches.forEach((match) => {
    const value = match[1];

    // Skip empty strings, single characters, and UI labels
    if (
      value.length === 0 ||
      value === ' ' ||
      value === '₽' ||
      value === '•' ||
      value.length > 100
    ) {
      return;
    }

    const key = value;
    const existing = hardcoded.get(key);

    if (existing) {
      existing.count++;
    } else {
      hardcoded.set(key, { value, count: 1 });
    }
  });

  return hardcoded;
}

/**
 * Infer prop type from value
 */
function inferPropType(value: string): { type: string; propName: string } {
  // Currency
  if (value.includes('₽') || value.includes('$') || /^\d+\s*₽?$/.test(value)) {
    return { type: 'number', propName: 'price' };
  }

  // Time/Duration
  if (/^\d+:\d+$/.test(value)) {
    return { type: 'string', propName: 'time' };
  }
  if (/\d+\s*(ч|мин|min|hour|h)/.test(value)) {
    return { type: 'number', propName: 'duration' };
  }

  // Date
  if (/\d+\s*(янв|фев|мар|апр|июл|авг|сен|окт|ноя|дек|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(value)) {
    return { type: 'Date | string', propName: 'date' };
  }
  if (/\b(Пн|Вт|Ср|Чт|Пт|Сб|Вс|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/.test(value)) {
    return { type: 'Date | string', propName: 'date' };
  }

  // Names (capitalized words)
  if (/^[А-ЯЁA-Z][а-яёa-z]+(\s+[А-ЯЁA-Z][а-яёa-z]+)*$/.test(value)) {
    return { type: 'string', propName: 'name' };
  }

  // Rating
  if (/^\d+\.\d+$/.test(value) && parseFloat(value) <= 5) {
    return { type: 'number', propName: 'rating' };
  }

  // Count (123)
  if (/^\(\d+\)$/.test(value)) {
    return { type: 'number', propName: 'count' };
  }

  // Generic text
  return { type: 'string', propName: 'text' };
}

/**
 * Generate suggested props from hardcoded values
 */
function generatePropSuggestions(
  hardcoded: Map<string, { value: string; count: number }>
): PropSuggestion[] {
  const suggestions: PropSuggestion[] = [];
  const usedNames = new Set<string>();

  hardcoded.forEach(({ value, count }, key) => {
    const { type, propName: baseName } = inferPropType(value);

    // Ensure unique prop names
    let propName = baseName;
    let suffix = 1;
    while (usedNames.has(propName)) {
      propName = `${baseName}${suffix}`;
      suffix++;
    }
    usedNames.add(propName);

    suggestions.push({
      name: propName,
      type,
      defaultValue: type === 'string' ? `"${value}"` : value.replace(/[^\d.]/g, ''),
      reason: `Detected from hardcoded value: "${value}"`,
      occurrences: count,
    });
  });

  return suggestions;
}

/**
 * Generate props interface code
 */
function generatePropsInterface(
  componentName: string,
  suggestions: PropSuggestion[]
): string {
  if (suggestions.length === 0) {
    return `interface ${componentName}Props {\n  style?: ViewStyle;\n}`;
  }

  let interfaceCode = `interface ${componentName}Props {\n`;

  // Add inferred props
  suggestions.forEach((prop) => {
    const optional = prop.defaultValue ? '?' : '';
    interfaceCode += `  ${prop.name}${optional}: ${prop.type};\n`;
  });

  // Always include style prop
  interfaceCode += `  style?: ViewStyle;\n`;

  interfaceCode += `}`;

  return interfaceCode;
}

/**
 * Refactor code to use props instead of hardcoded values
 */
function refactorToUseProps(
  code: string,
  hardcoded: Map<string, { value: string; count: number }>,
  suggestions: PropSuggestion[]
): string {
  let refactored = code;

  // Create mapping from value to prop name
  const valueToPropsMap = new Map<string, string>();
  hardcoded.forEach(({ value }, key) => {
    const suggestion = suggestions.find((s) => s.defaultValue?.includes(value));
    if (suggestion) {
      valueToPropsMap.set(value, suggestion.name);
    }
  });

  // Replace hardcoded strings with prop usage
  valueToPropsMap.forEach((propName, value) => {
    // Match {"value"} or {'value'}
    const regex = new RegExp(`\\{["']${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']\\}`, 'g');
    refactored = refactored.replace(regex, `{${propName}}`);
  });

  return refactored;
}

/**
 * Main: Infer props from generated code
 */
export function inferPropsFromContent(
  code: string,
  componentName: string
): PropsInferenceResult {
  // Detect hardcoded values
  const hardcoded = detectHardcodedValues(code);

  // Generate suggestions
  const suggestions = generatePropSuggestions(hardcoded);

  // Generate interface
  const propsInterface = generatePropsInterface(componentName, suggestions);

  // Refactor code (simplified - full implementation would be more complex)
  let refactored = code;

  // Replace existing interface
  const existingInterfaceRegex = new RegExp(
    `interface\\s+${componentName}Props\\s*\\{[^}]*\\}`,
    's'
  );

  if (existingInterfaceRegex.test(refactored)) {
    refactored = refactored.replace(existingInterfaceRegex, propsInterface);
  } else {
    // Add interface before component definition
    const componentDefRegex = new RegExp(`(const ${componentName})`);
    refactored = refactored.replace(componentDefRegex, `${propsInterface}\n\n$1`);
  }

  // Generate summary
  let summary = `# Props Inference for ${componentName}\n\n`;

  if (suggestions.length === 0) {
    summary += `No hardcoded values detected that should be props.\n`;
    summary += `The component appears to be purely presentational.\n`;
  } else {
    summary += `## Detected ${suggestions.length} Hardcoded Value(s)\n\n`;

    suggestions.forEach((prop) => {
      summary += `### ${prop.name}\n`;
      summary += `- **Type**: \`${prop.type}\`\n`;
      summary += `- **Reason**: ${prop.reason}\n`;
      summary += `- **Occurrences**: ${prop.occurrences}\n`;
      if (prop.defaultValue) {
        summary += `- **Default**: ${prop.defaultValue}\n`;
      }
      summary += `\n`;
    });

    summary += `## Updated Interface\n\n\`\`\`typescript\n${propsInterface}\n\`\`\`\n\n`;
    summary += `## Recommendations\n\n`;
    summary += `1. Review suggested prop names and types\n`;
    summary += `2. Replace hardcoded values with prop usage: {propName}\n`;
    summary += `3. Add prop destructuring: const {${suggestions.map((s) => s.name).join(', ')}, style} = props;\n`;
    summary += `4. Consider adding default values for optional props\n`;
  }

  return {
    suggestedProps: suggestions,
    propsInterface,
    refactoredCode: refactored,
    summary,
  };
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
