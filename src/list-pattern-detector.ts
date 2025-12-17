import { compareTwoStrings } from 'string-similarity';
import { toCamelCase, capitalize } from './smart-namer.js';

/**
 * Интерфейс для результата обнаружения паттерна списка
 * Interface for list pattern detection result
 */
export interface ListPatternDetection {
  /** Тип списка: FlatList, ScrollView, SectionList или none */
  type: 'FlatList' | 'ScrollView' | 'SectionList' | 'none';
  /** Уверенность в обнаружении (0-1) */
  confidence: number;
  /** Количество элементов в повторяющемся паттерне */
  itemCount: number;
  /** Структура элемента списка (извлеченные свойства) */
  itemStructure: Record<string, any>;
  /** Ориентация списка: вертикальная или горизонтальная */
  orientation: 'vertical' | 'horizontal';
  /** Наличие заголовка списка */
  hasHeader: boolean;
  /** Наличие футера списка */
  hasFooter: boolean;
  /** Расстояние между элементами (gap) */
  gap: number | null;
  /** Предложенное имя типа элемента для TypeScript */
  suggestedItemTypeName: string;
  /** Узлы, которые были идентифицированы как элементы списка */
  itemNodes: any[];
  /** Узел заголовка (если есть) */
  headerNode?: any;
  /** Узел футера (если есть) */
  footerNode?: any;
}

/**
 * Интерфейс для настроек обнаружения паттернов
 * Interface for pattern detection settings
 */
export interface DetectionOptions {
  /** Минимальное количество элементов для определения паттерна (по умолчанию 3) */
  minItemCount?: number;
  /** Минимальная уверенность в структурном сходстве (по умолчанию 0.7) */
  minConfidence?: number;
  /** Учитывать порядок элементов при обнаружении паттерна */
  strictOrder?: boolean;
}

/**
 * Обнаруживает повторяющиеся паттерны в Figma узлах
 * Detects repeating patterns in Figma nodes
 *
 * @param node - Figma узел для анализа
 * @param options - Настройки обнаружения
 * @returns Результат обнаружения паттерна списка
 */
export function detectListPattern(
  node: any,
  options: DetectionOptions = {}
): ListPatternDetection {
  const {
    minItemCount = 3,
    minConfidence = 0.7,
    strictOrder = false,
  } = options;

  // Инициализация результата по умолчанию
  // Initialize default result
  const defaultResult: ListPatternDetection = {
    type: 'none',
    confidence: 0,
    itemCount: 0,
    itemStructure: {},
    orientation: 'vertical',
    hasHeader: false,
    hasFooter: false,
    gap: null,
    suggestedItemTypeName: 'Item',
    itemNodes: [],
  };

  // Проверяем наличие дочерних элементов
  // Check for children
  if (!node.children || !Array.isArray(node.children) || node.children.length < minItemCount) {
    return defaultResult;
  }

  const children = node.children;

  // Определяем ориентацию на основе layoutMode
  // Determine orientation based on layoutMode
  const orientation: 'vertical' | 'horizontal' =
    node.layoutMode === 'HORIZONTAL' ? 'horizontal' : 'vertical';

  // Извлекаем gap из itemSpacing
  // Extract gap from itemSpacing
  const gap = node.itemSpacing !== undefined ? node.itemSpacing : null;

  // Анализируем структуру дочерних элементов
  // Analyze children structure
  const childStructures = children.map((child: any) => extractNodeStructure(child));

  // Ищем повторяющийся паттерн
  // Find repeating pattern
  const patternAnalysis = analyzeRepeatingPattern(
    children,
    childStructures,
    minItemCount,
    minConfidence,
    strictOrder
  );

  if (!patternAnalysis.found) {
    return defaultResult;
  }

  // Определяем заголовок и футер
  // Determine header and footer
  const { headerNode, footerNode, itemNodes } = identifyHeaderFooter(
    children,
    patternAnalysis.itemIndices
  );

  // Определяем тип списка
  // Determine list type
  const listType = determineListType(
    node,
    itemNodes,
    patternAnalysis.hasSectionHeaders
  );

  // Генерируем имя типа элемента
  // Generate item type name
  const suggestedItemTypeName = generateItemTypeName(node, itemNodes[0]);

  return {
    type: listType,
    confidence: patternAnalysis.confidence,
    itemCount: itemNodes.length,
    itemStructure: patternAnalysis.commonStructure,
    orientation,
    hasHeader: headerNode !== undefined,
    hasFooter: footerNode !== undefined,
    gap,
    suggestedItemTypeName,
    itemNodes,
    headerNode,
    footerNode,
  };
}

/**
 * Извлекает структуру узла для сравнения
 * Extracts node structure for comparison
 *
 * @param node - Figma узел
 * @returns Объект с ключевыми свойствами структуры
 */
function extractNodeStructure(node: any): Record<string, any> {
  const structure: Record<string, any> = {
    type: node.type || 'UNKNOWN',
    childCount: node.children ? node.children.length : 0,
    hasText: node.type === 'TEXT' || hasTextChildren(node),
    hasImage: hasImageFills(node),
    layoutMode: node.layoutMode || 'NONE',
  };

  // Добавляем информацию о дочерних типах
  // Add child types information
  if (node.children && node.children.length > 0) {
    structure.childTypes = node.children.map((child: any) => child.type).sort();
    structure.childNames = node.children.map((child: any) =>
      normalizeNodeName(child.name || '')
    ).sort();
  }

  return structure;
}

/**
 * Анализирует дочерние элементы на наличие повторяющегося паттерна
 * Analyzes children for repeating pattern
 *
 * @param children - Массив дочерних узлов
 * @param structures - Массив структур узлов
 * @param minItemCount - Минимальное количество элементов
 * @param minConfidence - Минимальная уверенность
 * @param strictOrder - Строгий порядок
 * @returns Результат анализа паттерна
 */
function analyzeRepeatingPattern(
  children: any[],
  structures: Record<string, any>[],
  minItemCount: number,
  minConfidence: number,
  strictOrder: boolean
): {
  found: boolean;
  confidence: number;
  commonStructure: Record<string, any>;
  itemIndices: number[];
  hasSectionHeaders: boolean;
} {
  const result = {
    found: false,
    confidence: 0,
    commonStructure: {},
    itemIndices: [] as number[],
    hasSectionHeaders: false,
  };

  // Проверяем похожесть имен (Item 1, Item 2, Card, Card Copy и т.д.)
  // Check name similarity patterns
  const nameSimilarity = analyzeNamePatterns(children);

  // Группируем похожие структуры
  // Group similar structures
  const groups = groupSimilarStructures(structures, minConfidence);

  // Находим самую большую группу
  // Find the largest group
  const largestGroup = groups.reduce(
    (max, group) => (group.indices.length > max.indices.length ? group : max),
    { indices: [], confidence: 0 }
  );

  // Проверяем, достаточно ли элементов в группе
  // Check if group has enough items
  if (largestGroup.indices.length < minItemCount) {
    return result;
  }

  // Проверяем на наличие секционных заголовков
  // Check for section headers
  const hasSectionHeaders = detectSectionHeaders(children, largestGroup.indices);

  // Вычисляем итоговую уверенность
  // Calculate final confidence
  const structureConfidence = largestGroup.confidence;
  const nameConfidence = nameSimilarity.confidence;
  const finalConfidence = structureConfidence * 0.7 + nameConfidence * 0.3;

  if (finalConfidence < minConfidence) {
    return result;
  }

  result.found = true;
  result.confidence = finalConfidence;
  result.commonStructure = structures[largestGroup.indices[0]];
  result.itemIndices = largestGroup.indices;
  result.hasSectionHeaders = hasSectionHeaders;

  return result;
}

/**
 * Группирует структуры по сходству
 * Groups structures by similarity
 *
 * @param structures - Массив структур узлов
 * @param minConfidence - Минимальная уверенность для группировки
 * @returns Массив групп с индексами и уверенностью
 */
function groupSimilarStructures(
  structures: Record<string, any>[],
  minConfidence: number
): Array<{ indices: number[]; confidence: number }> {
  const groups: Array<{ indices: number[]; confidence: number }> = [];

  for (let i = 0; i < structures.length; i++) {
    let addedToGroup = false;

    // Проверяем существующие группы
    // Check existing groups
    for (const group of groups) {
      const referenceStructure = structures[group.indices[0]];
      const similarity = calculateStructureSimilarity(structures[i], referenceStructure);

      if (similarity >= minConfidence) {
        group.indices.push(i);
        group.confidence = (group.confidence + similarity) / 2; // Усредняем уверенность
        addedToGroup = true;
        break;
      }
    }

    // Создаем новую группу, если элемент не подошел ни к одной
    // Create new group if item doesn't fit any existing group
    if (!addedToGroup) {
      groups.push({ indices: [i], confidence: 1.0 });
    }
  }

  return groups;
}

/**
 * Вычисляет сходство между двумя структурами
 * Calculates similarity between two structures
 *
 * @param struct1 - Первая структура
 * @param struct2 - Вторая структура
 * @returns Коэффициент сходства (0-1)
 */
function calculateStructureSimilarity(
  struct1: Record<string, any>,
  struct2: Record<string, any>
): number {
  let matches = 0;
  let total = 0;

  // Сравниваем основные свойства
  // Compare basic properties
  const keys = Array.from(new Set([...Object.keys(struct1), ...Object.keys(struct2)]));

  for (const key of keys) {
    total++;

    if (key === 'childTypes' || key === 'childNames') {
      // Специальная обработка для массивов
      // Special handling for arrays
      if (
        Array.isArray(struct1[key]) &&
        Array.isArray(struct2[key]) &&
        arraysEqual(struct1[key], struct2[key])
      ) {
        matches++;
      }
    } else if (struct1[key] === struct2[key]) {
      matches++;
    }
  }

  return total > 0 ? matches / total : 0;
}

/**
 * Анализирует паттерны в именах узлов
 * Analyzes patterns in node names
 *
 * @param nodes - Массив узлов
 * @returns Результат анализа с уверенностью
 */
function analyzeNamePatterns(nodes: any[]): { confidence: number } {
  const names = nodes.map((node) => node.name || '').filter((name) => name.length > 0);

  if (names.length < 2) {
    return { confidence: 0 };
  }

  // Проверяем на числовые суффиксы (Item 1, Item 2, Item 3)
  // Check for numeric suffixes
  const numericPattern = /^(.+?)\s*(\d+)$/;
  const numericMatches = names.filter((name) => numericPattern.test(name));

  if (numericMatches.length >= names.length * 0.7) {
    return { confidence: 0.9 };
  }

  // Проверяем на паттерн "Copy" (Card, Card Copy, Card Copy 2)
  // Check for "Copy" pattern
  const copyPattern = /^(.+?)(\s+Copy(\s+\d+)?)?$/;
  const copyMatches = names.filter((name) => {
    const match = name.match(copyPattern);
    return match && match[1];
  });

  if (copyMatches.length >= names.length * 0.7) {
    return { confidence: 0.8 };
  }

  // Проверяем общее сходство имен
  // Check general name similarity
  const baseName = names[0];
  let totalSimilarity = 0;

  for (let i = 1; i < names.length; i++) {
    totalSimilarity += compareTwoStrings(baseName, names[i]);
  }

  const avgSimilarity = names.length > 1 ? totalSimilarity / (names.length - 1) : 0;

  if (avgSimilarity > 0.6) {
    return { confidence: avgSimilarity * 0.7 };
  }

  return { confidence: 0 };
}

/**
 * Обнаруживает секционные заголовки в списке
 * Detects section headers in list
 *
 * @param children - Массив дочерних узлов
 * @param itemIndices - Индексы элементов списка
 * @returns true если найдены секционные заголовки
 */
function detectSectionHeaders(children: any[], itemIndices: number[]): boolean {
  // Ищем узлы между элементами списка, которые могут быть заголовками секций
  // Look for nodes between list items that could be section headers
  const nonItemIndices = children
    .map((_, index) => index)
    .filter((index) => !itemIndices.includes(index));

  if (nonItemIndices.length === 0) {
    return false;
  }

  // Проверяем, являются ли эти узлы текстовыми и имеют ли признаки заголовков
  // Check if these nodes are text and have header characteristics
  const potentialHeaders = nonItemIndices.filter((index) => {
    const node = children[index];
    const name = (node.name || '').toLowerCase();

    return (
      node.type === 'TEXT' ||
      name.includes('header') ||
      name.includes('title') ||
      name.includes('section')
    );
  });

  // Если найдено более одного потенциального заголовка, считаем что это SectionList
  // If more than one potential header found, consider it a SectionList
  return potentialHeaders.length > 1;
}

/**
 * Идентифицирует заголовок и футер списка
 * Identifies list header and footer
 *
 * @param children - Массив дочерних узлов
 * @param itemIndices - Индексы элементов списка
 * @returns Объект с заголовком, футером и элементами списка
 */
function identifyHeaderFooter(
  children: any[],
  itemIndices: number[]
): {
  headerNode?: any;
  footerNode?: any;
  itemNodes: any[];
} {
  const result = {
    itemNodes: itemIndices.map((index) => children[index]),
  } as { headerNode?: any; footerNode?: any; itemNodes: any[] };

  // Проверяем, есть ли узел перед первым элементом списка
  // Check if there's a node before the first list item
  const firstItemIndex = Math.min(...itemIndices);
  if (firstItemIndex > 0) {
    const potentialHeader = children[firstItemIndex - 1];
    if (isLikelyHeader(potentialHeader)) {
      result.headerNode = potentialHeader;
    }
  }

  // Проверяем, есть ли узел после последнего элемента списка
  // Check if there's a node after the last list item
  const lastItemIndex = Math.max(...itemIndices);
  if (lastItemIndex < children.length - 1) {
    const potentialFooter = children[lastItemIndex + 1];
    if (isLikelyFooter(potentialFooter)) {
      result.footerNode = potentialFooter;
    }
  }

  return result;
}

/**
 * Определяет, является ли узел вероятным заголовком
 * Determines if node is likely a header
 *
 * @param node - Узел для проверки
 * @returns true если узел похож на заголовок
 */
function isLikelyHeader(node: any): boolean {
  const name = (node.name || '').toLowerCase();
  return (
    name.includes('header') ||
    name.includes('title') ||
    name.includes('top') ||
    (node.type === 'TEXT' && node.style?.fontSize > 16)
  );
}

/**
 * Определяет, является ли узел вероятным футером
 * Determines if node is likely a footer
 *
 * @param node - Узел для проверки
 * @returns true если узел похож на футер
 */
function isLikelyFooter(node: any): boolean {
  const name = (node.name || '').toLowerCase();
  return (
    name.includes('footer') ||
    name.includes('bottom') ||
    name.includes('pagination') ||
    name.includes('load more')
  );
}

/**
 * Определяет тип списка на основе анализа узлов
 * Determines list type based on node analysis
 *
 * @param parentNode - Родительский узел
 * @param itemNodes - Элементы списка
 * @param hasSectionHeaders - Наличие секционных заголовков
 * @returns Тип списка
 */
function determineListType(
  parentNode: any,
  itemNodes: any[],
  hasSectionHeaders: boolean
): 'FlatList' | 'ScrollView' | 'SectionList' {
  // Если есть секционные заголовки, это SectionList
  // If section headers exist, it's a SectionList
  if (hasSectionHeaders) {
    return 'SectionList';
  }

  // Если элементов мало (< 5), можно использовать ScrollView
  // If few items (< 5), ScrollView can be used
  if (itemNodes.length < 5) {
    return 'ScrollView';
  }

  // По умолчанию FlatList для оптимальной производительности
  // Default to FlatList for optimal performance
  return 'FlatList';
}

/**
 * Генерирует имя типа элемента на основе узла
 * Generates item type name based on node
 *
 * @param parentNode - Родительский узел
 * @param itemNode - Узел элемента
 * @returns Имя типа в PascalCase
 */
function generateItemTypeName(parentNode: any, itemNode: any): string {
  const parentName = parentNode.name || '';
  const itemName = itemNode.name || '';

  // Пытаемся извлечь базовое имя из имени элемента
  // Try to extract base name from item name
  const baseNameMatch = itemName.match(/^([A-Za-z]+)/);
  if (baseNameMatch) {
    const baseName = baseNameMatch[1];
    return capitalize(toCamelCase(baseName));
  }

  // Используем имя родителя, если доступно
  // Use parent name if available
  if (parentName) {
    const cleanName = parentName.replace(/list|items|collection/gi, '').trim();
    if (cleanName) {
      return capitalize(toCamelCase(cleanName)) + 'Item';
    }
  }

  return 'Item';
}

/**
 * Генерирует код React Native для списка
 * Generates React Native code for list
 *
 * @param detection - Результат обнаружения паттерна
 * @param itemCode - Код для отображения элемента
 * @param screenName - Имя экрана/компонента
 * @returns Сгенерированный код
 */
export function generateListCode(
  detection: ListPatternDetection,
  itemCode: string,
  screenName: string
): string {
  if (detection.type === 'none') {
    return '// No list pattern detected';
  }

  const listName = toCamelCase(screenName + 'Data');
  const itemTypeName = detection.suggestedItemTypeName;

  let code = '';

  // Генерируем TypeScript интерфейс для элемента
  // Generate TypeScript interface for item
  code += `interface ${itemTypeName} {\n`;
  code += `  id: string;\n`;
  code += `  // TODO: Добавьте свойства на основе вашей модели данных\n`;
  code += `  // Add properties based on your data model\n`;
  code += `}\n\n`;

  // Генерируем mock данные
  // Generate mock data
  code += `const ${listName}: ${itemTypeName}[] = [\n`;
  for (let i = 0; i < Math.min(3, detection.itemCount); i++) {
    code += `  { id: '${i + 1}' },\n`;
  }
  code += `];\n\n`;

  // Генерируем renderItem функцию
  // Generate renderItem function
  code += `const renderItem = ({ item }: { item: ${itemTypeName} }) => (\n`;
  code += `  ${itemCode}\n`;
  code += `);\n\n`;

  // Генерируем keyExtractor
  // Generate keyExtractor
  code += `const keyExtractor = (item: ${itemTypeName}) => item.id;\n\n`;

  // Генерируем ItemSeparatorComponent если есть gap
  // Generate ItemSeparatorComponent if gap exists
  if (detection.gap !== null && detection.gap > 0) {
    code += `const ItemSeparator = () => (\n`;
    code += `  <View style={{ height: scale(${detection.gap}) }} />\n`;
    code += `);\n\n`;
  }

  // Генерируем ListEmptyComponent
  // Generate ListEmptyComponent
  code += `const ListEmptyComponent = () => (\n`;
  code += `  <View style={styles.emptyContainer}>\n`;
  code += `    <Text style={styles.emptyText}>Нет данных для отображения</Text>\n`;
  code += `  </View>\n`;
  code += `);\n\n`;

  // Генерируем основной компонент списка
  // Generate main list component
  if (detection.type === 'FlatList') {
    code += `<FlatList\n`;
    code += `  data={${listName}}\n`;
    code += `  renderItem={renderItem}\n`;
    code += `  keyExtractor={keyExtractor}\n`;

    if (detection.orientation === 'horizontal') {
      code += `  horizontal\n`;
    }

    if (detection.gap !== null && detection.gap > 0) {
      code += `  ItemSeparatorComponent={ItemSeparator}\n`;
    }

    code += `  ListEmptyComponent={ListEmptyComponent}\n`;

    // Добавляем pull-to-refresh паттерн
    // Add pull-to-refresh pattern
    code += `  refreshing={false} // TODO: Подключите состояние загрузки\n`;
    code += `  onRefresh={() => {}} // TODO: Реализуйте логику обновления\n`;

    // Добавляем pagination hints
    // Add pagination hints
    code += `  onEndReached={() => {}} // TODO: Реализуйте загрузку следующей страницы\n`;
    code += `  onEndReachedThreshold={0.5}\n`;

    if (detection.hasHeader && detection.headerNode) {
      code += `  ListHeaderComponent={() => (\n`;
      code += `    // TODO: Реализуйте компонент заголовка\n`;
      code += `    <View />\n`;
      code += `  )}\n`;
    }

    if (detection.hasFooter && detection.footerNode) {
      code += `  ListFooterComponent={() => (\n`;
      code += `    // TODO: Реализуйте компонент футера\n`;
      code += `    <View />\n`;
      code += `  )}\n`;
    }

    code += `/>\n`;
  } else if (detection.type === 'SectionList') {
    code += `// TODO: Реализуйте SectionList с секционными данными\n`;
    code += `<SectionList\n`;
    code += `  sections={[]} // TODO: Структурируйте данные по секциям\n`;
    code += `  renderItem={renderItem}\n`;
    code += `  renderSectionHeader={({ section }) => (\n`;
    code += `    <Text style={styles.sectionHeader}>{section.title}</Text>\n`;
    code += `  )}\n`;
    code += `  keyExtractor={keyExtractor}\n`;
    code += `/>\n`;
  } else if (detection.type === 'ScrollView') {
    code += `<ScrollView>\n`;
    code += `  {${listName}.map((item) => (\n`;
    code += `    <View key={item.id}>\n`;
    code += `      {renderItem({ item })}\n`;
    code += `    </View>\n`;
    code += `  ))}\n`;
    code += `</ScrollView>\n`;
  }

  return code;
}

// ============================================================================
// Вспомогательные функции
// Helper functions
// ============================================================================

/**
 * Проверяет наличие текстовых дочерних элементов
 * Checks for text children
 */
function hasTextChildren(node: any): boolean {
  if (!node.children) return false;
  return node.children.some((child: any) => child.type === 'TEXT' || hasTextChildren(child));
}

/**
 * Проверяет наличие изображений в fills
 * Checks for images in fills
 */
function hasImageFills(node: any): boolean {
  if (!node.fills || !Array.isArray(node.fills)) return false;
  return node.fills.some((fill: any) => fill.type === 'IMAGE');
}

/**
 * Нормализует имя узла для сравнения
 * Normalizes node name for comparison
 */
function normalizeNodeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+\d+$/g, '') // Удаляем числовые суффиксы
    .replace(/\s+copy(\s+\d+)?$/gi, '') // Удаляем "Copy" суффиксы
    .trim();
}

/**
 * Проверяет равенство двух массивов
 * Checks equality of two arrays
 */
function arraysEqual(arr1: any[], arr2: any[]): boolean {
  if (arr1.length !== arr2.length) return false;
  return arr1.every((val, index) => val === arr2[index]);
}
