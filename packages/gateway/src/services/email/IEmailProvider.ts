/**
 * CoreLink Email Provider Interface
 *
 * Defines the standard contract that all email providers must implement.
 * This enables service abstraction across Gmail, Outlook, ProtonMail, etc.
 */

import type {
  Account,
  Email,
  EmailResult,
  ListEmailsArgs,
  SendEmailArgs,
  SearchEmailsArgs,
} from './types.js';

/**
 * Email Provider Interface
 *
 * All email plugins (Gmail, Outlook, ProtonMail, etc.) must implement
 * this interface to be compatible with the EmailService orchestrator.
 */
export interface IEmailProvider {
  /**
   * List emails from the specified account
   *
   * @param account - The account to query
   * @param args - Listing parameters (max_results, query, filters)
   * @returns Array of normalized Email objects
   */
  listEmails(account: Account, args: ListEmailsArgs): Promise<Email[]>;

  /**
   * Read a single email by ID
   *
   * @param account - The account that owns the email
   * @param emailId - Provider-specific email ID
   * @returns Full email details with body content
   */
  readEmail(account: Account, emailId: string): Promise<Email>;

  /**
   * Send an email from the specified account
   *
   * @param account - The account to send from
   * @param args - Email content and recipients
   * @returns Result with message ID or error
   */
  sendEmail(account: Account, args: SendEmailArgs): Promise<EmailResult>;

  /**
   * Search emails in the specified account
   *
   * @param account - The account to search
   * @param args - Search query and filters
   * @returns Array of matching emails
   */
  searchEmails(account: Account, args: SearchEmailsArgs): Promise<Email[]>;

  /**
   * Get provider-specific capabilities and limits
   *
   * @returns Provider capabilities (optional)
   */
  getCapabilities?(): ProviderCapabilities;
}

/**
 * Provider-specific capabilities and limits
 */
export interface ProviderCapabilities {
  supportsThreading: boolean; // Gmail: yes, basic IMAP: no
  supportsLabels: boolean; // Gmail: yes, Outlook: categories
  supportsStarred: boolean;
  supportsAttachments: boolean;
  maxRecipientsPerEmail: number; // Gmail: 500, varies by provider
  maxAttachmentSize: number; // Bytes
  rateLimit?: {
    requestsPerDay?: number; // Gmail: 1 billion (quota), Outlook: varies
    requestsPerSecond?: number;
  };
}
