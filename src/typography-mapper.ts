/**
 * Typography extraction with React Native font mappings and Marafet theme lookups
 * Преобразование типографики Figma в React Native и Marafet theme
 */

export interface TypographySpec {
  figma: {
    fontFamily: string;
    fontWeight: number;
    fontSize: number;
    letterSpacing: number;
    lineHeightPx: number;
    textAlign: string;
  };
  reactNative: {
    fontFamily: string;
    fontWeight: string | number;
    fontSize: string; // scale(17)
    lineHeight: string; // scale(22)
    letterSpacing: number;
    textAlign: 'left' | 'center' | 'right';
  };
  marafetTheme?: {
    fontFamily: string; // commonFonts.primary.semibold
    fontSize: string;
    lineHeight: string;
  };
}

/**
 * Карта весов SF Pro для React Native
 * SF Pro Font Weight to React Native font family mapping
 */
const SF_PRO_WEIGHT_MAP: Record<number, string> = {
  100: 'SFProDisplay-Ultralight',
  200: 'SFProDisplay-Thin',
  300: 'SFProDisplay-Light',
  400: 'SFProDisplay-Regular',
  500: 'SFProDisplay-Medium',
  590: 'SFProDisplay-Semibold', // специальный вес / special weight
  600: 'SFProDisplay-Semibold',
  700: 'SFProDisplay-Bold',
  800: 'SFProDisplay-Heavy',
  900: 'SFProDisplay-Black',
};

/**
 * Карта Marafet theme fonts
 * Marafet theme font mapping for SF Pro
 */
const MARAFET_FONT_MAP: Record<string, string> = {
  'SFProDisplay-Regular': 'commonFonts.primary.regular',
  'SFProDisplay-Medium': 'commonFonts.primary.medium',
  'SFProDisplay-Semibold': 'commonFonts.primary.semibold',
  'SFProDisplay-Bold': 'commonFonts.primary.bold',
};

/**
 * Маппинг веса шрифта из числового значения в React Native font family
 * Map numeric font weight to React Native font family name
 */
export function mapFontWeight(weight: number): string {
  // Найти ближайший доступный вес
  // Find closest available weight
  const weights = Object.keys(SF_PRO_WEIGHT_MAP)
    .map(Number)
    .sort((a, b) => a - b);

  let closestWeight = weights[0];
  let minDiff = Math.abs(weight - closestWeight);

  for (const w of weights) {
    const diff = Math.abs(weight - w);
    if (diff < minDiff) {
      minDiff = diff;
      closestWeight = w;
    }
  }

  return SF_PRO_WEIGHT_MAP[closestWeight];
}

/**
 * Маппинг выравнивания текста из Figma в React Native
 * Map text alignment from Figma to React Native
 */
export function mapTextAlign(align: string): 'left' | 'center' | 'right' {
  const normalized = align.toLowerCase();

  if (normalized === 'center' || normalized === 'centered') {
    return 'center';
  }
  if (normalized === 'right') {
    return 'right';
  }

  // По умолчанию left / Default to left
  return 'left';
}

/**
 * Поиск соответствующего Marafet theme font
 * Find matching Marafet theme font reference
 */
export function findMarafetFont(family: string, weight: number): string | null {
  // Для SF Pro используем стандартный маппинг
  // For SF Pro, use standard mapping
  if (family.includes('SF Pro')) {
    const rnFontFamily = mapFontWeight(weight);
    return MARAFET_FONT_MAP[rnFontFamily] || null;
  }

  // Для других шрифтов можно добавить дополнительную логику
  // For other fonts, additional logic can be added here
  return null;
}

/**
 * Извлечение полной спецификации типографики из Figma node
 * Extract complete typography specification from Figma node
 */
export function extractCompleteTypography(node: any): TypographySpec | null {
  // Проверка: node должен быть текстовым и иметь стиль
  // Check: node must be TEXT type and have style property
  if (node.type !== 'TEXT' || !node.style) {
    return null;
  }

  const style = node.style;

  // Извлечение Figma свойств
  // Extract Figma properties
  const figmaSpec = {
    fontFamily: style.fontFamily || 'SF Pro',
    fontWeight: style.fontWeight || 400,
    fontSize: style.fontSize || 14,
    letterSpacing: style.letterSpacing || 0,
    lineHeightPx: style.lineHeightPx || style.fontSize * 1.2,
    textAlign: style.textAlignHorizontal || 'LEFT',
  };

  // Преобразование в React Native
  // Convert to React Native
  const rnFontFamily = mapFontWeight(figmaSpec.fontWeight);
  const rnTextAlign = mapTextAlign(figmaSpec.textAlign);

  const reactNativeSpec = {
    fontFamily: rnFontFamily,
    fontWeight: figmaSpec.fontWeight as string | number,
    fontSize: `scale(${figmaSpec.fontSize})`,
    lineHeight: `scale(${Math.round(figmaSpec.lineHeightPx)})`,
    letterSpacing: figmaSpec.letterSpacing,
    textAlign: rnTextAlign,
  };

  // Поиск Marafet theme mapping (опционально)
  // Lookup Marafet theme mapping (optional)
  const marafetFont = findMarafetFont(figmaSpec.fontFamily, figmaSpec.fontWeight);

  let marafetTheme: TypographySpec['marafetTheme'] = undefined;
  if (marafetFont) {
    marafetTheme = {
      fontFamily: marafetFont,
      fontSize: `scale(${figmaSpec.fontSize})`,
      lineHeight: `scale(${Math.round(figmaSpec.lineHeightPx)})`,
    };
  }

  return {
    figma: figmaSpec,
    reactNative: reactNativeSpec,
    marafetTheme,
  };
}

/**
 * Форматирование TypographySpec в читаемую строку
 * Format TypographySpec into readable string
 */
export function formatTypographySpec(spec: TypographySpec): string {
  const lines: string[] = [
    '// Figma Typography:',
    `// ${spec.figma.fontFamily} ${spec.figma.fontWeight} / ${spec.figma.fontSize}px / LH: ${spec.figma.lineHeightPx}px`,
    '',
    '{',
  ];

  // React Native стили
  // React Native styles
  if (spec.marafetTheme) {
    lines.push(`  fontFamily: ${spec.marafetTheme.fontFamily},`);
    lines.push(`  fontSize: ${spec.marafetTheme.fontSize},`);
    lines.push(`  lineHeight: ${spec.marafetTheme.lineHeight},`);
  } else {
    lines.push(`  fontFamily: '${spec.reactNative.fontFamily}',`);
    lines.push(`  fontSize: ${spec.reactNative.fontSize},`);
    lines.push(`  lineHeight: ${spec.reactNative.lineHeight},`);
  }

  if (spec.reactNative.letterSpacing !== 0) {
    lines.push(`  letterSpacing: ${spec.reactNative.letterSpacing},`);
  }

  if (spec.reactNative.textAlign !== 'left') {
    lines.push(`  textAlign: '${spec.reactNative.textAlign}',`);
  }

  lines.push('}');

  return lines.join('\n');
}

/**
 * Пакетная обработка typography для всех текстовых узлов
 * Batch process typography for all text nodes in tree
 */
export function extractAllTypography(node: any): Map<string, TypographySpec> {
  const results = new Map<string, TypographySpec>();

  function traverse(n: any, path: string = '') {
    const currentPath = path ? `${path} > ${n.name}` : n.name;

    if (n.type === 'TEXT') {
      const spec = extractCompleteTypography(n);
      if (spec) {
        results.set(currentPath, spec);
      }
    }

    if (n.children && Array.isArray(n.children)) {
      for (const child of n.children) {
        traverse(child, currentPath);
      }
    }
  }

  traverse(node);
  return results;
}
