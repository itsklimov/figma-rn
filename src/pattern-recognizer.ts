import { compareTwoStrings } from 'string-similarity';

/**
 * Интерфейс для результата сопоставления компонента
 */
export interface ComponentMatch {
  figmaNode: {
    id: string;
    name: string;
    type: string;
    properties: string[];  // извлеченные имена дочерних элементов, текстовое содержимое
  };
  existingComponent: {
    name: string;
    confidence: number;  // 0-1
  };
  matchReason: {
    nameSimilarity: number;
    structureSimilarity: number;
    semanticSimilarity: number;
  };
  recommendation: 'USE_EXISTING' | 'CREATE_NEW' | 'EXTEND_EXISTING';
}

/**
 * Нормализация строки для сравнения
 * @param str - исходная строка
 * @returns нормализованная строка (lowercase, без спецсимволов)
 */
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

/**
 * Извлечение свойств из Figma узла
 * @param node - узел Figma
 * @returns массив свойств (имена детей, токены из имени узла)
 */
function extractProperties(node: any): string[] {
  const properties = new Set<string>();

  // Токенизация имени узла
  const nameTokens = normalizeString(node.name || '')
    .split(/\s+/)
    .filter(token => token.length > 2);
  nameTokens.forEach(token => properties.add(token));

  // Рекурсивное извлечение имен дочерних элементов
  function extractChildNames(n: any) {
    if (n.children && Array.isArray(n.children)) {
      n.children.forEach((child: any) => {
        if (child.name) {
          const childTokens = normalizeString(child.name)
            .split(/\s+/)
            .filter(token => token.length > 2);
          childTokens.forEach(token => properties.add(token));
        }
        extractChildNames(child);
      });
    }
  }

  extractChildNames(node);

  // Извлечение текстового содержимого
  if (node.characters) {
    const textTokens = normalizeString(node.characters)
      .split(/\s+/)
      .filter(token => token.length > 2);
    textTokens.forEach(token => properties.add(token));
  }

  return Array.from(properties);
}

/**
 * Вычисление сходства имен с использованием алгоритма string-similarity
 * @param figmaName - имя Figma узла
 * @param compName - имя существующего компонента
 * @returns оценка сходства (0-1)
 */
function calculateNameSimilarity(figmaName: string, compName: string): number {
  const normalizedFigma = normalizeString(figmaName);
  const normalizedComp = normalizeString(compName);

  return compareTwoStrings(normalizedFigma, normalizedComp);
}

/**
 * Вычисление структурного сходства с использованием индекса Жаккара
 * @param figmaProps - свойства Figma узла
 * @param compProps - свойства существующего компонента
 * @returns индекс Жаккара (0-1)
 */
function calculateStructureSimilarity(figmaProps: string[], compProps: string[]): number {
  if (figmaProps.length === 0 && compProps.length === 0) {
    return 1.0;
  }

  if (figmaProps.length === 0 || compProps.length === 0) {
    return 0.0;
  }

  const setA = new Set(figmaProps.map(p => normalizeString(p)));
  const setB = new Set(compProps.map(p => normalizeString(p)));

  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);

  return intersection.size / union.size;
}

/**
 * Вычисление семантического сходства через простое сопоставление ключевых слов
 * @param figmaNode - узел Figma
 * @param compName - имя существующего компонента
 * @returns оценка семантического сходства (0-1)
 */
function calculateSemanticSimilarity(figmaNode: any, compName: string): number {
  // Ключевые слова для общих компонентов
  const componentKeywords: Record<string, string[]> = {
    button: ['button', 'btn', 'action', 'submit', 'click'],
    card: ['card', 'item', 'tile', 'panel'],
    input: ['input', 'field', 'textfield', 'text', 'form'],
    avatar: ['avatar', 'profile', 'photo', 'picture', 'user'],
    badge: ['badge', 'tag', 'label', 'chip'],
    modal: ['modal', 'dialog', 'popup', 'overlay'],
    header: ['header', 'nav', 'navigation', 'menu'],
    footer: ['footer', 'bottom'],
    list: ['list', 'items', 'collection'],
    icon: ['icon', 'symbol', 'glyph'],
  };

  const normalizedCompName = normalizeString(compName);
  const normalizedNodeName = normalizeString(figmaNode.name || '');

  let maxScore = 0;

  // Проверка совпадений ключевых слов
  for (const [category, keywords] of Object.entries(componentKeywords)) {
    const compContainsCategory = keywords.some(kw => normalizedCompName.includes(kw));
    const nodeContainsCategory = keywords.some(kw => normalizedNodeName.includes(kw));

    if (compContainsCategory && nodeContainsCategory) {
      maxScore = Math.max(maxScore, 0.8);
    } else if (compContainsCategory || nodeContainsCategory) {
      // Частичное совпадение
      const partialScore = keywords.some(kw =>
        normalizedCompName.includes(kw) && normalizedNodeName.includes(kw)
      ) ? 0.5 : 0.2;
      maxScore = Math.max(maxScore, partialScore);
    }
  }

  // Дополнительная проверка: прямое вхождение имени компонента в имя узла или наоборот
  if (normalizedNodeName.includes(normalizedCompName) ||
      normalizedCompName.includes(normalizedNodeName)) {
    maxScore = Math.max(maxScore, 0.6);
  }

  return maxScore;
}

/**
 * Распознавание паттернов компонентов с использованием мультиалгоритмического
 * сопоставления сходства
 *
 * @param figmaNode - узел Figma для анализа
 * @param existingComponents - массив имен существующих компонентов
 * @returns массив совпадений, отсортированных по уверенности (по убыванию)
 */
export function recognizeComponentPatterns(
  figmaNode: any,
  existingComponents: string[]
): ComponentMatch[] {
  const figmaProperties = extractProperties(figmaNode);
  const matches: ComponentMatch[] = [];

  // Для каждого существующего компонента вычисляем сходство
  for (const existingComp of existingComponents) {
    // Извлечение свойств из имени существующего компонента
    // (в реальном сценарии можно было бы парсить сам компонент, но пока используем только имя)
    const compProperties = normalizeString(existingComp)
      .split(/\s+/)
      .filter(token => token.length > 2);

    // a. Сходство имен
    const nameSimilarity = calculateNameSimilarity(figmaNode.name || '', existingComp);

    // b. Структурное сходство
    const structureSimilarity = calculateStructureSimilarity(figmaProperties, compProperties);

    // c. Семантическое сходство
    const semanticSimilarity = calculateSemanticSimilarity(figmaNode, existingComp);

    // Комбинированная уверенность: взвешенная сумма
    const confidence = (nameSimilarity * 0.4) + (structureSimilarity * 0.4) + (semanticSimilarity * 0.2);

    // Определение рекомендации на основе уверенности
    let recommendation: 'USE_EXISTING' | 'CREATE_NEW' | 'EXTEND_EXISTING';
    if (confidence > 0.85 && structureSimilarity > 0.7) {
      recommendation = 'USE_EXISTING';
    } else if (confidence > 0.65) {
      recommendation = 'EXTEND_EXISTING';
    } else {
      recommendation = 'CREATE_NEW';
    }

    matches.push({
      figmaNode: {
        id: figmaNode.id || '',
        name: figmaNode.name || '',
        type: figmaNode.type || '',
        properties: figmaProperties,
      },
      existingComponent: {
        name: existingComp,
        confidence,
      },
      matchReason: {
        nameSimilarity,
        structureSimilarity,
        semanticSimilarity,
      },
      recommendation,
    });
  }

  // Фильтрация совпадений с уверенностью > 0.5
  const filteredMatches = matches.filter(match => match.existingComponent.confidence > 0.5);

  // Сортировка по уверенности (по убыванию)
  filteredMatches.sort((a, b) => b.existingComponent.confidence - a.existingComponent.confidence);

  return filteredMatches;
}
