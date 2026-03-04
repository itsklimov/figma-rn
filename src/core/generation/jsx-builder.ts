/**
 * JSX Builder - Transform IR tree to JSX string
 * Includes accessibility props for production-ready components
 */

import type { IRNode, IconIR, ImageIR, StylesBundle, ExtractedStyle, RepeaterIR, ButtonIR, ComponentIR } from '../types.js';
import type { TokenMappings } from '../mapping/token-matcher.js';
import type { ContractDiagnostic, UnresolvedAssetRef } from '../contracts/types.js';
import { escapeJSXText } from './utils.js';
import { mapColor } from './styles-builder.js';

/** Minimum touch target size for comfortable interaction */
const MIN_TOUCH_TARGET = 44;

/**
 * Derive a valid JS style name from node name
 */
function deriveStyleName(node: IRNode): string {
  // styleRef is already a valid identifier from generateStyleRef()
  // No need to transform again - it causes casing issues
  return node.styleRef;
}

/**
 * Generate the style attribute, merging static and dynamic styles if needed
 */
function getStyleAttribute(node: IRNode, styleName: string): string {
  if (node.styleProps) {
    const overrides = Object.entries(node.styleProps)
      .map(([prop, name]) => `${prop}: ${name}`)
      .join(', ');
    return `style={[styles.${styleName}, { ${overrides} }]}`;
  }
  return `style={styles.${styleName}}`;
}

/**
 * Calculate hitSlop needed to meet minimum touch target
 */
function calculateHitSlop(size: number): number {
  if (size >= MIN_TOUCH_TARGET) return 0;
  return Math.ceil((MIN_TOUCH_TARGET - size) / 2);
}

/**
 * Derive accessibility label from node name
 * Converts naming conventions to readable text and escapes quotes for JSX
 */
function deriveA11yLabel(nodeName: string): string {
  // Ignore generic names which are not useful for a11y
  const genericNames = ['vector', 'group', 'frame', 'rectangle', 'ellipse', 'star', 'line', 'union', 'subtract', 'intersect', 'exclude'];
  const sanitizedName = nodeName.toLowerCase().replace(/\s*\d*$/, '').trim();
  if (genericNames.includes(sanitizedName)) {
    return '';
  }

  // Convert camelCase/PascalCase/kebab-case to readable text
  return nodeName
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/"/g, '\\"'); // Escape double quotes for JSX attribute
}

/**
 * Keyboard/system UI detection patterns
 * These are elements that typically shouldn't be custom-rendered as they're provided by the OS
 */
const KEYBOARD_PATTERNS = [
  /keys?\s*layout/i,
  /keyboard/i,
  /numpad/i,
  /keypad/i,
];

const KEY_COMPONENT_PATTERNS = [
  /^component\s*\/?\s*key$/i,
  /^key\s*(text|label|button)$/i,
];

/**
 * Detect if a node represents a keyboard or key input element
 * These are typically OS-provided and shouldn't need custom rendering
 */
function isKeyboardElement(node: IRNode): { isKeyboard: boolean; reason?: string } {
  // Check if node name matches keyboard patterns
  for (const pattern of KEYBOARD_PATTERNS) {
    if (pattern.test(node.name || '')) {
      return { isKeyboard: true, reason: `name matches pattern: ${node.name}` };
    }
  }

  // Check if it's a key component
  for (const pattern of KEY_COMPONENT_PATTERNS) {
    if (pattern.test(node.name || '')) {
      return { isKeyboard: true, reason: `key component: ${node.name}` };
    }
  }

  // Check for keyboard-like structure: container with many similar small children
  // (grid of keys typically has 9-12+ children arranged in rows)
  const nodeChildren = (node as any).children as IRNode[] | undefined;
  if (nodeChildren && nodeChildren.length >= 9) {
    const textChildren = nodeChildren.filter(
      (c) => c.semanticType === 'Text' || (c as any).children?.some((gc: any) => gc.semanticType === 'Text')
    );
    // If most children contain single-character or key-like text, it's likely a keyboard
    if (textChildren.length >= 9) {
      return { isKeyboard: true, reason: 'grid structure with many key-like children' };
    }
  }

  return { isKeyboard: false };
}

/**
 * Format gradient coordinate to a stable decimal string.
 */
function formatGradientCoord(value: number): string {
  if (!Number.isFinite(value)) return '0.50';
  return value.toFixed(2);
}

/**
 * Clamp a normalized ratio to [0, 1].
 */
function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Build gradient color expressions with optional token mapping.
 */
function buildGradientColors(
  colors: string[],
  mappings?: TokenMappings
): string[] {
  return mappings
    ? colors.map(hex => mapColor(hex, mappings).value)
    : colors.map(hex => `'${hex}'`);
}

/**
 * Generate LinearGradient props from ExtractedStyle.backgroundGradient.
 */
function buildLinearGradientProps(
  gradient: NonNullable<ExtractedStyle['backgroundGradient']>, 
  spaces: string,
  mappings?: TokenMappings
): string {
  const { colors, positions, angle } = gradient;
  const mappedColors = buildGradientColors(colors, mappings);

  // Prefer explicit start/end reconstructed from Figma handles.
  // Default: vertical top-to-bottom
  let start = gradient.start ?? { x: 0.5, y: 0 };
  let end = gradient.end ?? { x: 0.5, y: 1 };

  // Fallback to angle only when explicit points are unavailable.
  if ((!gradient.start || !gradient.end) && angle !== undefined) {
    // Convert angle to start/end (0 = top-to-bottom, 90 = left-to-right)
    const rad = (angle * Math.PI) / 180;
    start = { x: 0.5 - Math.sin(rad) * 0.5, y: 0.5 - Math.cos(rad) * 0.5 };
    end = { x: 0.5 + Math.sin(rad) * 0.5, y: 0.5 + Math.cos(rad) * 0.5 };
  }

  return `${spaces}  colors={[${mappedColors.join(', ')}]}
${spaces}  locations={${JSON.stringify(positions)}}
${spaces}  start={{ x: ${formatGradientCoord(start.x)}, y: ${formatGradientCoord(start.y)} }}
${spaces}  end={{ x: ${formatGradientCoord(end.x)}, y: ${formatGradientCoord(end.y)} }}`;
}

/**
 * Build radial gradient SVG overlay for React Native.
 */
function buildRadialGradientOverlay(
  gradient: NonNullable<ExtractedStyle['backgroundGradient']>,
  spaces: string,
  gradientId: string,
  mappings?: TokenMappings
): string {
  const mappedColors = buildGradientColors(gradient.colors, mappings);
  const stopPositions =
    gradient.positions && gradient.positions.length === gradient.colors.length
      ? gradient.positions
      : gradient.colors.map((_, idx, arr) => (arr.length <= 1 ? 0 : idx / (arr.length - 1)));

  const center = gradient.center ?? { x: 0.5, y: 0.5 };
  const radius = gradient.radius ?? { x: 0.5, y: 0.5 };

  const stops = mappedColors
    .map((colorExpr, index) => {
      const offset = `${(clampRatio(stopPositions[index] ?? 0) * 100).toFixed(2)}%`;
      return `${spaces}      <Stop offset="${offset}" stopColor={${colorExpr}} />`;
    })
    .join('\n');

  return `${spaces}  <Svg pointerEvents="none" style={StyleSheet.absoluteFillObject}>
${spaces}    <Defs>
${spaces}      <SvgRadialGradient
${spaces}        id="${gradientId}"
${spaces}        cx="${(center.x * 100).toFixed(2)}%"
${spaces}        cy="${(center.y * 100).toFixed(2)}%"
${spaces}        rx="${(radius.x * 100).toFixed(2)}%"
${spaces}        ry="${(radius.y * 100).toFixed(2)}%"
${spaces}      >
${stops}
${spaces}      </SvgRadialGradient>
${spaces}    </Defs>
${spaces}    <Rect x="0" y="0" width="100%" height="100%" fill="url(#${gradientId})" />
${spaces}  </Svg>`;
}

/**
 * Options for semantic state support in JSX generation
 */
export interface BuildJSXOptions {
  /** Override root wrapper element (e.g., 'Pressable' for interactive items) */
  wrapperOverride?: 'Pressable';
  /** State prop name for conditional styling (e.g., 'isOn', 'isSelected') */
  stateProp?: string;
  /** Suffix for selected state styles (default: 'Selected') */
  selectedStyleSuffix?: string;
  /** Additional props to add to root element */
  rootProps?: string[];
  /** Whether this is the root node (internal use) */
  _isRoot?: boolean;
  /** Missing asset handling mode */
  assetFailurePolicy?: 'fallback' | 'error';
  /** Resolved svg mode */
  svgMode?: 'component' | 'runtime' | 'raster';
  /** Whether SvgIcon provider import is available */
  hasSvgIconProvider?: boolean;
  /** Diagnostics collector */
  diagnostics?: ContractDiagnostic[];
  /** Unresolved asset collector */
  unresolvedAssets?: UnresolvedAssetRef[];
}

function resolveAssetPath(
  imagePathMap: Map<string, string> | undefined,
  node: IRNode,
  ref?: string
): string | undefined {
  if (!imagePathMap) return undefined;

  const keys = [
    ref,
    ref ? `ref:${ref}` : undefined,
    node.id,
    `node:${node.id}`,
    node.styleRef,
    `style:${node.styleRef}`,
  ].filter((value): value is string => !!value);

  for (const key of keys) {
    const found = imagePathMap.get(key);
    if (found) return found;
  }

  return undefined;
}

function collectMissingAsset(
  node: IRNode,
  ref: string | undefined,
  options: BuildJSXOptions | undefined,
  message: string
): void {
  if (!options) return;
  options.unresolvedAssets?.push({
    ref: ref || node.styleRef || node.id,
    nodeId: node.id,
    semanticType: node.semanticType,
  });
  options.diagnostics?.push({
    level: options.assetFailurePolicy === 'error' ? 'error' : 'warning',
    code: 'ASSET_UNRESOLVED',
    message,
    location: `${node.name} (${node.id})`,
  });
}

function buildFallbackStyleAttribute(node: IRNode, styleName: string): string {
  const fallbackDecoration =
    `backgroundColor: '#E5E7EB', borderWidth: 1, borderColor: '#9CA3AF', alignItems: 'center', justifyContent: 'center'`;

  if (node.styleProps) {
    const overrides = Object.entries(node.styleProps)
      .map(([prop, name]) => `${prop}: ${name}`)
      .join(', ');
    return `style={[styles.${styleName}, { ${overrides} }, { ${fallbackDecoration} }]}`;
  }

  return `style={[styles.${styleName}, { ${fallbackDecoration} }]}`;
}

function buildMissingAssetFallback(
  node: IRNode,
  styleName: string,
  spaces: string,
  label: string
): string {
  const styleAttr = buildFallbackStyleAttribute(node, styleName);
  return `${spaces}<View ${styleAttr} accessibilityRole="image" accessibilityLabel="${label}">
${spaces}  {/* MissingAssetFallback */}
${spaces}</View>`;
}

function resolveAssetComponent(
  path: string,
  options?: BuildJSXOptions
): { component: 'Image' | 'SvgIcon' | 'UnsupportedSvg'; isSvg: boolean } {
  const isSvg = path.toLowerCase().endsWith('.svg');
  if (!isSvg) return { component: 'Image', isSvg: false };

  if (options?.svgMode === 'component' && options.hasSvgIconProvider) {
    return { component: 'SvgIcon', isSvg: true };
  }

  return { component: 'UnsupportedSvg', isSvg: true };
}

/**
 * Build JSX string from IR node tree
 *
 * @param node - IR node to transform
 * @param indent - Current indentation level
 * @param imagePathMap - Optional mapping from imageRef to local file path
 * @param jsxOverrides - Optional overrides for specific node IDs
 * @param stylesBundle - Optional styles bundle to check for gradients
 * @param mappings - Optional token mappings
 * @param options - Optional semantic state options
 * @returns JSX string
 */
export function buildJSX(
  node: IRNode,
  indent: number = 0,
  imagePathMap?: Map<string, string>,
  jsxOverrides?: Map<string, string>,
  stylesBundle?: StylesBundle,
  mappings?: TokenMappings,
  options?: BuildJSXOptions,
  _visitedPath?: Set<string>
): string {
  const spaces = '  '.repeat(indent);
  const visitedPath = _visitedPath ?? new Set<string>();

  // Guard against accidental cyclic references in malformed IR trees.
  if (visitedPath.has(node.id)) {
    return `${spaces}{/* TODO: Cyclic node reference skipped: ${node.name} (${node.id}) */}`;
  }
  visitedPath.add(node.id);

  try {
  // Check for overrides (e.g. valid FlatList for a container)
  if (jsxOverrides?.has(node.id)) {
    return `${spaces}${jsxOverrides.get(node.id)!}`;
  }

  const styleName = deriveStyleName(node);
  
  // Check if this node has a gradient background
  const style = stylesBundle?.styles[node.styleRef];
  const hasGradient = style?.backgroundGradient != null;

  // Check if this is the root node for semantic state handling
  const isRoot = options?._isRoot !== false && indent <= 2;
  const stateProp = options?.stateProp;
  const selectedSuffix = options?.selectedStyleSuffix || 'Selected';
  const usesPressable = isRoot && options?.wrapperOverride === 'Pressable';

  // Check for conditional rendering (node.conditionalProp wraps element in {prop && ...})
  const conditionalProp = (node as any).conditionalProp as string | undefined;

  // Helper to generate style attribute with optional conditional styling
  const getConditionalStyleAttr = (baseStyleName: string, applyState: boolean): string => {
    if (applyState && stateProp) {
      return `style={[styles.${baseStyleName}, ${stateProp} && styles.${baseStyleName}${selectedSuffix}]}`;
    }
    return getStyleAttribute(node, baseStyleName);
  };

  // Child options - pass through state but mark as non-root
  const childOptions: BuildJSXOptions | undefined = options ? { ...options, _isRoot: false } : undefined;

  // Result to be wrapped in conditional if needed
  let result: string;

  switch (node.semanticType) {
    case 'Container':
    case 'Card': {
      const children = node.children || [];

      // Check for keyboard/system UI elements and add TODO warning
      const keyboardCheck = isKeyboardElement(node);
      const keyboardWarning = keyboardCheck.isKeyboard
        ? `${spaces}{/* TODO: This appears to be a keyboard layout (${keyboardCheck.reason}). Consider using the system keyboard instead via TextInput with appropriate keyboardType. */}\n`
        : '';

      // Handle gradient wrapping for containers
      if (hasGradient && style?.backgroundGradient) {
        const styleAttr = getStyleAttribute(node, styleName);
        const gradient = style.backgroundGradient;

        if (gradient.type === 'radial') {
          const gradientId = `grad_${node.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
          const overlay = buildRadialGradientOverlay(gradient, spaces, gradientId, mappings);

          if (children.length === 0) {
            result = `${keyboardWarning}${spaces}<View ${styleAttr}>
${overlay}
${spaces}</View>`;
            break;
          }

          const childrenJSX = children
            .map((child) =>
              buildJSX(
                child,
                indent + 1,
                imagePathMap,
                jsxOverrides,
                stylesBundle,
                mappings,
                childOptions,
                visitedPath
              )
            )
            .join('\n');

          result = `${keyboardWarning}${spaces}<View ${styleAttr}>
${overlay}
${childrenJSX}
${spaces}</View>`;
          break;
        }

        const gradientProps = buildLinearGradientProps(gradient, spaces, mappings);
        if (children.length === 0) {
          result = `${keyboardWarning}${spaces}<LinearGradient
${gradientProps}
${spaces}  ${styleAttr}
${spaces}/>`;
          break;
        }
        const childrenJSX = children
          .map((child) =>
            buildJSX(
              child,
              indent + 1,
              imagePathMap,
              jsxOverrides,
              stylesBundle,
              mappings,
              childOptions,
              visitedPath
            )
          )
          .join('\n');
        result = `${keyboardWarning}${spaces}<LinearGradient
${gradientProps}
${spaces}  ${styleAttr}
${spaces}>
${childrenJSX}
${spaces}</LinearGradient>`;
        break;
      }

      // Pressable wrapper for interactive semantic state components
      if (usesPressable) {
        const pressableStyleAttr = getConditionalStyleAttr(styleName, true);
        const rootPropsStr = options?.rootProps?.length
          ? '\n' + options.rootProps.map(p => `${spaces}  ${p}`).join('\n')
          : '';

        if (children.length === 0) {
          result = `${keyboardWarning}${spaces}<Pressable
${spaces}  ${pressableStyleAttr}${rootPropsStr}
${spaces}/>`;
          break;
        }
        const pressableChildrenJSX = children
          .map((child) =>
            buildJSX(
              child,
              indent + 1,
              imagePathMap,
              jsxOverrides,
              stylesBundle,
              mappings,
              childOptions,
              visitedPath
            )
          )
          .join('\n');
        result = `${keyboardWarning}${spaces}<Pressable
${spaces}  ${pressableStyleAttr}${rootPropsStr}
${spaces}>
${pressableChildrenJSX}
${spaces}</Pressable>`;
        break;
      }

      // Regular View
      const viewStyleAttr = getStyleAttribute(node, styleName);

      if (children.length === 0) {
        result = `${keyboardWarning}${spaces}<View ${viewStyleAttr} />`;
        break;
      }
      const viewChildrenJSX = children
        .map((child) =>
          buildJSX(
            child,
            indent + 1,
            imagePathMap,
            jsxOverrides,
            stylesBundle,
            mappings,
            childOptions,
            visitedPath
          )
        )
        .join('\n');
      result = `${keyboardWarning}${spaces}<View ${viewStyleAttr}>
${viewChildrenJSX}
${spaces}</View>`;
      break;
    }

    case 'Text': {
      const content = node.propName ? `{${node.propName}}` : escapeJSXText(node.text);
      // Apply conditional styling to text with propName (dynamic content)
      const applyStateToText = !!node.propName && !!stateProp;
      const textStyleAttr = applyStateToText
        ? `style={[styles.${styleName}, ${stateProp} && styles.${styleName}${selectedSuffix}]}`
        : getStyleAttribute(node, styleName);
      result = `${spaces}<Text ${textStyleAttr}>${content}</Text>`;
      break;
    }

    case 'Image': {
      const imgNode = node as ImageIR;
      const imageGradient = style?.backgroundGradient;
      const imageFallbackLabel = deriveA11yLabel(node.name) || `Missing asset: ${node.name}`;

      // Gradient-only image-like layers (no imageRef) should render as gradient views.
      if (imageGradient && !imgNode.imageRef && !imgNode.propName) {
        const imgStyleAttr = getStyleAttribute(node, styleName);
        const children = imgNode.children || [];

        if (imageGradient.type === 'radial') {
          const gradientId = `grad_${node.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
          const overlay = buildRadialGradientOverlay(imageGradient, spaces, gradientId, mappings);

          if (children.length === 0) {
            result = `${spaces}<View ${imgStyleAttr}>
${overlay}
${spaces}</View>`;
            break;
          }

          const childrenJSX = children
            .map((child) =>
              buildJSX(
                child,
                indent + 1,
                imagePathMap,
                jsxOverrides,
                stylesBundle,
                mappings,
                childOptions,
                visitedPath
              )
            )
            .join('\n');

          result = `${spaces}<View ${imgStyleAttr}>
${overlay}
${childrenJSX}
${spaces}</View>`;
          break;
        }

        const gradientProps = buildLinearGradientProps(imageGradient, spaces, mappings);
        if (children.length === 0) {
          result = `${spaces}<LinearGradient
${gradientProps}
${spaces}  ${imgStyleAttr}
${spaces}/>`;
          break;
        }

        const childrenJSX = children
          .map((child) =>
            buildJSX(
              child,
              indent + 1,
              imagePathMap,
              jsxOverrides,
              stylesBundle,
              mappings,
              childOptions,
              visitedPath
            )
          )
          .join('\n');

        result = `${spaces}<LinearGradient
${gradientProps}
${spaces}  ${imgStyleAttr}
${spaces}>
${childrenJSX}
${spaces}</LinearGradient>`;
        break;
      }

      const resolvedImagePath = resolveAssetPath(imagePathMap, node, imgNode.imageRef);

      // Prefer exported parent asset when available before recursing into image children.
      if (resolvedImagePath && imgNode.children && imgNode.children.length > 0 && !imgNode.propName) {
        const asset = resolveAssetComponent(resolvedImagePath, options);
        const imgStyleAttr = getStyleAttribute(node, styleName);
        const imgA11yLabel = deriveA11yLabel(node.name);
        const imgA11yProp = imgA11yLabel ? `\n${spaces}  accessibilityLabel="${imgA11yLabel}"` : '';

        if (asset.component === 'UnsupportedSvg') {
          collectMissingAsset(
            node,
            imgNode.imageRef,
            options,
            `SVG asset "${resolvedImagePath}" requires component SVG mode/provider in project profile.`
          );
          result = buildMissingAssetFallback(node, styleName, spaces, imageFallbackLabel);
          break;
        }

        const componentName = asset.component;
        result = `${spaces}<${componentName}
${spaces}  source={require('${resolvedImagePath}')}
${spaces}  ${imgStyleAttr}
${spaces}  accessibilityRole="image"${imgA11yProp}
${spaces}/>`;
        break;
      }

      // NEW: If image has children (overlays), render as View container
      if (imgNode.children && imgNode.children.length > 0) {
        const imgChildrenJSX = imgNode.children
          .map((child) =>
            buildJSX(
              child,
              indent + 1,
              imagePathMap,
              jsxOverrides,
              stylesBundle,
              mappings,
              childOptions,
              visitedPath
            )
          )
          .join('\n');
        const imgStyleAttr = getStyleAttribute(node, styleName);

        result = `${spaces}<View ${imgStyleAttr}>
${imgChildrenJSX}
${spaces}</View>`;
        break;
      }

      // DEFAULT: Render as simple Image component
      const imgStyleAttr = getStyleAttribute(node, styleName);
      if (imgNode.propName) {
        const fallback = buildMissingAssetFallback(node, styleName, `${spaces}  `, imageFallbackLabel);
        result = `${spaces}{${imgNode.propName} ? (
${spaces}  <Image
${spaces}    source={${imgNode.propName}}
${spaces}    ${imgStyleAttr}
${spaces}    accessibilityRole="image"
${spaces}  />
${spaces}) : (
${fallback}
${spaces})}`;
        break;
      }

      // Use imageRef if available, with mapping to local path
      const imgSourcePath = resolvedImagePath;
      if (!imgSourcePath && imgNode.imageRef) {
        collectMissingAsset(node, imgNode.imageRef, options, `Image ref "${imgNode.imageRef}" is unresolved.`);
      } else if (!imgSourcePath && !imgNode.imageRef) {
        collectMissingAsset(node, undefined, options, 'Image node has no imageRef and no propName.');
      }

      const imgA11yLabel = deriveA11yLabel(node.name);
      const imgA11yProp = imgA11yLabel ? `\n${spaces}  accessibilityLabel="${imgA11yLabel}"` : '';

      if (!imgSourcePath) {
        result = buildMissingAssetFallback(node, styleName, spaces, imageFallbackLabel);
        break;
      }

      const asset = resolveAssetComponent(imgSourcePath, options);
      if (asset.component === 'UnsupportedSvg') {
        collectMissingAsset(
          node,
          imgNode.imageRef,
          options,
          `SVG asset "${imgSourcePath}" requires component SVG mode/provider in project profile.`
        );
        result = buildMissingAssetFallback(node, styleName, spaces, imageFallbackLabel);
        break;
      }

      result = `${spaces}<${asset.component}
${spaces}  source={require('${imgSourcePath}')}
${spaces}  ${imgStyleAttr}
${spaces}  accessibilityRole="image"${imgA11yProp}
${spaces}/>`;
      break;
    }

    case 'Button': {
      const btn = node as ButtonIR;
      const escapedLabel = escapeJSXText(btn.label);

      // NEW: If button has custom children, render them instead of default reconstruction
      if (btn.children && btn.children.length > 0) {
        const btnChildrenJSX = btn.children
          .map((child) =>
            buildJSX(
              child,
              indent + 1,
              imagePathMap,
              jsxOverrides,
              stylesBundle,
              mappings,
              childOptions,
              visitedPath
            )
          )
          .join('\n');

        result = `${spaces}<TouchableOpacity
${spaces}  style={styles.${styleName}}
${spaces}  onPress={() => {}}
${spaces}  accessibilityRole="button"
${spaces}  accessibilityLabel="${escapedLabel}"
${spaces}>
${btnChildrenJSX}
${spaces}</TouchableOpacity>`;
        break;
      }

      // DEFAULT: Reconstruct from label + iconRef (existing behavior for simple buttons)
      let iconJSX = '';
      if (btn.iconRef && btn.iconStyleRef) {
        const mappedPath = resolveAssetPath(imagePathMap, node, btn.iconRef);
        if (!mappedPath) {
          collectMissingAsset(node, btn.iconRef, options, `Button icon ref "${btn.iconRef}" is unresolved.`);
          iconJSX = `\n${spaces}  <View style={[styles.${btn.iconStyleRef}, { backgroundColor: '#E5E7EB', borderWidth: 1, borderColor: '#9CA3AF' }]} accessibilityRole="image" accessibilityLabel="Missing button icon">{/* MissingAssetFallback */}</View>`;
        } else {
          const resolved = resolveAssetComponent(mappedPath, options);
          if (resolved.component === 'UnsupportedSvg') {
            collectMissingAsset(
              node,
              btn.iconRef,
              options,
              `Button icon "${mappedPath}" requires component SVG mode/provider in project profile.`
            );
            iconJSX = `\n${spaces}  <View style={[styles.${btn.iconStyleRef}, { backgroundColor: '#E5E7EB', borderWidth: 1, borderColor: '#9CA3AF' }]} accessibilityRole="image" accessibilityLabel="Missing button icon">{/* MissingAssetFallback */}</View>`;
          } else {
            const btnComponent = resolved.component;
            const iconStyleName = btn.iconStyleRef;
            iconJSX = `\n${spaces}  <${btnComponent} source={require('${mappedPath}')} style={styles.${iconStyleName}} />`;
          }
        }
      }

      const textStyleName = btn.textStyleRef ? btn.textStyleRef : `${styleName}Text`;

      result = `${spaces}<TouchableOpacity
${spaces}  style={styles.${styleName}}
${spaces}  onPress={() => {}}
${spaces}  accessibilityRole="button"
${spaces}  accessibilityLabel="${escapedLabel}"
${spaces}>${iconJSX}
${spaces}  <Text style={styles.${textStyleName}}>${escapedLabel}</Text>
${spaces}</TouchableOpacity>`;
      break;
    }

    case 'Icon': {
      const iconNode = node as IconIR;

      // Check if this is a "vector group" - container with only vector/image children
      const isVectorGroup = iconNode.children && iconNode.children.length > 0 &&
        iconNode.children.every(child =>
          child.semanticType === 'Icon' ||
          child.semanticType === 'Image' ||
          (child as any).type === 'VECTOR' ||
          (child as any).type === 'ELLIPSE' ||
          (child as any).type === 'BOOLEAN_OPERATION'
        );

      // For vector groups: render as single SVG using parent's iconRef
      if (isVectorGroup && iconNode.iconRef) {
        const iconPath = resolveAssetPath(imagePathMap, node, iconNode.iconRef);
        const iconA11yLabel = deriveA11yLabel(node.name);
        const iconA11yProp = iconA11yLabel ? `\n${spaces}  accessibilityLabel="${iconA11yLabel}"` : '';
        const hitSlop = calculateHitSlop(iconNode.size);
        const hitSlopProp = hitSlop > 0
          ? `\n${spaces}  hitSlop={{ top: ${hitSlop}, bottom: ${hitSlop}, left: ${hitSlop}, right: ${hitSlop} }}`
          : '';

        if (!iconPath) {
          collectMissingAsset(node, iconNode.iconRef, options, `Icon ref "${iconNode.iconRef}" is unresolved.`);
          result = `${spaces}<TouchableOpacity
${spaces}  accessibilityRole="button"${iconA11yProp}${hitSlopProp}
${spaces}>
${spaces}  ${buildMissingAssetFallback(node, styleName, spaces + '  ', `Missing asset: ${node.name}`)}
${spaces}</TouchableOpacity>`;
          break;
        }

        const resolved = resolveAssetComponent(iconPath, options);
        if (resolved.component === 'UnsupportedSvg') {
          collectMissingAsset(
            node,
            iconNode.iconRef,
            options,
            `Icon asset "${iconPath}" requires component SVG mode/provider in project profile.`
          );
          result = `${spaces}<TouchableOpacity
${spaces}  accessibilityRole="button"${iconA11yProp}${hitSlopProp}
${spaces}>
${spaces}  ${buildMissingAssetFallback(node, styleName, spaces + '  ', `Missing asset: ${node.name}`)}
${spaces}</TouchableOpacity>`;
          break;
        }

        result = `${spaces}<TouchableOpacity
${spaces}  accessibilityRole="button"${iconA11yProp}${hitSlopProp}
${spaces}>
${spaces}  <${resolved.component} source={require('${iconPath}')} style={styles.${styleName}} />
${spaces}</TouchableOpacity>`;
        break;
      }

      // For icons with mixed children (not pure vector group): render children
      if (iconNode.children && iconNode.children.length > 0 && !isVectorGroup) {
        const iconChildrenJSX = iconNode.children
          .map((child) =>
            buildJSX(
              child,
              indent + 1,
              imagePathMap,
              jsxOverrides,
              stylesBundle,
              mappings,
              childOptions,
              visitedPath
            )
          )
          .join('\n');
        const iconA11yLabel2 = deriveA11yLabel(node.name);
        const iconA11yProp2 = iconA11yLabel2 ? `\n${spaces}  accessibilityLabel="${iconA11yLabel2}"` : '';
        const hitSlop2 = calculateHitSlop(iconNode.size);
        const hitSlopProp2 = hitSlop2 > 0
          ? `\n${spaces}  hitSlop={{ top: ${hitSlop2}, bottom: ${hitSlop2}, left: ${hitSlop2}, right: ${hitSlop2} }}`
          : '';

        result = `${spaces}<TouchableOpacity
${spaces}  accessibilityRole="button"${iconA11yProp2}${hitSlopProp2}
${spaces}>
${iconChildrenJSX}
${spaces}</TouchableOpacity>`;
        break;
      }

      // DEFAULT: Use iconRef (existing behavior for simple icons)
      const defaultIconPath = iconNode.iconRef
        ? resolveAssetPath(imagePathMap, node, iconNode.iconRef)
        : undefined;
      const defaultHitSlop = calculateHitSlop(iconNode.size);
      const defaultA11yLabel = deriveA11yLabel(node.name);
      const defaultHitSlopProp = defaultHitSlop > 0
        ? `\n${spaces}  hitSlop={{ top: ${defaultHitSlop}, bottom: ${defaultHitSlop}, left: ${defaultHitSlop}, right: ${defaultHitSlop} }}`
        : '';

      const defaultA11yProp = defaultA11yLabel ? `\n${spaces}  accessibilityLabel="${defaultA11yLabel}"` : '';

      if (!defaultIconPath) {
        collectMissingAsset(
          node,
          iconNode.iconRef,
          options,
          iconNode.iconRef
            ? `Icon ref "${iconNode.iconRef}" is unresolved.`
            : 'Icon node has no iconRef.'
        );
        result = `${spaces}<TouchableOpacity
${spaces}  accessibilityRole="button"${defaultA11yProp}${defaultHitSlopProp}
${spaces}>
${spaces}  ${buildMissingAssetFallback(node, styleName, spaces + '  ', `Missing asset: ${node.name}`)}
${spaces}</TouchableOpacity>`;
        break;
      }

      const defaultResolved = resolveAssetComponent(defaultIconPath, options);
      if (defaultResolved.component === 'UnsupportedSvg') {
        collectMissingAsset(
          node,
          iconNode.iconRef,
          options,
          `Icon asset "${defaultIconPath}" requires component SVG mode/provider in project profile.`
        );
        result = `${spaces}<TouchableOpacity
${spaces}  accessibilityRole="button"${defaultA11yProp}${defaultHitSlopProp}
${spaces}>
${spaces}  ${buildMissingAssetFallback(node, styleName, spaces + '  ', `Missing asset: ${node.name}`)}
${spaces}</TouchableOpacity>`;
        break;
      }

      result = `${spaces}<TouchableOpacity
${spaces}  accessibilityRole="button"${defaultA11yProp}${defaultHitSlopProp}
${spaces}>
${spaces}  <${defaultResolved.component} source={require('${defaultIconPath}')} style={styles.${styleName}} />
${spaces}</TouchableOpacity>`;
      break;
    }

    case 'Component': {
      const comp = node as ComponentIR;

      // Check if this component was exported as an asset (icon/logo)
      if (comp.isExportableAsset) {
        const assetPath = resolveAssetPath(imagePathMap, node, node.id);
        if (assetPath) {
          const resolved = resolveAssetComponent(assetPath, options);
          if (resolved.component === 'UnsupportedSvg') {
            collectMissingAsset(
              node,
              node.id,
              options,
              `Component asset "${assetPath}" requires component SVG mode/provider in project profile.`
            );
            result = buildMissingAssetFallback(node, styleName, spaces, `Missing asset: ${node.name}`);
            break;
          }
          result = `${spaces}<${resolved.component} source={require('${assetPath}')} style={styles.${styleName}} />`;
          break;
        }
      }

      // Normal component rendering
      const componentName = comp.componentName;
      const compProps = comp.props || {};
      const propEntries = Object.keys(compProps);

      if (propEntries.length > 0) {
        const attributes = propEntries.map(p => `${p}={${p}}`).join(' ');
        result = `${spaces}<${componentName} ${attributes} />`;
      } else {
        result = `${spaces}<${componentName} />`;
      }
      break;
    }

    case 'Repeater': {
      const repeater = node as RepeaterIR;
      result = `${spaces}{${repeater.dataPropName}.map((item, index) => (
${spaces}  <${repeater.itemComponentName} key={index} {...item} />
${spaces}))}`;
      break;
    }

    default: {
      // Fallback for any unknown type
      result = `${spaces}<View style={styles.${styleName}} />`;
      break;
    }
  }

  // Apply conditional wrapper if node has conditionalProp
  if (conditionalProp && result) {
    return `${spaces}{${conditionalProp} && (
${result.replace(new RegExp(`^${spaces}`), spaces + '  ')}
${spaces})}`;
  }

  return result;
  } finally {
    visitedPath.delete(node.id);
  }
}

/**
 * Collect all style names that will be referenced in JSX
 * Used to ensure StyleSheet has matching entries
 */
export function collectStyleNames(node: IRNode): string[] {
  const names: string[] = [];

  function collect(n: IRNode, path: Set<string> = new Set()): void {
    if (path.has(n.id)) {
      return;
    }
    path.add(n.id);

    const styleName = deriveStyleName(n);
    names.push(styleName);

    // Button generates additional text/icon styles
    if (n.semanticType === 'Button') {
      const btn = n as ButtonIR;
      if (btn.textStyleRef) {
        names.push(btn.textStyleRef); // Already valid from generateStyleRef()
      } else {
        names.push(`${styleName}Text`);
      }

      if (btn.iconStyleRef) {
        names.push(btn.iconStyleRef); // Already valid from generateStyleRef()
      } else if ((btn as any).iconRef) {
        names.push(`${styleName}Icon`);
      }
    }

    // Recurse into children (check at runtime for all types that might have children)
    if ('children' in n && n.children) {
      for (const child of n.children) {
        collect(child, path);
      }
    }

    path.delete(n.id);
  }

  collect(node);
  return names;
}
