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

        // Create execution context
        const context: ExecutionContext = {
          auth: credentials,
          settings: {},
          logger: (message: string, level = 'info') => {
            console.log(`[${plugin.id}] [${level}] ${message}`);
          },
        };

        // Execute the tool
        const result = await plugin.execute(toolName, args as Record<string, unknown>, context);

        // Return result
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result.data, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
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
