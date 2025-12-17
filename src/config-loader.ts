/**
 * Project configuration loader
 * Uses cosmiconfig to search for configuration in various formats
 */

import { cosmiconfig } from 'cosmiconfig';
import Ajv from 'ajv';
import {
  ProjectConfig,
  projectConfigSchema,
  DEFAULT_CONFIG
} from './config-schema.js';

/**
 * Module name for cosmiconfig
 */
const MODULE_NAME = 'figma';

/**
 * Configuration search locations (in priority order)
 */
const SEARCH_PLACES = [
  '.figmarc.json',
  '.figmarc.js',
  'figma.config.js',
  '.config/figma.json',
  'package.json'
];

/**
 * AJV validator for configuration schema
 */
const ajv = new Ajv({ allErrors: true, verbose: true });
const validateConfig = ajv.compile(projectConfigSchema);

/**
 * Configuration validation error
 */
export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public errors: Array<{ path: string; message: string }>
  ) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

/**
 * Loads project configuration from filesystem
 *
 * @param searchFrom - Directory to start search from (defaults to current)
 * @returns Found configuration or null if not found
 * @throws {ConfigValidationError} If configuration is invalid
 */
export async function loadProjectConfig(
  searchFrom?: string
): Promise<ProjectConfig | null> {
  try {
    // Create explorer to search for configuration
    const explorer = cosmiconfig(MODULE_NAME, {
      searchPlaces: SEARCH_PLACES,
      stopDir: undefined, // Search up to filesystem root
    });

    // Search for configuration
    const result = await explorer.search(searchFrom);

    // If not found - return null
    if (!result || !result.config) {
      return null;
    }

    // Validate and return configuration
    return validateAndNormalizeConfig(result.config, result.filepath);
  } catch (error) {
    // If this is already our validation error - rethrow
    if (error instanceof ConfigValidationError) {
      throw error;
    }

    // Otherwise - wrap in general error
    console.error('Configuration loading error:', error);
    return null;
  }
}

/**
 * Loads configuration or returns default
 *
 * @param searchFrom - Directory to search in
 * @returns Found configuration or DEFAULT_CONFIG
 */
export async function loadProjectConfigOrDefault(
  searchFrom?: string
): Promise<ProjectConfig> {
  const config = await loadProjectConfig(searchFrom);
  return config || DEFAULT_CONFIG;
}

/**
 * Validates configuration using AJV and normalizes it
 *
 * @param config - Raw configuration from file
 * @param filepath - Path to configuration file (for errors)
 * @returns Validated and normalized configuration
 * @throws {ConfigValidationError} If configuration is invalid
 */
function validateAndNormalizeConfig(
  config: any,
  filepath: string
): ProjectConfig {
  // If configuration from package.json - take only 'figma' field
  if (filepath.endsWith('package.json') && config.figma) {
    config = config.figma;
  }

  // Validate using AJV
  const isValid = validateConfig(config);

  if (!isValid) {
    // Collect validation errors
    const errors = (validateConfig.errors || []).map(err => ({
      path: err.instancePath || '(root)',
      message: err.message || 'Unknown error'
    }));

    throw new ConfigValidationError(
      `Invalid configuration in ${filepath}`,
      errors
    );
  }

  // Return typed configuration
  return config as ProjectConfig;
}

/**
 * Clears cosmiconfig cache (useful for tests)
 */
export function clearConfigCache(): void {
  const explorer = cosmiconfig(MODULE_NAME, {
    searchPlaces: SEARCH_PLACES
  });
  explorer.clearCaches();
}

/**
 * Formats validation errors for user output
 *
 * @param error - Validation error
 * @returns Readable error message
 */
export function formatValidationErrors(error: ConfigValidationError): string {
  const errorList = error.errors
    .map(err => `  - ${err.path}: ${err.message}`)
    .join('\n');

  return `${error.message}\n\nErrors:\n${errorList}`;
}
