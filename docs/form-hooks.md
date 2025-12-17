# Form Hooks Generator - Usage Examples

## Overview

Module `form-hooks-generator.ts` automatically detects form elements in Figma design and generates:
- React Native components with react-hook-form
- Zod validation schemas
- TypeScript types

## Usage Example

```typescript
import {
  detectFormElements,
  generateFormHook,
  generateZodSchema,
  generateFormComponent
} from './form-hooks-generator';

// 1. Detect form in Figma node
const figmaNode = {
  name: 'Registration Form',
  type: 'FRAME',
  children: [
    {
      name: 'Email Input',
      type: 'FRAME',
      children: [{ type: 'TEXT', characters: 'Email *', name: 'label' }]
    },
    {
      name: 'Password Input',
      type: 'FRAME',
      children: [{ type: 'TEXT', characters: 'Password *', name: 'label' }]
    },
    {
      name: 'Submit Button',
      type: 'FRAME',
      children: [{ type: 'TEXT', characters: 'Register', name: 'button-text' }]
    }
  ]
};

const detection = detectFormElements(figmaNode);

console.log(detection);
// Output:
// {
//   fields: [
//     { name: 'email', type: 'email', label: 'Email', required: true, ... },
//     { name: 'password', type: 'password', label: 'Password', required: true, ... }
//   ],
//   hasSubmitButton: true,
//   submitLabel: 'Register',
//   formName: 'RegistrationForm'
// }

// 2. Generate Zod schema
const schemaCode = generateZodSchema(detection);
console.log(schemaCode);

// 3. Generate form hook
const hookCode = generateFormHook(detection, detection.formName);
console.log(hookCode);

// 4. Generate React Native component
const componentCode = generateFormComponent(detection, detection.formName);
console.log(componentCode);
```

## Detection Heuristics

### Input Fields
- Nodes with names: `input`, `field`, `textfield`
- `FRAME` or `RECTANGLE` with:
  - Placeholder text inside
  - Visible borders (strokes)

### Checkboxes
- Names: `checkbox`, `check`, `consent`, `agree`
- Small squares (16-32px)

### Radio Buttons
- Names: `radio`, `choice`, `option`
- Small circles (16-32px)

### Select/Dropdown
- Names: `select`, `dropdown`, `picker`, `list`
- Presence of chevron/arrow icon

### Submit Buttons
- Names: `button` + submission keywords
- Keywords: `submit`, `send`, `save`, `continue`, `login`, `register`, etc.

### Field Types
Auto-detection by names and content:
- `email` - email, e-mail
- `password` - password, pass
- `phone` - phone, mobile, telephone
- `number` - number, amount, quantity
- `textarea` - message, comment, description

### Required Fields
Detected by:
- `*` in label or placeholder
- Words: `required`, `mandatory`, `must`

## Generated Code Example

### Zod Schema
```typescript
import { z } from 'zod';

export const RegistrationFormSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Minimum 8 characters'),
  phone: z.string().regex(/^[+]?[(]?[0-9]{1,4}[)]?[-\s\.]?/, 'Invalid phone format').optional(),
  agreeToTerms: z.boolean(),
});

export type RegistrationFormData = z.infer<typeof RegistrationFormSchema>;
```

### Form Hook
```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

export function useRegistrationForm() {
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<RegistrationFormData>({
    resolver: zodResolver(RegistrationFormSchema),
    defaultValues: {
      email: '',
      password: '',
      phone: '',
      agreeToTerms: false,
    },
  });

  const onSubmit = async (data: RegistrationFormData) => {
    try {
      console.log('Form data:', data);
      // TODO: Implement form submission
    } catch (error) {
      console.error('Form submission error:', error);
    }
  };

  return {
    control,
    handleSubmit: handleSubmit(onSubmit),
    errors,
    isSubmitting,
    reset,
  };
}
```

### React Native Component
```typescript
export function RegistrationForm() {
  const { control, handleSubmit, errors, isSubmitting } = useRegistrationForm();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>RegistrationForm</Text>

      <Controller
        control={control}
        name="email"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            label="Email"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            keyboardType="email-address"
            autoCapitalize="none"
            error={errors.email?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            label="Password"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            secureTextEntry
            error={errors.password?.message}
          />
        )}
      />

      <Button
        title="Register"
        onPress={handleSubmit}
        disabled={isSubmitting}
        loading={isSubmitting}
      />
    </View>
  );
}
```

## MCP Server Integration

To add to MCP server, add new tool to `src/index.ts`:

```typescript
{
  name: 'detect_form_elements',
  description: '[FORMS] Detect form elements in Figma design and generate react-hook-form + Zod code',
  inputSchema: {
    type: 'object',
    properties: {
      figmaUrl: {
        type: 'string',
        description: 'Figma URL containing form design',
      },
      formName: {
        type: 'string',
        description: 'Form name (e.g., LoginForm, RegistrationForm)',
      },
    },
    required: ['figmaUrl', 'formName'],
  },
}
```

## Features

✅ **Automatic Detection** - field type detection by names and structure
✅ **Multilingual** - support for multiple naming conventions
✅ **Smart Validation** - auto-generation of Zod rules based on field types
✅ **React Hook Form** - ready-to-use hook with control, errors, handleSubmit
✅ **TypeScript Types** - full typing through Zod inference
✅ **React Native** - component with Controller and styles

## Dependencies

Project already contains necessary dependencies:
- `string-similarity` - for string comparison (already installed)

To use generated code, you need:
- `react-hook-form` - form management
- `@hookform/resolvers` - integration with Zod
- `zod` - validation schemas
