/**
 * Component Group JSX Generators
 * Generates real React Native JSX for detected component patterns
 */

import { type ComponentGroupDetection } from './interactive-group-detector.js';

interface GroupGeneratorContext {
  group: ComponentGroupDetection;
  node: any;
  depth: number;
  styleName: string;
}

export function generateComponentGroupJSX(context: GroupGeneratorContext): string {
  switch (context.group.pattern) {
    case 'rating':
      return generateRatingJSX(context);
    case 'tabs':
      return generateTabsJSX(context);
    case 'segmented-control':
      return generateSegmentedControlJSX(context);
    case 'stepper':
      return generateStepperJSX(context);
    case 'pagination':
      return generatePaginationJSX(context);
    default:
      return generateGenericGroupJSX(context);
  }
}

function generateRatingJSX(context: GroupGeneratorContext): string {
  const { depth, styleName, group } = context;
  const indent = '  '.repeat(depth);
  const count = group.childCount;

  return `${indent}<View style={styles.${styleName}}>
${indent}  {[${Array.from({length: count}, (_, i) => i + 1).join(', ')}].map((star) => (
${indent}    <TouchableOpacity
${indent}      key={star}
${indent}      onPress={() => onRatingChange?.(star)}
${indent}      style={styles.${styleName}Star}
${indent}    >
${indent}      <View style={[styles.${styleName}StarIcon, star <= rating && styles.${styleName}StarIconActive]} />
${indent}    </TouchableOpacity>
${indent}  ))}
${indent}</View>`;
}

function generateTabsJSX(context: GroupGeneratorContext): string {
  const { depth, styleName, group } = context;
  const indent = '  '.repeat(depth);
  const tabs = Array.from({length: group.childCount}, (_, i) => `Tab ${i + 1}`);

  return `${indent}<View style={styles.${styleName}}>
${indent}  {[${tabs.map(t => `'${t}'`).join(', ')}].map((tab, index) => (
${indent}    <TouchableOpacity
${indent}      key={tab}
${indent}      onPress={() => onTabChange?.(index)}
${indent}      style={[styles.${styleName}Tab, activeTab === index && styles.${styleName}TabActive]}
${indent}    >
${indent}      <Text style={[styles.${styleName}TabText, activeTab === index && styles.${styleName}TabTextActive]}>
${indent}        {tab}
${indent}      </Text>
${indent}    </TouchableOpacity>
${indent}  ))}
${indent}</View>`;
}

function generateSegmentedControlJSX(context: GroupGeneratorContext): string {
  const { depth, styleName, group } = context;
  const indent = '  '.repeat(depth);
  const segments = Array.from({length: group.childCount}, (_, i) => `Option ${i + 1}`);

  return `${indent}<View style={styles.${styleName}}>
${indent}  {[${segments.map(s => `'${s}'`).join(', ')}].map((segment, index) => (
${indent}    <TouchableOpacity
${indent}      key={segment}
${indent}      onPress={() => onSegmentChange?.(index)}
${indent}      style={[styles.${styleName}Segment, selectedSegment === index && styles.${styleName}SegmentSelected]}
${indent}    >
${indent}      <Text style={styles.${styleName}SegmentText}>{segment}</Text>
${indent}    </TouchableOpacity>
${indent}  ))}
${indent}</View>`;
}

function generateStepperJSX(context: GroupGeneratorContext): string {
  const { depth, styleName } = context;
  const indent = '  '.repeat(depth);

  return `${indent}<View style={styles.${styleName}}>
${indent}  <TouchableOpacity onPress={() => onDecrement?.()} style={styles.${styleName}Button}>
${indent}    <Text style={styles.${styleName}ButtonText}>−</Text>
${indent}  </TouchableOpacity>
${indent}  <Text style={styles.${styleName}Value}>{stepperValue}</Text>
${indent}  <TouchableOpacity onPress={() => onIncrement?.()} style={styles.${styleName}Button}>
${indent}    <Text style={styles.${styleName}ButtonText}>+</Text>
${indent}  </TouchableOpacity>
${indent}</View>`;
}

function generatePaginationJSX(context: GroupGeneratorContext): string {
  const { depth, styleName, group } = context;
  const indent = '  '.repeat(depth);

  return `${indent}<View style={styles.${styleName}}>
${indent}  {Array.from({ length: ${group.childCount} }).map((_, index) => (
${indent}    <TouchableOpacity
${indent}      key={index}
${indent}      onPress={() => onPageChange?.(index)}
${indent}      style={[styles.${styleName}Dot, currentPage === index && styles.${styleName}DotActive]}
${indent}    />
${indent}  ))}
${indent}</View>`;
}

function generateGenericGroupJSX(context: GroupGeneratorContext): string {
  const { depth, styleName, group } = context;
  const indent = '  '.repeat(depth);

  return `${indent}<View style={styles.${styleName}}>
${indent}  {/* Interactive group: ${group.childCount} items */}
${indent}</View>`;
}
