/**
 * Microsoft Outlook Plugin for CoreLink
 *
 * Implements email operations using Microsoft Graph API
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
import { Client } from '@microsoft/microsoft-graph-client';

export class OutlookPlugin implements ICoreLinkPlugin {
  readonly id = 'com.corelink.outlook';
  readonly name = 'Outlook';
  readonly version = '0.1.0';
  readonly category = 'email' as const;
  readonly description = 'Access Outlook emails with granular control';

  /**
   * OAuth2 configuration
   */
  getConfigSchema(): Record<string, ConfigField> {
    return {
      clientId: {
        type: 'text',
        label: 'Microsoft Client ID',
        description: 'OAuth 2.0 Client ID from Azure Portal',
        required: true,
      },
      redirectUri: {
        type: 'url',
        label: 'Redirect URI',
        description: 'OAuth redirect URI (must match Azure Portal)',
        required: true,
        default: 'http://127.0.0.1:3000/oauth/callback/outlook',
      },
    };
  }

  /**
   * Standard email tools (same as Gmail!)
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
              description: 'Search query (optional)',
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
              description: 'Search query',
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
    const graphClient = this.getGraphClient(context);

    switch (toolName) {
      case STANDARD_TOOLS.EMAIL_LIST:
        return this.listEmails(graphClient, args);
      case STANDARD_TOOLS.EMAIL_READ:
        return this.readEmail(graphClient, args);
      case STANDARD_TOOLS.EMAIL_SEND:
        return this.sendEmail(graphClient, args);
      case STANDARD_TOOLS.EMAIL_SEARCH:
        return this.searchEmails(graphClient, args);
      default:
        throw new PluginError(`Unknown tool: ${toolName}`);
    }
  }

  /**
   * Get authenticated Microsoft Graph client
   */
  private getGraphClient(context: ExecutionContext): Client {
    const { auth } = context;

    if (auth.type !== 'oauth2') {
      throw new PluginError('Outlook requires OAuth2 authentication');
    }

    return Client.init({
      authProvider: (done) => {
        done(null, auth.data.accessToken as string);
      },
    });
  }

  /**
   * List emails
   */
  private async listEmails(
    graphClient: Client,
    args: Record<string, unknown>
  ): Promise<ActionResult> {
    const maxResults = (args.max_results as number) || 10;

    const response = await graphClient
      .api('/me/messages')
      .top(maxResults)
      .select('id,subject,from,receivedDateTime')
      .orderby('receivedDateTime desc')
      .get();

    const messages = response.value || [];

    return {
      data: messages,
      summary: `Listed ${messages.length} emails`,
      metadata: { total: messages.length },
    };
  }

  /**
   * Read email
   */
  private async readEmail(
    graphClient: Client,
    args: Record<string, unknown>
  ): Promise<ActionResult> {
    const emailId = args.email_id as string;

    const message = await graphClient
      .api(`/me/messages/${emailId}`)
      .select('id,subject,from,body,receivedDateTime')
      .get();

    const subject = message.subject || '(no subject)';
    const from = message.from?.emailAddress?.address || 'unknown';

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
    graphClient: Client,
    args: Record<string, unknown>
  ): Promise<ActionResult> {
    const to = args.to as string;
    const subject = args.subject as string;
    const body = args.body as string;

    const message = {
      subject,
      body: {
        contentType: 'Text',
        content: body,
      },
      toRecipients: [
        {
          emailAddress: {
            address: to,
          },
        },
      ],
    };

    await graphClient.api('/me/sendMail').post({
      message,
      saveToSentItems: true,
    });

    return {
      data: { sent: true },
      summary: `Sent email to ${to}: "${subject}"`,
      metadata: { to, subject },
    };
  }

  /**
   * Search emails
   */
  private async searchEmails(
    graphClient: Client,
    args: Record<string, unknown>
  ): Promise<ActionResult> {
    const query = args.query as string;
    const maxResults = (args.max_results as number) || 20;

    const response = await graphClient
      .api('/me/messages')
      .search(`"${query}"`)
      .top(maxResults)
      .select('id,subject,from,receivedDateTime')
      .get();

    const messages = response.value || [];

    return {
      data: messages,
      summary: `Found ${messages.length} emails matching "${query}"`,
      metadata: { query, total: messages.length },
    };
  }
}

export default OutlookPlugin;
