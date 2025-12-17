/**
 * Detect when Figma components match existing Marafet components
 * Helps LLM reuse existing components instead of generating new ones
 */

interface ComponentMatch {
  figmaNodeName: string;
  marafetComponent: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  importPath: string;
  usage: string;
}

// Known Marafet components (from catalog)
const MARAFET_COMPONENTS = {
  // UI Components
  Avatar: {
    patterns: ['avatar', 'profile picture', 'user photo'],
    importPath: '@app/components/Avatar/Avatar',
    props: ['source', 'placeholder', 'size'],
  },
  Button: {
    patterns: ['button', 'btn'],
    importPath: '@app/components/Button/Button',
    props: ['title', 'onPress', 'variant', 'size'],
  },
  GradientButton: {
    patterns: ['gradient button', 'primary button', 'cta button'],
    importPath: '@app/components/GradientButton',
    props: ['title', 'onPress', 'disabled', 'icon'],
  },
  Input: {
    patterns: ['input', 'text field', 'text input'],
    importPath: '@app/components/Input/Input',
    props: ['value', 'onChangeText', 'placeholder', 'label'],
  },
  Area: {
    patterns: ['card', 'container', 'section', 'area'],
    importPath: '@app/components/Area/Area',
    props: ['padding', 'rounded', 'backgroundColor'],
  },
  LevelBadge: {
    patterns: ['level', 'badge', 'tag', 'pro', 'master'],
    importPath: '@app/components/LevelBadge',
    props: ['level', 'size'],
  },
  VisitCard: {
    patterns: ['visit card', 'visit', 'appointment card'],
    importPath: '@app/components/VisitCard/VisitCard',
    props: ['visit', 'onPress', 'onEdit', 'onCancel'],
  },
  MasterCard: {
    patterns: ['master card', 'master', 'specialist card'],
    importPath: '@app/components/MasterCard/MasterCard',
    props: ['master', 'onPress', 'showTimeSlots'],
  },
};

/**
 * Detect matching Marafet components from Figma component names
 */
export function detectExistingComponents(
  figmaCode: string,
  figmaNodeNames: string[]
): ComponentMatch[] {
  const matches: ComponentMatch[] = [];

  for (const nodeName of figmaNodeNames) {
    const lowerName = nodeName.toLowerCase();

    // Check each Marafet component for pattern matches
    for (const [componentName, config] of Object.entries(MARAFET_COMPONENTS)) {
      for (const pattern of config.patterns) {
        if (lowerName.includes(pattern)) {
          // Determine confidence based on exactness
          let confidence: 'high' | 'medium' | 'low' = 'low';
          let reason = '';

          if (lowerName === pattern) {
            confidence = 'high';
            reason = 'Exact name match';
          } else if (lowerName.startsWith(pattern) || lowerName.endsWith(pattern)) {
            confidence = 'high';
            reason = 'Strong name match';
          } else if (lowerName.includes(pattern)) {
            confidence = 'medium';
            reason = 'Pattern found in name';
          }

          // Generate usage example
          const propsExample = config.props
            .map((prop) => {
              if (prop === 'onPress') return 'onPress={handlePress}';
              if (prop === 'title') return 'title="Text"';
              if (prop === 'size') return 'size="large"';
              if (prop === 'source') return 'source={{uri: imageUrl}}';
              return `${prop}={value}`;
            })
            .join(' ');

          const usage = `<${componentName} ${propsExample} />`;

          matches.push({
            figmaNodeName: nodeName,
            marafetComponent: componentName,
            confidence,
            reason,
            importPath: config.importPath,
            usage,
          });

          break; // Only match first pattern per component
        }
      }
    }
  }

  return matches;
}

/**
 * Generate component reuse suggestions for LLM
 */
export function generateComponentSuggestions(matches: ComponentMatch[]): string {
  if (matches.length === 0) {
    return 'No existing Marafet components detected. Generate new components as needed.';
  }

  let suggestions = '# Existing Component Suggestions\n\n';
  suggestions += `Found ${matches.length} potential matches with existing Marafet components:\n\n`;

  // Group by confidence
  const byConfidence = {
    high: matches.filter((m) => m.confidence === 'high'),
    medium: matches.filter((m) => m.confidence === 'medium'),
    low: matches.filter((m) => m.confidence === 'low'),
  };

  if (byConfidence.high.length > 0) {
    suggestions += `## High Confidence Matches (${byConfidence.high.length})\n\n`;
    byConfidence.high.forEach((m) => {
      suggestions += `### ${m.figmaNodeName} → ${m.marafetComponent}\n`;
      suggestions += `- **Reason**: ${m.reason}\n`;
      suggestions += `- **Import**: \`import ${m.marafetComponent} from '${m.importPath}';\`\n`;
      suggestions += `- **Usage**: \`${m.usage}\`\n\n`;
    });
  }

  if (byConfidence.medium.length > 0) {
    suggestions += `## Medium Confidence Matches (${byConfidence.medium.length})\n\n`;
    byConfidence.medium.forEach((m) => {
      suggestions += `- **${m.figmaNodeName}** might be **${m.marafetComponent}** - ${m.reason}\n`;
    });
    suggestions += '\n';
  }

  suggestions += `\n## Recommendation\n\n`;
  suggestions += `Reuse existing components where confidence is high. This:\n`;
  suggestions += `- Maintains consistency with existing app\n`;
  suggestions += `- Reduces code duplication\n`;
  suggestions += `- Ensures accessibility and functionality\n`;
  suggestions += `- Follows established patterns\n`;

  return suggestions;
}

/**
 * Extract all node names from generated code
 */
export function extractNodeNamesFromCode(code: string): string[] {
  const names: Set<string> = new Set();

  // Extract from View style references (e.g., styles.avatarMaster)
  const styleRefs = code.matchAll(/styles\.(\w+)/g);
  for (const match of styleRefs) {
    names.add(match[1]);
  }

  // Extract from component JSX structure
  const viewNames = code.matchAll(/data-name="([^"]+)"/g);
  for (const match of viewNames) {
    names.add(match[1]);
  }

  return Array.from(names);
}
