/**
 * Form State Hooks Generator for Figma MCP Server
 * Automatic form detection and state management hooks generation
 */

import { compareTwoStrings } from 'string-similarity';
import { normalizeStyleName } from './style-normalizer.js';

/**
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
  options?: string[]; // for select and radio
}

/**
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
 * Keywords for detecting field types
 */
const FIELD_TYPE_KEYWORDS = {
  email: ['email', 'e-mail'],
  password: ['password', 'pass', 'pwd'],
  phone: ['phone', 'tel', 'mobile'],
  number: ['number', 'count', 'age'],
  textarea: ['textarea', 'message', 'comment', 'description', 'text'],
  checkbox: ['checkbox', 'check', 'agree', 'accept'],
  radio: ['radio', 'option', 'choice'],
  select: ['select', 'dropdown', 'list'],
};

/**
 * Keywords for required fields
 */
const REQUIRED_KEYWORDS = [
  'required',
  '*',
  'required field',
];

/**
 * Keywords for submit buttons
 */
const SUBMIT_KEYWORDS = [
  'submit',
  'send',
  'save',
  'register',
  'login',
  'sign in',
  'sign up',
  'continue',
  'next',
];

/**
 * Normalize string for comparison
 * @param str - source string
 * @returns normalized string
 */
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

/**
 * Determine field type by name and content
 * @param name - node name
 * @param text - text content
 * @returns field type or null
 */
function inferFieldType(name: string, text?: string): FormFieldType | null {
  const normalized = normalizeString(name + ' ' + (text || ''));

  // Check each field type
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
 * Check if field is required
 * @param name - node name
 * @param text - text content
 * @returns true if field is required
 */
function isFieldRequired(name: string, text?: string): boolean {
  const normalized = normalizeString(name + ' ' + (text || ''));

  return REQUIRED_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

/**
 * Determine if node is an input field
 * @param node - Figma node
 * @returns true if this is an input field
 */
function isInputField(node: any): boolean {
  if (!node) return false;

  const name = normalizeString(node.name || '');

  // 1. Check by name
  if (
    name.includes('input') ||
    name.includes('field') ||
    name.includes('textfield')
  ) {
    return true;
  }

  // 2. Check by type: rectangle with placeholder text
  if (node.type === 'FRAME' || node.type === 'RECTANGLE') {
    const hasPlaceholder = node.children?.some(
      (child: any) =>
        child.type === 'TEXT' &&
        (normalizeString(child.characters || '').includes('placeholder') ||
          normalizeString(child.name || '').includes('placeholder'))
    );

    if (hasPlaceholder) return true;

    // Check for borders - input field indicator
    if (node.strokes && node.strokes.length > 0) {
      return true;
    }
  }

  return false;
}

/**
 * Determine if node is a checkbox
 * @param node - Figma node
 * @returns true if this is a checkbox
 */
function isCheckbox(node: any): boolean {
  if (!node) return false;

  const name = normalizeString(node.name || '');

  // Check by name
  if (
    name.includes('checkbox') ||
    name.includes('check')
  ) {
    return true;
  }

  // Check by shape: small square
  if (
    (node.type === 'RECTANGLE' || node.type === 'FRAME') &&
    node.absoluteBoundingBox
  ) {
    const { width, height } = node.absoluteBoundingBox;
    // Checkboxes are usually 16-32px, square
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
 * Determine if node is a radio button
 * @param node - Figma node
 * @returns true if this is a radio button
 */
function isRadioButton(node: any): boolean {
  if (!node) return false;

  const name = normalizeString(node.name || '');

  // Check by name
  if (name.includes('radio')) {
    return true;
  }

  // Check by shape: circle
  if (node.type === 'ELLIPSE' && node.absoluteBoundingBox) {
    const { width, height } = node.absoluteBoundingBox;
    // Radio buttons are usually 16-32px, circular
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
 * Determine if node is a select/dropdown
 * @param node - Figma node
 * @returns true if this is a select
 */
function isSelect(node: any): boolean {
  if (!node) return false;

  const name = normalizeString(node.name || '');

  // Check by name
  if (
    name.includes('select') ||
    name.includes('dropdown') ||
    name.includes('list')
  ) {
    return true;
  }

  // Check for chevron icon (down arrow)
  const hasChevron = node.children?.some(
    (child: any) =>
      normalizeString(child.name || '').includes('chevron') ||
      normalizeString(child.name || '').includes('arrow')
  );

  return hasChevron;
}

/**
 * Determine if node is a submit button
 * @param node - Figma node
 * @returns true if this is a submit button
 */
function isSubmitButton(node: any): boolean {
  if (!node) return false;

  const name = normalizeString(node.name || '');

  // Check by name
  if (name.includes('button') || name.includes('btn')) {
    // Check if text contains submit keywords
    const hasSubmitText = SUBMIT_KEYWORDS.some((keyword) => name.includes(keyword));

    if (hasSubmitText) return true;

    // Check text content of child elements
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
 * Extract label from node or its surroundings
 * @param node - Figma node
 * @param parent - parent node
 * @returns label or empty string
 */
function extractLabel(node: any, parent?: any): string {
  // 1. Search in node name
  const nodeName = node.name || '';
  if (nodeName && !nodeName.toLowerCase().includes('input')) {
    return nodeName;
  }

  // 2. Search for text node sibling with label
  if (parent && parent.children) {
    const nodeIndex = parent.children.indexOf(node);
    if (nodeIndex > 0) {
      const prevSibling = parent.children[nodeIndex - 1];
      if (prevSibling && prevSibling.type === 'TEXT') {
        return prevSibling.characters || prevSibling.name || '';
      }
    }
  }

  // 3. Search for text node inside
  const textChild = node.children?.find((child: any) => child.type === 'TEXT');
  if (textChild && textChild.characters) {
    return textChild.characters;
  }

  return 'Field';
}

/**
 * Extract placeholder from node
 * @param node - Figma node
 * @returns placeholder or undefined
 */
function extractPlaceholder(node: any): string | undefined {
  if (!node.children) return undefined;

  const placeholderNode = node.children.find(
    (child: any) =>
      child.type === 'TEXT' &&
      (normalizeString(child.name || '').includes('placeholder'))
  );

  return placeholderNode?.characters;
}

/**
 * Generate field name from label
 * @param label - field label
 * @returns field name in camelCase
 */
function generateFieldName(label: string): string {
  const normalized = label
    .replace(/[^a-zA-Z0-9\s]/g, '')
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
 * Recursively detect form elements in node tree
 * @param node - Figma node
 * @param parent - parent node
 * @param fields - accumulated fields array
 * @param submitInfo - submit button information
 */
function detectFormElementsRecursive(
  node: any,
  parent: any,
  fields: FormField[],
  submitInfo: { found: boolean; label: string }
): void {
  if (!node) return;

  // Check if node is a submit button
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

  // Determine form element type
  let fieldType: FormFieldType | null = null;

  if (isInputField(node)) {
    fieldType = 'text'; // default
  } else if (isCheckbox(node)) {
    fieldType = 'checkbox';
  } else if (isRadioButton(node)) {
    fieldType = 'radio';
  } else if (isSelect(node)) {
    fieldType = 'select';
  }

  // If form element detected, create field
  if (fieldType) {
    const label = extractLabel(node, parent);
    const placeholder = extractPlaceholder(node);
    const name = generateFieldName(label);

    // Refine type based on label/placeholder
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

    // Add validation based on type
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

  // Recursively process child elements
  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      detectFormElementsRecursive(child, node, fields, submitInfo);
    }
  }
}

/**
 * Detect form elements in Figma node
 * @param node - root node for analysis
 * @returns form detection result
 */
export function detectFormElements(node: any): FormDetection {
  const fields: FormField[] = [];
  const submitInfo = { found: false, label: 'Submit' };

  detectFormElementsRecursive(node, null, fields, submitInfo);

  // Generate form name from node name
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
 * Generate form hook using react-hook-form
 * @param detection - form detection result
 * @param formName - form name
 * @returns hook code
 */
export function generateFormHook(detection: FormDetection, formName: string): string {
  const { fields } = detection;

  let code = `import { useForm } from 'react-hook-form';\n`;
  code += `import { zodResolver } from '@hookform/resolvers/zod';\n`;
  code += `import { ${formName}Schema, ${formName}Data } from './${formName}Schema';\n\n`;

  code += `/**\n`;
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

  // Track used names to prevent duplicates
  const usedNames = new Map<string, number>();

  fields.forEach((field) => {
    // Normalize and generate unique field name
    const baseName = normalizeStyleName(field.name);
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
 * Generate Zod validation schema
 * @param detection - form detection result
 * @returns schema code
 */
export function generateZodSchema(detection: FormDetection): string {
  const { fields, formName } = detection;

  let code = `import { z } from 'zod';\n\n`;

  code += `/**\n`;
  code += ` * Zod validation schema for ${formName}\n`;
  code += ` */\n`;
  code += `export const ${formName}Schema = z.object({\n`;

  // Track used names to prevent duplicates
  const usedNames = new Map<string, number>();

  fields.forEach((field) => {
    // Normalize and generate unique field name
    const baseName = normalizeStyleName(field.name);
    const count = usedNames.get(baseName) || 0;
    let fieldName = baseName;
    if (count > 0) {
      fieldName = `${baseName}${count + 1}`;
    }
    usedNames.set(baseName, count + 1);
    let zodType = '';

    switch (field.type) {
      case 'email':
        zodType = `z.string().email('Invalid email format')`;
        break;
      case 'phone':
        zodType = `z.string().regex(/${field.validation?.pattern || '.+'}/, 'Invalid phone format')`;
        break;
      case 'password':
        zodType = `z.string().min(${field.validation?.minLength || 8}, 'Minimum ${field.validation?.minLength || 8} characters')`;
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
  code += ` * Form data type\n`;
  code += ` */\n`;
  code += `export type ${formName}Data = z.infer<typeof ${formName}Schema>;\n`;

  return code;
}

/**
 * Generate React Native form component
 * @param detection - form detection result
 * @param formName - form name
 * @returns component code
 */
export function generateFormComponent(detection: FormDetection, formName: string): string {
  const { fields, submitLabel } = detection;

  let code = `import React from 'react';\n`;
  code += `import { View, Text, StyleSheet } from 'react-native';\n`;
  code += `import { Controller } from 'react-hook-form';\n`;
  code += `import { use${formName} } from './use${formName}';\n`;
  code += `// TODO: Import Input, Button, Checkbox components etc.\n\n`;

  code += `/**\n`;
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
      code += `            placeholder="${field.placeholder || 'Select...'}"\n`;
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
