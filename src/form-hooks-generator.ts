/**
 * Form State Hooks Generator для Figma MCP Server
 * Автоматическое обнаружение форм и генерация хуков управления состоянием
 * Form State Hooks Generator for Figma MCP Server
 * Automatic form detection and state management hooks generation
 */

import { compareTwoStrings } from 'string-similarity';
import { normalizeStyleName } from './style-normalizer.js';

/**
 * Тип поля формы
 * Form field type
 */
export type FormFieldType =
  | 'text'
  | 'email'
  | 'password'
  | 'phone'
  | 'number'
  | 'checkbox'
  | 'radio'
  | 'select'
  | 'textarea';

/**
 * Интерфейс поля формы
 * Form field interface
 */
export interface FormField {
  name: string;
  type: FormFieldType;
  label: string;
  placeholder?: string;
  required: boolean;
  validation?: {
    pattern?: string;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
  };
  options?: string[]; // для select и radio
}

/**
 * Результат обнаружения формы
 * Form detection result
 */
export interface FormDetection {
  fields: FormField[];
  hasSubmitButton: boolean;
  submitLabel: string;
  formName: string;
  grouping?: {
    sections: string[];
    fieldsBySection: Record<string, string[]>;
  };
}

/**
 * Ключевые слова для обнаружения типов полей
 * Keywords for detecting field types
 */
const FIELD_TYPE_KEYWORDS = {
  email: ['email', 'e-mail', 'почта', 'емейл', 'эл.почта'],
  password: ['password', 'пароль', 'pass', 'pwd'],
  phone: ['phone', 'телефон', 'tel', 'mobile', 'мобильный'],
  number: ['number', 'номер', 'количество', 'count', 'age', 'возраст'],
  textarea: ['textarea', 'message', 'comment', 'описание', 'description', 'текст'],
  checkbox: ['checkbox', 'check', 'согласие', 'agree', 'accept', 'галочка'],
  radio: ['radio', 'выбор', 'option', 'choice'],
  select: ['select', 'dropdown', 'выпадающий', 'список', 'выбрать'],
};

/**
 * Ключевые слова для обязательных полей
 * Keywords for required fields
 */
const REQUIRED_KEYWORDS = [
  'required',
  'обязательно',
  'обязательное',
  '*',
  'required field',
  'обязательное поле',
];

/**
 * Ключевые слова для кнопок отправки
 * Keywords for submit buttons
 */
const SUBMIT_KEYWORDS = [
  'submit',
  'send',
  'save',
  'отправить',
  'сохранить',
  'создать',
  'войти',
  'зарегистрироваться',
  'register',
  'login',
  'sign in',
  'sign up',
  'continue',
  'продолжить',
  'далее',
  'next',
];

/**
 * Нормализация строки для сравнения
 * Normalize string for comparison
 * @param str - исходная строка
 * @returns нормализованная строка
 */
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-zа-я0-9\s]/g, '')
    .trim();
}

/**
 * Определение типа поля по имени и содержимому
 * Determine field type by name and content
 * @param name - имя узла
 * @param text - текстовое содержимое
 * @returns тип поля или null
 */
function inferFieldType(name: string, text?: string): FormFieldType | null {
  const normalized = normalizeString(name + ' ' + (text || ''));

  // Проверяем каждый тип поля
  for (const [type, keywords] of Object.entries(FIELD_TYPE_KEYWORDS)) {
    for (const keyword of keywords) {
      if (normalized.includes(keyword)) {
        return type as FormFieldType;
      }
    }
  }

  return null;
}

/**
 * Проверка, является ли поле обязательным
 * Check if field is required
 * @param name - имя узла
 * @param text - текстовое содержимое
 * @returns true если поле обязательно
 */
function isFieldRequired(name: string, text?: string): boolean {
  const normalized = normalizeString(name + ' ' + (text || ''));

  return REQUIRED_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

/**
 * Определение, является ли узел полем ввода
 * Determine if node is an input field
 * @param node - узел Figma
 * @returns true если это поле ввода
 */
function isInputField(node: any): boolean {
  if (!node) return false;

  const name = normalizeString(node.name || '');

  // 1. Проверяем по имени
  if (
    name.includes('input') ||
    name.includes('field') ||
    name.includes('textfield') ||
    name.includes('ввод') ||
    name.includes('поле')
  ) {
    return true;
  }

  // 2. Проверяем по типу: прямоугольник с текстом-placeholder'ом
  if (node.type === 'FRAME' || node.type === 'RECTANGLE') {
    const hasPlaceholder = node.children?.some(
      (child: any) =>
        child.type === 'TEXT' &&
        (normalizeString(child.characters || '').includes('placeholder') ||
          normalizeString(child.characters || '').includes('введите') ||
          normalizeString(child.name || '').includes('placeholder'))
    );

    if (hasPlaceholder) return true;

    // Проверяем наличие границ (border) - признак input
    if (node.strokes && node.strokes.length > 0) {
      return true;
    }
  }

  return false;
}

/**
 * Определение, является ли узел чекбоксом
 * Determine if node is a checkbox
 * @param node - узел Figma
 * @returns true если это чекбокс
 */
function isCheckbox(node: any): boolean {
  if (!node) return false;

  const name = normalizeString(node.name || '');

  // Проверяем по имени
  if (
    name.includes('checkbox') ||
    name.includes('check') ||
    name.includes('галочка') ||
    name.includes('согласие')
  ) {
    return true;
  }

  // Проверяем по форме: маленький квадрат
  if (
    (node.type === 'RECTANGLE' || node.type === 'FRAME') &&
    node.absoluteBoundingBox
  ) {
    const { width, height } = node.absoluteBoundingBox;
    // Чекбоксы обычно 16-32px, квадратные
    if (
      width >= 16 &&
      width <= 32 &&
      height >= 16 &&
      height <= 32 &&
      Math.abs(width - height) < 4
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Определение, является ли узел радио-кнопкой
 * Determine if node is a radio button
 * @param node - узел Figma
 * @returns true если это радио-кнопка
 */
function isRadioButton(node: any): boolean {
  if (!node) return false;

  const name = normalizeString(node.name || '');

  // Проверяем по имени
  if (name.includes('radio') || name.includes('радио') || name.includes('выбор')) {
    return true;
  }

  // Проверяем по форме: круг
  if (node.type === 'ELLIPSE' && node.absoluteBoundingBox) {
    const { width, height } = node.absoluteBoundingBox;
    // Радио-кнопки обычно 16-32px, круглые
    if (
      width >= 16 &&
      width <= 32 &&
      height >= 16 &&
      height <= 32 &&
      Math.abs(width - height) < 2
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Определение, является ли узел селектом/dropdown
 * Determine if node is a select/dropdown
 * @param node - узел Figma
 * @returns true если это селект
 */
function isSelect(node: any): boolean {
  if (!node) return false;

  const name = normalizeString(node.name || '');

  // Проверяем по имени
  if (
    name.includes('select') ||
    name.includes('dropdown') ||
    name.includes('выпадающ') ||
    name.includes('список')
  ) {
    return true;
  }

  // Проверяем наличие иконки chevron (стрелки вниз)
  const hasChevron = node.children?.some(
    (child: any) =>
      normalizeString(child.name || '').includes('chevron') ||
      normalizeString(child.name || '').includes('arrow') ||
      normalizeString(child.name || '').includes('стрелка')
  );

  return hasChevron;
}

/**
 * Определение, является ли узел кнопкой отправки
 * Determine if node is a submit button
 * @param node - узел Figma
 * @returns true если это кнопка отправки
 */
function isSubmitButton(node: any): boolean {
  if (!node) return false;

  const name = normalizeString(node.name || '');

  // Проверяем по имени
  if (name.includes('button') || name.includes('btn') || name.includes('кнопка')) {
    // Проверяем, содержит ли текст submit-ключевые слова
    const hasSubmitText = SUBMIT_KEYWORDS.some((keyword) => name.includes(keyword));

    if (hasSubmitText) return true;

    // Проверяем текстовое содержимое дочерних элементов
    const buttonText = node.children
      ?.filter((child: any) => child.type === 'TEXT')
      .map((child: any) => normalizeString(child.characters || ''))
      .join(' ');

    if (buttonText) {
      return SUBMIT_KEYWORDS.some((keyword) => buttonText.includes(keyword));
    }
  }

  return false;
}

/**
 * Извлечение label из узла или его окружения
 * Extract label from node or its surroundings
 * @param node - узел Figma
 * @param parent - родительский узел
 * @returns label или пустая строка
 */
function extractLabel(node: any, parent?: any): string {
  // 1. Ищем в имени узла
  const nodeName = node.name || '';
  if (nodeName && !nodeName.toLowerCase().includes('input')) {
    return nodeName;
  }

  // 2. Ищем текстовый узел-sibling с label
  if (parent && parent.children) {
    const nodeIndex = parent.children.indexOf(node);
    if (nodeIndex > 0) {
      const prevSibling = parent.children[nodeIndex - 1];
      if (prevSibling && prevSibling.type === 'TEXT') {
        return prevSibling.characters || prevSibling.name || '';
      }
    }
  }

  // 3. Ищем текстовый узел внутри
  const textChild = node.children?.find((child: any) => child.type === 'TEXT');
  if (textChild && textChild.characters) {
    return textChild.characters;
  }

  return 'Field';
}

/**
 * Извлечение placeholder из узла
 * Extract placeholder from node
 * @param node - узел Figma
 * @returns placeholder или undefined
 */
function extractPlaceholder(node: any): string | undefined {
  if (!node.children) return undefined;

  const placeholderNode = node.children.find(
    (child: any) =>
      child.type === 'TEXT' &&
      (normalizeString(child.name || '').includes('placeholder') ||
        normalizeString(child.characters || '').includes('введите'))
  );

  return placeholderNode?.characters;
}

/**
 * Генерация имени поля из label
 * Generate field name from label
 * @param label - метка поля
 * @returns имя поля в camelCase
 */
function generateFieldName(label: string): string {
  const normalized = label
    .replace(/[^a-zA-Zа-яА-Я0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .map((word, index) => {
      if (index === 0) return word.toLowerCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join('');

  return normalized || 'field';
}

/**
 * Рекурсивное обнаружение элементов формы в дереве узлов
 * Recursively detect form elements in node tree
 * @param node - узел Figma
 * @param parent - родительский узел
 * @param fields - массив накопленных полей
 * @param submitInfo - информация о кнопке отправки
 */
function detectFormElementsRecursive(
  node: any,
  parent: any,
  fields: FormField[],
  submitInfo: { found: boolean; label: string }
): void {
  if (!node) return;

  // Проверяем, является ли узел кнопкой отправки
  if (isSubmitButton(node)) {
    submitInfo.found = true;
    const buttonText =
      node.children
        ?.filter((child: any) => child.type === 'TEXT')
        .map((child: any) => child.characters)
        .join(' ') ||
      node.name ||
      'Submit';
    submitInfo.label = buttonText;
    return;
  }

  // Определяем тип элемента формы
  let fieldType: FormFieldType | null = null;

  if (isInputField(node)) {
    fieldType = 'text'; // по умолчанию
  } else if (isCheckbox(node)) {
    fieldType = 'checkbox';
  } else if (isRadioButton(node)) {
    fieldType = 'radio';
  } else if (isSelect(node)) {
    fieldType = 'select';
  }

  // Если обнаружен элемент формы, создаем поле
  if (fieldType) {
    const label = extractLabel(node, parent);
    const placeholder = extractPlaceholder(node);
    const name = generateFieldName(label);

    // Уточняем тип на основе label/placeholder
    const inferredType = inferFieldType(label, placeholder);
    if (inferredType) {
      fieldType = inferredType;
    }

    const required = isFieldRequired(label, placeholder);

    const field: FormField = {
      name,
      type: fieldType,
      label,
      placeholder,
      required,
    };

    // Добавляем валидацию на основе типа
    if (fieldType === 'email') {
      field.validation = {
        pattern: '^[\\w-\\.]+@([\\w-]+\\.)+[\\w-]{2,4}$',
      };
    } else if (fieldType === 'phone') {
      field.validation = {
        pattern: '^[+]?[(]?[0-9]{1,4}[)]?[-\\s\\.]?[(]?[0-9]{1,4}[)]?[-\\s\\.]?[0-9]{1,9}$',
      };
    } else if (fieldType === 'password') {
      field.validation = {
        minLength: 8,
      };
    }

    fields.push(field);
  }

  // Рекурсивно обрабатываем дочерние элементы
  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      detectFormElementsRecursive(child, node, fields, submitInfo);
    }
  }
}

/**
 * Обнаружение элементов формы в узле Figma
 * Detect form elements in Figma node
 * @param node - корневой узел для анализа
 * @returns результат обнаружения формы
 */
export function detectFormElements(node: any): FormDetection {
  const fields: FormField[] = [];
  const submitInfo = { found: false, label: 'Submit' };

  detectFormElementsRecursive(node, null, fields, submitInfo);

  // Генерируем имя формы из имени узла
  const formName =
    generateFieldName(node.name || 'Form') + (node.name?.includes('Form') ? '' : 'Form');

  return {
    fields,
    hasSubmitButton: submitInfo.found,
    submitLabel: submitInfo.label,
    formName,
  };
}

/**
 * Генерация хука формы с использованием react-hook-form
 * Generate form hook using react-hook-form
 * @param detection - результат обнаружения формы
 * @param formName - имя формы
 * @returns код хука
 */
export function generateFormHook(detection: FormDetection, formName: string): string {
  const { fields } = detection;

  let code = `import { useForm } from 'react-hook-form';\n`;
  code += `import { zodResolver } from '@hookform/resolvers/zod';\n`;
  code += `import { ${formName}Schema, ${formName}Data } from './${formName}Schema';\n\n`;

  code += `/**\n`;
  code += ` * Хук для управления формой ${formName}\n`;
  code += ` * Form management hook for ${formName}\n`;
  code += ` */\n`;
  code += `export function use${formName}() {\n`;
  code += `  const {\n`;
  code += `    control,\n`;
  code += `    handleSubmit,\n`;
  code += `    formState: { errors, isSubmitting },\n`;
  code += `    reset,\n`;
  code += `  } = useForm<${formName}Data>({\n`;
  code += `    resolver: zodResolver(${formName}Schema),\n`;
  code += `    defaultValues: {\n`;

  // Отслеживаем использованные имена для предотвращения дубликатов
  // Track used names to prevent duplicates
  const usedNames = new Map<string, number>();

  fields.forEach((field) => {
    // Нормализуем и генерируем уникальное имя поля
    // Normalize and generate unique field name
    let baseName = normalizeStyleName(field.name);
    const count = usedNames.get(baseName) || 0;
    let fieldName = baseName;
    if (count > 0) {
      fieldName = `${baseName}${count + 1}`;
    }
    usedNames.set(baseName, count + 1);

    if (field.type === 'checkbox') {
      code += `      ${fieldName}: false,\n`;
    } else if (field.type === 'number') {
      code += `      ${fieldName}: 0,\n`;
    } else {
      code += `      ${fieldName}: '',\n`;
    }
  });

  code += `    },\n`;
  code += `  });\n\n`;

  code += `  const onSubmit = async (data: ${formName}Data) => {\n`;
  code += `    try {\n`;
  code += `      console.log('Form data:', data);\n`;
  code += `      // TODO: Реализовать отправку формы\n`;
  code += `      // TODO: Implement form submission\n`;
  code += `    } catch (error) {\n`;
  code += `      console.error('Form submission error:', error);\n`;
  code += `    }\n`;
  code += `  };\n\n`;

  code += `  return {\n`;
  code += `    control,\n`;
  code += `    handleSubmit: handleSubmit(onSubmit),\n`;
  code += `    errors,\n`;
  code += `    isSubmitting,\n`;
  code += `    reset,\n`;
  code += `  };\n`;
  code += `}\n`;

  return code;
}

/**
 * Генерация Zod схемы валидации
 * Generate Zod validation schema
 * @param detection - результат обнаружения формы
 * @returns код схемы
 */
export function generateZodSchema(detection: FormDetection): string {
  const { fields, formName } = detection;

  let code = `import { z } from 'zod';\n\n`;

  code += `/**\n`;
  code += ` * Zod схема валидации для ${formName}\n`;
  code += ` * Zod validation schema for ${formName}\n`;
  code += ` */\n`;
  code += `export const ${formName}Schema = z.object({\n`;

  // Отслеживаем использованные имена для предотвращения дубликатов
  // Track used names to prevent duplicates
  const usedNames = new Map<string, number>();

  fields.forEach((field) => {
    // Нормализуем и генерируем уникальное имя поля
    // Normalize and generate unique field name
    let baseName = normalizeStyleName(field.name);
    const count = usedNames.get(baseName) || 0;
    let fieldName = baseName;
    if (count > 0) {
      fieldName = `${baseName}${count + 1}`;
    }
    usedNames.set(baseName, count + 1);
    let zodType = '';

    switch (field.type) {
      case 'email':
        zodType = `z.string().email('Неверный формат email')`;
        break;
      case 'phone':
        zodType = `z.string().regex(/${field.validation?.pattern || '.+'}/, 'Неверный формат телефона')`;
        break;
      case 'password':
        zodType = `z.string().min(${field.validation?.minLength || 8}, 'Минимум ${field.validation?.minLength || 8} символов')`;
        break;
      case 'number':
        zodType = `z.number()`;
        if (field.validation?.min !== undefined) {
          zodType += `.min(${field.validation.min})`;
        }
        if (field.validation?.max !== undefined) {
          zodType += `.max(${field.validation.max})`;
        }
        break;
      case 'checkbox':
        zodType = `z.boolean()`;
        break;
      case 'select':
      case 'radio':
        if (field.options && field.options.length > 0) {
          zodType = `z.enum([${field.options.map((opt) => `'${opt}'`).join(', ')}])`;
        } else {
          zodType = `z.string()`;
        }
        break;
      case 'textarea':
        zodType = `z.string()`;
        if (field.validation?.minLength) {
          zodType += `.min(${field.validation.minLength})`;
        }
        if (field.validation?.maxLength) {
          zodType += `.max(${field.validation.maxLength})`;
        }
        break;
      default:
        zodType = `z.string()`;
        if (field.validation?.minLength) {
          zodType += `.min(${field.validation.minLength})`;
        }
        if (field.validation?.maxLength) {
          zodType += `.max(${field.validation.maxLength})`;
        }
    }

    if (!field.required && field.type !== 'checkbox') {
      zodType += `.optional()`;
    }

    code += `  ${fieldName}: ${zodType},\n`;
  });

  code += `});\n\n`;

  code += `/**\n`;
  code += ` * Тип данных формы\n`;
  code += ` * Form data type\n`;
  code += ` */\n`;
  code += `export type ${formName}Data = z.infer<typeof ${formName}Schema>;\n`;

  return code;
}

/**
 * Генерация React Native компонента формы
 * Generate React Native form component
 * @param detection - результат обнаружения формы
 * @param formName - имя формы
 * @returns код компонента
 */
export function generateFormComponent(detection: FormDetection, formName: string): string {
  const { fields, submitLabel } = detection;

  let code = `import React from 'react';\n`;
  code += `import { View, Text, StyleSheet } from 'react-native';\n`;
  code += `import { Controller } from 'react-hook-form';\n`;
  code += `import { use${formName} } from './use${formName}';\n`;
  code += `// TODO: Импортировать компоненты Input, Button, Checkbox и т.д.\n`;
  code += `// TODO: Import Input, Button, Checkbox components etc.\n\n`;

  code += `/**\n`;
  code += ` * Компонент формы ${formName}\n`;
  code += ` * ${formName} form component\n`;
  code += ` */\n`;
  code += `export function ${formName}() {\n`;
  code += `  const { control, handleSubmit, errors, isSubmitting } = use${formName}();\n\n`;

  code += `  return (\n`;
  code += `    <View style={styles.container}>\n`;
  code += `      <Text style={styles.title}>${formName}</Text>\n\n`;

  fields.forEach((field) => {
    code += `      {/* ${field.label} */}\n`;
    code += `      <Controller\n`;
    code += `        control={control}\n`;
    code += `        name="${field.name}"\n`;
    code += `        render={({ field: { onChange, onBlur, value } }) => (\n`;

    if (field.type === 'checkbox') {
      code += `          <Checkbox\n`;
      code += `            label="${field.label}"\n`;
      code += `            value={value}\n`;
      code += `            onChange={onChange}\n`;
      code += `            error={errors.${field.name}?.message}\n`;
      code += `          />\n`;
    } else if (field.type === 'select') {
      code += `          <Select\n`;
      code += `            label="${field.label}"\n`;
      code += `            value={value}\n`;
      code += `            onChange={onChange}\n`;
      code += `            placeholder="${field.placeholder || 'Выберите...'}"\n`;
      code += `            error={errors.${field.name}?.message}\n`;
      code += `          />\n`;
    } else if (field.type === 'textarea') {
      code += `          <TextArea\n`;
      code += `            label="${field.label}"\n`;
      code += `            value={value}\n`;
      code += `            onChangeText={onChange}\n`;
      code += `            onBlur={onBlur}\n`;
      code += `            placeholder="${field.placeholder || ''}"\n`;
      code += `            error={errors.${field.name}?.message}\n`;
      code += `          />\n`;
    } else {
      code += `          <Input\n`;
      code += `            label="${field.label}"\n`;
      code += `            value={value}\n`;
      code += `            onChangeText={onChange}\n`;
      code += `            onBlur={onBlur}\n`;
      code += `            placeholder="${field.placeholder || ''}"\n`;

      if (field.type === 'email') {
        code += `            keyboardType="email-address"\n`;
        code += `            autoCapitalize="none"\n`;
      } else if (field.type === 'phone') {
        code += `            keyboardType="phone-pad"\n`;
      } else if (field.type === 'number') {
        code += `            keyboardType="numeric"\n`;
      } else if (field.type === 'password') {
        code += `            secureTextEntry\n`;
      }

      code += `            error={errors.${field.name}?.message}\n`;
      code += `          />\n`;
    }

    code += `        )}\n`;
    code += `      />\n\n`;
  });

  code += `      <Button\n`;
  code += `        title="${submitLabel}"\n`;
  code += `        onPress={handleSubmit}\n`;
  code += `        disabled={isSubmitting}\n`;
  code += `        loading={isSubmitting}\n`;
  code += `      />\n`;
  code += `    </View>\n`;
  code += `  );\n`;
  code += `}\n\n`;

  code += `const styles = StyleSheet.create({\n`;
  code += `  container: {\n`;
  code += `    padding: 16,\n`;
  code += `  },\n`;
  code += `  title: {\n`;
  code += `    fontSize: 24,\n`;
  code += `    fontWeight: 'bold',\n`;
  code += `    marginBottom: 16,\n`;
  code += `  },\n`;
  code += `});\n`;

  return code;
}
