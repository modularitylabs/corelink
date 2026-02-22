/**
 * CoreLink Cache Utility
 *
 * Simple in-memory cache with TTL support for caching API responses
 */

/**
 * Cache entry with value and expiration
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number; // Unix timestamp in milliseconds
}

/**
 * Cache options
 */
export interface CacheOptions {
  /**
   * Time-to-live in milliseconds
   * @default 3600000 (1 hour)
   */
  ttl?: number;

  /**
   * Maximum cache size (number of entries)
   * When exceeded, oldest entries are evicted (LRU)
   * @default 1000
   */
  maxSize?: number;

  /**
   * Cleanup interval in milliseconds
   * How often to remove expired entries
   * @default 300000 (5 minutes)
   */
  cleanupInterval?: number;
}

/**
 * Simple in-memory cache with TTL and LRU eviction
 */
export class Cache<T = any> {
  private store: Map<string, CacheEntry<T>> = new Map();
  private accessOrder: Map<string, number> = new Map(); // Track access time for LRU
  private options: Required<CacheOptions>;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(options: CacheOptions = {}) {
    this.options = {
      ttl: 3600000, // 1 hour
      maxSize: 1000,
      cleanupInterval: 300000, // 5 minutes
      ...options,
    };

    // Start cleanup timer
    this.startCleanup();
  }

  /**
   * Get a value from cache
   *
   * @param key - Cache key
   * @returns Cached value or undefined if not found/expired
   */
  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.accessOrder.delete(key);
      return undefined;
    }

    // Update access time for LRU
    this.accessOrder.set(key, Date.now());

    return entry.value;
  }

  /**
   * Set a value in cache
   *
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttl - Optional custom TTL for this entry (in milliseconds)
   */
  set(key: string, value: T, ttl?: number): void {
    const expiresAt = Date.now() + (ttl || this.options.ttl);

    // Check if we need to evict entries
    if (this.store.size >= this.options.maxSize && !this.store.has(key)) {
      this.evictOldest();
    }

    this.store.set(key, { value, expiresAt });
    this.accessOrder.set(key, Date.now());
  }

  /**
   * Check if a key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) {
      return false;
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.accessOrder.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete a specific key
   */
  delete(key: string): boolean {
    this.accessOrder.delete(key);
    return this.store.delete(key);
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.store.clear();
    this.accessOrder.clear();
  }

  /**
   * Get current cache size
   */
  size(): number {
    return this.store.size;
  }

  /**
   * Get or compute a value
   *
   * If the key exists in cache, return it.
   * Otherwise, compute the value, cache it, and return it.
   *
   * @param key - Cache key
   * @param fn - Function to compute value if not cached
   * @param ttl - Optional custom TTL
   * @returns Cached or computed value
   */
  async getOrCompute(key: string, fn: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await fn();
    this.set(key, value, ttl);
    return value;
  }

  /**
   * Evict the least recently used entry
   */
  private evictOldest(): void {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;

    for (const [key, accessTime] of this.accessOrder.entries()) {
      if (accessTime < oldestTime) {
        oldestTime = accessTime;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.store.delete(oldestKey);
      this.accessOrder.delete(oldestKey);
    }
  }

  /**
   * Remove all expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.store.delete(key);
      this.accessOrder.delete(key);
    }

    if (expiredKeys.length > 0) {
      console.log(`[Cache] Cleaned up ${expiredKeys.length} expired entries`);
    }
  }

  /**
   * Start periodic cleanup timer
   */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.options.cleanupInterval);

    // Don't prevent Node.js from exiting
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Stop cleanup timer and clear cache
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.clear();
  }
}

/**
 * Create a cache for email metadata
 * TTL: 1 hour (emails don't change frequently)
 */
export function createEmailCache(): Cache {
  return new Cache({
    ttl: 3600000, // 1 hour
    maxSize: 5000, // Cache up to 5000 emails
    cleanupInterval: 300000, // Cleanup every 5 minutes
  });
}

/**
 * Create a cache for credentials
 * TTL: 10 minutes (shorter for security)
 */
export function createCredentialCache(): Cache {
  return new Cache({
    ttl: 600000, // 10 minutes
    maxSize: 100, // Limited number of accounts
    cleanupInterval: 60000, // Cleanup every minute
  });
}
