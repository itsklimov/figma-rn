import { describe, it, expect } from 'vitest';
import { detectLists } from '../../../src/core/detection/list-detector.js';
import type { IRNode, ContainerIR, TextIR, CardIR } from '../../../src/core/types.js';

describe('detectLists', () => {
  const baseBoundingBox = { x: 0, y: 0, width: 100, height: 50 };
  const baseLayout = {
    type: 'column' as const,
    gap: 8,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    mainAlign: 'start' as const,
    crossAlign: 'start' as const,
  };

  it('should detect a vertical list with 3+ similar items', () => {
    const listItems: ContainerIR[] = [
      {
        id: 'item_1',
        name: 'ProductItem',
        semanticType: 'Container',
        boundingBox: baseBoundingBox,
        styleRef: 'style_item',
        layout: baseLayout,
        children: [
          { id: 'text_1', name: 'title', semanticType: 'Text', boundingBox: baseBoundingBox, styleRef: 'style_text', text: 'Product 1' } as TextIR,
        ],
      },
      {
        id: 'item_2',
        name: 'ProductItem',
        semanticType: 'Container',
        boundingBox: baseBoundingBox,
        styleRef: 'style_item',
        layout: baseLayout,
        children: [
          { id: 'text_2', name: 'title', semanticType: 'Text', boundingBox: baseBoundingBox, styleRef: 'style_text', text: 'Product 2' } as TextIR,
        ],
      },
      {
        id: 'item_3',
        name: 'ProductItem',
        semanticType: 'Container',
        boundingBox: baseBoundingBox,
        styleRef: 'style_item',
        layout: baseLayout,
        children: [
          { id: 'text_3', name: 'title', semanticType: 'Text', boundingBox: baseBoundingBox, styleRef: 'style_text', text: 'Product 3' } as TextIR,
        ],
      },
    ];

    const root: ContainerIR = {
      id: 'list_container',
      name: 'ProductList',
      semanticType: 'Container',
      boundingBox: { x: 0, y: 0, width: 300, height: 200 },
      styleRef: 'style_list',
      layout: baseLayout,
      children: listItems,
    };

    const hints = detectLists(root);

    expect(hints).toHaveLength(1);
    expect(hints[0].containerId).toBe('list_container');
    expect(hints[0].itemIds).toEqual(['item_1', 'item_2', 'item_3']);
    expect(hints[0].orientation).toBe('vertical');
    expect(hints[0].itemType).toBe('ProductItemItem');
  });

  it('should detect a horizontal list', () => {
    const rowLayout = { ...baseLayout, type: 'row' as const };

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
      layout: rowLayout,
      children: items,
    };

    const hints = detectLists(root);

    expect(hints).toHaveLength(1);
    expect(hints[0].orientation).toBe('horizontal');
  });

  it('should not detect a list with fewer than 3 items', () => {
    const items: ContainerIR[] = [
      {
        id: 'item_1',
        name: 'Item',
        semanticType: 'Container',
        boundingBox: baseBoundingBox,
        styleRef: 'style_item',
        layout: baseLayout,
        children: [],
      },
      {
        id: 'item_2',
        name: 'Item',
        semanticType: 'Container',
        boundingBox: baseBoundingBox,
        styleRef: 'style_item',
        layout: baseLayout,
        children: [],
      },
    ];

    const root: ContainerIR = {
      id: 'container',
      name: 'Container',
      semanticType: 'Container',
      boundingBox: { x: 0, y: 0, width: 300, height: 200 },
      styleRef: 'style_container',
      layout: baseLayout,
      children: items,
    };

    const hints = detectLists(root);
    expect(hints).toHaveLength(0);
  });

  it('should not detect a list with dissimilar items', () => {
    const items: IRNode[] = [
      {
        id: 'text_1',
        name: 'Title',
        semanticType: 'Text',
        boundingBox: baseBoundingBox,
        styleRef: 'style_text',
        text: 'Hello',
      } as TextIR,
      {
        id: 'container_1',
        name: 'Box',
        semanticType: 'Container',
        boundingBox: baseBoundingBox,
        styleRef: 'style_box',
        layout: baseLayout,
        children: [],
      } as ContainerIR,
      {
        id: 'card_1',
        name: 'Card',
        semanticType: 'Card',
        boundingBox: baseBoundingBox,
        styleRef: 'style_card',
        layout: baseLayout,
        children: [],
      } as CardIR,
    ];

    const root: ContainerIR = {
      id: 'mixed',
      name: 'MixedContent',
      semanticType: 'Container',
      boundingBox: { x: 0, y: 0, width: 300, height: 300 },
      styleRef: 'style_mixed',
      layout: baseLayout,
      children: items,
    };

    const hints = detectLists(root);
    expect(hints).toHaveLength(0);
  });

  it('should detect nested lists', () => {
    const createListItems = (prefix: string): ContainerIR[] =>
      Array.from({ length: 3 }, (_, i) => ({
        id: `${prefix}_item_${i}`,
        name: 'ListItem',
        semanticType: 'Container' as const,
        boundingBox: baseBoundingBox,
        styleRef: 'style_item',
        layout: baseLayout,
        children: [],
      }));

    const section1: ContainerIR = {
      id: 'section_1',
      name: 'Section1',
      semanticType: 'Container',
      boundingBox: { x: 0, y: 0, width: 300, height: 200 },
      styleRef: 'style_section',
      layout: baseLayout,
      children: createListItems('s1'),
    };

    const section2: ContainerIR = {
      id: 'section_2',
      name: 'Section2',
      semanticType: 'Container',
      boundingBox: { x: 0, y: 200, width: 300, height: 200 },
      styleRef: 'style_section',
      layout: baseLayout,
      children: createListItems('s2'),
    };

    // Root has only 2 sections (not a list), but each section has 3 items (lists)
    const root: ContainerIR = {
      id: 'root',
      name: 'Root',
      semanticType: 'Container',
      boundingBox: { x: 0, y: 0, width: 300, height: 400 },
      styleRef: 'style_root',
      layout: baseLayout,
      children: [section1, section2],
    };

    const hints = detectLists(root);

    // Should detect 2 lists (section1 and section2), not the root
    expect(hints).toHaveLength(2);
    expect(hints.map(h => h.containerId).sort()).toEqual(['section_1', 'section_2']);
  });

  it('should detect list in Card containers', () => {
    const items: ContainerIR[] = Array.from({ length: 3 }, (_, i) => ({
      id: `item_${i}`,
      name: 'MenuItem',
      semanticType: 'Container' as const,
      boundingBox: baseBoundingBox,
      styleRef: 'style_item',
      layout: baseLayout,
      children: [],
    }));

    const card: CardIR = {
      id: 'menu_card',
      name: 'MenuCard',
      semanticType: 'Card',
      boundingBox: { x: 0, y: 0, width: 300, height: 200 },
      styleRef: 'style_card',
      layout: baseLayout,
      children: items,
    };

    const hints = detectLists(card);

    expect(hints).toHaveLength(1);
    expect(hints[0].containerId).toBe('menu_card');
  });

  it('should reject items with significantly different sizes', () => {
    const items: ContainerIR[] = [
      {
        id: 'item_1',
        name: 'Item',
        semanticType: 'Container',
        boundingBox: { x: 0, y: 0, width: 100, height: 50 },
        styleRef: 'style_item',
        layout: baseLayout,
        children: [],
      },
      {
        id: 'item_2',
        name: 'Item',
        semanticType: 'Container',
        boundingBox: { x: 0, y: 50, width: 200, height: 100 }, // Very different size
        styleRef: 'style_item',
        layout: baseLayout,
        children: [],
      },
      {
        id: 'item_3',
        name: 'Item',
        semanticType: 'Container',
        boundingBox: { x: 0, y: 150, width: 100, height: 50 },
        styleRef: 'style_item',
        layout: baseLayout,
        children: [],
      },
    ];

    const root: ContainerIR = {
      id: 'container',
      name: 'Container',
      semanticType: 'Container',
      boundingBox: { x: 0, y: 0, width: 300, height: 300 },
      styleRef: 'style_container',
      layout: baseLayout,
      children: items,
    };

    const hints = detectLists(root);
    expect(hints).toHaveLength(0);
  });
});
