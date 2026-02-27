/**
 * Virtual ID Manager
 *
 * Provides complete service abstraction by generating virtual IDs for emails and accounts.
 * LLMs interact with virtual IDs only - real provider IDs are never exposed.
 *
 * Architecture:
 * - Hybrid storage: In-memory LRU cache + SQLite persistence
 * - Virtual email IDs: email_<nanoid> (e.g., email_abc123xyz)
 * - Virtual account IDs: account_<nanoid> (e.g., account_xyz789)
 * - Bidirectional mapping: virtual ↔ real
 */

import { nanoid } from 'nanoid';
import { eq, and } from 'drizzle-orm';
import type { Database } from '../db/index.js';
import { virtualIdMappings } from '../db/schema.js';

/**
 * Virtual ID mapping types
 */
export type VirtualIdType = 'email' | 'account';

/**
 * Virtual email ID mapping
 */
export interface VirtualEmailMapping {
  virtualId: string;
  realAccountId: string;
  providerEmailId: string;
  createdAt: string;
}

/**
 * Virtual account ID mapping
 */
export interface VirtualAccountMapping {
  virtualId: string;
  realAccountId: string;
  createdAt: string;
}

/**
 * Resolved virtual email ID
 */
export interface ResolvedEmailId {
  accountId: string;
  emailId: string;
}

/**
 * Virtual ID Manager
 * Manages virtual ID generation, storage, and resolution
 */
export class VirtualIdManager {
  // In-memory cache (LRU with max 10k entries)
  private emailCache: Map<string, VirtualEmailMapping> = new Map();
  private accountCache: Map<string, VirtualAccountMapping> = new Map();
  private readonly MAX_CACHE_SIZE = 10000;

  // Reverse lookups for fast resolution
  private emailReverseCache: Map<string, string> = new Map(); // "accountId:emailId" -> virtualId
  private accountReverseCache: Map<string, string> = new Map(); // realAccountId -> virtualId

  constructor(private db: Database) {}

  /**
   * Initialize the manager (load recent mappings into cache)
   */
  async initialize(): Promise<void> {
    try {
      // Load recent email mappings (last 1000, ordered by most recent)
      const emailMappings = await this.db
        .select()
        .from(virtualIdMappings)
        .where(eq(virtualIdMappings.type, 'email'))
        .limit(1000);

      let loadedEmails = 0;
      let skippedEmails = 0;

      for (const mapping of emailMappings) {
        // NULL POINTER FIX: Validate providerEntityId before using
        if (!mapping.providerEntityId) {
          console.warn(
            `[VirtualIdManager] Skipping corrupted email mapping: ${mapping.virtualId} has null providerEntityId`
          );
          skippedEmails++;
          continue;
        }

        const emailMapping: VirtualEmailMapping = {
          virtualId: mapping.virtualId,
          realAccountId: mapping.realAccountId,
          providerEmailId: mapping.providerEntityId,
          createdAt: mapping.createdAt,
        };
        this.emailCache.set(mapping.virtualId, emailMapping);
        this.emailReverseCache.set(
          `${mapping.realAccountId}:${mapping.providerEntityId}`,
          mapping.virtualId
        );
        loadedEmails++;
      }

      // Load account mappings
      const accountMappings = await this.db
        .select()
        .from(virtualIdMappings)
        .where(eq(virtualIdMappings.type, 'account'));

      for (const mapping of accountMappings) {
        const accountMapping: VirtualAccountMapping = {
          virtualId: mapping.virtualId,
          realAccountId: mapping.realAccountId,
          createdAt: mapping.createdAt,
        };
        this.accountCache.set(mapping.virtualId, accountMapping);
        this.accountReverseCache.set(mapping.realAccountId, mapping.virtualId);
      }

      console.error(
        `[VirtualIdManager] Initialized with ${loadedEmails} email mappings (${skippedEmails} skipped) and ${accountMappings.length} account mappings`
      );
    } catch (error) {
      console.error('[VirtualIdManager] Failed to initialize cache:', error);
      // Continue anyway - will populate cache as needed
    }
  }

  /**
   * Create or retrieve virtual email ID
   * If mapping already exists, returns existing virtual ID
   *
   * RACE CONDITION FIX: Uses INSERT OR IGNORE pattern to handle concurrent requests
   * UNIQUE constraint (type, realAccountId, providerEntityId) ensures no duplicates
   */
  async createVirtualEmailId(accountId: string, providerEmailId: string): Promise<string> {
    // Check reverse cache first
    const cacheKey = `${accountId}:${providerEmailId}`;
    const existingVirtualId = this.emailReverseCache.get(cacheKey);
    if (existingVirtualId) {
      return existingVirtualId;
    }

    // Generate new virtual ID with collision retry
    const virtualId = await this.generateUniqueEmailId();
    const createdAt = new Date().toISOString();

    // Try to insert - if unique constraint fails, another thread created it
    // Use INSERT OR IGNORE to handle race condition
    try {
      await this.db.insert(virtualIdMappings).values({
        virtualId,
        type: 'email',
        realAccountId: accountId,
        providerEntityId: providerEmailId,
        createdAt,
      });

      // Successfully inserted - cache and return our new ID
      this.cacheEmailMapping({
        virtualId,
        realAccountId: accountId,
        providerEmailId,
        createdAt,
      });

      return virtualId;
    } catch (error: any) {
      // Check if it's a constraint violation (another thread inserted first)
      if (error?.code === 'SQLITE_CONSTRAINT' || error?.message?.includes('UNIQUE constraint')) {
        console.error('[VirtualIdManager] Race condition detected, fetching existing mapping');

        // Another thread won - fetch their virtual ID
        const existing = await this.db
          .select()
          .from(virtualIdMappings)
          .where(
            and(
              eq(virtualIdMappings.type, 'email'),
              eq(virtualIdMappings.realAccountId, accountId),
              eq(virtualIdMappings.providerEntityId, providerEmailId)
            )
          )
          .limit(1);

        if (existing.length > 0) {
          const existingVirtualId = existing[0].virtualId;
          // Cache the winner's mapping
          this.cacheEmailMapping({
            virtualId: existingVirtualId,
            realAccountId: accountId,
            providerEmailId,
            createdAt: existing[0].createdAt,
          });
          return existingVirtualId;
        }

        // Should never reach here - constraint failed but no record found
        throw new Error(`Constraint violation but no existing mapping found for ${accountId}:${providerEmailId}`);
      }

      // Not a constraint error - this is a real failure
      console.error('[VirtualIdManager] CRITICAL: Failed to persist email mapping:', error);
      throw new Error(`Virtual ID persistence failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Generate unique email virtual ID with collision detection
   */
  private async generateUniqueEmailId(): Promise<string> {
    const MAX_ATTEMPTS = 3;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const virtualId = `email_${nanoid(12)}`;

      // Check if this ID already exists (collision detection)
      const exists = await this.db
        .select()
        .from(virtualIdMappings)
        .where(eq(virtualIdMappings.virtualId, virtualId))
        .limit(1);

      if (exists.length === 0) {
        return virtualId;
      }

      console.warn(`[VirtualIdManager] Virtual ID collision detected: ${virtualId}, retrying (attempt ${attempt + 1}/${MAX_ATTEMPTS})`);
    }

    throw new Error('Failed to generate unique virtual ID after 3 attempts - astronomical collision rate detected');
  }

  /**
   * Create or retrieve virtual account ID
   *
   * RACE CONDITION FIX: Uses INSERT OR IGNORE pattern to handle concurrent requests
   * UNIQUE constraint (type, realAccountId) ensures no duplicates
   */
  async createVirtualAccountId(realAccountId: string): Promise<string> {
    // Check cache first
    const existingVirtualId = this.accountReverseCache.get(realAccountId);
    if (existingVirtualId) {
      return existingVirtualId;
    }

    // Generate new virtual ID with collision retry
    const virtualId = await this.generateUniqueAccountId();
    const createdAt = new Date().toISOString();

    // Try to insert - if unique constraint fails, another thread created it
    try {
      await this.db.insert(virtualIdMappings).values({
        virtualId,
        type: 'account',
        realAccountId,
        providerEntityId: null,
        createdAt,
      });

      // Successfully inserted - cache and return our new ID
      this.cacheAccountMapping({
        virtualId,
        realAccountId,
        createdAt,
      });

      return virtualId;
    } catch (error: any) {
      // Check if it's a constraint violation (another thread inserted first)
      if (error?.code === 'SQLITE_CONSTRAINT' || error?.message?.includes('UNIQUE constraint')) {
        console.error('[VirtualIdManager] Race condition detected, fetching existing mapping');

        // Another thread won - fetch their virtual ID
        const existing = await this.db
          .select()
          .from(virtualIdMappings)
          .where(
            and(
              eq(virtualIdMappings.type, 'account'),
              eq(virtualIdMappings.realAccountId, realAccountId)
            )
          )
          .limit(1);

        if (existing.length > 0) {
          const existingVirtualId = existing[0].virtualId;
          // Cache the winner's mapping
          this.cacheAccountMapping({
            virtualId: existingVirtualId,
            realAccountId,
            createdAt: existing[0].createdAt,
          });
          return existingVirtualId;
        }

        // Should never reach here - constraint failed but no record found
        throw new Error(`Constraint violation but no existing mapping found for account ${realAccountId}`);
      }

      // Not a constraint error - this is a real failure
      console.error('[VirtualIdManager] CRITICAL: Failed to persist account mapping:', error);
      throw new Error(`Virtual ID persistence failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Generate unique account virtual ID with collision detection
   */
  private async generateUniqueAccountId(): Promise<string> {
    const MAX_ATTEMPTS = 3;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const virtualId = `account_${nanoid(12)}`;

      // Check if this ID already exists (collision detection)
      const exists = await this.db
        .select()
        .from(virtualIdMappings)
        .where(eq(virtualIdMappings.virtualId, virtualId))
        .limit(1);

      if (exists.length === 0) {
        return virtualId;
      }

      console.warn(`[VirtualIdManager] Virtual ID collision detected: ${virtualId}, retrying (attempt ${attempt + 1}/${MAX_ATTEMPTS})`);
    }

    throw new Error('Failed to generate unique virtual ID after 3 attempts - astronomical collision rate detected');
  }

  /**
   * Resolve virtual email ID to real account and email IDs
   */
  async resolveVirtualEmailId(virtualId: string): Promise<ResolvedEmailId | null> {
    // Check cache first
    const cached = this.emailCache.get(virtualId);
    if (cached) {
      // LRU FIX: Move accessed item to end (most recently used)
      this.emailCache.delete(virtualId);
      this.emailCache.set(virtualId, cached);

      return {
        accountId: cached.realAccountId,
        emailId: cached.providerEmailId,
      };
    }

    // Check database
    try {
      const result = await this.db
        .select()
        .from(virtualIdMappings)
        .where(
          and(
            eq(virtualIdMappings.virtualId, virtualId),
            eq(virtualIdMappings.type, 'email')
          )
        )
        .limit(1);

      if (result.length > 0) {
        const mapping = result[0];

        // NULL POINTER FIX: Validate providerEntityId before using
        if (!mapping.providerEntityId) {
          console.error(
            `[VirtualIdManager] Corrupted email mapping found: ${virtualId} has null providerEntityId`
          );
          return null;
        }

        const emailMapping: VirtualEmailMapping = {
          virtualId: mapping.virtualId,
          realAccountId: mapping.realAccountId,
          providerEmailId: mapping.providerEntityId,
          createdAt: mapping.createdAt,
        };
        // Update cache
        this.cacheEmailMapping(emailMapping);
        return {
          accountId: mapping.realAccountId,
          emailId: mapping.providerEntityId,
        };
      }
    } catch (error) {
      console.error('[VirtualIdManager] Failed to resolve virtual email ID:', error);
      throw new Error(`Failed to resolve virtual email ID: ${error instanceof Error ? error.message : String(error)}`);
    }

    return null;
  }

  /**
   * Resolve virtual account ID to real account ID
   */
  async resolveVirtualAccountId(virtualId: string): Promise<string | null> {
    // Check cache first
    const cached = this.accountCache.get(virtualId);
    if (cached) {
      // LRU FIX: Move accessed item to end (most recently used)
      this.accountCache.delete(virtualId);
      this.accountCache.set(virtualId, cached);

      return cached.realAccountId;
    }

    // Check database
    try {
      const result = await this.db
        .select()
        .from(virtualIdMappings)
        .where(
          and(
            eq(virtualIdMappings.virtualId, virtualId),
            eq(virtualIdMappings.type, 'account')
          )
        )
        .limit(1);

      if (result.length > 0) {
        const mapping = result[0];
        const accountMapping: VirtualAccountMapping = {
          virtualId: mapping.virtualId,
          realAccountId: mapping.realAccountId,
          createdAt: mapping.createdAt,
        };
        // Update cache
        this.cacheAccountMapping(accountMapping);
        return mapping.realAccountId;
      }
    } catch (error) {
      console.error('[VirtualIdManager] Failed to resolve virtual account ID:', error);
    }

    return null;
  }

  /**
   * Cache email mapping (with LRU eviction)
   * LRU FIX: Evicts least recently used item (first key in Map = oldest accessed)
   * Maps maintain insertion order, and we re-insert on access (see resolveVirtualEmailId)
   */
  private cacheEmailMapping(mapping: VirtualEmailMapping): void {
    // Evict least recently used if cache full
    if (this.emailCache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.emailCache.keys().next().value as string | undefined;
      if (firstKey) {
        const firstMapping = this.emailCache.get(firstKey);
        if (firstMapping) {
          // Clean up reverse cache
          this.emailReverseCache.delete(
            `${firstMapping.realAccountId}:${firstMapping.providerEmailId}`
          );
        }
        this.emailCache.delete(firstKey);
      }
    }

    this.emailCache.set(mapping.virtualId, mapping);
    this.emailReverseCache.set(
      `${mapping.realAccountId}:${mapping.providerEmailId}`,
      mapping.virtualId
    );
  }

  /**
   * Cache account mapping (with LRU eviction)
   * LRU FIX: Evicts least recently used item (first key in Map = oldest accessed)
   * Maps maintain insertion order, and we re-insert on access (see resolveVirtualAccountId)
   */
  private cacheAccountMapping(mapping: VirtualAccountMapping): void {
    // Evict least recently used if cache full
    if (this.accountCache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.accountCache.keys().next().value as string | undefined;
      if (firstKey) {
        const firstMapping = this.accountCache.get(firstKey);
        if (firstMapping) {
          // Clean up reverse cache
          this.accountReverseCache.delete(firstMapping.realAccountId);
        }
        this.accountCache.delete(firstKey);
      }
    }

    this.accountCache.set(mapping.virtualId, mapping);
    this.accountReverseCache.set(mapping.realAccountId, mapping.virtualId);
  }

  /**
   * Get cache statistics (for debugging)
   */
  getCacheStats() {
    return {
      emailMappings: this.emailCache.size,
      accountMappings: this.accountCache.size,
      maxSize: this.MAX_CACHE_SIZE,
    };
  }
}
