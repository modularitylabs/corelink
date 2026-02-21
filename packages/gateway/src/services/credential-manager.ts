/**
 * Credential Manager Service
 *
 * Handles secure storage and retrieval of plugin credentials
 */

import { PluginCredentials } from '@corelink/core';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { decryptCredentials, encryptCredentials } from '../crypto/encryption.js';
import { Database, schema } from '../db/index.js';

export class CredentialManager {
  constructor(private db: Database) {}

  /**
   * Store credentials for a plugin
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
      pluginId,
      type,
      encryptedData,
    });

    return id;
  }

  /**
   * Get credentials for a plugin
   */
  async getCredentials(pluginId: string): Promise<PluginCredentials | null> {
    const result = await this.db
      .select()
      .from(schema.credentials)
      .where(eq(schema.credentials.pluginId, pluginId))
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
   * Update credentials
   */
  async updateCredentials(
    pluginId: string,
    data: Record<string, unknown>
  ): Promise<void> {
    const existing = await this.db
      .select()
      .from(schema.credentials)
      .where(eq(schema.credentials.pluginId, pluginId))
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
      .where(eq(schema.credentials.pluginId, pluginId));
  }

  /**
   * Delete credentials
   */
  async deleteCredentials(pluginId: string): Promise<void> {
    await this.db
      .delete(schema.credentials)
      .where(eq(schema.credentials.pluginId, pluginId));
  }

  /**
   * Check if credentials exist
   */
  async hasCredentials(pluginId: string): Promise<boolean> {
    const result = await this.db
      .select({ id: schema.credentials.id })
      .from(schema.credentials)
      .where(eq(schema.credentials.pluginId, pluginId))
      .limit(1);

    return result.length > 0;
  }
}
