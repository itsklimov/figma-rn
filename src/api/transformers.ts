/**
 * Raw Figma API response → Internal type converters
 */

import type {
  Color,
  LayoutInfo,
  TypographyInfo,
  Effect,
  Fill,
  Stroke,
  CornerRadius,
  FigmaNode,
  BoundingBox,
  FigmaFile,
  ComponentProperty,
  ShadowEffect,
  BlurEffect,
  Padding,
} from './types.js';

/**
 * Convert RGBA (0-1 range) to hex string + rgba object
 * Output is always uppercase (#RRGGBB or #RRGGBBAA)
 */
export function transformColor(raw: { r: number; g: number; b: number; a?: number }): Color {
  const r = Math.round(raw.r * 255);
  const g = Math.round(raw.g * 255);
  const b = Math.round(raw.b * 255);
  const a = raw.a ?? 1;

  const toHex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
  const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}${a < 1 ? toHex(Math.round(a * 255)) : ''}`;

  return {
    hex,
    rgba: { r, g, b, a },
  };
}

/**
 * Map layoutMode HORIZONTAL/VERTICAL/NONE and extract layout properties
 */
export function transformLayout(raw: any): LayoutInfo | null {
  if (!raw.layoutMode || raw.layoutMode === 'NONE') {
    return null;
  }

  const mode = raw.layoutMode === 'HORIZONTAL' ? 'horizontal' : 'vertical';

  const padding: Padding = {
    top: raw.paddingTop ?? 0,
    right: raw.paddingRight ?? 0,
    bottom: raw.paddingBottom ?? 0,
    left: raw.paddingLeft ?? 0,
  };

  return {
    mode,
    gap: raw.itemSpacing ?? 0,
    padding,
    mainAxisAlign: raw.primaryAxisAlignItems || 'MIN',
    crossAxisAlign: raw.counterAxisAlignItems || 'MIN',
    wrap: raw.layoutWrap === 'WRAP',
    wrapGap: raw.counterAxisSpacing,
  };
}

/**
 * Extract typography information from text style
 */
export function transformTypography(raw: any): TypographyInfo | null {
  if (!raw.style) {
    return null;
  }

  const style = raw.style;

  const mapTextAlign = (align?: string): 'left' | 'right' | 'center' | 'justify' => {
    if (!align) return 'left';
    const lower = align.toLowerCase();
    if (lower === 'left' || lower === 'right' || lower === 'center') {
      return lower;
    }
    if (lower === 'justified') return 'justify';
    return 'left';
  };

  return {
    fontFamily: style.fontFamily || 'System',
    fontSize: style.fontSize || 14,
    fontWeight: style.fontWeight || 400,
    lineHeight: style.lineHeightPx || style.fontSize * 1.2,
    letterSpacing: style.letterSpacing || 0,
    textAlign: mapTextAlign(style.textAlignHorizontal),
  };
}

/**
 * Transform effects (shadows, blurs) into clean effect objects
 */
export function transformEffects(raw: any): Effect[] {
  if (!raw.effects || !Array.isArray(raw.effects)) {
    return [];
  }

  const effects: Effect[] = [];

  for (const effect of raw.effects) {
    if (effect.visible === false) {
      continue;
    }

    if (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') {
      if (!effect.color) continue;

      const shadowEffect: ShadowEffect = {
        type: effect.type === 'DROP_SHADOW' ? 'drop-shadow' : 'inner-shadow',
        color: transformColor(effect.color),
        offset: {
          x: effect.offset?.x ?? 0,
          y: effect.offset?.y ?? 0,
        },
        radius: effect.radius ?? 0,
        spread: effect.spread ?? 0,
      };
      effects.push(shadowEffect);
    } else if (effect.type === 'LAYER_BLUR' || effect.type === 'BACKGROUND_BLUR') {
      const blurEffect: BlurEffect = {
        type: effect.type === 'LAYER_BLUR' ? 'layer-blur' : 'background-blur',
        radius: effect.radius ?? 0,
      };
      effects.push(blurEffect);
    }
  }

  return effects;
}

/**
 * Transform fills (solid, gradient, image) into clean fill objects
 */
export function transformFills(raw: any): Fill[] {
  if (!raw.fills || !Array.isArray(raw.fills)) {
    return [];
  }

  const fills: Fill[] = [];

  for (const fill of raw.fills) {
    // Skip hidden fills (visible: false)
    if (fill.visible === false) {
      continue;
    }
    const opacity = fill.opacity ?? 1;
    if (opacity === 0) {
      continue;
    }

    if (fill.type === 'SOLID' && fill.color) {
      fills.push({
        type: 'solid',
        color: transformColor(fill.color),
        opacity,
      });
    } else if (fill.type === 'GRADIENT_LINEAR' || fill.type === 'GRADIENT_RADIAL') {
      if (!fill.gradientStops) continue;

      fills.push({
        type: 'gradient',
        gradient: {
          type: fill.type === 'GRADIENT_LINEAR' ? 'linear' : 'radial',
          stops: fill.gradientStops.map((stop: any) => ({
            position: stop.position,
            color: transformColor(stop.color),
          })),
        },
        opacity,
      });
    } else if (fill.type === 'IMAGE' && fill.imageRef) {
      fills.push({
        type: 'image',
        imageRef: fill.imageRef,
        opacity,
        scaleMode: fill.scaleMode?.toLowerCase(),
      });
    }
  }

  return fills;
}

/**
 * Extract stroke information
 */
export function transformStroke(raw: any): Stroke | null {
  if (!raw.strokes || !Array.isArray(raw.strokes) || raw.strokes.length === 0) {
    return null;
  }

  const stroke = raw.strokes[0];
  // Skip hidden strokes (visible: false)
  if (stroke.visible === false) {
    return null;
  }
  if (stroke.type !== 'SOLID' || !stroke.color) {
    return null;
  }

  return {
    color: transformColor(stroke.color),
    weight: raw.strokeWeight ?? 1,
    opacity: stroke.opacity ?? 1,
    align: (raw.strokeAlign?.toLowerCase() as 'inside' | 'outside' | 'center') || 'inside',
  };
}

/**
 * Extract corner radius (uniform or per-corner)
 */
export function transformCornerRadius(raw: any): CornerRadius | null {
  const hasCornerRadius = raw.cornerRadius !== undefined;
  const hasIndividualRadii = raw.rectangleCornerRadii && Array.isArray(raw.rectangleCornerRadii);

  if (!hasCornerRadius && !hasIndividualRadii) {
    return null;
  }

  if (hasIndividualRadii) {
    const [topLeft, topRight, bottomRight, bottomLeft] = raw.rectangleCornerRadii;
    const allSame = topLeft === topRight && topLeft === bottomRight && topLeft === bottomLeft;

    if (allSame) {
      return topLeft;
    }

    return {
      topLeft,
      topRight,
      bottomRight,
      bottomLeft,
    };
  }

  return raw.cornerRadius ?? 0;
}

/**
 * Transform component property definitions
 */
export function transformComponentProperties(raw: any): Record<string, ComponentProperty> | null {
  if (!raw.componentPropertyDefinitions) {
    return null;
  }

  const properties: Record<string, ComponentProperty> = {};

  for (const [name, prop] of Object.entries(raw.componentPropertyDefinitions)) {
    const typedProp = prop as any;

    const typeMap: Record<string, ComponentProperty['type']> = {
      'VARIANT': 'VARIANT',
      'TEXT': 'TEXT',
      'BOOLEAN': 'BOOLEAN',
      'INSTANCE_SWAP': 'INSTANCE_SWAP',
    };

    properties[name] = {
      type: typeMap[typedProp.type] || 'TEXT',
      value: typedProp.defaultValue ?? '',
      options: typedProp.variantOptions,
    };
  }

  return Object.keys(properties).length > 0 ? properties : null;
}

/**
 * Extract bound variables (tokens)
 */
export function transformBoundVariables(raw: any): any {
  return raw.boundVariables || null;
}

/**
 * Extract constraints
 */
export function transformConstraints(raw: any): any {
  if (!raw.constraints) return undefined;
  return {
    horizontal: raw.constraints.horizontal,
    vertical: raw.constraints.vertical,
  };
}

/**
 * Extract validation/style references
 */
export function transformStyles(raw: any): any {
  return raw.styles || null;
}

/**
 * Main recursive transformer for Figma nodes
 */
export function transformNode(raw: any, parentBounds?: BoundingBox): FigmaNode {
  const boundingBox: BoundingBox | undefined = raw.absoluteBoundingBox
    ? {
        x: raw.absoluteBoundingBox.x,
        y: raw.absoluteBoundingBox.y,
        width: raw.absoluteBoundingBox.width,
        height: raw.absoluteBoundingBox.height,
      }
    : undefined;

  const node: FigmaNode = {
    id: raw.id,
    name: raw.name,
    type: raw.type,
    boundingBox,
    visible: raw.visible !== false,
    opacity: raw.opacity,
  };

  // Layout
  const layout = transformLayout(raw);
  if (layout) {
    node.layout = layout;
  }

  // Typography
  const typography = transformTypography(raw);
  if (typography) {
    node.typography = typography;
  }

  // Text content
  if (raw.characters !== undefined) {
    node.text = raw.characters;
  }

  // Fills
  const fills = transformFills(raw);
  if (fills.length > 0) {
    node.fills = fills;
  }

  // Strokes
  const stroke = transformStroke(raw);
  if (stroke) {
    node.strokes = [stroke];
  }

  // Effects
  const effects = transformEffects(raw);
  if (effects.length > 0) {
    node.effects = effects;
  }

  // Corner radius
  const cornerRadius = transformCornerRadius(raw);
  if (cornerRadius !== null) {
    node.cornerRadius = cornerRadius;
  }

  // Component properties
  if (raw.componentId) {
    node.componentId = raw.componentId;
  }

  const componentProperties = transformComponentProperties(raw);
  if (componentProperties) {
    node.componentProperties = componentProperties;
  }



  // Layout sizing constraints
  if (raw.primaryAxisSizingMode) node.primaryAxisSizingMode = raw.primaryAxisSizingMode;
  if (raw.counterAxisSizingMode) node.counterAxisSizingMode = raw.counterAxisSizingMode;
  if (raw.layoutAlign) node.layoutAlign = raw.layoutAlign;
  if (raw.layoutGrow !== undefined) node.layoutGrow = raw.layoutGrow;
  if (raw.layoutPositioning) node.layoutPositioning = raw.layoutPositioning;

  // New Advanced Properties
  if (raw.boundVariables) node.boundVariables = raw.boundVariables;
  if (raw.styles) node.styles = raw.styles;
  if (raw.scrollBehavior) node.scrollBehavior = raw.scrollBehavior;
  
  // Constraints
  if (raw.constraints) {
    node.constraints = {
      horizontal: raw.constraints.horizontal,
      vertical: raw.constraints.vertical,
    };
  }

  // Scrolling
  if (raw.overflowDirection) node.overflowDirection = raw.overflowDirection;

  // Children
  if (raw.children && Array.isArray(raw.children)) {
    node.children = raw.children.map((child: any) => transformNode(child, boundingBox));
  }

  return node;
}

/**
 * Transform complete file response
 */
export function transformFile(fileKey: string, response: any): FigmaFile {
  return {
    key: fileKey,
    name: response.name ?? 'Untitled',
    lastModified: response.lastModified ?? new Date().toISOString(),
    version: response.version ?? '0',
    thumbnailUrl: response.thumbnailUrl,
  };
}
