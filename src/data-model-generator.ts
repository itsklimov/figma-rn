/**
 * Data model and API type generator from Figma screens
 * Data model and API type generator from Figma screens
 *
 * Analyzes screen content to infer:
 * - TypeScript interfaces for data
 * - React Query hooks for data fetching
 * - API endpoint structure
 */

import { normalizeStyleName } from './style-normalizer.js';

/**
 * Data field interface
 * Data field interface
 */
export interface DataField {
  /** Field name */
  name: string;
  /** Field type */
  type: 'string' | 'number' | 'boolean' | 'Date' | 'array' | 'object';
  /** Whether field can be null */
  nullable: boolean;
  /** Array item type (if type === 'array') */
  arrayItemType?: string;
  /** Nested fields (if type === 'object') */
  nestedFields?: DataField[];
}

/**
 * Data model interface
 * Data model interface
 */
export interface DataModel {
  /** Model name (e.g., "Product", "User") */
  name: string;
  /** Model fields */
  fields: DataField[];
  /** Whether model is an array */
  isArray: boolean;
  /** API endpoint for fetching data */
  apiEndpoint?: string;
}

/**
 * React Query hook interface
 * React Query hook interface
 */
export interface APIHook {
  /** Hook name (e.g., "useProducts") */
  hookName: string;
  /** API endpoint */
  endpoint: string;
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Request type (for POST/PUT) */
  requestType?: string;
  /** Response type */
  responseType: string;
}

/**
 * Detects screen type by name and structure
 * Detects screen type by name and structure
 *
 * @param screenName - Screen name
 * @param node - Figma node
 * @returns Screen type
 */
function detectScreenType(
  screenName: string,
  node: any
): 'list' | 'detail' | 'form' | 'profile' | 'unknown' {
  const normalizedName = screenName.toLowerCase();

  // List screens
  // List screens
  if (
    normalizedName.includes('list') ||
    normalizedName.includes('catalog') ||
    normalizedName.includes('catalog') ||
    normalizedName.includes('list') ||
    normalizedName.includes('items') ||
    normalizedName.includes('products') ||
    normalizedName.includes('orders') ||
    normalizedName.includes('visits') ||
    normalizedName.includes('masters')
  ) {
    return 'list';
  }

  // Detail screens
  // Detail screens
  if (
    normalizedName.includes('detail') ||
    normalizedName.includes('details') ||
    normalizedName.includes('card') ||
    normalizedName.includes('card') ||
    normalizedName.includes('information') ||
    normalizedName.includes('info')
  ) {
    return 'detail';
  }

  // Forms
  // Form screens
  if (
    normalizedName.includes('form') ||
    normalizedName.includes('edit') ||
    normalizedName.includes('create') ||
    normalizedName.includes('add') ||
    normalizedName.includes('form') ||
    normalizedName.includes('edit') ||
    normalizedName.includes('create')
  ) {
    return 'form';
  }

  // Profile
  // Profile screens
  if (
    normalizedName.includes('profile') ||
    normalizedName.includes('profile') ||
    normalizedName.includes('account') ||
    normalizedName.includes('account')
  ) {
    return 'profile';
  }

  return 'unknown';
}

/**
 * Extracts entity name from screen name
 * Extracts entity name from screen name
 *
 * @param screenName - Screen name
 * @returns Entity name in PascalCase
 */
function extractEntityName(screenName: string): string {
  const normalizedName = screenName
    .replace(/Screen|Page|View/gi, '')
    .replace(/List|Catalog|Details?|Form|Card/gi, '')
    .trim();

  // Convert to PascalCase
  const words = normalizedName.split(/[\s_-]+/);
  const pascalCase = words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');

  // Remove plural for English words
  if (pascalCase.endsWith('s') && pascalCase.length > 2) {
    return pascalCase.slice(0, -1);
  }

  return pascalCase || 'Item';
}

/**
 * Determines field type by text content
 * Determines field type by text content
 *
 * @param text - Text content
 * @param fieldName - Expected field name
 * @returns Field type
 */
function inferFieldType(
  text: string,
  fieldName: string
): 'string' | 'number' | 'boolean' | 'Date' {
  const lowerFieldName = fieldName.toLowerCase();

  // Boolean values
  // Boolean values
  if (
    text === 'true' ||
    text === 'false' ||
    lowerFieldName.startsWith('is') ||
    lowerFieldName.startsWith('has')
  ) {
    return 'boolean';
  }

  // Number values: prices
  // Number values: prices
  if (
    /^\d+[\s]*₽?$/.test(text) ||
    /^\$?\d+(\.\d{2})?$/.test(text) ||
    lowerFieldName.includes('price') ||
    lowerFieldName.includes('cost') ||
    lowerFieldName.includes('amount') ||
    lowerFieldName.includes('price') ||
    lowerFieldName.includes('cost')
  ) {
    return 'number';
  }

  // Number values: rating
  // Number values: rating
  if (
    /^\d+\.\d+$/.test(text) ||
    lowerFieldName.includes('rating') ||
    lowerFieldName.includes('rating') ||
    lowerFieldName.includes('score')
  ) {
    return 'number';
  }

  // Number values: count
  // Number values: count
  if (
    /^\d+$/.test(text) ||
    lowerFieldName.includes('count') ||
    lowerFieldName.includes('quantity') ||
    lowerFieldName.includes('quantity')
  ) {
    return 'number';
  }

  // Dates
  // Dates
  if (
    /\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/.test(text) ||
    /\d+\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(text) ||
    /\d+\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(text) ||
    lowerFieldName.includes('date') ||
    lowerFieldName.includes('date') ||
    lowerFieldName.includes('created') ||
    lowerFieldName.includes('updated')
  ) {
    return 'Date';
  }

  // Time
  // Time
  if (
    /\d{1,2}:\d{2}/.test(text) ||
    lowerFieldName.includes('time') ||
    lowerFieldName.includes('time')
  ) {
    return 'string'; // Store time as string for simplicity
  }

  // Default to string
  // Default to string
  return 'string';
}

/**
 * Extracts fields from text elements in node
 * Extracts fields from text elements in node
 *
 * @param node - Figma node
 * @returns Array of data fields
 */
function extractFieldsFromNode(node: any): DataField[] {
  const fields: DataField[] = [];
  const textContents = new Map<string, string>();

  /**
   * Recursively collects text elements
   * Recursively collects text elements
   */
  function collectTextContent(n: any, depth: number = 0) {
    if (depth > 5) return; // Limit recursion depth

    if (n.type === 'TEXT' && n.characters && n.characters.trim()) {
      const name = n.name || `field_${textContents.size}`;
      const text = n.characters.trim();

      // Skip too long texts (likely paragraphs)
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

  // Convert found texts to fields
  // Convert found texts to fields
  const processedNames = new Set<string>();

  textContents.forEach((text, nodeName) => {
    // Generate field name from node name
    // Generate field name from node name
    let fieldName = nodeName
      .replace(/\d+/g, '')
      .replace(/[^a-zA-Za-zA-Z]/g, ' ')
      .trim()
      .split(/\s+/)
      .filter((word) => word.length > 0)
      .map((word, idx) =>
        idx === 0
          ? word.toLowerCase()
          : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      )
      .join('');

    // If name is empty or already used, generate new one
    // If name is empty or already used, generate new one
    if (!fieldName || processedNames.has(fieldName)) {
      fieldName = `field${processedNames.size + 1}`;
    }

    processedNames.add(fieldName);

    const type = inferFieldType(text, fieldName);

    // Normalize field name (Cyrillic transliteration)
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
 * Determines specific fields based on entity type
 * Determines specific fields based on entity type
 *
 * @param entityName - Entity name
 * @returns Array of standard fields for this entity
 */
function getStandardFieldsForEntity(entityName: string): DataField[] {
  const lowerName = entityName.toLowerCase();

  // Common fields for all entities
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
  if (lowerName.includes('product') || lowerName.includes('product')) {
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
  if (lowerName.includes('order') || lowerName.includes('order')) {
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
  if (lowerName.includes('visit') || lowerName.includes('visit')) {
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
  if (lowerName.includes('master') || lowerName.includes('master')) {
    return [
      ...commonFields,
      { name: 'name', type: 'string', nullable: false },
      { name: 'specialty', type: 'string', nullable: false },
      { name: 'rating', type: 'number', nullable: false },
      { name: 'avatar', type: 'string', nullable: true },
      { name: 'experience', type: 'number', nullable: true },
    ];
  }

  // Default - basic fields
  // Default - basic fields
  return [
    ...commonFields,
    { name: 'name', type: 'string', nullable: false },
    { name: 'createdAt', type: 'Date', nullable: false },
  ];
}

/**
 * Infers data models from Figma node
 * Infers data models from Figma node
 *
 * @param node - Figma node to analyze
 * @param screenName - Screen name
 * @returns Array of data models
 */
export function inferDataModels(node: any, screenName: string): DataModel[] {
  const models: DataModel[] = [];

  const screenType = detectScreenType(screenName, node);
  const entityName = extractEntityName(screenName);

  // For list screens create array model
  // For list screens create array model
  if (screenType === 'list') {
    const itemFields = [
      ...getStandardFieldsForEntity(entityName),
      ...extractFieldsFromNode(node),
    ];

    // Remove duplicate fields
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

  // For detail screens create single object model
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

  // For forms create input and output types
  // For forms create input and output types
  else if (screenType === 'form') {
    const itemFields = [
      ...getStandardFieldsForEntity(entityName),
      ...extractFieldsFromNode(node),
    ];

    const uniqueFields = Array.from(
      new Map(itemFields.map((field) => [field.name, field])).values()
    );

    // Input type (without id usually)
    // Input type (without id usually)
    const inputFields = uniqueFields.filter((f) => f.name !== 'id');

    models.push({
      name: `${entityName}Input`,
      fields: inputFields,
      isArray: false,
    });

    // Output type (full model)
    // Output type (full model)
    models.push({
      name: entityName,
      fields: uniqueFields,
      isArray: false,
      apiEndpoint: inferAPIEndpoint(screenName, entityName),
    });
  }

  // For profile create User model
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

  // If screen type is unknown, create basic model
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
 * Generates TypeScript interfaces from data models
 * Generates TypeScript interfaces from data models
 *
 * @param models - Array of data models
 * @returns TypeScript code for interfaces
 */
export function generateTypeDefinitions(models: DataModel[]): string {
  let code = '// Auto-generated data types\n';
  code += '// Auto-generated data types\n\n';

  models.forEach((model) => {
    code += `/**\n`;
    code += ` * Data model: ${model.name}\n`;
    code += ` * Data model: ${model.name}\n`;
    if (model.apiEndpoint) {
      code += ` * API endpoint: ${model.apiEndpoint}\n`;
    }
    code += ` */\n`;
    code += `export interface ${model.name} {\n`;

    model.fields.forEach((field) => {
      const nullable = field.nullable ? '| null' : '';
      // Normalize field name (Cyrillic transliteration)
      // Normalize field name (Cyrillic transliteration)
      const fieldName = normalizeStyleName(field.name);
      let fieldType: string;

      if (field.type === 'array' && field.arrayItemType) {
        fieldType = `${field.arrayItemType}[]`;
      } else if (field.type === 'object' && field.nestedFields) {
        // For nested objects generate inline type
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

  // For array models add response type
  // For array models add response type
  const arrayModels = models.filter((m) => m.isArray);
  if (arrayModels.length > 0) {
    arrayModels.forEach((model) => {
      code += `/**\n`;
      code += ` * Response type for list ${model.name}\n`;
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
 * Infers API endpoint from screen name and model
 * Infers API endpoint from screen name and model
 *
 * @param screenName - Screen name
 * @param modelName - Model name
 * @returns API endpoint
 */
export function inferAPIEndpoint(screenName: string, modelName: string): string {
  const screenType = detectScreenType(screenName, { name: screenName });
  const entity = modelName.toLowerCase();

  // For list screens
  // For list screens
  if (screenType === 'list') {
    return `/api/${entity}s`;
  }

  // For detail screens
  // For detail screens
  if (screenType === 'detail') {
    return `/api/${entity}/:id`;
  }

  // For forms
  // For forms
  if (screenType === 'form') {
    if (screenName.toLowerCase().includes('create') || screenName.toLowerCase().includes('add')) {
      return `/api/${entity}`;
    }
    if (screenName.toLowerCase().includes('edit') || screenName.toLowerCase().includes('update')) {
      return `/api/${entity}/:id`;
    }
  }

  // Default
  // Default
  return `/api/${entity}`;
}

/**
 * Generates React Query hooks for data fetching
 * Generates React Query hooks for data fetching
 *
 * @param models - Array of data models
 * @param screenName - Screen name
 * @returns TypeScript code with React Query hooks
 */
export function generateReactQueryHooks(models: DataModel[], screenName: string): string {
  let code = '// Auto-generated React Query hooks\n';
  code += '// Auto-generated React Query hooks\n\n';
  code += "import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';\n";
  code += "import { api } from '@/services/api'; // TODO: Configure path to your API client\n\n";

  const screenType = detectScreenType(screenName, { name: screenName });

  models.forEach((model) => {
    if (model.isArray) {
      // Hook for fetching list
      // Hook for fetching list
      const hookName = `use${model.name}s`;
      const queryKey = `${model.name.toLowerCase()}s`;

      code += `/**\n`;
      code += ` * Hook for fetching list ${model.name}\n`;
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
      // Hook for fetching single item
      // Hook for fetching single item
      const hookName = `use${model.name}`;
      const queryKey = model.name.toLowerCase();

      code += `/**\n`;
      code += ` * Hook for fetching ${model.name} by ID\n`;
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

  // For forms create mutation hooks
  // For forms create mutation hooks
  if (screenType === 'form') {
    const mainModel = models.find((m) => !m.name.endsWith('Input'));
    const inputModel = models.find((m) => m.name.endsWith('Input'));

    if (mainModel && inputModel) {
      const entityName = mainModel.name;
      const inputTypeName = inputModel.name;

      // Create mutation
      code += `/**\n`;
      code += ` * Hook for creating ${entityName}\n`;
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
      code += `      // Invalidate list cache after creation\n`;
      code += `      // Invalidate list cache after creation\n`;
      code += `      queryClient.invalidateQueries({ queryKey: ['${entityName.toLowerCase()}s'] });\n`;
      code += `    },\n`;
      code += `  });\n`;
      code += `}\n\n`;

      // Update mutation
      code += `/**\n`;
      code += ` * Hook for updating ${entityName}\n`;
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
      code += `      // Invalidate item and list cache after update\n`;
      code += `      // Invalidate item and list cache after update\n`;
      code += `      queryClient.invalidateQueries({ queryKey: ['${entityName.toLowerCase()}', variables.id] });\n`;
      code += `      queryClient.invalidateQueries({ queryKey: ['${entityName.toLowerCase()}s'] });\n`;
      code += `    },\n`;
      code += `  });\n`;
      code += `}\n\n`;

      // Delete mutation
      code += `/**\n`;
      code += ` * Hook for deleting ${entityName}\n`;
      code += ` * Hook for deleting ${entityName}\n`;
      code += ` */\n`;
      code += `export function useDelete${entityName}() {\n`;
      code += `  const queryClient = useQueryClient();\n\n`;
      code += `  return useMutation({\n`;
      code += `    mutationFn: async (id: string) => {\n`;
      code += `      await api.delete(\`${mainModel.apiEndpoint?.replace(':id', '${id}')}\`);\n`;
      code += `    },\n`;
      code += `    onSuccess: (_, id) => {\n`;
      code += `      // Invalidate cache after deletion\n`;
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
