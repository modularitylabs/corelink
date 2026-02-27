/**
 * CoreLink MCP Server
 *
 * Implements the Model Context Protocol server that AI agents connect to.
 * Provides a unified interface to all registered plugins.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { PluginRegistry } from './plugin-registry.js';
import { CredentialManager } from '../services/credential-manager.js';
import { policyEngine } from '../services/policy-engine.js';
import { auditLogger } from '../services/audit-logger.js';
import { UniversalEmailRouter } from '../services/email/UniversalEmailRouter.js';
import type { Database } from '../db/index.js';

/**
 * MCP Server configuration
 */
export interface MCPServerConfig {
  name: string;
  version: string;
  db: Database;
  credentialManager: CredentialManager;
}

/**
 * CoreLink MCP Server
 */
export class CoreLinkMCPServer {
  private server: Server;
  private registry: PluginRegistry;
  private emailRouter: UniversalEmailRouter;

  constructor(config: MCPServerConfig) {
    this.registry = new PluginRegistry(config.db);
    this.emailRouter = new UniversalEmailRouter(config.db, config.credentialManager);

    // Create MCP server instance
    this.server = new Server(
      {
        name: config.name,
        version: config.version,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  /**
   * Setup MCP protocol handlers
   */
  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = await this.registry.getAllTools();
      return { tools };
    });

    // Execute tool
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name: toolName, arguments: args } = request.params;
      const startTime = Date.now();

      try {
        // Check if this is a universal tool
        if (!this.registry.isUniversalTool(toolName)) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: Unknown tool "${toolName}". CoreLink only exposes universal tools.`,
              },
            ],
            isError: true,
          };
        }

        // ===== POLICY EVALUATION =====
        // Evaluate policy before executing the tool
        const policyResult = await policyEngine.evaluate({
          tool: toolName,
          plugin: 'universal', // Universal tools not tied to specific plugin
          agent: 'Claude Code', // TODO: Extract from request metadata
          args: args as Record<string, unknown>,
          category: 'email', // TODO: Derive from tool name
        });

        // Handle BLOCK action
        if (policyResult.action === 'BLOCK') {
          const executionTime = Date.now() - startTime;
          await auditLogger.log({
            agentName: 'Claude Code',
            category: 'email',
            pluginId: 'universal',
            toolName,
            inputArgs: args as Record<string, unknown>,
            policyDecision: {
              action: 'BLOCK',
              ruleId: policyResult.matchedRuleId,
              reason: policyResult.reason,
            },
            status: 'denied',
            executionTimeMs: executionTime,
            dataSummary: 'Request blocked by policy',
          });

          return {
            content: [
              {
                type: 'text',
                text: `Access Denied: ${policyResult.reason || 'Policy does not allow this operation'}`,
              },
            ],
            isError: true,
          };
        }

        // Handle REQUIRE_APPROVAL action
        if (policyResult.action === 'REQUIRE_APPROVAL') {
          const executionTime = Date.now() - startTime;
          await auditLogger.log({
            agentName: 'Claude Code',
            category: 'email',
            pluginId: 'universal',
            toolName,
            inputArgs: args as Record<string, unknown>,
            policyDecision: {
              action: 'REQUIRE_APPROVAL',
              ruleId: policyResult.matchedRuleId,
              reason: policyResult.reason,
            },
            status: 'denied',
            executionTimeMs: executionTime,
            dataSummary: 'Approval required',
            metadata: {
              approvalRequestId: policyResult.approvalRequestId,
            },
          });

          return {
            content: [
              {
                type: 'text',
                text: `Approval Required: ${policyResult.reason || 'This operation requires user approval'}\n\nApproval Request ID: ${policyResult.approvalRequestId}\n\nPlease approve this request via the CoreLink web dashboard.`,
              },
            ],
            isError: true,
          };
        }

        // Use modified args if REDACT action applied
        const executionArgs = policyResult.modifiedArgs || (args as Record<string, unknown>);

        // Route to appropriate universal router
        let result;
        switch (toolName) {
          case 'list_emails':
            result = await this.emailRouter.listEmails(executionArgs);
            break;
          case 'read_email':
            result = await this.emailRouter.readEmail(executionArgs);
            break;
          case 'send_email':
            result = await this.emailRouter.sendEmail(executionArgs);
            break;
          case 'search_emails':
            result = await this.emailRouter.searchEmails(executionArgs);
            break;
          default:
            throw new Error(`Universal tool "${toolName}" not implemented`);
        }

        // Handle REDACT action - redact output if needed
        let finalResult = result.data;
        let redactedOutputFields: string[] = [];

        if (policyResult.action === 'REDACT') {
          const { redactedResult, redactedFields } = await policyEngine.redactResult(result.data);
          finalResult = redactedResult;
          redactedOutputFields = redactedFields;
        }

        // Calculate execution time
        const executionTime = Date.now() - startTime;

        // Log successful execution
        await auditLogger.log({
          agentName: 'Claude Code',
          category: 'email',
          pluginId: 'universal',
          toolName,
          inputArgs: args as Record<string, unknown>,
          policyDecision: {
            action: policyResult.action,
            ruleId: policyResult.matchedRuleId,
            redactedFields: [
              ...(policyResult.redactedFields || []),
              ...redactedOutputFields,
            ],
            reason: policyResult.reason,
          },
          status: 'success',
          executionTimeMs: executionTime,
          dataSummary: result.summary || 'Operation completed successfully',
        });

        // Return result
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(finalResult, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const executionTime = Date.now() - startTime;

        // Log error
        try {
          await auditLogger.log({
            agentName: 'Claude Code',
            category: 'email',
            pluginId: 'universal',
            toolName,
            inputArgs: args as Record<string, unknown>,
            policyDecision: {
              action: 'ALLOW', // Error happened during execution, not policy
              reason: 'Execution error',
            },
            status: 'error',
            errorMessage,
            executionTimeMs: executionTime,
            dataSummary: 'Error during execution',
          });
        } catch (logError) {
          console.error('[CoreLink MCP] Failed to log error:', logError);
        }

        return {
          content: [
            {
              type: 'text',
              text: `Error executing tool "${toolName}": ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  /**
   * Get the plugin registry
   */
  getRegistry(): PluginRegistry {
    return this.registry;
  }

  /**
   * Start the MCP server with stdio transport
   */
  async start() {
    // Load all plugins (needed for EmailService providers)
    await this.registry.loadPlugins();

    // Initialize email router (loads virtual ID mappings into cache)
    await this.emailRouter.initialize();
    console.error('[CoreLink MCP] Email router initialized');

    // Register universal email tools
    this.registerUniversalEmailTools();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    console.error('[CoreLink MCP] Server started and listening on stdio');
    console.error(`[CoreLink MCP] Loaded ${this.registry.getPluginCount()} plugins`);
    console.error(`[CoreLink MCP] Available tools: ${(await this.registry.getAllTools()).length}`);
  }

  /**
   * Register universal email tools
   * These tools aggregate across all email providers
   */
  private registerUniversalEmailTools() {
    this.registry.registerUniversalTool({
      name: 'list_emails',
      description: 'List emails from ALL configured email accounts (Gmail, Outlook, etc.). Aggregates and sorts by timestamp.',
      inputSchema: {
        type: 'object',
        properties: {
          max_results: {
            type: 'number',
            description: 'Maximum number of emails to return (default: 10, max: 500)',
            default: 10,
          },
          query: {
            type: 'string',
            description: 'Optional search query',
          },
          labels: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter by labels/categories',
          },
          isRead: {
            type: 'boolean',
            description: 'Filter by read/unread status',
          },
        },
      },
    });

    this.registry.registerUniversalTool({
      name: 'read_email',
      description: 'Read a single email by virtual ID. The email_id is obtained from list_emails or search_emails results.',
      inputSchema: {
        type: 'object',
        properties: {
          email_id: {
            type: 'string',
            description: 'Virtual email ID (format: email_<id>). Get this from list_emails or search_emails.',
          },
        },
        required: ['email_id'],
      },
    });

    this.registry.registerUniversalTool({
      name: 'send_email',
      description: 'Send an email from the primary email account (or specify account_id to use a different account).',
      inputSchema: {
        type: 'object',
        properties: {
          to: {
            oneOf: [
              { type: 'string' },
              { type: 'array', items: { type: 'string' } },
            ],
            description: 'Recipient email address(es)',
          },
          subject: {
            type: 'string',
            description: 'Email subject',
          },
          body: {
            type: 'string',
            description: 'Email body (plain text)',
          },
          cc: {
            oneOf: [
              { type: 'string' },
              { type: 'array', items: { type: 'string' } },
            ],
            description: 'CC recipients',
          },
          bcc: {
            oneOf: [
              { type: 'string' },
              { type: 'array', items: { type: 'string' } },
            ],
            description: 'BCC recipients',
          },
          htmlBody: {
            type: 'string',
            description: 'Email body (HTML)',
          },
          account_id: {
            type: 'string',
            description: 'Optional: Virtual account ID (format: account_<id>) to send from. Defaults to primary account.',
          },
        },
        required: ['to', 'subject', 'body'],
      },
    });

    this.registry.registerUniversalTool({
      name: 'search_emails',
      description: 'Search emails across ALL configured email accounts. Returns aggregated results sorted by timestamp.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query string',
          },
          max_results: {
            type: 'number',
            description: 'Maximum number of results (default: 20)',
            default: 20,
          },
          from: {
            type: 'string',
            description: 'Filter by sender email',
          },
          to: {
            type: 'string',
            description: 'Filter by recipient email',
          },
          subject: {
            type: 'string',
            description: 'Filter by subject keywords',
          },
          hasAttachment: {
            type: 'boolean',
            description: 'Filter emails with attachments',
          },
        },
        required: ['query'],
      },
    });
  }

  /**
   * Stop the MCP server
   */
  async stop() {
    await this.server.close();
    console.error('[CoreLink MCP] Server stopped');
  }
}
