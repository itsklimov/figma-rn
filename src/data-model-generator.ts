/**
 * Генератор моделей данных и API типов из Figma экранов
 * Data model and API type generator from Figma screens
 *
 * Анализирует контент экрана для вывода:
 * - TypeScript интерфейсов для данных
 * - React Query хуков для загрузки данных
 * - API endpoint структуры
 */

import { normalizeStyleName } from './style-normalizer.js';

/**
 * Интерфейс для поля данных
 * Data field interface
 */
export interface DataField {
  /** Имя поля */
  name: string;
  /** Тип поля */
  type: 'string' | 'number' | 'boolean' | 'Date' | 'array' | 'object';
  /** Может ли поле быть null */
  nullable: boolean;
  /** Тип элементов массива (если type === 'array') */
  arrayItemType?: string;
  /** Вложенные поля (если type === 'object') */
  nestedFields?: DataField[];
}

/**
 * Интерфейс для модели данных
 * Data model interface
 */
export interface DataModel {
  /** Имя модели (например, "Product", "User") */
  name: string;
  /** Поля модели */
  fields: DataField[];
  /** Является ли модель массивом */
  isArray: boolean;
  /** API endpoint для получения данных */
  apiEndpoint?: string;
}

/**
 * Интерфейс для React Query хука
 * React Query hook interface
 */
export interface APIHook {
  /** Имя хука (например, "useProducts") */
  hookName: string;
  /** API endpoint */
  endpoint: string;
  /** HTTP метод */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Тип запроса (для POST/PUT) */
  requestType?: string;
  /** Тип ответа */
  responseType: string;
}

/**
 * Обнаруживает тип экрана по его названию и структуре
 * Detects screen type by name and structure
 *
 * @param screenName - Название экрана
 * @param node - Figma узел
 * @returns Тип экрана
 */
function detectScreenType(
  screenName: string,
  node: any
): 'list' | 'detail' | 'form' | 'profile' | 'unknown' {
  const normalizedName = screenName.toLowerCase();

  // Списочные экраны
  // List screens
  if (
    normalizedName.includes('list') ||
    normalizedName.includes('catalog') ||
    normalizedName.includes('каталог') ||
    normalizedName.includes('список') ||
    normalizedName.includes('items') ||
    normalizedName.includes('products') ||
    normalizedName.includes('orders') ||
    normalizedName.includes('visits') ||
    normalizedName.includes('masters')
  ) {
    return 'list';
  }

  // Экраны деталей
  // Detail screens
  if (
    normalizedName.includes('detail') ||
    normalizedName.includes('details') ||
    normalizedName.includes('card') ||
    normalizedName.includes('карточка') ||
    normalizedName.includes('информация') ||
    normalizedName.includes('info')
  ) {
    return 'detail';
  }

  // Формы
  // Form screens
  if (
    normalizedName.includes('form') ||
    normalizedName.includes('edit') ||
    normalizedName.includes('create') ||
    normalizedName.includes('add') ||
    normalizedName.includes('форма') ||
    normalizedName.includes('редактирование') ||
    normalizedName.includes('создание')
  ) {
    return 'form';
  }

  // Профиль
  // Profile screens
  if (
    normalizedName.includes('profile') ||
    normalizedName.includes('профиль') ||
    normalizedName.includes('account') ||
    normalizedName.includes('аккаунт')
  ) {
    return 'profile';
  }

  return 'unknown';
}

/**
 * Извлекает название сущности из имени экрана
 * Extracts entity name from screen name
 *
 * @param screenName - Название экрана
 * @returns Название сущности в PascalCase
 */
function extractEntityName(screenName: string): string {
  const normalizedName = screenName
    .replace(/Screen|Page|View|Экран|Страница/gi, '')
    .replace(/List|Catalog|Details?|Form|Card/gi, '')
    .replace(/Список|Каталог|Карточка|Форма/gi, '')
    .trim();

  // Преобразуем в PascalCase
  // Convert to PascalCase
  const words = normalizedName.split(/[\s_-]+/);
  const pascalCase = words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');

  // Убираем множественное число для англ. слов
  // Remove plural for English words
  if (pascalCase.endsWith('s') && pascalCase.length > 2) {
    return pascalCase.slice(0, -1);
  }

  return pascalCase || 'Item';
}

/**
 * Определяет тип поля по содержимому текста
 * Determines field type by text content
 *
 * @param text - Текстовое содержимое
 * @param fieldName - Предполагаемое имя поля
 * @returns Тип поля
 */
function inferFieldType(
  text: string,
  fieldName: string
): 'string' | 'number' | 'boolean' | 'Date' {
  const lowerFieldName = fieldName.toLowerCase();

  // Булевы значения
  // Boolean values
  if (
    text === 'true' ||
    text === 'false' ||
    lowerFieldName.startsWith('is') ||
    lowerFieldName.startsWith('has')
  ) {
    return 'boolean';
  }

  // Числовые значения: цены
  // Number values: prices
  if (
    /^\d+[\s]*₽?$/.test(text) ||
    /^\$?\d+(\.\d{2})?$/.test(text) ||
    lowerFieldName.includes('price') ||
    lowerFieldName.includes('cost') ||
    lowerFieldName.includes('amount') ||
    lowerFieldName.includes('цена') ||
    lowerFieldName.includes('стоимость')
  ) {
    return 'number';
  }

  // Числовые значения: рейтинг
  // Number values: rating
  if (
    /^\d+\.\d+$/.test(text) ||
    lowerFieldName.includes('rating') ||
    lowerFieldName.includes('рейтинг') ||
    lowerFieldName.includes('score')
  ) {
    return 'number';
  }

  // Числовые значения: количество
  // Number values: count
  if (
    /^\d+$/.test(text) ||
    lowerFieldName.includes('count') ||
    lowerFieldName.includes('quantity') ||
    lowerFieldName.includes('количество')
  ) {
    return 'number';
  }

  // Даты
  // Dates
  if (
    /\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/.test(text) ||
    /\d+\s*(янв|фев|мар|апр|май|июн|июл|авг|сен|окт|ноя|дек)/i.test(text) ||
    /\d+\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(text) ||
    lowerFieldName.includes('date') ||
    lowerFieldName.includes('дата') ||
    lowerFieldName.includes('created') ||
    lowerFieldName.includes('updated')
  ) {
    return 'Date';
  }

  // Время
  // Time
  if (
    /\d{1,2}:\d{2}/.test(text) ||
    lowerFieldName.includes('time') ||
    lowerFieldName.includes('время')
  ) {
    return 'string'; // Храним время как строку для простоты
  }

  // По умолчанию - строка
  // Default to string
  return 'string';
}

/**
 * Извлекает поля из текстовых элементов узла
 * Extracts fields from text elements in node
 *
 * @param node - Figma узел
 * @returns Массив полей данных
 */
function extractFieldsFromNode(node: any): DataField[] {
  const fields: DataField[] = [];
  const textContents = new Map<string, string>();

  /**
   * Рекурсивно собирает текстовые элементы
   * Recursively collects text elements
   */
  function collectTextContent(n: any, depth: number = 0) {
    if (depth > 5) return; // Ограничиваем глубину рекурсии

    if (n.type === 'TEXT' && n.characters && n.characters.trim()) {
      const name = n.name || `field_${textContents.size}`;
      const text = n.characters.trim();

      // Пропускаем слишком длинные тексты (вероятно, параграфы)
      // Skip too long texts (likely paragraphs)
      if (text.length <= 100) {
        textContents.set(name, text);
      }
    }

    if (n.children && Array.isArray(n.children)) {
      n.children.forEach((child: any) => collectTextContent(child, depth + 1));
    }
  }

  collectTextContent(node);

  // Преобразуем найденные тексты в поля
  // Convert found texts to fields
  const processedNames = new Set<string>();

  textContents.forEach((text, nodeName) => {
    // Генерируем имя поля из имени узла
    // Generate field name from node name
    let fieldName = nodeName
      .replace(/\d+/g, '')
      .replace(/[^a-zA-Zа-яА-ЯёЁ]/g, ' ')
      .trim()
      .split(/\s+/)
      .filter((word) => word.length > 0)
      .map((word, idx) =>
        idx === 0
          ? word.toLowerCase()
          : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      )
      .join('');

    // Если имя пустое или уже использовано, генерируем новое
    // If name is empty or already used, generate new one
    if (!fieldName || processedNames.has(fieldName)) {
      fieldName = `field${processedNames.size + 1}`;
    }

    processedNames.add(fieldName);

    const type = inferFieldType(text, fieldName);

    // Нормализуем имя поля (транслитерация кириллицы)
    // Normalize field name (Cyrillic transliteration)
    const normalizedFieldName = normalizeStyleName(fieldName);

    fields.push({
      name: normalizedFieldName,
      type,
      nullable: false,
      arrayItemType: undefined,
      nestedFields: undefined,
    });
  });

  return fields;
}

/**
 * Определяет специфические поля на основе типа сущности
 * Determines specific fields based on entity type
 *
 * @param entityName - Название сущности
 * @returns Массив стандартных полей для данной сущности
 */
function getStandardFieldsForEntity(entityName: string): DataField[] {
  const lowerName = entityName.toLowerCase();

  // Общие поля для всех сущностей
  // Common fields for all entities
  const commonFields: DataField[] = [
    { name: 'id', type: 'string', nullable: false },
  ];

  // User / Profile
  if (lowerName.includes('user') || lowerName.includes('profile')) {
    return [
      ...commonFields,
      { name: 'name', type: 'string', nullable: false },
      { name: 'email', type: 'string', nullable: true },
      { name: 'phone', type: 'string', nullable: true },
      { name: 'avatar', type: 'string', nullable: true },
      { name: 'createdAt', type: 'Date', nullable: false },
    ];
  }

  // Product
  if (lowerName.includes('product') || lowerName.includes('товар')) {
    return [
      ...commonFields,
      { name: 'name', type: 'string', nullable: false },
      { name: 'description', type: 'string', nullable: true },
      { name: 'price', type: 'number', nullable: false },
      { name: 'image', type: 'string', nullable: true },
      { name: 'category', type: 'string', nullable: true },
      { name: 'inStock', type: 'boolean', nullable: false },
    ];
  }

  // Order
  if (lowerName.includes('order') || lowerName.includes('заказ')) {
    return [
      ...commonFields,
      { name: 'orderNumber', type: 'string', nullable: false },
      { name: 'status', type: 'string', nullable: false },
      { name: 'total', type: 'number', nullable: false },
      { name: 'createdAt', type: 'Date', nullable: false },
      { name: 'customerId', type: 'string', nullable: false },
    ];
  }

  // Visit
  if (lowerName.includes('visit') || lowerName.includes('визит')) {
    return [
      ...commonFields,
      { name: 'date', type: 'Date', nullable: false },
      { name: 'time', type: 'string', nullable: false },
      { name: 'serviceId', type: 'string', nullable: false },
      { name: 'masterId', type: 'string', nullable: false },
      { name: 'status', type: 'string', nullable: false },
      { name: 'price', type: 'number', nullable: false },
    ];
  }

  // Master
  if (lowerName.includes('master') || lowerName.includes('мастер')) {
    return [
      ...commonFields,
      { name: 'name', type: 'string', nullable: false },
      { name: 'specialty', type: 'string', nullable: false },
      { name: 'rating', type: 'number', nullable: false },
      { name: 'avatar', type: 'string', nullable: true },
      { name: 'experience', type: 'number', nullable: true },
    ];
  }

  // По умолчанию - базовые поля
  // Default - basic fields
  return [
    ...commonFields,
    { name: 'name', type: 'string', nullable: false },
    { name: 'createdAt', type: 'Date', nullable: false },
  ];
}

/**
 * Выводит модели данных из Figma узла
 * Infers data models from Figma node
 *
 * @param node - Figma узел для анализа
 * @param screenName - Название экрана
 * @returns Массив моделей данных
 */
export function inferDataModels(node: any, screenName: string): DataModel[] {
  const models: DataModel[] = [];

  const screenType = detectScreenType(screenName, node);
  const entityName = extractEntityName(screenName);

  // Для списочных экранов создаем модель массива
  // For list screens create array model
  if (screenType === 'list') {
    const itemFields = [
      ...getStandardFieldsForEntity(entityName),
      ...extractFieldsFromNode(node),
    ];

    // Удаляем дубликаты полей
    // Remove duplicate fields
    const uniqueFields = Array.from(
      new Map(itemFields.map((field) => [field.name, field])).values()
    );

    models.push({
      name: entityName,
      fields: uniqueFields,
      isArray: true,
      apiEndpoint: inferAPIEndpoint(screenName, entityName),
    });
  }

  // Для экранов деталей создаем модель одного объекта
  // For detail screens create single object model
  else if (screenType === 'detail') {
    const itemFields = [
      ...getStandardFieldsForEntity(entityName),
      ...extractFieldsFromNode(node),
    ];

    const uniqueFields = Array.from(
      new Map(itemFields.map((field) => [field.name, field])).values()
    );

    models.push({
      name: entityName,
      fields: uniqueFields,
      isArray: false,
      apiEndpoint: inferAPIEndpoint(screenName, entityName),
    });
  }

  // Для форм создаем input и output типы
  // For forms create input and output types
  else if (screenType === 'form') {
    const itemFields = [
      ...getStandardFieldsForEntity(entityName),
      ...extractFieldsFromNode(node),
    ];

    const uniqueFields = Array.from(
      new Map(itemFields.map((field) => [field.name, field])).values()
    );

    // Input тип (без id, обычно)
    // Input type (without id usually)
    const inputFields = uniqueFields.filter((f) => f.name !== 'id');

    models.push({
      name: `${entityName}Input`,
      fields: inputFields,
      isArray: false,
    });

    // Output тип (полная модель)
    // Output type (full model)
    models.push({
      name: entityName,
      fields: uniqueFields,
      isArray: false,
      apiEndpoint: inferAPIEndpoint(screenName, entityName),
    });
  }

  // Для профиля создаем User модель
  // For profile create User model
  else if (screenType === 'profile') {
    const userFields = [
      ...getStandardFieldsForEntity('User'),
      ...extractFieldsFromNode(node),
    ];

    const uniqueFields = Array.from(
      new Map(userFields.map((field) => [field.name, field])).values()
    );

    models.push({
      name: 'User',
      fields: uniqueFields,
      isArray: false,
      apiEndpoint: '/api/user/profile',
    });
  }

  // Если тип экрана неизвестен, создаем базовую модель
  // If screen type is unknown, create basic model
  else {
    const fields = extractFieldsFromNode(node);

    if (fields.length > 0) {
      models.push({
        name: entityName,
        fields: [
          { name: 'id', type: 'string', nullable: false },
          ...fields,
        ],
        isArray: false,
      });
    }
  }

  return models;
}

/**
 * Генерирует TypeScript интерфейсы из моделей данных
 * Generates TypeScript interfaces from data models
 *
 * @param models - Массив моделей данных
 * @returns TypeScript код интерфейсов
 */
export function generateTypeDefinitions(models: DataModel[]): string {
  let code = '// Автоматически сгенерированные типы данных\n';
  code += '// Auto-generated data types\n\n';

  models.forEach((model) => {
    code += `/**\n`;
    code += ` * Модель данных: ${model.name}\n`;
    code += ` * Data model: ${model.name}\n`;
    if (model.apiEndpoint) {
      code += ` * API endpoint: ${model.apiEndpoint}\n`;
    }
    code += ` */\n`;
    code += `export interface ${model.name} {\n`;

    model.fields.forEach((field) => {
      const nullable = field.nullable ? '| null' : '';
      // Нормализуем имя поля (транслитерация кириллицы)
      // Normalize field name (Cyrillic transliteration)
      const fieldName = normalizeStyleName(field.name);
      let fieldType: string;

      if (field.type === 'array' && field.arrayItemType) {
        fieldType = `${field.arrayItemType}[]`;
      } else if (field.type === 'object' && field.nestedFields) {
        // Для вложенных объектов генерируем inline тип
        // For nested objects generate inline type
        fieldType = '{\n';
        field.nestedFields.forEach((nested) => {
          const nestedNullable = nested.nullable ? '| null' : '';
          fieldType += `    ${nested.name}: ${nested.type}${nestedNullable};\n`;
        });
        fieldType += '  }';
      } else {
        fieldType = field.type;
      }

      code += `  ${fieldName}: ${fieldType}${nullable};\n`;
    });

    code += `}\n\n`;
  });

  // Для моделей массивов добавляем тип ответа
  // For array models add response type
  const arrayModels = models.filter((m) => m.isArray);
  if (arrayModels.length > 0) {
    arrayModels.forEach((model) => {
      code += `/**\n`;
      code += ` * Тип ответа для списка ${model.name}\n`;
      code += ` * Response type for ${model.name} list\n`;
      code += ` */\n`;
      code += `export interface ${model.name}ListResponse {\n`;
      code += `  data: ${model.name}[];\n`;
      code += `  total: number;\n`;
      code += `  page?: number;\n`;
      code += `  pageSize?: number;\n`;
      code += `}\n\n`;
    });
  }

  return code;
}

/**
 * Выводит API endpoint из названия экрана и модели
 * Infers API endpoint from screen name and model
 *
 * @param screenName - Название экрана
 * @param modelName - Название модели
 * @returns API endpoint
 */
export function inferAPIEndpoint(screenName: string, modelName: string): string {
  const screenType = detectScreenType(screenName, { name: screenName });
  const entity = modelName.toLowerCase();

  // Для списочных экранов
  // For list screens
  if (screenType === 'list') {
    return `/api/${entity}s`;
  }

  // Для экранов деталей
  // For detail screens
  if (screenType === 'detail') {
    return `/api/${entity}/:id`;
  }

  // Для форм
  // For forms
  if (screenType === 'form') {
    if (screenName.toLowerCase().includes('create') || screenName.toLowerCase().includes('add')) {
      return `/api/${entity}`;
    }
    if (screenName.toLowerCase().includes('edit') || screenName.toLowerCase().includes('update')) {
      return `/api/${entity}/:id`;
    }
  }

  // По умолчанию
  // Default
  return `/api/${entity}`;
}

/**
 * Генерирует React Query хуки для загрузки данных
 * Generates React Query hooks for data fetching
 *
 * @param models - Массив моделей данных
 * @param screenName - Название экрана
 * @returns TypeScript код с React Query хуками
 */
export function generateReactQueryHooks(models: DataModel[], screenName: string): string {
  let code = '// Автоматически сгенерированные React Query хуки\n';
  code += '// Auto-generated React Query hooks\n\n';
  code += "import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';\n";
  code += "import { api } from '@/services/api'; // TODO: Настройте путь к вашему API клиенту\n\n";

  const screenType = detectScreenType(screenName, { name: screenName });

  models.forEach((model) => {
    if (model.isArray) {
      // Хук для получения списка
      // Hook for fetching list
      const hookName = `use${model.name}s`;
      const queryKey = `${model.name.toLowerCase()}s`;

      code += `/**\n`;
      code += ` * Хук для получения списка ${model.name}\n`;
      code += ` * Hook for fetching ${model.name} list\n`;
      code += ` */\n`;
      code += `export function ${hookName}() {\n`;
      code += `  return useQuery({\n`;
      code += `    queryKey: ['${queryKey}'],\n`;
      code += `    queryFn: async () => {\n`;
      code += `      const response = await api.get<${model.name}ListResponse>('${model.apiEndpoint}');\n`;
      code += `      return response.data;\n`;
      code += `    },\n`;
      code += `  });\n`;
      code += `}\n\n`;
    } else if (!model.name.endsWith('Input')) {
      // Хук для получения одного элемента
      // Hook for fetching single item
      const hookName = `use${model.name}`;
      const queryKey = model.name.toLowerCase();

      code += `/**\n`;
      code += ` * Хук для получения ${model.name} по ID\n`;
      code += ` * Hook for fetching ${model.name} by ID\n`;
      code += ` */\n`;
      code += `export function ${hookName}(id: string) {\n`;
      code += `  return useQuery({\n`;
      code += `    queryKey: ['${queryKey}', id],\n`;
      code += `    queryFn: async () => {\n`;
      code += `      const response = await api.get<${model.name}>(\`${model.apiEndpoint?.replace(':id', '${id}')}\`);\n`;
      code += `      return response.data;\n`;
      code += `    },\n`;
      code += `    enabled: !!id,\n`;
      code += `  });\n`;
      code += `}\n\n`;
    }
  });

  // Для форм создаем mutation хуки
  // For forms create mutation hooks
  if (screenType === 'form') {
    const mainModel = models.find((m) => !m.name.endsWith('Input'));
    const inputModel = models.find((m) => m.name.endsWith('Input'));

    if (mainModel && inputModel) {
      const entityName = mainModel.name;
      const inputTypeName = inputModel.name;

      // Create mutation
      code += `/**\n`;
      code += ` * Хук для создания ${entityName}\n`;
      code += ` * Hook for creating ${entityName}\n`;
      code += ` */\n`;
      code += `export function useCreate${entityName}() {\n`;
      code += `  const queryClient = useQueryClient();\n\n`;
      code += `  return useMutation({\n`;
      code += `    mutationFn: async (data: ${inputTypeName}) => {\n`;
      code += `      const response = await api.post<${entityName}>('${mainModel.apiEndpoint}', data);\n`;
      code += `      return response.data;\n`;
      code += `    },\n`;
      code += `    onSuccess: () => {\n`;
      code += `      // Инвалидируем кеш списка после создания\n`;
      code += `      // Invalidate list cache after creation\n`;
      code += `      queryClient.invalidateQueries({ queryKey: ['${entityName.toLowerCase()}s'] });\n`;
      code += `    },\n`;
      code += `  });\n`;
      code += `}\n\n`;

      // Update mutation
      code += `/**\n`;
      code += ` * Хук для обновления ${entityName}\n`;
      code += ` * Hook for updating ${entityName}\n`;
      code += ` */\n`;
      code += `export function useUpdate${entityName}() {\n`;
      code += `  const queryClient = useQueryClient();\n\n`;
      code += `  return useMutation({\n`;
      code += `    mutationFn: async ({ id, data }: { id: string; data: Partial<${inputTypeName}> }) => {\n`;
      code += `      const response = await api.put<${entityName}>(\`${mainModel.apiEndpoint?.replace(':id', '${id}')}\`, data);\n`;
      code += `      return response.data;\n`;
      code += `    },\n`;
      code += `    onSuccess: (_, variables) => {\n`;
      code += `      // Инвалидируем кеш элемента и списка после обновления\n`;
      code += `      // Invalidate item and list cache after update\n`;
      code += `      queryClient.invalidateQueries({ queryKey: ['${entityName.toLowerCase()}', variables.id] });\n`;
      code += `      queryClient.invalidateQueries({ queryKey: ['${entityName.toLowerCase()}s'] });\n`;
      code += `    },\n`;
      code += `  });\n`;
      code += `}\n\n`;

      // Delete mutation
      code += `/**\n`;
      code += ` * Хук для удаления ${entityName}\n`;
      code += ` * Hook for deleting ${entityName}\n`;
      code += ` */\n`;
      code += `export function useDelete${entityName}() {\n`;
      code += `  const queryClient = useQueryClient();\n\n`;
      code += `  return useMutation({\n`;
      code += `    mutationFn: async (id: string) => {\n`;
      code += `      await api.delete(\`${mainModel.apiEndpoint?.replace(':id', '${id}')}\`);\n`;
      code += `    },\n`;
      code += `    onSuccess: (_, id) => {\n`;
      code += `      // Инвалидируем кеш после удаления\n`;
      code += `      // Invalidate cache after deletion\n`;
      code += `      queryClient.invalidateQueries({ queryKey: ['${entityName.toLowerCase()}', id] });\n`;
      code += `      queryClient.invalidateQueries({ queryKey: ['${entityName.toLowerCase()}s'] });\n`;
      code += `    },\n`;
      code += `  });\n`;
      code += `}\n\n`;
    }
  }

  return code;
}
