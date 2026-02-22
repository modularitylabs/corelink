/**
 * CoreLink Rate Limiter
 *
 * Per-account rate limiting to comply with provider API quotas
 * (Gmail: 250 quota units/user/second, Outlook: varies)
 */

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /**
   * Maximum requests per time window
   */
  maxRequests: number;

  /**
   * Time window in milliseconds
   * @default 1000 (1 second)
   */
  windowMs?: number;

  /**
   * Optional callback when rate limit is hit
   */
  onRateLimit?: (accountId: string, waitTime: number) => void;
}

/**
 * Request timestamp tracking
 */
interface RequestWindow {
  timestamps: number[];
  lastCleanup: number;
}

/**
 * Rate Limiter Service
 *
 * Implements sliding window rate limiting per account ID
 */
export class RateLimiter {
  private windows: Map<string, RequestWindow> = new Map();
  private config: Required<RateLimitConfig>;

  constructor(config: RateLimitConfig) {
    this.config = {
      windowMs: 1000,
      onRateLimit: () => {},
      ...config,
    };
  }

  /**
   * Wait if necessary to comply with rate limit, then proceed
   *
   * @param accountId - Unique account identifier
   * @returns Promise that resolves when request can proceed
   */
  async throttle(accountId: string): Promise<void> {
    const now = Date.now();
    const window = this.getOrCreateWindow(accountId);

    // Clean up old timestamps outside the window
    this.cleanupWindow(window, now);

    // Check if we're at the limit
    if (window.timestamps.length >= this.config.maxRequests) {
      // Calculate wait time until oldest request falls outside window
      const oldestTimestamp = window.timestamps[0];
      const waitTime = oldestTimestamp + this.config.windowMs - now;

      if (waitTime > 0) {
        // Invoke rate limit callback
        this.config.onRateLimit(accountId, waitTime);

        // Wait until we can proceed
        await this.sleep(waitTime);

        // Clean up again after waiting
        this.cleanupWindow(window, Date.now());
      }
    }

    // Record this request
    window.timestamps.push(Date.now());
  }

  /**
   * Check if a request would be rate limited without actually waiting
   *
   * @param accountId - Unique account identifier
   * @returns Object with isLimited flag and wait time in ms
   */
  check(accountId: string): { isLimited: boolean; waitTimeMs: number } {
    const now = Date.now();
    const window = this.getOrCreateWindow(accountId);

    // Clean up old timestamps
    this.cleanupWindow(window, now);

    if (window.timestamps.length >= this.config.maxRequests) {
      const oldestTimestamp = window.timestamps[0];
      const waitTime = Math.max(0, oldestTimestamp + this.config.windowMs - now);

      return {
        isLimited: waitTime > 0,
        waitTimeMs: waitTime,
      };
    }

    return {
      isLimited: false,
      waitTimeMs: 0,
    };
  }

  /**
   * Reset rate limit for a specific account (useful for testing)
   */
  reset(accountId: string): void {
    this.windows.delete(accountId);
  }

  /**
   * Reset all rate limits
   */
  resetAll(): void {
    this.windows.clear();
  }

  /**
   * Get current request count for an account
   */
  getRequestCount(accountId: string): number {
    const window = this.windows.get(accountId);
    if (!window) return 0;

    this.cleanupWindow(window, Date.now());
    return window.timestamps.length;
  }

  /**
   * Get or create request window for an account
   */
  private getOrCreateWindow(accountId: string): RequestWindow {
    let window = this.windows.get(accountId);
    if (!window) {
      window = {
        timestamps: [],
        lastCleanup: Date.now(),
      };
      this.windows.set(accountId, window);
    }
    return window;
  }

  /**
   * Remove timestamps outside the current window
   */
  private cleanupWindow(window: RequestWindow, now: number): void {
    const cutoff = now - this.config.windowMs;
    window.timestamps = window.timestamps.filter(ts => ts > cutoff);
    window.lastCleanup = now;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Create a rate limiter for Gmail API
 * Limit: 250 quota units per user per second
 */
export function createGmailRateLimiter(): RateLimiter {
  return new RateLimiter({
    maxRequests: 250,
    windowMs: 1000,
    onRateLimit: (accountId, waitTime) => {
      console.warn(
        `[RateLimit] Gmail account ${accountId} rate limited, waiting ${waitTime}ms`
      );
    },
  });
}

/**
 * Create a rate limiter for Outlook API
 * Limit: ~60 requests per minute per user (conservative estimate)
 */
export function createOutlookRateLimiter(): RateLimiter {
  return new RateLimiter({
    maxRequests: 60,
    windowMs: 60000, // 1 minute
    onRateLimit: (accountId, waitTime) => {
      console.warn(
        `[RateLimit] Outlook account ${accountId} rate limited, waiting ${waitTime}ms`
      );
    },
  });
}

/**
 * Create a rate limiter for IMAP providers (ProtonMail, etc.)
 * Limit: Conservative limit to avoid being blocked
 */
export function createImapRateLimiter(): RateLimiter {
  return new RateLimiter({
    maxRequests: 10,
    windowMs: 1000,
    onRateLimit: (accountId, waitTime) => {
      console.warn(
        `[RateLimit] IMAP account ${accountId} rate limited, waiting ${waitTime}ms`
      );
    },
  });
}
