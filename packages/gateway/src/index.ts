/**
 * CoreLink Gateway Server
 *
 * Main entry point for the MCP gateway
 */

import { config } from 'dotenv';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import * as path from 'path';
import * as fs from 'fs';

// Load .env from project root (2 levels up from packages/gateway)
const projectRoot = path.join(process.cwd(), '..', '..');
const envPath = path.join(projectRoot, '.env');

// Load environment variables
const result = config({ path: envPath });

if (result.error) {
  console.error(`Failed to load .env from ${envPath}:`, result.error);
} else {
  console.log(`✓ Loaded environment variables from: ${envPath}`);
}

import { initDatabase, runMigrations } from './db/index.js';
import { seedPolicies } from './db/seed-policies.js';
import { CredentialManager } from './services/credential-manager.js';
import { oauthRoutes } from './routes/oauth.js';
import { outlookOAuthRoutes } from './routes/outlook-oauth.js';
import { policyRoutes } from './routes/policies.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PluginRegistry } from './mcp/plugin-registry.js';
import { MCPSessionManager } from './mcp/http-handler.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

/**
 * Validate environment configuration
 */
function validateEnvironment() {
  const projectRoot = path.join(process.cwd(), '../..');
  const envPath = path.join(projectRoot, '.env');

  if (!fs.existsSync(envPath)) {
    console.error(`
╔═══════════════════════════════════════════════════╗
║   ❌ ERROR: .env file not found                   ║
╚═══════════════════════════════════════════════════╝

The .env file is missing at: ${envPath}

Current working directory: ${process.cwd()}

Please create a .env file in the project root:
  cp .env.example .env

Then restart the server.
`);
    process.exit(1);
  }

  // Check if GOOGLE_CLIENT_ID is set and not the placeholder
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  if (!googleClientId || googleClientId === '1234567890-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com') {
    console.warn(`
╔═══════════════════════════════════════════════════╗
║   ⚠️  WARNING: Google Client ID not configured    ║
╚═══════════════════════════════════════════════════╝

Gmail OAuth will not work until you set GOOGLE_CLIENT_ID in .env

See SETUP.md for instructions.
`);
  } else {
    console.log(`✓ Google Client ID loaded: ${googleClientId.substring(0, 20)}...`);
  }

  // Check Microsoft Client ID
  const microsoftClientId = process.env.MICROSOFT_CLIENT_ID;
  if (!microsoftClientId || microsoftClientId === '00000000-0000-0000-0000-000000000000') {
    console.warn(`
╔═══════════════════════════════════════════════════╗
║   ⚠️  WARNING: Microsoft Client ID not configured ║
╚═══════════════════════════════════════════════════╝

Outlook OAuth will not work until you set MICROSOFT_CLIENT_ID in .env

See OUTLOOK_SETUP.md for instructions.
`);
  } else {
    console.log(`✓ Microsoft Client ID loaded: ${microsoftClientId}`);
  }
}

/**
 * Convert JSON Schema to Zod schema
 * This is a simple converter for the schemas we use in plugins
 */
function jsonSchemaToZod(jsonSchema: Record<string, any>): z.ZodTypeAny {
  if (jsonSchema.type !== 'object') {
    return z.any();
  }

  const shape: Record<string, z.ZodTypeAny> = {};
  const properties = jsonSchema.properties || {};
  const required = jsonSchema.required || [];

  for (const [key, prop] of Object.entries(properties) as [string, any][]) {
    let zodType: z.ZodTypeAny;

    switch (prop.type) {
      case 'string':
        zodType = z.string();
        break;
      case 'number':
        zodType = z.number();
        break;
      case 'boolean':
        zodType = z.boolean();
        break;
      case 'array':
        zodType = z.array(z.any());
        break;
      case 'object':
        zodType = z.object({});
        break;
      default:
        zodType = z.any();
    }

    // Add description if present
    if (prop.description) {
      zodType = zodType.describe(prop.description);
    }

    // Make optional if not in required array
    if (!required.includes(key)) {
      zodType = zodType.optional();
    }

    shape[key] = zodType;
  }

  return z.object(shape);
}

async function start() {
  // Validate environment before starting
  validateEnvironment();
  // Initialize database
  const { db } = initDatabase();
  runMigrations(db);

  // Seed default policies and redaction patterns
  await seedPolicies();

  // Initialize services
  const credentialManager = new CredentialManager(db);

  // Initialize plugin registry
  const pluginRegistry = new PluginRegistry(db);
  await pluginRegistry.loadPlugins();
  const tools = await pluginRegistry.getAllTools();

  // Create MCP server factory - each session gets its own server instance
  const createMcpServer = () => {
    const server = new McpServer(
      {
        name: 'CoreLink Gateway',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Register all plugin tools
    for (const tool of tools) {
      server.registerTool(
        tool.name,
        {
          description: tool.description,
          inputSchema: jsonSchemaToZod(tool.inputSchema as Record<string, any>),
        },
        async (args: any): Promise<CallToolResult> => {
          const plugin = await pluginRegistry.getPluginForTool(tool.name);
          if (!plugin) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Error: Plugin not found for tool: ${tool.name}`,
                },
              ],
              isError: true,
            };
          }

          // Extract original tool name (remove plugin ID prefix)
          // Format is: pluginId__toolName
          const originalToolName = tool.name.split('__')[1] || tool.name;

          // Get credentials
          const credentials = await credentialManager.getCredentials(plugin.id);
          if (!credentials) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Error: Plugin "${plugin.name}" is not authenticated. Please connect it first via the web dashboard at http://localhost:${PORT}`,
                },
              ],
              isError: true,
            };
          }

          // Execute tool
          try {
            const result = await plugin.execute(
              originalToolName,
              args || {},
              {
                auth: credentials,
                settings: {},
                logger: (message: string, level = 'info') => {
                  console.log(`[${plugin.id}] [${level}] ${message}`);
                },
              }
            );

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
                  text: `Error executing ${originalToolName}: ${errorMessage}`,
                },
              ],
              isError: true,
            };
          }
        }
      );
    }

    return server;
  };

  // Create MCP session manager with server factory
  const mcpSessionManager = new MCPSessionManager(createMcpServer);

  // Create Fastify instance
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
  });

  // Enable CORS for web UI and MCP
  await fastify.register(cors, {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
    exposedHeaders: ['Mcp-Session-Id', 'Last-Event-Id', 'Mcp-Protocol-Version'],
  });

  // Health check
  fastify.get('/health', async () => {
    return {
      status: 'ok',
      version: '0.1.0',
      mcp: {
        enabled: true,
        sessions: mcpSessionManager.getSessionCount(),
        plugins: pluginRegistry.getPluginCount(),
        tools: tools.length,
      },
    };
  });

  // Register OAuth routes
  fastify.register(async (instance) => {
    await oauthRoutes(instance, credentialManager);
    await outlookOAuthRoutes(instance, credentialManager);
  });

  // Register policy management routes
  fastify.register(policyRoutes);

  // Register MCP HTTP routes
  fastify.post('/mcp', async (request, reply) => {
    await mcpSessionManager.handleRequest(request, reply);
  });

  fastify.get('/mcp', async (request, reply) => {
    await mcpSessionManager.handleRequest(request, reply);
  });

  fastify.delete('/mcp', async (request, reply) => {
    await mcpSessionManager.handleRequest(request, reply);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n[CoreLink] Shutting down gracefully...');
    await mcpSessionManager.cleanup();
    await fastify.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Start server
  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`
╔═══════════════════════════════════════════════════╗
║                                                   ║
║   🔗 CoreLink Gateway Server                     ║
║                                                   ║
║   HTTP API:  http://localhost:${PORT}              ║
║   MCP Server: http://localhost:${PORT}/mcp         ║
║   Status:    Running                              ║
║                                                   ║
║   📊 Stats:                                        ║
║   - Plugins loaded: ${pluginRegistry.getPluginCount()}                           ║
║   - Tools available: ${tools.length}                          ║
║                                                   ║
║   Next steps:                                     ║
║   1. Start web UI: npm run dev -w @corelink/web   ║
║   2. Visit http://localhost:5173                  ║
║   3. Connect Gmail/Outlook via OAuth              ║
║   4. Connect AI agents to http://localhost:${PORT}/mcp ║
║                                                   ║
╚═══════════════════════════════════════════════════╝
    `);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
