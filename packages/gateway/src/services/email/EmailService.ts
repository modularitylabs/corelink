/**
 * CoreLink Email Service
 *
 * Orchestrates multiple email providers (Gmail, Outlook, ProtonMail, etc.)
 * to provide a unified email interface. Aggregates results from all accounts
 * across all providers.
 */

import type { IEmailProvider } from './IEmailProvider.js';
import type {
  Account,
  Email,
  EmailResult,
  EmailStats,
  ListEmailsArgs,
  SearchEmailsArgs,
  SendEmailArgs,
} from './types.js';
import { Cache } from '../shared/cache.js';
import { withApiRetry } from '../shared/retry.js';

/**
 * Email Service - Universal email interface
 *
 * Manages multiple email accounts across different providers
 * and aggregates their results into a unified view.
 */
export class EmailService {
  private providers: Map<string, IEmailProvider> = new Map();
  private cache: Cache<Email | Email[]>;

  constructor(cache?: Cache) {
    this.cache = cache || new Cache({ ttl: 3600000, maxSize: 5000 }); // 1 hour, 5000 emails
  }

  /**
   * Register an email provider
   *
   * @param pluginId - Provider plugin ID (e.g., "com.corelink.gmail")
   * @param provider - Provider implementation
   */
  registerProvider(pluginId: string, provider: IEmailProvider): void {
    this.providers.set(pluginId, provider);
    console.log(`[EmailService] Registered provider: ${pluginId}`);
  }

  /**
   * Unregister an email provider
   */
  unregisterProvider(pluginId: string): boolean {
    return this.providers.delete(pluginId);
  }

  /**
   * List emails from ALL configured email accounts
   *
   * Queries all accounts across all providers in parallel,
   * merges results, sorts by timestamp, and returns the most recent emails.
   *
   * @param accounts - List of email accounts to query
   * @param args - Listing parameters
   * @returns Aggregated and sorted email list
   */
  async listEmails(accounts: Account[], args: ListEmailsArgs): Promise<Email[]> {
    if (accounts.length === 0) {
      return [];
    }

    const maxResults = args.max_results || 10;

    // Query all accounts in parallel
    const emailPromises = accounts.map(async account => {
      const provider = this.providers.get(account.pluginId);
      if (!provider) {
        console.warn(`[EmailService] No provider found for ${account.pluginId}`);
        return [];
      }

      try {
        // Wrap in retry logic
        return await withApiRetry(() =>
          provider.listEmails(account, {
            ...args,
            max_results: maxResults, // Request full amount from each
          })
        );
      } catch (error) {
        console.error(
          `[EmailService] Failed to list emails from ${account.email}:`,
          error instanceof Error ? error.message : String(error)
        );
        // Return empty array on failure (partial results from other accounts)
        return [];
      }
    });

    // Wait for all providers to respond
    const emailArrays = await Promise.all(emailPromises);

    // Flatten and merge all results
    const allEmails = emailArrays.flat();

    // Sort by timestamp (most recent first)
    allEmails.sort((a, b) => b.timestamp - a.timestamp);

    // Return top N results
    return allEmails.slice(0, maxResults);
  }

  /**
   * Read a single email by ID
   *
   * @param account - The account that owns the email
   * @param emailId - Provider-specific email ID
   * @returns Full email details
   */
  async readEmail(account: Account, emailId: string): Promise<Email> {
    // Check cache first
    const cacheKey = `email:${account.id}:${emailId}`;
    const cached = this.cache.get(cacheKey);
    if (cached && !Array.isArray(cached)) {
      return cached;
    }

    const provider = this.providers.get(account.pluginId);
    if (!provider) {
      throw new Error(`No provider found for ${account.pluginId}`);
    }

    // Fetch with retry
    const email = await withApiRetry(() => provider.readEmail(account, emailId));

    // Cache the result
    this.cache.set(cacheKey, email);

    return email;
  }

  /**
   * Send an email from a specific account
   *
   * @param account - The account to send from (or primary account if not specified)
   * @param args - Email content and recipients
   * @returns Send result with message ID
   */
  async sendEmail(account: Account, args: SendEmailArgs): Promise<EmailResult> {
    const provider = this.providers.get(account.pluginId);
    if (!provider) {
      throw new Error(`No provider found for ${account.pluginId}`);
    }

    // Sending is critical - use retry logic
    const result = await withApiRetry(() => provider.sendEmail(account, args));

    // Invalidate cache for sent folder (if applicable)
    // TODO: Implement more granular cache invalidation

    return result;
  }

  /**
   * Search emails across ALL configured accounts
   *
   * @param accounts - List of email accounts to search
   * @param args - Search query and filters
   * @returns Aggregated search results sorted by relevance/timestamp
   */
  async searchEmails(accounts: Account[], args: SearchEmailsArgs): Promise<Email[]> {
    if (accounts.length === 0) {
      return [];
    }

    const maxResults = args.max_results || 20;

    // Search all accounts in parallel
    const searchPromises = accounts.map(async account => {
      const provider = this.providers.get(account.pluginId);
      if (!provider) {
        console.warn(`[EmailService] No provider found for ${account.pluginId}`);
        return [];
      }

      try {
        return await withApiRetry(() =>
          provider.searchEmails(account, {
            ...args,
            max_results: maxResults,
          })
        );
      } catch (error) {
        console.error(
          `[EmailService] Failed to search emails in ${account.email}:`,
          error instanceof Error ? error.message : String(error)
        );
        return [];
      }
    });

    // Wait for all searches to complete
    const resultArrays = await Promise.all(searchPromises);

    // Flatten and merge
    const allResults = resultArrays.flat();

    // Sort by timestamp (most recent first)
    // TODO: Could implement relevance scoring here
    allResults.sort((a, b) => b.timestamp - a.timestamp);

    return allResults.slice(0, maxResults);
  }

  /**
   * Get aggregate statistics across all accounts
   *
   * @param accounts - List of email accounts
   * @returns Email statistics
   */
  async getStats(accounts: Account[]): Promise<EmailStats> {
    const stats: EmailStats = {
      totalAccounts: accounts.length,
      totalEmails: 0,
      unreadCount: 0,
      byProvider: {},
      byAccount: {},
    };

    // Query recent emails from all accounts to get counts
    const recentEmails = await this.listEmails(accounts, { max_results: 100 });

    stats.totalEmails = recentEmails.length;
    stats.unreadCount = recentEmails.filter(email => !email.isRead).length;

    // Count by provider and account
    for (const email of recentEmails) {
      // By provider
      stats.byProvider[email.providerId] = (stats.byProvider[email.providerId] || 0) + 1;

      // By account
      stats.byAccount[email.accountId] = (stats.byAccount[email.accountId] || 0) + 1;
    }

    return stats;
  }

  /**
   * Clear cache for a specific account
   */
  clearAccountCache(_accountId: string): void {
    // TODO: Implement prefix-based cache clearing
    // For now, just clear everything
    this.cache.clear();
  }

  /**
   * Clear all cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// Export singleton instance
export const emailService = new EmailService();
