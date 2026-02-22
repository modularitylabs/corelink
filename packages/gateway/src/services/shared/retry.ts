/**
 * CoreLink Retry Utility
 *
 * Provides exponential backoff retry logic for handling transient failures
 * when calling external APIs (Gmail, Outlook, etc.)
 */

/**
 * Retry configuration options
 */
export interface RetryOptions {
  /**
   * Maximum number of retry attempts
   * @default 3
   */
  maxAttempts?: number;

  /**
   * Initial delay in milliseconds before first retry
   * @default 1000
   */
  initialDelay?: number;

  /**
   * Multiplier for exponential backoff
   * @default 2
   */
  backoffMultiplier?: number;

  /**
   * Maximum delay in milliseconds
   * @default 10000
   */
  maxDelay?: number;

  /**
   * Whether to add random jitter to delays (prevents thundering herd)
   * @default true
   */
  jitter?: boolean;

  /**
   * Optional predicate to determine if error should be retried
   * By default, retries on network errors and 5xx status codes
   */
  shouldRetry?: (error: unknown) => boolean;

  /**
   * Callback invoked before each retry attempt
   */
  onRetry?: (attempt: number, error: unknown, delay: number) => void;
}

/**
 * Default retry predicate - retries on transient errors
 */
function defaultShouldRetry(error: unknown): boolean {
  // Network errors
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('enotfound')
    ) {
      return true;
    }
  }

  // HTTP 5xx errors (server errors)
  if (typeof error === 'object' && error !== null) {
    const statusCode = (error as any).statusCode || (error as any).status;
    if (statusCode && statusCode >= 500 && statusCode < 600) {
      return true;
    }

    // Rate limit errors (429)
    if (statusCode === 429) {
      return true;
    }
  }

  // Don't retry by default
  return false;
}

/**
 * Execute a function with exponential backoff retry logic
 *
 * @param fn - Async function to execute
 * @param options - Retry configuration options
 * @returns Result of the function
 * @throws Last error if all retries are exhausted
 *
 * @example
 * const result = await withRetry(
 *   async () => await gmailClient.users.messages.list({ userId: 'me' }),
 *   { maxAttempts: 3, initialDelay: 1000 }
 * );
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    backoffMultiplier = 2,
    maxDelay = 10000,
    jitter = true,
    shouldRetry = defaultShouldRetry,
    onRetry,
  } = options;

  let lastError: unknown;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      const isLastAttempt = attempt === maxAttempts;
      if (isLastAttempt || !shouldRetry(error)) {
        throw error;
      }

      // Calculate delay with exponential backoff
      let currentDelay = Math.min(delay, maxDelay);

      // Add jitter (random variance to prevent thundering herd)
      if (jitter) {
        currentDelay = currentDelay * (0.5 + Math.random() * 0.5);
      }

      // Invoke retry callback
      if (onRetry) {
        onRetry(attempt, error, currentDelay);
      }

      // Wait before retry
      await sleep(currentDelay);

      // Increase delay for next attempt
      delay *= backoffMultiplier;
    }
  }

  // This should never be reached, but TypeScript requires it
  throw lastError;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry with specific configuration for API calls
 */
export async function withApiRetry<T>(fn: () => Promise<T>): Promise<T> {
  return withRetry(fn, {
    maxAttempts: 3,
    initialDelay: 1000,
    backoffMultiplier: 2,
    maxDelay: 5000,
    jitter: true,
    onRetry: (attempt, error, delay) => {
      console.warn(
        `[Retry] Attempt ${attempt} failed, retrying in ${delay}ms...`,
        error instanceof Error ? error.message : String(error)
      );
    },
  });
}
