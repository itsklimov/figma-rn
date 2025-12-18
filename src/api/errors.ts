/**
 * Error handling for Figma API operations
 */

/**
 * Specific error codes for Figma API failures
 */
export type FigmaErrorCode =
  | 'INVALID_TOKEN'
  | 'INVALID_URL'
  | 'NODE_NOT_FOUND'
  | 'FILE_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'PARSE_ERROR'
  | 'PERMISSION_DENIED'
  | 'UNKNOWN';

/**
 * Custom error class for Figma API errors
 */
export class FigmaApiError extends Error {
  /**
   * Specific error code
   */
  readonly code: FigmaErrorCode;

  /**
   * HTTP status code (if applicable)
   */
  readonly statusCode?: number;

  /**
   * Additional error details
   */
  readonly details?: Record<string, any>;

  constructor(
    message: string,
    code: FigmaErrorCode,
    statusCode?: number,
    details?: Record<string, any>
  ) {
    super(message);
    this.name = 'FigmaApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;

    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, FigmaApiError);
    }
  }

  /**
   * Check if this is a specific error code
   */
  is(code: FigmaErrorCode): boolean {
    return this.code === code;
  }

  /**
   * Check if this is a retryable error
   */
  isRetryable(): boolean {
    return this.code === 'RATE_LIMITED' || this.code === 'NETWORK_ERROR';
  }

  /**
   * Get user-friendly error message
   */
  getUserMessage(): string {
    switch (this.code) {
      case 'INVALID_TOKEN':
        return 'Invalid Figma API token. Please check your authentication credentials.';
      case 'INVALID_URL':
        return 'Invalid Figma URL format. Please provide a valid Figma file or node URL.';
      case 'NODE_NOT_FOUND':
        return 'The specified node was not found in the Figma file.';
      case 'FILE_NOT_FOUND':
        return 'The specified Figma file was not found or is not accessible.';
      case 'RATE_LIMITED':
        return 'Rate limit exceeded. Please wait a moment before trying again.';
      case 'NETWORK_ERROR':
        return 'Network error occurred. Please check your connection and try again.';
      case 'PARSE_ERROR':
        return 'Failed to parse Figma API response. The data may be malformed.';
      case 'PERMISSION_DENIED':
        return 'Permission denied. You may not have access to this file.';
      case 'UNKNOWN':
      default:
        return this.message || 'An unknown error occurred while accessing Figma API.';
    }
  }

  /**
   * Convert to JSON for logging
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
      stack: this.stack,
    };
  }
}

/**
 * Create a FigmaApiError from an unknown error
 * Attempts to detect error type and extract relevant information
 */
export function createApiError(error: unknown): FigmaApiError {
  // Already a FigmaApiError
  if (error instanceof FigmaApiError) {
    return error;
  }

  // Standard Error object
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Detect specific error patterns
    if (message.includes('invalid token') || message.includes('unauthorized')) {
      return new FigmaApiError('Invalid or expired Figma token', 'INVALID_TOKEN', 401);
    }

    if (message.includes('not found')) {
      if (message.includes('node')) {
        return new FigmaApiError('Node not found', 'NODE_NOT_FOUND', 404);
      }
      return new FigmaApiError('File not found', 'FILE_NOT_FOUND', 404);
    }

    if (message.includes('rate limit') || message.includes('too many requests')) {
      return new FigmaApiError('Rate limit exceeded', 'RATE_LIMITED', 429);
    }

    if (
      message.includes('forbidden') ||
      message.includes('access denied') ||
      message.includes('permission')
    ) {
      return new FigmaApiError('Permission denied', 'PERMISSION_DENIED', 403);
    }

    if (
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('timeout') ||
      message.includes('enotfound')
    ) {
      return new FigmaApiError('Network error', 'NETWORK_ERROR', undefined, {
        originalMessage: error.message,
      });
    }

    if (
      message.includes('json') ||
      message.includes('parse') ||
      message.includes('unexpected token')
    ) {
      return new FigmaApiError('Failed to parse API response', 'PARSE_ERROR', undefined, {
        originalMessage: error.message,
      });
    }

    // Generic error
    return new FigmaApiError(error.message, 'UNKNOWN', undefined, {
      originalError: error.name,
    });
  }

  // HTTP error-like object with status code
  if (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof error.statusCode === 'number'
  ) {
    const statusCode = error.statusCode;
    const message = 'message' in error && typeof error.message === 'string' ? error.message : '';

    switch (statusCode) {
      case 401:
        return new FigmaApiError('Invalid or expired token', 'INVALID_TOKEN', statusCode);
      case 403:
        return new FigmaApiError('Permission denied', 'PERMISSION_DENIED', statusCode);
      case 404:
        return new FigmaApiError('Resource not found', 'FILE_NOT_FOUND', statusCode);
      case 429:
        return new FigmaApiError('Rate limit exceeded', 'RATE_LIMITED', statusCode);
      default:
        return new FigmaApiError(
          message || `HTTP error ${statusCode}`,
          'UNKNOWN',
          statusCode
        );
    }
  }

  // String error
  if (typeof error === 'string') {
    const message = error.toLowerCase();

    if (message.includes('invalid') && message.includes('url')) {
      return new FigmaApiError('Invalid URL format', 'INVALID_URL');
    }

    return new FigmaApiError(error, 'UNKNOWN');
  }

  // Unknown error type
  return new FigmaApiError(
    'An unknown error occurred',
    'UNKNOWN',
    undefined,
    { originalError: String(error) }
  );
}

/**
 * Type guard to check if an error is a FigmaApiError
 */
export function isFigmaApiError(error: unknown): error is FigmaApiError {
  return error instanceof FigmaApiError;
}

/**
 * Type guard to check if an error has a specific code
 */
export function hasErrorCode(error: unknown, code: FigmaErrorCode): boolean {
  return isFigmaApiError(error) && error.code === code;
}

/**
 * Retry helper for retryable errors
 */
export async function retryOnError<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    retryDelay?: number;
    onRetry?: (error: FigmaApiError, attempt: number) => void;
  } = {}
): Promise<T> {
  const { maxRetries = 3, retryDelay = 1000, onRetry } = options;

  let lastError: FigmaApiError | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const apiError = createApiError(error);
      lastError = apiError;

      // Don't retry non-retryable errors
      if (!apiError.isRetryable() || attempt === maxRetries) {
        throw apiError;
      }

      // Call retry callback if provided
      if (onRetry) {
        onRetry(apiError, attempt);
      }

      // Wait before retrying (exponential backoff for rate limits)
      const delay = apiError.code === 'RATE_LIMITED' ? retryDelay * attempt : retryDelay;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // This should never happen, but TypeScript needs it
  throw lastError || new FigmaApiError('Max retries exceeded', 'UNKNOWN');
}
