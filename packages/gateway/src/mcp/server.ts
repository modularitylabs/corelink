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
import { ExecutionContext } from '@corelink/core';
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
  private credentialManager: CredentialManager;

  constructor(config: MCPServerConfig) {
    this.credentialManager = config.credentialManager;
    this.registry = new PluginRegistry(config.db);

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
        // Find which plugin provides this tool
        const plugin = await this.registry.getPluginForTool(toolName);
        if (!plugin) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: Unknown tool "${toolName}"`,
              },
            ],
            isError: true,
          };
        }

        // Get credentials for this plugin
        const credentials = await this.credentialManager.getCredentials(plugin.id);
        if (!credentials) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: Plugin "${plugin.name}" is not authenticated. Please connect it first via the web dashboard.`,
              },
            ],
            isError: true,
          };
        }

        // ===== POLICY EVALUATION =====
        // Evaluate policy before executing the tool
        const policyResult = await policyEngine.evaluate({
          tool: toolName,
          plugin: plugin.id,
          agent: 'Claude Code', // TODO: Extract from request metadata
          args: args as Record<string, unknown>,
          category: plugin.category,
        });

        // Handle BLOCK action
        if (policyResult.action === 'BLOCK') {
          const executionTime = Date.now() - startTime;
          await auditLogger.log({
            agentName: 'Claude Code',
            pluginId: plugin.id,
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
            pluginId: plugin.id,
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

        // Create execution context
        const context: ExecutionContext = {
          auth: credentials,
          settings: {},
          logger: (message: string, level = 'info') => {
            console.log(`[${plugin.id}] [${level}] ${message}`);
          },
        };

        // Execute the tool
        const result = await plugin.execute(toolName, executionArgs, context);

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
          pluginId: plugin.id,
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
          const plugin = await this.registry.getPluginForTool(toolName);
          if (plugin) {
            await auditLogger.log({
              agentName: 'Claude Code',
              pluginId: plugin.id,
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
          }
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
    // Load all plugins
    await this.registry.loadPlugins();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    console.error('[CoreLink MCP] Server started and listening on stdio');
    console.error(`[CoreLink MCP] Loaded ${this.registry.getPluginCount()} plugins`);
    console.error(`[CoreLink MCP] Available tools: ${(await this.registry.getAllTools()).length}`);
  }

  /**
   * Stop the MCP server
   */
  async stop() {
    await this.server.close();
    console.error('[CoreLink MCP] Server stopped');
  }
}
