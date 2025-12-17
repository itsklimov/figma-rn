# Form Hooks Generator - Примеры использования / Usage Examples

## Обзор / Overview

Модуль `form-hooks-generator.ts` автоматически обнаруживает элементы формы в дизайне Figma и генерирует:
- React Native компоненты с react-hook-form
- Zod схемы валидации
- TypeScript типы

## Пример использования / Usage Example

```typescript
import {
  detectFormElements,
  generateFormHook,
  generateZodSchema,
  generateFormComponent
} from './form-hooks-generator';

// 1. Обнаружение формы в узле Figma
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
      children: [{ type: 'TEXT', characters: 'Зарегистрироваться', name: 'button-text' }]
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
//   submitLabel: 'Зарегистрироваться',
//   formName: 'RegistrationForm'
// }

// 2. Генерация Zod схемы
// 2. Generate Zod schema
const schemaCode = generateZodSchema(detection);
console.log(schemaCode);

// 3. Генерация хука формы
// 3. Generate form hook
const hookCode = generateFormHook(detection, detection.formName);
console.log(hookCode);

// 4. Генерация React Native компонента
// 4. Generate React Native component
const componentCode = generateFormComponent(detection, detection.formName);
console.log(componentCode);
```

## Эвристики обнаружения / Detection Heuristics

### Input Fields / Поля ввода
- Узлы с именами: `input`, `field`, `textfield`, `ввод`, `поле`
- `FRAME` или `RECTANGLE` с:
  - Текстом-placeholder внутри
  - Видимыми границами (strokes)

### Checkboxes / Чекбоксы
- Имена: `checkbox`, `check`, `галочка`, `согласие`
- Маленькие квадраты (16-32px)

### Radio Buttons / Радио-кнопки
- Имена: `radio`, `радио`, `выбор`
- Маленькие круги (16-32px)

### Select/Dropdown / Выпадающие списки
- Имена: `select`, `dropdown`, `выпадающ`, `список`
- Наличие иконки chevron/arrow

### Submit Buttons / Кнопки отправки
- Имена: `button` + ключевые слова отправки
- Ключевые слова: `submit`, `send`, `save`, `отправить`, `сохранить`, `войти`, etc.

### Типы полей / Field Types
Автоопределение по именам и содержимому:
- `email` - email, почта, e-mail
- `password` - password, пароль
- `phone` - phone, телефон, mobile
- `number` - number, номер, количество
- `textarea` - message, comment, описание

### Обязательные поля / Required Fields
Детектируются по:
- `*` в label или placeholder
- Слова: `required`, `обязательно`, `обязательное поле`

## Пример сгенерированного кода / Generated Code Example

### Zod Schema
```typescript
import { z } from 'zod';

export const RegistrationFormSchema = z.object({
  email: z.string().email('Неверный формат email'),
  password: z.string().min(8, 'Минимум 8 символов'),
  phone: z.string().regex(/^[+]?[(]?[0-9]{1,4}[)]?[-\s\.]?/, 'Неверный формат телефона').optional(),
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
        title="Зарегистрироваться"
        onPress={handleSubmit}
        disabled={isSubmitting}
        loading={isSubmitting}
      />
    </View>
  );
}
```

## Интеграция с MCP Server / MCP Server Integration

Для добавления в MCP server, добавьте новый tool в `src/index.ts`:

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

## Возможности / Features

✅ **Автоматическое обнаружение** - определение типов полей по именам и структуре
✅ **Мультиязычность** - поддержка русских и английских названий
✅ **Умная валидация** - автогенерация Zod правил на основе типов полей
✅ **React Hook Form** - готовый хук с control, errors, handleSubmit
✅ **TypeScript типы** - полная типизация через Zod inference
✅ **React Native** - компонент с Controller и стилями

## Зависимости / Dependencies

Проект уже содержит необходимые зависимости:
- `string-similarity` - для сравнения строк (уже установлен)

Для использования сгенерированного кода потребуются:
- `react-hook-form` - управление формой
- `@hookform/resolvers` - интеграция с Zod
- `zod` - схемы валидации
