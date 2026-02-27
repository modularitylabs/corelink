/**
 * Gmail Email Provider
 *
 * Implements IEmailProvider for Gmail using Google Gmail API
 */

import { google } from 'googleapis';
import type { gmail_v1 } from 'googleapis';
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

export class GmailProvider implements IEmailProvider {
  /**
   * List emails from a Gmail account
   * OPTIMIZED: Uses 'metadata' format for fast listing (no body content)
   */
  async listEmails(account: Account, args: ListEmailsArgs): Promise<Email[]> {
    const gmail = this.getGmailClient(account);
    const maxResults = Math.min(args.max_results || 10, 500);

    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults,
      q: args.query,
      includeSpamTrash: args.includeSpam || args.includeTrash,
    });

    const messages = response.data.messages || [];

    // Fetch metadata only (headers + snippet, NO body) - much faster!
    const emailPromises = messages.map(msg =>
      this.fetchEmailMetadata(gmail, account, msg.id!)
    );

    const emails = await Promise.all(emailPromises);
    return emails.filter(Boolean) as Email[];
  }

  /**
   * Read a single email by ID
   */
  async readEmail(account: Account, emailId: string): Promise<Email> {
    const gmail = this.getGmailClient(account);
    return this.fetchEmailDetails(gmail, account, emailId);
  }

  /**
   * Send an email from Gmail account
   */
  async sendEmail(account: Account, args: SendEmailArgs): Promise<EmailResult> {
    const gmail = this.getGmailClient(account);

    try {
      // Normalize recipients
      const toAddresses = Array.isArray(args.to) ? args.to : [args.to];
      const ccAddresses = args.cc ? (Array.isArray(args.cc) ? args.cc : [args.cc]) : [];
      const bccAddresses = args.bcc ? (Array.isArray(args.bcc) ? args.bcc : [args.bcc]) : [];

      // Create RFC 2822 formatted message
      const messageParts = [
        `To: ${toAddresses.join(', ')}`,
        ...(ccAddresses.length > 0 ? [`Cc: ${ccAddresses.join(', ')}`] : []),
        ...(bccAddresses.length > 0 ? [`Bcc: ${bccAddresses.join(', ')}`] : []),
        `Subject: ${args.subject}`,
        ...(args.replyTo ? [`Reply-To: ${args.replyTo}`] : []),
        'Content-Type: text/plain; charset=utf-8',
        '',
        args.body,
      ];

      const message = messageParts.join('\n');
      const encodedMessage = Buffer.from(message)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage,
        },
      });

      return {
        success: true,
        messageId: response.data.id || undefined,
        threadId: response.data.threadId || undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Search emails in Gmail account
   * OPTIMIZED: Uses 'metadata' format for fast searching (no body content)
   */
  async searchEmails(account: Account, args: SearchEmailsArgs): Promise<Email[]> {
    const gmail = this.getGmailClient(account);
    const maxResults = Math.min(args.max_results || 20, 500);

    // Build Gmail search query
    let query = args.query;

    if (args.from) {
      query += ` from:${args.from}`;
    }
    if (args.to) {
      query += ` to:${args.to}`;
    }
    if (args.subject) {
      query += ` subject:${args.subject}`;
    }
    if (args.hasAttachment) {
      query += ' has:attachment';
    }
    if (args.dateFrom) {
      const date = new Date(args.dateFrom).toISOString().split('T')[0];
      query += ` after:${date}`;
    }
    if (args.dateTo) {
      const date = new Date(args.dateTo).toISOString().split('T')[0];
      query += ` before:${date}`;
    }

    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults,
      q: query.trim(),
    });

    const messages = response.data.messages || [];

    // Fetch metadata only (headers + snippet, NO body) - much faster!
    const emailPromises = messages.map(msg =>
      this.fetchEmailMetadata(gmail, account, msg.id!)
    );

    const emails = await Promise.all(emailPromises);
    return emails.filter(Boolean) as Email[];
  }

  /**
   * Get Gmail capabilities
   */
  getCapabilities() {
    return {
      supportsThreading: true,
      supportsLabels: true,
      supportsStarred: true,
      supportsAttachments: true,
      maxRecipientsPerEmail: 500,
      maxAttachmentSize: 25 * 1024 * 1024, // 25 MB
      rateLimit: {
        requestsPerDay: 1000000000, // 1 billion quota units
        requestsPerSecond: 250,
      },
    };
  }

  /**
   * Create authenticated Gmail client
   */
  private getGmailClient(account: Account): gmail_v1.Gmail {
    const metadata = account.metadata as any;
    if (!metadata?.accessToken) {
      throw new Error(`No access token found for account: ${account.email}`);
    }

    const oauth2Client = new google.auth.OAuth2(
      metadata.clientId,
      metadata.clientSecret,
      metadata.redirectUri
    );

    oauth2Client.setCredentials({
      access_token: metadata.accessToken,
      refresh_token: metadata.refreshToken,
      expiry_date: metadata.expiryDate,
    });

    return google.gmail({ version: 'v1', auth: oauth2Client });
  }

  /**
   * Fetch email metadata only (for listing) - OPTIMIZED
   * Uses 'metadata' format which returns headers + snippet but NO body content
   * ~25x less data than 'full' format
   */
  private async fetchEmailMetadata(
    gmail: gmail_v1.Gmail,
    account: Account,
    emailId: string
  ): Promise<Email> {
    const response = await gmail.users.messages.get({
      userId: 'me',
      id: emailId,
      format: 'metadata',
      metadataHeaders: ['From', 'To', 'Cc', 'Bcc', 'Subject', 'Date'],
    });

    const message = response.data;
    const headers = message.payload?.headers || [];

    // Extract headers
    const getHeader = (name: string): string | undefined => {
      const value = headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value;
      return value || undefined;
    };

    const subject = getHeader('Subject') || '(no subject)';
    const fromRaw = getHeader('From') || 'unknown';
    const toRaw = getHeader('To') || '';
    const ccRaw = getHeader('Cc');
    const bccRaw = getHeader('Bcc');

    // Parse email addresses
    const parseAddresses = (raw: string): EmailAddress[] => {
      if (!raw) return [];
      return raw.split(',').map(addr => {
        const match = addr.match(/^(.+?)\s*<(.+?)>$/);
        if (match) {
          return { name: match[1].trim(), email: match[2].trim() };
        }
        return { email: addr.trim() };
      });
    };

    const snippet = message.snippet || '';
    const labels = message.labelIds || [];

    // Note: hasAttachments check requires parts, which may not be in metadata
    // We'll check if any parts exist as a heuristic
    const hasAttachments = (message.payload?.parts?.length || 0) > 1;

    // Normalize to Email type (NO body field - only snippet)
    return {
      id: message.id!,
      accountId: account.id,
      providerId: account.pluginId,
      subject,
      from: parseAddresses(fromRaw)[0] || { email: 'unknown' },
      to: parseAddresses(toRaw),
      cc: ccRaw ? parseAddresses(ccRaw) : undefined,
      bcc: bccRaw ? parseAddresses(bccRaw) : undefined,
      snippet,
      timestamp: parseInt(message.internalDate || '0'),
      isRead: !labels.includes('UNREAD'),
      isStarred: labels.includes('STARRED'),
      labels,
      threadId: message.threadId || undefined,
      hasAttachments,
      raw: message as any,
    };
  }

  /**
   * Fetch full email details and normalize to Email type
   * Uses 'full' format which includes complete body content
   * Used by readEmail() for on-demand full email retrieval
   */
  private async fetchEmailDetails(
    gmail: gmail_v1.Gmail,
    account: Account,
    emailId: string
  ): Promise<Email> {
    const response = await gmail.users.messages.get({
      userId: 'me',
      id: emailId,
      format: 'full',
    });

    const message = response.data;
    const headers = message.payload?.headers || [];

    // Extract headers
    const getHeader = (name: string): string | undefined => {
      const value = headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value;
      return value || undefined;
    };

    const subject = getHeader('Subject') || '(no subject)';
    const fromRaw = getHeader('From') || 'unknown';
    const toRaw = getHeader('To') || '';
    const ccRaw = getHeader('Cc');
    const bccRaw = getHeader('Bcc');

    // Parse email addresses
    const parseAddresses = (raw: string): EmailAddress[] => {
      if (!raw) return [];
      return raw.split(',').map(addr => {
        const match = addr.match(/^(.+?)\s*<(.+?)>$/);
        if (match) {
          return { name: match[1].trim(), email: match[2].trim() };
        }
        return { email: addr.trim() };
      });
    };

    // Extract body (only available in 'full' format)
    const body = this.extractBody(message.payload);
    const snippet = message.snippet || '';

    // Extract labels
    const labels = message.labelIds || [];

    // Check for attachments
    const hasAttachments = this.hasAttachments(message.payload);

    // Normalize to Email type
    return {
      id: message.id!,
      accountId: account.id,
      providerId: account.pluginId,
      subject,
      from: parseAddresses(fromRaw)[0] || { email: 'unknown' },
      to: parseAddresses(toRaw),
      cc: ccRaw ? parseAddresses(ccRaw) : undefined,
      bcc: bccRaw ? parseAddresses(bccRaw) : undefined,
      body,
      snippet,
      timestamp: parseInt(message.internalDate || '0'),
      isRead: !labels.includes('UNREAD'),
      isStarred: labels.includes('STARRED'),
      labels,
      threadId: message.threadId || undefined,
      hasAttachments,
      raw: message as any,
    };
  }

  /**
   * Extract plain text body from Gmail message
   */
  private extractBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
    if (!payload) return '';

    // Check if this part has a body
    if (payload.body?.data) {
      return Buffer.from(payload.body.data, 'base64').toString('utf-8');
    }

    // Recursively check parts
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          return Buffer.from(part.body.data, 'base64').toString('utf-8');
        }
      }

      // Fallback to any part with data
      for (const part of payload.parts) {
        const body = this.extractBody(part);
        if (body) return body;
      }
    }

    return '';
  }

  /**
   * Check if message has attachments
   */
  private hasAttachments(payload: gmail_v1.Schema$MessagePart | undefined): boolean {
    if (!payload) return false;

    if (payload.filename && payload.filename.length > 0) {
      return true;
    }

    if (payload.parts) {
      return payload.parts.some(part => this.hasAttachments(part));
    }

    return false;
  }
}
