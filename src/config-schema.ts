/**
 * Схемы конфигурации проекта для Figma MCP
 * Определяет интерфейсы TypeScript и JSON Schema для валидации
 */

/**
 * Основная конфигурация проекта
 */
export interface ProjectConfig {
  /** Тип фреймворка проекта */
  framework: 'react-native' | 'expo' | 'ignite';

  /** Название проекта (опционально) */
  projectName?: string;

  /** Корневая директория проекта / Project root directory */
  projectRoot?: string;

  /** Конфигурация темы */
  theme?: {
    /** Путь к файлу цветов / Path to colors file */
    location: string;

    /** Тип системы темизации */
    type: 'object-export' | 'styled-components' | 'nativewind' | 'tamagui';

    /** Путь к основному файлу темы (для spacing, radii, shadows) / Path to main theme file */
    mainThemeLocation?: string;

    /** Путь к цветам внутри темы (например, 'colors' или 'palette.colors') */
    colorPath?: string;

    /** Путь к шрифтам внутри темы (например, 'fonts' или 'typography.fonts') */
    fontPath?: string;

    /** Путь к файлу типографики / Path to typography file */
    typographyFile?: string;
  };

  /** Конфигурация компонентов */
  components?: {
    /** Директория с компонентами */
    location: string;

    /** Glob-паттерн для поиска компонентов */
    pattern?: string;
  };

  /** Стиль генерируемого кода */
  codeStyle: {
    /** Паттерн стилизации */
    stylePattern: 'useTheme' | 'StyleSheet' | 'styled-components' | 'nativewind';

    /** Функция масштабирования (например, 'scale', 'RFValue', 'moderateScale') */
    scaleFunction?: string;

    /** Префикс для импортов (например, '@app', '@components', '~') */
    importPrefix?: string;
  };

  /** Пользовательские маппинги Figma → код */
  mappings?: {
    /** Маппинг цветов: Figma название → путь в теме */
    colors?: Record<string, string>;

    /** Маппинг шрифтов: Figma название → путь в теме */
    fonts?: Record<string, string>;

    /** Маппинг spacing: Figma значение → путь в теме */
    spacing?: Record<number, string>;

    /** Маппинг radii: Figma значение → путь в теме */
    radii?: Record<number, string>;

    /** Маппинг shadows: Figma сигнатура → путь в теме */
    shadows?: Record<string, string>;

    /** Маппинг градиентов: Figma сигнатура → путь в теме */
    gradients?: Record<string, string>;

    /** Маппинг типографики: Figma ключ → путь в теме */
    typography?: Record<string, string>;
  };

  /** Конфигурация ассетов (изображения, иконки) */
  assets?: {
    /** Директория для изображений (относительно корня проекта) */
    imagesDir: string;

    /** Директория для иконок (относительно корня проекта) */
    iconsDir: string;

    /** Формат по умолчанию для изображений */
    defaultImageFormat: 'png' | 'jpg' | 'webp';

    /** Формат по умолчанию для иконок */
    defaultIconFormat: 'svg' | 'png';

    /** Масштаб для экспорта изображений (1, 2, 3) */
    imageScale: number;

    /** Префикс импорта для ассетов (например, '@assets' или '../assets') */
    importPrefix: string;
  };
}

/**
 * Входные данные для генерации конфигурации
 */
export interface ProjectConfigInput {
  /** Корневая директория проекта */
  projectRoot: string;

  /** Путь к файлу темы */
  themePath?: string;

  /** Путь к директории компонентов */
  componentsPath?: string;

  /** Тип фреймворка */
  framework?: string;

  /** Подход к стилизации */
  styleApproach?: string;
}

/**
 * JSON Schema для валидации конфигурации с помощью AJV
 * Используем plain object вместо JSONSchemaType для совместимости с tsconfig без strictNullChecks
 */
export const projectConfigSchema = {
  type: 'object',
  properties: {
    framework: {
      type: 'string',
      enum: ['react-native', 'expo', 'ignite']
    },
    projectName: {
      type: 'string',
      nullable: true
    },
    projectRoot: {
      type: 'string',
      nullable: true
    },
    theme: {
      type: 'object',
      nullable: true,
      required: ['location', 'type'],
      properties: {
        location: { type: 'string' },
        type: {
          type: 'string',
          enum: ['object-export', 'styled-components', 'nativewind', 'tamagui']
        },
        mainThemeLocation: {
          type: 'string',
          nullable: true
        },
        colorPath: {
          type: 'string',
          nullable: true
        },
        fontPath: {
          type: 'string',
          nullable: true
        },
        typographyFile: {
          type: 'string',
          nullable: true
        }
      },
      additionalProperties: false
    },
    components: {
      type: 'object',
      nullable: true,
      required: ['location'],
      properties: {
        location: { type: 'string' },
        pattern: {
          type: 'string',
          nullable: true
        }
      },
      additionalProperties: false
    },
    codeStyle: {
      type: 'object',
      required: ['stylePattern'],
      properties: {
        stylePattern: {
          type: 'string',
          enum: ['useTheme', 'StyleSheet', 'styled-components', 'nativewind']
        },
        scaleFunction: {
          type: 'string',
          nullable: true
        },
        importPrefix: {
          type: 'string',
          nullable: true
        }
      },
      additionalProperties: false
    },
    mappings: {
      type: 'object',
      nullable: true,
      properties: {
        colors: {
          type: 'object',
          nullable: true,
          required: [],
          additionalProperties: { type: 'string' }
        },
        fonts: {
          type: 'object',
          nullable: true,
          required: [],
          additionalProperties: { type: 'string' }
        },
        spacing: {
          type: 'object',
          nullable: true,
          required: [],
          additionalProperties: { type: 'string' }
        },
        radii: {
          type: 'object',
          nullable: true,
          required: [],
          additionalProperties: { type: 'string' }
        },
        shadows: {
          type: 'object',
          nullable: true,
          required: [],
          additionalProperties: { type: 'string' }
        },
        gradients: {
          type: 'object',
          nullable: true,
          required: [],
          additionalProperties: { type: 'string' }
        },
        typography: {
          type: 'object',
          nullable: true,
          required: [],
          additionalProperties: { type: 'string' }
        }
      },
      additionalProperties: false
    },
    assets: {
      type: 'object',
      nullable: true,
      properties: {
        imagesDir: { type: 'string' },
        iconsDir: { type: 'string' },
        defaultImageFormat: {
          type: 'string',
          enum: ['png', 'jpg', 'webp']
        },
        defaultIconFormat: {
          type: 'string',
          enum: ['svg', 'png']
        },
        imageScale: { type: 'number' },
        importPrefix: { type: 'string' }
      },
      additionalProperties: false
    }
  },
  required: ['framework', 'codeStyle'],
  additionalProperties: false
};

/**
 * Конфигурация по умолчанию
 */
export const DEFAULT_CONFIG: ProjectConfig = {
  framework: 'react-native',
  codeStyle: {
    stylePattern: 'StyleSheet'
  },
  assets: {
    imagesDir: 'src/assets/images',
    iconsDir: 'src/assets/icons',
    defaultImageFormat: 'png',
    defaultIconFormat: 'svg',
    imageScale: 2,
    importPrefix: '@assets'
  }
};
