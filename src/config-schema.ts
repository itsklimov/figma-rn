/**
 * Project configuration schemas for Figma MCP
 * Defines TypeScript interfaces and JSON Schema for validation
 */

/**
 * Main project configuration
 */
export interface ProjectConfig {
  /** Project framework type */
  framework: 'react-native' | 'expo' | 'ignite';

  /** Project name (optional) */
  projectName?: string;

  /** Project root directory */
  projectRoot?: string;

  /** Theme configuration */
  theme?: {
    /** Path to colors file */
    location: string;

    /** Theming system type */
    type: 'object-export' | 'styled-components' | 'nativewind' | 'tamagui';

    /** Path to main theme file (for spacing, radii, shadows) */
    mainThemeLocation?: string;

    /** Path to colors within theme (e.g., 'colors' or 'palette.colors') */
    colorPath?: string;

    /** Path to fonts within theme (e.g., 'fonts' or 'typography.fonts') */
    fontPath?: string;

    /** Path(s) to typography file(s) */
    typographyFile?: string | string[];
  };

  /** Components configuration */
  components?: {
    /** Components directory */
    location: string;

    /** Glob pattern for finding components */
    pattern?: string;
  };

  /** Generated code style */
  codeStyle: {
    /** Styling pattern */
    stylePattern: 'useTheme' | 'StyleSheet' | 'styled-components' | 'nativewind';

    /** Scaling function (e.g., 'scale', 'RFValue', 'moderateScale') */
    scaleFunction?: string;

    /** Import prefix (e.g., '@app', '@components', '~') */
    importPrefix?: string;
  };

  /** Custom Figma → code mappings */
  mappings?: {
    /** Color mapping: Figma name → theme path */
    colors?: Record<string, string>;

    /** Font mapping: Figma name → theme path */
    fonts?: Record<string, string>;

    /** Spacing mapping: Figma value → theme path */
    spacing?: Record<number, string>;

    /** Radii mapping: Figma value → theme path */
    radii?: Record<number, string>;

    /** Shadow mapping: Figma signature → theme path */
    shadows?: Record<string, string>;

    /** Gradient mapping: Figma signature → theme path */
    gradients?: Record<string, string>;

    /** Typography mapping: Figma key → theme path */
    typography?: Record<string, string>;
  };

  /** Assets configuration (images, icons) */
  assets?: {
    /** Images directory (relative to project root) */
    imagesDir: string;

    /** Icons directory (relative to project root) */
    iconsDir: string;

    /** Default format for images */
    defaultImageFormat: 'png' | 'jpg' | 'webp';

    /** Default format for icons */
    defaultIconFormat: 'svg' | 'png';

    /** Image export scale (1, 2, 3) */
    imageScale: number;

    /** Import prefix for assets (e.g., '@assets' or '../assets') */
    importPrefix: string;
  };
}

/**
 * Input data for configuration generation
 */
export interface ProjectConfigInput {
  /** Project root directory */
  projectRoot: string;

  /** Theme file path */
  themePath?: string;

  /** Components directory path */
  componentsPath?: string;

  /** Framework type */
  framework?: string;

  /** Styling approach */
  styleApproach?: string;
}

/**
 * JSON Schema for configuration validation using AJV
 * Using plain object instead of JSONSchemaType for compatibility with tsconfig without strictNullChecks
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
          oneOf: [
            { type: 'string' },
            { type: 'array', items: { type: 'string' } },
            { type: 'null' }
          ]
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
 * Default configuration
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
