/**
 * Механизм замены компонентов
 * Component replacement engine
 * Определяет какие View заменить на существующие компоненты
 * Determines which Views to replace with existing components
 */

/**
 * Описание замены компонента
 * Component replacement description
 */
export interface ComponentReplacement {
  /** Имя узла в Figma */
  nodeName: string;
  /** Имя существующего компонента для замены */
  componentName: string;
  /** Уверенность в замене (0-1) */
  confidence: number;
}

/**
 * Результат распознавания компонента
 * Component match result
 */
export interface ComponentMatch {
  figmaNode: {
    name: string;
    id: string;
    type: string;
  };
  existingComponent?: {
    name: string;
    confidence: number;
  };
  recommendation: 'USE_EXISTING' | 'EXTEND_EXISTING' | 'CREATE_NEW';
}

/**
 * Определяет какие узлы заменить компонентами
 * Для Phase 2.5 - простая версия, только планирование замен
 * Determines which nodes to replace with components
 * For Phase 2.5 - simple version, only replacement planning
 *
 * @param metadata - Метаданные Figma файла
 * @param matches - Результаты распознавания компонентов
 * @returns Список планируемых замен
 */
export function planComponentReplacements(
  metadata: any,
  matches: ComponentMatch[]
): ComponentReplacement[] {
  const replacements: ComponentReplacement[] = [];

  // Находим совпадения с высокой уверенностью (>85%)
  // Find high-confidence matches (>85%)
  const goodMatches = matches.filter(
    (m) =>
      m.recommendation === 'USE_EXISTING' &&
      m.existingComponent &&
      m.existingComponent.confidence > 0.85
  );

  for (const match of goodMatches) {
    if (match.existingComponent) {
      replacements.push({
        nodeName: match.figmaNode.name,
        componentName: match.existingComponent.name,
        confidence: match.existingComponent.confidence,
      });
    }
  }

  return replacements;
}

/**
 * Генерирует импорты для компонентов
 * Generates imports for components
 *
 * @param replacements - Список замен компонентов
 * @param importPrefix - Префикс пути импорта (по умолчанию '@app')
 * @returns Строка с импортами
 */
export function generateComponentImports(
  replacements: ComponentReplacement[],
  importPrefix: string = '@app'
): string {
  if (replacements.length === 0) return '';

  const imports = replacements.map(
    (r) =>
      `import ${r.componentName} from '${importPrefix}/components/${r.componentName}';`
  );

  return imports.join('\n');
}

/**
 * Фильтрует замены по минимальному порогу уверенности
 * Filters replacements by minimum confidence threshold
 *
 * @param replacements - Список замен
 * @param minConfidence - Минимальная уверенность (0-1)
 * @returns Отфильтрованный список замен
 */
export function filterByConfidence(
  replacements: ComponentReplacement[],
  minConfidence: number = 0.85
): ComponentReplacement[] {
  return replacements.filter((r) => r.confidence >= minConfidence);
}

/**
 * Группирует замены по именам компонентов
 * Полезно для подсчета использования каждого компонента
 * Groups replacements by component names
 * Useful for counting component usage
 *
 * @param replacements - Список замен
 * @returns Map с группировкой по имени компонента
 */
export function groupByComponent(
  replacements: ComponentReplacement[]
): Map<string, ComponentReplacement[]> {
  const groups = new Map<string, ComponentReplacement[]>();

  for (const replacement of replacements) {
    const existing = groups.get(replacement.componentName) || [];
    existing.push(replacement);
    groups.set(replacement.componentName, existing);
  }

  return groups;
}

/**
 * Генерирует отчет о заменах компонентов
 * Generates component replacement report
 *
 * @param replacements - Список замен
 * @returns Читаемый отчет
 */
export function generateReplacementReport(
  replacements: ComponentReplacement[]
): string {
  if (replacements.length === 0) {
    return 'Нет компонентов для замены';
  }

  const grouped = groupByComponent(replacements);
  const lines: string[] = [];

  lines.push(`Найдено ${replacements.length} замен в ${grouped.size} компонентах:`);
  lines.push('');

  for (const [componentName, items] of grouped.entries()) {
    const avgConfidence = (
      items.reduce((sum, item) => sum + item.confidence, 0) / items.length
    ).toFixed(2);

    lines.push(`- ${componentName} (${items.length}x, confidence: ${avgConfidence})`);
    for (const item of items) {
      lines.push(`  • ${item.nodeName} (${(item.confidence * 100).toFixed(0)}%)`);
    }
  }

  return lines.join('\n');
}
