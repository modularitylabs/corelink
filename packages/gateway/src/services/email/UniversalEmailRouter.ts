/**
 * Universal Email Router
 *
 * Routes MCP tool calls to the EmailService, implementing the business logic
 * for universal email tools that work across all providers and accounts.
 *
 * Strategy:
 * - Read operations (list, read, search): Aggregate ALL accounts
 * - Write operations (send): Use primary account
 */

import type { ActionResult } from '@corelink/core';
import { emailService } from './EmailService.js';
import { CredentialManager } from '../credential-manager.js';
import { VirtualIdManager } from '../VirtualIdManager.js';
import type { Database } from '../../db/index.js';
import type { Account, ListEmailsArgs, SendEmailArgs, SearchEmailsArgs, Email, VirtualEmail } from './types.js';

export class UniversalEmailRouter {
  private virtualIdManager: VirtualIdManager;

  constructor(
    db: Database,
    private credentialManager: CredentialManager
  ) {
    this.virtualIdManager = new VirtualIdManager(db);
  }

  /**
   * Initialize the router (loads virtual ID mappings into cache)
   */
  async initialize(): Promise<void> {
    await this.virtualIdManager.initialize();
  }

  /**
   * Translate Email to VirtualEmail (for LLM responses)
   * Converts real IDs to virtual IDs for complete service abstraction
   */
  private async translateToVirtualEmail(email: Email): Promise<VirtualEmail> {
    // Generate virtual IDs
    const virtualEmailId = await this.virtualIdManager.createVirtualEmailId(
      email.accountId,
      email.id
    );
    const virtualAccountId = await this.virtualIdManager.createVirtualAccountId(
      email.accountId
    );

    // Return VirtualEmail (no providerId exposed)
    return {
      id: virtualEmailId,
      accountId: virtualAccountId,
      subject: email.subject,
      from: email.from,
      to: email.to,
      cc: email.cc,
      bcc: email.bcc,
      replyTo: email.replyTo,
      body: email.body,
      htmlBody: email.htmlBody,
      snippet: email.snippet,
      timestamp: email.timestamp,
      isRead: email.isRead,
      isStarred: email.isStarred,
      labels: email.labels,
      threadId: email.threadId,
      hasAttachments: email.hasAttachments,
      attachments: email.attachments,
    };
  }

  /**
   * List emails from ALL email accounts
   * Aggregates results from Gmail, Outlook, and any other connected providers
   * Returns VirtualEmail objects with virtual IDs (service abstraction)
   */
  async listEmails(args: Record<string, unknown>): Promise<ActionResult> {
    console.error('[UniversalEmailRouter] listEmails called with args:', JSON.stringify(args));

    // Get all email accounts
    const accounts = await this.getAllEmailAccounts();
    console.error(`[UniversalEmailRouter] Found ${accounts.length} email account(s)`);

    if (accounts.length === 0) {
      console.error('[UniversalEmailRouter] No email accounts connected');
      return {
        data: [],
        summary: 'No email accounts connected',
        metadata: { accountCount: 0 },
      };
    }

    // Cast args to proper type
    const listArgs: ListEmailsArgs = {
      max_results: (args.max_results as number) || 10,
      query: args.query as string,
      labels: args.labels as string[],
      isRead: args.isRead as boolean,
      includeSpam: args.includeSpam as boolean,
      includeTrash: args.includeTrash as boolean,
    };

    console.error('[UniversalEmailRouter] Querying EmailService with:', JSON.stringify(listArgs));

    // Query all accounts via EmailService
    const emails = await emailService.listEmails(accounts, listArgs);
    console.error(`[UniversalEmailRouter] EmailService returned ${emails.length} email(s)`);

    // Translate all emails to virtual IDs
    const virtualEmails = await Promise.all(
      emails.map(email => this.translateToVirtualEmail(email))
    );

    return {
      data: virtualEmails,
      summary: `Retrieved ${virtualEmails.length} emails from ${accounts.length} account(s)`,
      metadata: {
        accountCount: accounts.length,
        emailCount: virtualEmails.length,
      },
    };
  }

  /**
   * Read a single email by virtual ID
   * Resolves virtual ID to real account and email IDs, then queries provider
   */
  async readEmail(args: Record<string, unknown>): Promise<ActionResult> {
    const virtualEmailId = args.email_id as string;

    if (!virtualEmailId) {
      throw new Error('email_id is required');
    }

    // Resolve virtual ID to real IDs
    const resolved = await this.virtualIdManager.resolveVirtualEmailId(virtualEmailId);
    if (!resolved) {
      throw new Error(`Invalid email ID: ${virtualEmailId}`);
    }

    const { accountId, emailId } = resolved;

    // Get account
    let account = await this.credentialManager.getAccount(accountId);
    if (!account) {
      throw new Error(`Account not found: ${accountId}`);
    }

    // Load credentials into account metadata
    const credentials = await this.credentialManager.getAccountCredentials(accountId);
    if (credentials) {
      account = {
        ...account,
        metadata: {
          ...account.metadata,
          ...credentials.data,
        },
      };
    }

    // Read email from provider
    const email = await emailService.readEmail(account as Account, emailId);

    // Translate to virtual email for response
    const virtualEmail = await this.translateToVirtualEmail(email);

    return {
      data: virtualEmail,
      summary: `Read email "${email.subject}" from ${account.email}`,
      metadata: {
        accountId: virtualEmail.accountId, // Virtual account ID
      },
    };
  }

  /**
   * Send an email from primary account (or specified account)
   * Accepts optional virtual account ID - defaults to primary account
   */
  async sendEmail(args: Record<string, unknown>): Promise<ActionResult> {
    let account: Account;

    // If account_id specified, resolve virtual ID to real account ID
    if (args.account_id) {
      const virtualAccountId = args.account_id as string;
      const realAccountId = await this.virtualIdManager.resolveVirtualAccountId(virtualAccountId);
      if (!realAccountId) {
        throw new Error(`Invalid account ID: ${virtualAccountId}`);
      }

      let foundAccount = await this.credentialManager.getAccount(realAccountId);
      if (!foundAccount) {
        throw new Error(`Account not found: ${virtualAccountId}`);
      }

      // Load credentials into account metadata
      const credentials = await this.credentialManager.getAccountCredentials(realAccountId);
      if (credentials) {
        foundAccount = {
          ...foundAccount,
          metadata: {
            ...foundAccount.metadata,
            ...credentials.data,
          },
        };
      }

      account = foundAccount as Account;
    } else {
      // Use primary email account
      const primaryAccount = await this.getPrimaryEmailAccount();
      if (!primaryAccount) {
        throw new Error('No primary email account found. Please connect an email account first.');
      }
      account = primaryAccount;
    }

    // Cast args to proper type
    const sendArgs: SendEmailArgs = {
      to: args.to as string | string[],
      subject: args.subject as string,
      body: args.body as string,
      cc: args.cc as string | string[],
      bcc: args.bcc as string | string[],
      replyTo: args.replyTo as string,
      htmlBody: args.htmlBody as string,
    };

    // Validate required fields
    if (!sendArgs.to || !sendArgs.subject || !sendArgs.body) {
      throw new Error('to, subject, and body are required fields');
    }

    const result = await emailService.sendEmail(account, sendArgs);

    if (!result.success) {
      throw new Error(result.error || 'Failed to send email');
    }

    // Create virtual account ID for response
    const virtualAccountId = await this.virtualIdManager.createVirtualAccountId(account.id);

    return {
      data: result,
      summary: `Sent email "${sendArgs.subject}" from ${account.email} to ${sendArgs.to}`,
      metadata: {
        accountId: virtualAccountId, // Virtual account ID
        messageId: result.messageId,
      },
    };
  }

  /**
   * Search emails across ALL email accounts
   * Returns VirtualEmail objects with virtual IDs (service abstraction)
   */
  async searchEmails(args: Record<string, unknown>): Promise<ActionResult> {
    const accounts = await this.getAllEmailAccounts();

    if (accounts.length === 0) {
      return {
        data: [],
        summary: 'No email accounts connected',
        metadata: { accountCount: 0 },
      };
    }

    // Cast args to proper type
    const searchArgs: SearchEmailsArgs = {
      query: args.query as string,
      max_results: (args.max_results as number) || 20,
      from: args.from as string,
      to: args.to as string,
      subject: args.subject as string,
      hasAttachment: args.hasAttachment as boolean,
      dateFrom: args.dateFrom as string,
      dateTo: args.dateTo as string,
    };

    if (!searchArgs.query) {
      throw new Error('query is required for searching emails');
    }

    const emails = await emailService.searchEmails(accounts, searchArgs);

    // Translate all emails to virtual IDs
    const virtualEmails = await Promise.all(
      emails.map(email => this.translateToVirtualEmail(email))
    );

    return {
      data: virtualEmails,
      summary: `Found ${virtualEmails.length} emails matching "${searchArgs.query}" across ${accounts.length} account(s)`,
      metadata: {
        accountCount: accounts.length,
        emailCount: virtualEmails.length,
        query: searchArgs.query,
      },
    };
  }

  /**
   * Get all email accounts (across all email providers)
   * Loads credentials into account metadata for provider access
   */
  private async getAllEmailAccounts(): Promise<Account[]> {
    // Get all accounts from all email plugins
    const allAccounts = await this.credentialManager.listAccounts();

    // Filter to only email category plugins
    // We need to check the plugin's category - for now, filter by known email plugin IDs
    const emailPluginIds = ['com.corelink.gmail', 'com.corelink.outlook', 'com.corelink.protonmail'];

    const emailAccounts = allAccounts.filter(account =>
      emailPluginIds.includes(account.pluginId)
    );

    // Load credentials for each account and add to metadata
    const accountsWithCredentials = await Promise.all(
      emailAccounts.map(async account => {
        try {
          const credentials = await this.credentialManager.getAccountCredentials(account.id);
          if (credentials) {
            console.error(`[UniversalEmailRouter] Loaded credentials for ${account.email}, type: ${credentials.type}`);
            // Merge credentials.data into account metadata for provider access
            return {
              ...account,
              metadata: {
                ...account.metadata,
                ...credentials.data, // Spread the data property, not the whole credentials object
              },
            };
          }
          console.error(`[UniversalEmailRouter] No credentials found for ${account.email}`);
          return account;
        } catch (error) {
          console.error(`[UniversalEmailRouter] Failed to load credentials for ${account.email}:`, error);
          return account;
        }
      })
    );

    return accountsWithCredentials as Account[];
  }

  /**
   * Get primary email account (used for sending emails)
   */
  private async getPrimaryEmailAccount(): Promise<Account | null> {
    const allAccounts = await this.getAllEmailAccounts();

    // Find first primary account
    const primary = allAccounts.find(account => account.isPrimary);
    if (primary) {
      return primary;
    }

    // Fallback to first account if no primary set
    return allAccounts[0] || null;
  }
}
