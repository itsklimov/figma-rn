/**
 * Transform Figma-generated code to Marafet project standards
 */

// Marafet color mappings
const COLOR_MAPPINGS = [
  // Primary colors
  { rgb: 'rgb(122, 84, 255)', theme: 'palette.primary' },
  { rgb: 'rgb(123, 84, 255)', theme: 'palette.primary' },
  { rgb: 'rgb(171, 92, 233)', theme: 'palette.secondary' },

  // Gray scale
  { rgb: 'rgb(247, 247, 247)', theme: 'palette.gray.gray10' },
  { rgb: 'rgb(244, 244, 244)', theme: 'palette.gray.gray10' },
  { rgb: 'rgb(221, 221, 221)', theme: 'palette.gray.gray20' },
  { rgb: 'rgb(180, 180, 180)', theme: 'palette.gray.gray50' },
  { rgb: 'rgb(90, 90, 91)', theme: 'palette.gray.gray70' },

  // Base colors
  { rgb: 'rgb(255, 255, 255)', theme: 'palette.white' },
  { rgb: 'rgb(23, 23, 26)', theme: 'palette.text' },
  { rgb: 'rgb(17, 23, 26)', theme: 'palette.text' },
];

const SCALE_PROPERTIES = [
  'padding', 'margin', 'width', 'height', 'fontSize', 'lineHeight',
  'borderRadius', 'borderWidth', 'gap', 'top', 'left', 'right', 'bottom',
];

/**
 * Main transformation function
 */
export function transformToMarafetStandards(code: string): string {
  let transformed = code;

  // Apply transformations in order
  transformed = addScaleFunction(transformed);
  transformed = replaceColors(transformed);
  transformed = fixTextBackgroundColor(transformed);
  transformed = addImports(transformed);
  transformed = convertToUseTheme(transformed);

  return transformed;
}

/**
 * Add scale() function to dimension values
 */
function addScaleFunction(code: string): string {
  const styleRegex = /(\w+):\s*(\d+\.?\d*)(,?)/g;

  return code.replace(styleRegex, (match, prop, value, comma) => {
    const shouldScale = SCALE_PROPERTIES.some((p) =>
      prop.toLowerCase().includes(p.toLowerCase())
    );

    if (shouldScale && !match.includes('scale(')) {
      return `${prop}: scale(${value})${comma}`;
    }

    return match;
  });
}

/**
 * Replace RGB colors with theme references
 */
function replaceColors(code: string): string {
  let transformed = code;

  const sortedMappings = [...COLOR_MAPPINGS].sort(
    (a, b) => b.rgb.length - a.rgb.length
  );

  for (const mapping of sortedMappings) {
    const rgbEscaped = mapping.rgb.replace(/[()]/g, '\\$&');
    const regexSingle = new RegExp(`'${rgbEscaped}'`, 'g');
    const regexDouble = new RegExp(`"${rgbEscaped}"`, 'g');

    transformed = transformed.replace(regexSingle, mapping.theme);
    transformed = transformed.replace(regexDouble, mapping.theme);
  }

  return transformed;
}

/**
 * Remove backgroundColor from Text styles (generator bug)
 */
function fixTextBackgroundColor(code: string): string {
  const lines = code.split('\n');
  const result: string[] = [];
  let inStyleObject = false;
  let styleHasTextProps = false;
  let skipBackgroundColor = false;

  for (const line of lines) {
    if (line.match(/^\s*\w+:\s*\{/)) {
      inStyleObject = true;
      styleHasTextProps = false;
      skipBackgroundColor = false;
    }

    if (
      inStyleObject &&
      (line.includes('fontFamily') ||
        line.includes('fontSize') ||
        line.includes('fontWeight') ||
        line.includes('textAlign') ||
        line.includes('letterSpacing'))
    ) {
      styleHasTextProps = true;
      skipBackgroundColor = true;
    }

    if (skipBackgroundColor && line.includes('backgroundColor')) {
      continue;
    }

    if (line.match(/^\s*\}/)) {
      inStyleObject = false;
    }

    result.push(line);
  }

  return result.join('\n');
}

/**
 * Add necessary imports
 */
function addImports(code: string): string {
  const hasScaleImport = code.includes("from '@app/utils/responsive'");
  const hasThemeImport = code.includes("from '@app/contexts/ThemeContext'");

  let imports = '';

  if (!hasScaleImport) {
    imports += "import { scale } from '@app/utils/responsive';\n";
  }

  if (!hasThemeImport) {
    imports += "import { useTheme } from '@app/contexts/ThemeContext';\n";
    imports += "import { ThemeType } from '@app/styles/theme';\n";
  }

  if (imports) {
    code = code.replace(
      /(import React from ['"]react['"];)/,
      `$1\n${imports}`
    );
  }

  return code;
}

/**
 * Convert StyleSheet.create to useTheme pattern
 */
function convertToUseTheme(code: string): string {
  // Replace StyleSheet.create with createStyles function
  code = code.replace(
    /const styles = StyleSheet\.create\(\{/,
    'const createStyles = ({palette, commonFonts}: ThemeType) =>\n  ({'
  );

  // Close the createStyles function properly
  code = code.replace(/\}\);(\s*export default)/, '  }) as const;\n\n$1');

  // Update component to use useTheme
  code = code.replace(
    /(const \w+: React\.FC<\w+> = \(\{ style, \.\.\.props \}\) => \{)/,
    `$1\n  const {styles} = useTheme(createStyles);`
  );

  // Remove StyleSheet from imports
  code = code.replace(/, StyleSheet/g, '');
  code = code.replace(/StyleSheet, /g, '');

  return code;
}
