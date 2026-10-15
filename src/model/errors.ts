export type ErrorCategory =
  | "AUTH"
  | "RATE_LIMIT"
  | "NETWORK"
  | "INVALID_REQUEST"
  | "CONTEXT_LENGTH"
  | "UNKNOWN";

/**
 * Strips sensitive keys/tokens from error messages and logs.
 */
export function sanitizeMessage(text: string): string {
  return text
    .replace(/sk-[a-zA-Z0-9_\-]{20,}/g, "[REDACTED_API_KEY]")
    .replace(/AIzaSy[a-zA-Z0-9_\-]{33}/g, "[REDACTED_API_KEY]")
    .replace(/key=[^&\s]+/gi, "key=[REDACTED]")
    .replace(/Bearer\s+[a-zA-Z0-9_\-\.]+/gi, "Bearer [REDACTED]");
}

/**
 * Standard typed error for all model provider failures.
 */
export class XcoderModelError extends Error {
  public readonly category: ErrorCategory;
  public readonly provider: string;
  public readonly isRetryable: boolean;
  public readonly status?: number;
  public readonly originalError?: unknown;

  constructor(params: {
    message: string;
    category: ErrorCategory;
    provider: string;
    isRetryable: boolean;
    status?: number;
    originalError?: unknown;
  }) {
    super(sanitizeMessage(params.message));
    this.name = "XcoderModelError";
    this.category = params.category;
    this.provider = params.provider;
    this.isRetryable = params.isRetryable;
    this.status = params.status;
    this.originalError = params.originalError;

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, XcoderModelError.prototype);
  }
}
