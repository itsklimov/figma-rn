import { describe, it, expect } from 'vitest';
import { detectRepetitions } from '../../../src/core/detection/repetition-detector.js';
import type { ContainerIR, TextIR, ButtonIR, CardIR } from '../../../src/core/types.js';

describe('detectRepetitions', () => {
  const baseBoundingBox = { x: 0, y: 0, width: 100, height: 50 };
  const baseLayout = {
    type: 'column' as const,
    gap: 8,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    mainAlign: 'start' as const,
    crossAlign: 'start' as const,
  };

  it('should detect repeated containers with same structure', () => {
    const createCard = (id: string, title: string): ContainerIR => ({
      id,
      name: 'ProductCard',
      semanticType: 'Container',
      boundingBox: baseBoundingBox,
      styleRef: 'style_card',
      layout: baseLayout,
      children: [
        {
          id: `${id}_title`,
          name: 'Title',
          semanticType: 'Text',
          boundingBox: baseBoundingBox,
          styleRef: 'style_title',
          text: title,
        } as TextIR,
      ],
    });

    const root: ContainerIR = {
      id: 'root',
      name: 'Root',
      semanticType: 'Container',
      boundingBox: { x: 0, y: 0, width: 300, height: 200 },
      styleRef: 'style_root',
      layout: baseLayout,
      children: [
        createCard('card_1', 'Product 1'),
        createCard('card_2', 'Product 2'),
      ],
    };

    const hints = detectRepetitions(root);

    expect(hints.length).toBeGreaterThanOrEqual(1);
    const cardHint = hints.find(h => h.instanceIds.includes('card_1'));
    expect(cardHint).toBeDefined();
    expect(cardHint!.instanceIds).toContain('card_1');
    expect(cardHint!.instanceIds).toContain('card_2');
  });

  it('should extract props variations from repeated nodes', () => {
    const createButton = (id: string, label: string): ButtonIR => ({
      id,
      name: 'ActionButton',
      semanticType: 'Button',
      boundingBox: baseBoundingBox,
      styleRef: 'style_btn',
      label,
      variant: 'primary',
    });

    const root: ContainerIR = {
      id: 'root',
      name: 'Root',
      semanticType: 'Container',
      boundingBox: { x: 0, y: 0, width: 300, height: 200 },
      styleRef: 'style_root',
      layout: baseLayout,
      children: [
        createButton('btn_1', 'Save'),
        createButton('btn_2', 'Cancel'),
      ],
    };

    const hints = detectRepetitions(root);

    const btnHint = hints.find(h => h.instanceIds.includes('btn_1'));
    expect(btnHint).toBeDefined();
    expect(btnHint!.propsVariations).toHaveProperty('label');
    expect(btnHint!.propsVariations.label).toContain('Save');
    expect(btnHint!.propsVariations.label).toContain('Cancel');
  });

  it('should not detect repetition with single occurrence', () => {
    const root: ContainerIR = {
      id: 'root',
      name: 'Root',
      semanticType: 'Container',
      boundingBox: { x: 0, y: 0, width: 300, height: 200 },
      styleRef: 'style_root',
      layout: baseLayout,
      children: [
        {
          id: 'unique_card',
          name: 'UniqueCard',
          semanticType: 'Container',
          boundingBox: baseBoundingBox,
          styleRef: 'style_card',
          layout: baseLayout,
          children: [
            {
              id: 'title',
              name: 'Title',
              semanticType: 'Text',
              boundingBox: baseBoundingBox,
              styleRef: 'style_title',
              text: 'Hello',
            } as TextIR,
          ],
        } as ContainerIR,
      ],
    };

    const hints = detectRepetitions(root);

    // Should not detect the unique container
    const cardHints = hints.filter(h => h.instanceIds.includes('unique_card'));
    expect(cardHints).toHaveLength(0);
  });

  it('should detect repeated Cards', () => {
    const createCard = (id: string): CardIR => ({
      id,
      name: 'InfoCard',
      semanticType: 'Card',
      boundingBox: baseBoundingBox,
      styleRef: 'style_card',
      layout: baseLayout,
      children: [
        {
          id: `${id}_text`,
          name: 'Content',
          semanticType: 'Text',
          boundingBox: baseBoundingBox,
          styleRef: 'style_text',
          text: 'Some content',
        } as TextIR,
      ],
    });

    const root: ContainerIR = {
      id: 'root',
      name: 'Root',
      semanticType: 'Container',
      boundingBox: { x: 0, y: 0, width: 300, height: 300 },
      styleRef: 'style_root',
      layout: baseLayout,
      children: [
        createCard('card_a'),
        createCard('card_b'),
      ],
    };

    const hints = detectRepetitions(root);

    const cardHint = hints.find(h => h.instanceIds.includes('card_a'));
    expect(cardHint).toBeDefined();
    expect(cardHint!.instanceIds).toContain('card_b');
  });

  it('should not group differently structured containers', () => {
    const containerWithOneChild: ContainerIR = {
      id: 'container_1',
      name: 'Box',
      semanticType: 'Container',
      boundingBox: baseBoundingBox,
      styleRef: 'style_box',
      layout: baseLayout,
      children: [
        {
          id: 'text_1',
          name: 'Text',
          semanticType: 'Text',
          boundingBox: baseBoundingBox,
          styleRef: 'style_text',
          text: 'Hello',
        } as TextIR,
      ],
    };

    const containerWithTwoChildren: ContainerIR = {
      id: 'container_2',
      name: 'Box',
      semanticType: 'Container',
      boundingBox: baseBoundingBox,
      styleRef: 'style_box',
      layout: baseLayout,
      children: [
        {
          id: 'text_2',
          name: 'Text',
          semanticType: 'Text',
          boundingBox: baseBoundingBox,
          styleRef: 'style_text',
          text: 'Hello',
        } as TextIR,
        {
          id: 'text_3',
          name: 'Text',
          semanticType: 'Text',
          boundingBox: baseBoundingBox,
          styleRef: 'style_text',
          text: 'World',
        } as TextIR,
      ],
    };

    const root: ContainerIR = {
      id: 'root',
      name: 'Root',
      semanticType: 'Container',
      boundingBox: { x: 0, y: 0, width: 300, height: 200 },
      styleRef: 'style_root',
      layout: baseLayout,
      children: [containerWithOneChild, containerWithTwoChildren],
    };

    const hints = detectRepetitions(root);

    // Should not group these two as they have different structures
    const mixedHint = hints.find(h =>
      h.instanceIds.includes('container_1') && h.instanceIds.includes('container_2')
    );
    expect(mixedHint).toBeUndefined();
  });

  it('should generate meaningful component names', () => {
    const createSection = (id: string): ContainerIR => ({
      id,
      name: 'product-card-section',
      semanticType: 'Container',
      boundingBox: baseBoundingBox,
      styleRef: 'style_section',
      layout: baseLayout,
      children: [
        {
          id: `${id}_inner`,
          name: 'Inner',
          semanticType: 'Container',
          boundingBox: baseBoundingBox,
          styleRef: 'style_inner',
          layout: baseLayout,
          children: [],
        } as ContainerIR,
      ],
    });

    const root: ContainerIR = {
      id: 'root',
      name: 'Root',
      semanticType: 'Container',
      boundingBox: { x: 0, y: 0, width: 300, height: 200 },
      styleRef: 'style_root',
      layout: baseLayout,
      children: [
        createSection('section_1'),
        createSection('section_2'),
      ],
    };

    const hints = detectRepetitions(root);

    const sectionHint = hints.find(h => h.instanceIds.includes('section_1'));
    expect(sectionHint).toBeDefined();
    expect(sectionHint!.componentName).toMatch(/product|card|section/i);
  });

  it('should detect deeply nested repetitions', () => {
    const createNestedItem = (id: string): ContainerIR => ({
      id,
      name: 'DeepItem',
      semanticType: 'Container',
      boundingBox: baseBoundingBox,
      styleRef: 'style_item',
      layout: baseLayout,
      children: [
        {
          id: `${id}_text`,
          name: 'ItemText',
          semanticType: 'Text',
          boundingBox: baseBoundingBox,
          styleRef: 'style_text',
          text: 'Item',
        } as TextIR,
      ],
    });

    const root: ContainerIR = {
      id: 'root',
      name: 'Root',
      semanticType: 'Container',
      boundingBox: { x: 0, y: 0, width: 300, height: 400 },
      styleRef: 'style_root',
      layout: baseLayout,
      children: [
        {
          id: 'section_1',
          name: 'Section1',
          semanticType: 'Container',
          boundingBox: { x: 0, y: 0, width: 300, height: 200 },
          styleRef: 'style_section',
          layout: baseLayout,
          children: [createNestedItem('item_1')],
        } as ContainerIR,
        {
          id: 'section_2',
          name: 'Section2',
          semanticType: 'Container',
          boundingBox: { x: 0, y: 200, width: 300, height: 200 },
          styleRef: 'style_section',
          layout: baseLayout,
          children: [createNestedItem('item_2')],
        } as ContainerIR,
      ],
    };

    const hints = detectRepetitions(root);

    // Should detect the nested items
    const itemHint = hints.find(h => h.instanceIds.includes('item_1'));
    expect(itemHint).toBeDefined();
    expect(itemHint!.instanceIds).toContain('item_2');
  });
});
