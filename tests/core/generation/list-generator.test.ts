import { describe, it, expect } from 'vitest';
import { generateFlatList, generateItemComponent } from '../../../src/core/generation/list-generator.js';
import type { ListHint } from '../../../src/core/detection/types.js';
import type { ContainerIR, TextIR } from '../../../src/core/types.js';

describe('generateFlatList', () => {
  const baseBoundingBox = { x: 0, y: 0, width: 100, height: 50 };
  const baseLayout = {
    type: 'column' as const,
    gap: 8,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    mainAlign: 'start' as const,
    crossAlign: 'start' as const,
    sizing: { horizontal: 'fixed' as const, vertical: 'fixed' as const },
  };

  it('should generate FlatList with type definition', () => {
    const items: ContainerIR[] = Array.from({ length: 3 }, (_, i) => ({
      id: `item_${i}`,
      name: 'ProductItem',
      semanticType: 'Container' as const,
      boundingBox: baseBoundingBox,
      styleRef: 'style_item',
      layout: baseLayout,
      children: [
        {
          id: `text_${i}`,
          name: 'title',
          semanticType: 'Text',
          boundingBox: baseBoundingBox,
          styleRef: 'style_text',
          text: `Product ${i}`,
        } as TextIR,
      ],
    }));

    const root: ContainerIR = {
      id: 'list_container',
      name: 'ProductList',
      semanticType: 'Container',
      boundingBox: { x: 0, y: 0, width: 300, height: 200 },
      styleRef: 'style_list',
      layout: baseLayout,
      children: items,
    };

    const hint: ListHint = {
      containerId: 'list_container',
      itemIds: ['item_0', 'item_1', 'item_2'],
      orientation: 'vertical',
      itemType: 'ProductItem',
    };

    const result = generateFlatList(hint, root);

    expect(result.imports).toContain('FlatList');
    expect(result.typeDefinition).toContain('interface ProductItem');
    expect(result.typeDefinition).toContain('id: string');
    expect(result.renderItemFunction).toContain('renderProductItem');
    expect(result.renderItemFunction).toContain('ProductItem');
    expect(result.flatListJSX).toContain('<FlatList');
    expect(result.flatListJSX).toContain('keyExtractor');
  });

  it('should generate horizontal FlatList', () => {
    const items: ContainerIR[] = Array.from({ length: 3 }, (_, i) => ({
      id: `card_${i}`,
      name: 'Card',
      semanticType: 'Container' as const,
      boundingBox: baseBoundingBox,
      styleRef: 'style_card',
      layout: baseLayout,
      children: [],
    }));

    const root: ContainerIR = {
      id: 'carousel',
      name: 'Carousel',
      semanticType: 'Container',
      boundingBox: { x: 0, y: 0, width: 400, height: 100 },
      styleRef: 'style_carousel',
      layout: { ...baseLayout, type: 'row' as const },
      children: items,
    };

    const hint: ListHint = {
      containerId: 'carousel',
      itemIds: ['card_0', 'card_1', 'card_2'],
      orientation: 'horizontal',
      itemType: 'CarouselCard',
    };

    const result = generateFlatList(hint, root);

    expect(result.flatListJSX).toContain('horizontal');
    expect(result.flatListJSX).toContain('showsHorizontalScrollIndicator={false}');
  });

  it('should infer props from text nodes', () => {
    const item: ContainerIR = {
      id: 'item_1',
      name: 'NewsItem',
      semanticType: 'Container',
      boundingBox: baseBoundingBox,
      styleRef: 'style_item',
      layout: baseLayout,
      children: [
        {
          id: 'title_1',
          name: 'headline',
          semanticType: 'Text',
          boundingBox: baseBoundingBox,
          styleRef: 'style_title',
          text: 'Breaking News',
        } as TextIR,
        {
          id: 'subtitle_1',
          name: 'summary',
          semanticType: 'Text',
          boundingBox: baseBoundingBox,
          styleRef: 'style_subtitle',
          text: 'Some summary...',
        } as TextIR,
      ],
    };

    const root: ContainerIR = {
      id: 'list',
      name: 'NewsList',
      semanticType: 'Container',
      boundingBox: { x: 0, y: 0, width: 300, height: 400 },
      styleRef: 'style_list',
      layout: baseLayout,
      children: [item],
    };

    const hint: ListHint = {
      containerId: 'list',
      itemIds: ['item_1'],
      orientation: 'vertical',
      itemType: 'NewsItem',
    };

    const result = generateFlatList(hint, root);

    expect(result.typeDefinition).toContain('id: string');
    expect(result.typeDefinition).toContain('string'); // Text props are strings
  });

  it('should handle missing container gracefully', () => {
    const root: ContainerIR = {
      id: 'root',
      name: 'Root',
      semanticType: 'Container',
      boundingBox: { x: 0, y: 0, width: 300, height: 200 },
      styleRef: 'style_root',
      layout: baseLayout,
      children: [],
    };

    const hint: ListHint = {
      containerId: 'nonexistent',
      itemIds: [],
      orientation: 'vertical',
      itemType: 'MissingItem',
    };

    const result = generateFlatList(hint, root);

    expect(result.imports).toContain('FlatList');
    expect(result.typeDefinition).toContain('interface MissingItem');
    expect(result.flatListJSX).toContain('FlatList');
  });

  it('should use container style name in FlatList', () => {
    const items: ContainerIR[] = Array.from({ length: 3 }, (_, i) => ({
      id: `item_${i}`,
      name: 'Item',
      semanticType: 'Container' as const,
      boundingBox: baseBoundingBox,
      styleRef: 'style_item',
      layout: baseLayout,
      children: [],
    }));

    const root: ContainerIR = {
      id: 'product_list',
      name: 'productListContainer',
      semanticType: 'Container',
      boundingBox: { x: 0, y: 0, width: 300, height: 200 },
      styleRef: 'style_list',
      layout: baseLayout,
      children: items,
    };

    const hint: ListHint = {
      containerId: 'product_list',
      itemIds: ['item_0', 'item_1', 'item_2'],
      orientation: 'vertical',
      itemType: 'ProductItem',
    };

    const result = generateFlatList(hint, root);

    expect(result.flatListJSX).toContain('styles.productListContainer');
  });
});

describe('generateItemComponent', () => {
  const baseBoundingBox = { x: 0, y: 0, width: 100, height: 50 };
  const baseLayout = {
    type: 'column' as const,
    gap: 8,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    mainAlign: 'start' as const,
    crossAlign: 'start' as const,
    sizing: { horizontal: 'fixed' as const, vertical: 'fixed' as const },
  };

  it('should generate item component with props', () => {
    const templateItem: ContainerIR = {
      id: 'item_1',
      name: 'ProductCard',
      semanticType: 'Container',
      boundingBox: baseBoundingBox,
      styleRef: 'style_item',
      layout: baseLayout,
      children: [
        {
          id: 'title_1',
          name: 'productName',
          semanticType: 'Text',
          boundingBox: baseBoundingBox,
          styleRef: 'style_title',
          text: 'Product Name',
        } as TextIR,
      ],
    };

    const hint: ListHint = {
      containerId: 'list',
      itemIds: ['item_1'],
      orientation: 'vertical',
      itemType: 'ProductCard',
    };

    const result = generateItemComponent(hint, templateItem, (node) => '<View />');

    expect(result).toContain('interface ProductCard');
    expect(result).toContain('interface ProductCardComponentProps');
    expect(result).toContain('export function ProductCardComponent');
    expect(result).toContain('item: ProductCard');
  });
});
