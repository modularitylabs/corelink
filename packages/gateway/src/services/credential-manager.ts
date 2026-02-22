/**
 * Credential Manager Service
 *
 * Handles secure storage and retrieval of plugin credentials
 * Now with multi-account support for connecting multiple accounts per provider
 */

import { PluginCredentials } from '@corelink/core';
import { eq, and, isNull } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { decryptCredentials, encryptCredentials } from '../crypto/encryption.js';
import { Database, schema } from '../db/index.js';
import type { Account } from './email/types.js';

export class CredentialManager {
  constructor(private db: Database) {}

  // ===========================================
  // ACCOUNT MANAGEMENT (Multi-Account Support)
  // ===========================================

  /**
   * Create a new account
   *
   * @param pluginId - Plugin ID (e.g., "com.corelink.gmail")
   * @param email - Account email address
   * @param displayName - Optional friendly name
   * @param metadata - Optional provider-specific metadata
   * @returns Account ID (UUID)
   */
  async createAccount(
    pluginId: string,
    email: string,
    displayName?: string,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    const id = randomUUID();

    // Check if this is the first account for this plugin
    const existingAccounts = await this.listAccounts(pluginId);
    const isPrimary = existingAccounts.length === 0; // First account is primary

    await this.db.insert(schema.accounts).values({
      id,
      pluginId,
      email,
      displayName: displayName || null,
      isPrimary,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });

    console.log(
      `[CredentialManager] Created account: ${email} for ${pluginId} (primary: ${isPrimary})`
    );

    return id;
  }

  /**
   * Get an account by ID
   */
  async getAccount(accountId: string): Promise<Account | null> {
    const result = await this.db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.id, accountId))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const row = result[0];
    return {
      id: row.id,
      pluginId: row.pluginId,
      email: row.email,
      displayName: row.displayName || undefined,
      isPrimary: Boolean(row.isPrimary),
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * List all accounts for a plugin (or all accounts if no plugin specified)
   */
  async listAccounts(pluginId?: string): Promise<Account[]> {
    const query = pluginId
      ? this.db.select().from(schema.accounts).where(eq(schema.accounts.pluginId, pluginId))
      : this.db.select().from(schema.accounts);

    const results = await query;

    return results.map(row => ({
      id: row.id,
      pluginId: row.pluginId,
      email: row.email,
      displayName: row.displayName || undefined,
      isPrimary: Boolean(row.isPrimary),
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  /**
   * Get primary account for a plugin
   */
  async getPrimaryAccount(pluginId: string): Promise<Account | null> {
    const result = await this.db
      .select()
      .from(schema.accounts)
      .where(
        and(eq(schema.accounts.pluginId, pluginId), eq(schema.accounts.isPrimary, true))
      )
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const row = result[0];
    return {
      id: row.id,
      pluginId: row.pluginId,
      email: row.email,
      displayName: row.displayName || undefined,
      isPrimary: true,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * Set an account as primary (and unset others for this plugin)
   */
  async setPrimaryAccount(accountId: string): Promise<void> {
    const account = await this.getAccount(accountId);
    if (!account) {
      throw new Error(`Account not found: ${accountId}`);
    }

    // Unset all primary accounts for this plugin
    await this.db
      .update(schema.accounts)
      .set({ isPrimary: false, updatedAt: new Date().toISOString() })
      .where(eq(schema.accounts.pluginId, account.pluginId));

    // Set this account as primary
    await this.db
      .update(schema.accounts)
      .set({ isPrimary: true, updatedAt: new Date().toISOString() })
      .where(eq(schema.accounts.id, accountId));

    console.log(`[CredentialManager] Set ${account.email} as primary account`);
  }

  /**
   * Update account metadata
   */
  async updateAccount(
    accountId: string,
    updates: {
      displayName?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<void> {
    const updateData: any = {
      updatedAt: new Date().toISOString(),
    };

    if (updates.displayName !== undefined) {
      updateData.displayName = updates.displayName;
    }
    if (updates.metadata !== undefined) {
      updateData.metadata = JSON.stringify(updates.metadata);
    }

    await this.db
      .update(schema.accounts)
      .set(updateData)
      .where(eq(schema.accounts.id, accountId));
  }

  /**
   * Delete an account and its credentials
   */
  async deleteAccount(accountId: string): Promise<void> {
    const account = await this.getAccount(accountId);
    if (!account) {
      throw new Error(`Account not found: ${accountId}`);
    }

    // Delete associated credentials
    await this.db
      .delete(schema.credentials)
      .where(eq(schema.credentials.accountId, accountId));

    // Delete account
    await this.db.delete(schema.accounts).where(eq(schema.accounts.id, accountId));

    // If this was the primary account, promote another account to primary
    if (account.isPrimary) {
      const remainingAccounts = await this.listAccounts(account.pluginId);
      if (remainingAccounts.length > 0) {
        await this.setPrimaryAccount(remainingAccounts[0].id);
      }
    }

    console.log(`[CredentialManager] Deleted account: ${account.email}`);
  }

  // ===========================================
  // CREDENTIAL MANAGEMENT (Account-Aware)
  // ===========================================

  /**
   * Store credentials for a specific account
   */
  async storeAccountCredentials(
    accountId: string,
    type: PluginCredentials['type'],
    data: Record<string, unknown>
  ): Promise<string> {
    const account = await this.getAccount(accountId);
    if (!account) {
      throw new Error(`Account not found: ${accountId}`);
    }

    const id = randomUUID();
    const encryptedData = encryptCredentials(data);

    await this.db.insert(schema.credentials).values({
      id,
      accountId,
      pluginId: account.pluginId, // Keep for backward compatibility
      type,
      encryptedData,
    });

    console.log(`[CredentialManager] Stored credentials for account: ${account.email}`);

    return id;
  }

  /**
   * Get credentials for a specific account
   */
  async getAccountCredentials(accountId: string): Promise<PluginCredentials | null> {
    const result = await this.db
      .select()
      .from(schema.credentials)
      .where(eq(schema.credentials.accountId, accountId))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const cred = result[0];
    const data = decryptCredentials(cred.encryptedData);

    return {
      type: cred.type as PluginCredentials['type'],
      data,
    };
  }

  /**
   * Update credentials for an account
   */
  async updateAccountCredentials(
    accountId: string,
    data: Record<string, unknown>
  ): Promise<void> {
    const existing = await this.db
      .select()
      .from(schema.credentials)
      .where(eq(schema.credentials.accountId, accountId))
      .limit(1);

    if (existing.length === 0) {
      throw new Error(`No credentials found for account: ${accountId}`);
    }

    const encryptedData = encryptCredentials(data);

    await this.db
      .update(schema.credentials)
      .set({
        encryptedData,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.credentials.accountId, accountId));
  }

  /**
   * Delete credentials for an account
   */
  async deleteAccountCredentials(accountId: string): Promise<void> {
    await this.db
      .delete(schema.credentials)
      .where(eq(schema.credentials.accountId, accountId));
  }

  // ===========================================
  // LEGACY METHODS (Backward Compatibility)
  // ===========================================

  /**
   * Store credentials for a plugin (legacy - single account)
   * @deprecated Use createAccount + storeAccountCredentials instead
   */
  async storeCredentials(
    pluginId: string,
    type: PluginCredentials['type'],
    data: Record<string, unknown>
  ): Promise<string> {
    const id = randomUUID();
    const encryptedData = encryptCredentials(data);

    await this.db.insert(schema.credentials).values({
      id,
      accountId: null, // Legacy credentials have no account
      pluginId,
      type,
      encryptedData,
    });

    return id;
  }

  /**
   * Get credentials for a plugin (legacy - returns primary account credentials)
   * @deprecated Use getPrimaryAccount + getAccountCredentials instead
   */
  async getCredentials(pluginId: string): Promise<PluginCredentials | null> {
    // Try to get credentials for primary account
    const primaryAccount = await this.getPrimaryAccount(pluginId);
    if (primaryAccount) {
      return this.getAccountCredentials(primaryAccount.id);
    }

    // Fallback to legacy credentials (accountId = null)
    const result = await this.db
      .select()
      .from(schema.credentials)
      .where(
        and(eq(schema.credentials.pluginId, pluginId), isNull(schema.credentials.accountId))
      )
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const cred = result[0];
    const data = decryptCredentials(cred.encryptedData);

    return {
      type: cred.type as PluginCredentials['type'],
      data,
    };
  }

  /**
   * Update credentials (legacy - updates primary account credentials)
   * @deprecated Use updateAccountCredentials instead
   */
  async updateCredentials(
    pluginId: string,
    data: Record<string, unknown>
  ): Promise<void> {
    const primaryAccount = await this.getPrimaryAccount(pluginId);
    if (primaryAccount) {
      return this.updateAccountCredentials(primaryAccount.id, data);
    }

    // Fallback to legacy credentials
    const existing = await this.db
      .select()
      .from(schema.credentials)
      .where(
        and(eq(schema.credentials.pluginId, pluginId), isNull(schema.credentials.accountId))
      )
      .limit(1);

    if (existing.length === 0) {
      throw new Error(`No credentials found for plugin: ${pluginId}`);
    }

    const encryptedData = encryptCredentials(data);

    await this.db
      .update(schema.credentials)
      .set({
        encryptedData,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(eq(schema.credentials.pluginId, pluginId), isNull(schema.credentials.accountId))
      );
  }

  /**
   * Delete credentials (legacy - deletes all credentials for plugin)
   * @deprecated Use deleteAccount instead
   */
  async deleteCredentials(pluginId: string): Promise<void> {
    await this.db
      .delete(schema.credentials)
      .where(eq(schema.credentials.pluginId, pluginId));
  }

  /**
   * Check if credentials exist (legacy - checks for any credentials)
   * @deprecated Use listAccounts to check for accounts
   */
  async hasCredentials(pluginId: string): Promise<boolean> {
    try {
      // Try to check for accounts (requires accounts table to exist)
      const accounts = await this.listAccounts(pluginId);
      if (accounts.length > 0) {
        return true;
      }
    } catch (error) {
      // Accounts table might not exist yet - fall through to legacy check
      console.warn('[CredentialManager] Could not check accounts table:', error);
    }

    try {
      // Check for legacy credentials
      const result = await this.db
        .select({ id: schema.credentials.id })
        .from(schema.credentials)
        .where(eq(schema.credentials.pluginId, pluginId))
        .limit(1);

      return result.length > 0;
    } catch (error) {
      console.error('[CredentialManager] Error checking credentials:', error);
      return false;
    }
  }
}
