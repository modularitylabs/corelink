/**
 * Gmail Plugin for CoreLink
 *
 * Implements email operations using Google Gmail API
 */

import {
  ActionResult,
  ConfigField,
  ExecutionContext,
  ICoreLinkPlugin,
  PluginError,
  STANDARD_TOOLS,
  ToolDefinition,
} from '@corelink/core';
import { google } from 'googleapis';

export class GmailPlugin implements ICoreLinkPlugin {
  readonly id = 'com.corelink.gmail';
  readonly name = 'Gmail';
  readonly version = '0.1.0';
  readonly category = 'email' as const;
  readonly description = 'Access Gmail emails with granular control';

  /**
   * OAuth2 configuration
   */
  getConfigSchema(): Record<string, ConfigField> {
    return {
      clientId: {
        type: 'text',
        label: 'Google Client ID',
        description: 'OAuth 2.0 Client ID from Google Cloud Console',
        required: true,
      },
      clientSecret: {
        type: 'password',
        label: 'Google Client Secret',
        description: 'OAuth 2.0 Client Secret from Google Cloud Console',
        required: true,
      },
      redirectUri: {
        type: 'url',
        label: 'Redirect URI',
        description: 'OAuth redirect URI (must match Google Console)',
        required: true,
        default: 'http://localhost:3000/oauth/callback',
      },
    };
  }

  /**
   * Standard email tools
   */
  getStandardTools(): ToolDefinition[] {
    return [
      {
        name: STANDARD_TOOLS.EMAIL_LIST,
        description: 'List emails from inbox',
        inputSchema: {
          type: 'object',
          properties: {
            max_results: {
              type: 'number',
              description: 'Maximum number of emails to return',
              default: 10,
            },
            query: {
              type: 'string',
              description: 'Gmail search query (optional)',
            },
          },
        },
      },
      {
        name: STANDARD_TOOLS.EMAIL_READ,
        description: 'Read a specific email by ID',
        inputSchema: {
          type: 'object',
          properties: {
            email_id: {
              type: 'string',
              description: 'Email message ID',
            },
          },
          required: ['email_id'],
        },
      },
      {
        name: STANDARD_TOOLS.EMAIL_SEND,
        description: 'Send an email',
        inputSchema: {
          type: 'object',
          properties: {
            to: {
              type: 'string',
              description: 'Recipient email address',
            },
            subject: {
              type: 'string',
              description: 'Email subject',
            },
            body: {
              type: 'string',
              description: 'Email body (plain text)',
            },
          },
          required: ['to', 'subject', 'body'],
        },
      },
      {
        name: STANDARD_TOOLS.EMAIL_SEARCH,
        description: 'Search emails',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Gmail search query',
            },
            max_results: {
              type: 'number',
              description: 'Maximum results',
              default: 20,
            },
          },
          required: ['query'],
        },
      },
    ];
  }

  /**
   * Execute a tool
   */
  async execute(
    toolName: string,
    args: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<ActionResult> {
    const gmail = this.getGmailClient(context);

    switch (toolName) {
      case STANDARD_TOOLS.EMAIL_LIST:
        return this.listEmails(gmail, args);
      case STANDARD_TOOLS.EMAIL_READ:
        return this.readEmail(gmail, args);
      case STANDARD_TOOLS.EMAIL_SEND:
        return this.sendEmail(gmail, args);
      case STANDARD_TOOLS.EMAIL_SEARCH:
        return this.searchEmails(gmail, args);
      default:
        throw new PluginError(`Unknown tool: ${toolName}`);
    }
  }

  /**
   * Get authenticated Gmail client
   */
  private getGmailClient(context: ExecutionContext) {
    const { auth } = context;

    if (auth.type !== 'oauth2') {
      throw new PluginError('Gmail requires OAuth2 authentication');
    }

    const oauth2Client = new google.auth.OAuth2(
      auth.data.clientId as string,
      auth.data.clientSecret as string,
      auth.data.redirectUri as string
    );

    oauth2Client.setCredentials({
      access_token: auth.data.accessToken as string,
      refresh_token: auth.data.refreshToken as string,
      expiry_date: auth.data.expiryDate as number,
    });

    return google.gmail({ version: 'v1', auth: oauth2Client });
  }

  /**
   * List emails
   */
  private async listEmails(
    gmail: ReturnType<typeof google.gmail>,
    args: Record<string, unknown>
  ): Promise<ActionResult> {
    const maxResults = (args.max_results as number) || 10;
    const query = args.query as string | undefined;

    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults,
      q: query,
    });

    const messages = response.data.messages || [];

    return {
      data: messages,
      summary: `Listed ${messages.length} emails`,
      metadata: { total: messages.length, query },
    };
  }

  /**
   * Read email
   */
  private async readEmail(
    gmail: ReturnType<typeof google.gmail>,
    args: Record<string, unknown>
  ): Promise<ActionResult> {
    const emailId = args.email_id as string;

    const response = await gmail.users.messages.get({
      userId: 'me',
      id: emailId,
      format: 'full',
    });

    const message = response.data;
    const headers = message.payload?.headers || [];
    const subject = headers.find((h) => h.name === 'Subject')?.value || '(no subject)';
    const from = headers.find((h) => h.name === 'From')?.value || 'unknown';

    return {
      data: message,
      summary: `Read email from ${from}: "${subject}"`,
      metadata: { emailId, subject, from },
    };
  }

  /**
   * Send email
   */
  private async sendEmail(
    gmail: ReturnType<typeof google.gmail>,
    args: Record<string, unknown>
  ): Promise<ActionResult> {
    const to = args.to as string;
    const subject = args.subject as string;
    const body = args.body as string;

    // Create RFC 2822 formatted message
    const message = [
      `To: ${to}`,
      `Subject: ${subject}`,
      '',
      body,
    ].join('\n');

    const encodedMessage = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    return {
      data: response.data,
      summary: `Sent email to ${to}: "${subject}"`,
      metadata: { to, subject, messageId: response.data.id },
    };
  }

  /**
   * Search emails
   */
  private async searchEmails(
    gmail: ReturnType<typeof google.gmail>,
    args: Record<string, unknown>
  ): Promise<ActionResult> {
    const query = args.query as string;
    const maxResults = (args.max_results as number) || 20;

    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults,
      q: query,
    });

    const messages = response.data.messages || [];

    return {
      data: messages,
      summary: `Found ${messages.length} emails matching "${query}"`,
      metadata: { query, total: messages.length },
    };
  }
}

export default GmailPlugin;
