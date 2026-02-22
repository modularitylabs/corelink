/**
 * Outlook Email Provider
 *
 * Implements IEmailProvider for Outlook/Office 365 using Microsoft Graph API
 */

import { Client } from '@microsoft/microsoft-graph-client';
import type { IEmailProvider } from '../IEmailProvider.js';
import type {
  Account,
  Email,
  EmailAddress,
  EmailResult,
  ListEmailsArgs,
  SearchEmailsArgs,
  SendEmailArgs,
} from '../types.js';

/**
 * Microsoft Graph Message type (simplified)
 * Based on @microsoft/microsoft-graph-types but defined inline to avoid dependency
 */
interface Message {
  id?: string;
  subject?: string;
  bodyPreview?: string;
  body?: {
    contentType?: string;
    content?: string;
  };
  from?: {
    emailAddress?: {
      name?: string;
      address?: string;
    };
  };
  toRecipients?: Array<{
    emailAddress?: {
      name?: string;
      address?: string;
    };
  }>;
  ccRecipients?: Array<{
    emailAddress?: {
      name?: string;
      address?: string;
    };
  }>;
  bccRecipients?: Array<{
    emailAddress?: {
      name?: string;
      address?: string;
    };
  }>;
  receivedDateTime?: string;
  isRead?: boolean;
  hasAttachments?: boolean;
  categories?: string[];
  conversationId?: string;
  flag?: {
    flagStatus?: string;
  };
}

export class OutlookProvider implements IEmailProvider {
  /**
   * List emails from an Outlook account
   */
  async listEmails(account: Account, args: ListEmailsArgs): Promise<Email[]> {
    const client = this.getGraphClient(account);
    const maxResults = Math.min(args.max_results || 10, 1000);

    // Build query parameters
    let endpoint = `/me/messages?$top=${maxResults}&$orderby=receivedDateTime desc`;

    if (args.query) {
      endpoint += `&$filter=contains(subject,'${args.query}')`;
    }

    if (args.isRead !== undefined) {
      const readFilter = args.isRead ? 'isRead eq true' : 'isRead eq false';
      endpoint += endpoint.includes('$filter')
        ? ` and ${readFilter}`
        : `&$filter=${readFilter}`;
    }

    const response = await client.api(endpoint).get();
    const messages: Message[] = response.value || [];

    return messages.map(msg => this.normalizeEmail(msg, account));
  }

  /**
   * Read a single email by ID
   */
  async readEmail(account: Account, emailId: string): Promise<Email> {
    const client = this.getGraphClient(account);

    const message: Message = await client.api(`/me/messages/${emailId}`).get();

    return this.normalizeEmail(message, account);
  }

  /**
   * Send an email from Outlook account
   */
  async sendEmail(account: Account, args: SendEmailArgs): Promise<EmailResult> {
    const client = this.getGraphClient(account);

    try {
      // Normalize recipients
      const toAddresses = Array.isArray(args.to) ? args.to : [args.to];
      const ccAddresses = args.cc ? (Array.isArray(args.cc) ? args.cc : [args.cc]) : [];
      const bccAddresses = args.bcc ? (Array.isArray(args.bcc) ? args.bcc : [args.bcc]) : [];

      // Build message
      const message = {
        subject: args.subject,
        body: {
          contentType: args.htmlBody ? 'HTML' : 'Text',
          content: args.htmlBody || args.body,
        },
        toRecipients: toAddresses.map(email => ({
          emailAddress: { address: email },
        })),
        ...(ccAddresses.length > 0 && {
          ccRecipients: ccAddresses.map(email => ({
            emailAddress: { address: email },
          })),
        }),
        ...(bccAddresses.length > 0 && {
          bccRecipients: bccAddresses.map(email => ({
            emailAddress: { address: email },
          })),
        }),
        ...(args.replyTo && {
          replyTo: [{ emailAddress: { address: args.replyTo } }],
        }),
      };

      const response = await client.api('/me/sendMail').post({
        message,
        saveToSentItems: true,
      });

      return {
        success: true,
        messageId: response?.id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Search emails in Outlook account
   */
  async searchEmails(account: Account, args: SearchEmailsArgs): Promise<Email[]> {
    const client = this.getGraphClient(account);
    const maxResults = Math.min(args.max_results || 20, 1000);

    // Build search query
    let filterParts: string[] = [];

    if (args.query) {
      filterParts.push(`contains(subject,'${args.query}') or contains(body/content,'${args.query}')`);
    }
    if (args.from) {
      filterParts.push(`from/emailAddress/address eq '${args.from}'`);
    }
    if (args.to) {
      filterParts.push(`toRecipients/any(r: r/emailAddress/address eq '${args.to}')`);
    }
    if (args.subject) {
      filterParts.push(`contains(subject,'${args.subject}')`);
    }
    if (args.hasAttachment !== undefined) {
      filterParts.push(`hasAttachments eq ${args.hasAttachment}`);
    }
    if (args.dateFrom) {
      filterParts.push(`receivedDateTime ge ${args.dateFrom}`);
    }
    if (args.dateTo) {
      filterParts.push(`receivedDateTime le ${args.dateTo}`);
    }

    let endpoint = `/me/messages?$top=${maxResults}&$orderby=receivedDateTime desc`;
    if (filterParts.length > 0) {
      endpoint += `&$filter=${filterParts.join(' and ')}`;
    }

    const response = await client.api(endpoint).get();
    const messages: Message[] = response.value || [];

    return messages.map(msg => this.normalizeEmail(msg, account));
  }

  /**
   * Get Outlook capabilities
   */
  getCapabilities() {
    return {
      supportsThreading: true,
      supportsLabels: false, // Outlook uses categories instead
      supportsStarred: true, // Flagged messages
      supportsAttachments: true,
      maxRecipientsPerEmail: 500,
      maxAttachmentSize: 150 * 1024 * 1024, // 150 MB for Office 365
      rateLimit: {
        requestsPerDay: undefined, // Varies by tenant
        requestsPerSecond: undefined, // Throttling is dynamic
      },
    };
  }

  /**
   * Create authenticated Microsoft Graph client
   */
  private getGraphClient(account: Account): Client {
    const metadata = account.metadata as any;
    if (!metadata?.accessToken) {
      throw new Error(`No access token found for account: ${account.email}`);
    }

    return Client.init({
      authProvider: done => {
        done(null, metadata.accessToken);
      },
    });
  }

  /**
   * Normalize Outlook message to Email type
   */
  private normalizeEmail(message: Message, account: Account): Email {
    // Parse email addresses
    const parseAddress = (recipient: any): EmailAddress => ({
      email: recipient?.emailAddress?.address || 'unknown',
      name: recipient?.emailAddress?.name,
    });

    const from = parseAddress(message.from);
    const to = (message.toRecipients || []).map(parseAddress);
    const cc = message.ccRecipients ? message.ccRecipients.map(parseAddress) : undefined;
    const bcc = message.bccRecipients ? message.bccRecipients.map(parseAddress) : undefined;

    // Extract body
    const body = message.body?.content || '';
    const snippet = message.bodyPreview || '';

    // Convert receivedDateTime to timestamp
    const timestamp = message.receivedDateTime
      ? new Date(message.receivedDateTime).getTime()
      : Date.now();

    // Extract categories (Outlook's version of labels)
    const labels = message.categories || [];

    return {
      id: message.id!,
      accountId: account.id,
      providerId: account.pluginId,
      subject: message.subject || '(no subject)',
      from,
      to,
      cc,
      bcc,
      body,
      snippet,
      timestamp,
      isRead: message.isRead || false,
      isStarred: message.flag?.flagStatus === 'flagged',
      labels,
      threadId: message.conversationId,
      hasAttachments: message.hasAttachments || false,
      raw: message as any,
    };
  }
}
