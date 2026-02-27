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
import { accountRoutes } from './routes/accounts.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PluginRegistry } from './mcp/plugin-registry.js';
import { MCPSessionManager } from './mcp/http-handler.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { UniversalEmailRouter } from './services/email/UniversalEmailRouter.js';
import { emailService } from './services/email/EmailService.js';
import { GmailProvider } from './services/email/providers/GmailProvider.js';
import { OutlookProvider } from './services/email/providers/OutlookProvider.js';

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

  // Initialize EmailService with providers (for virtual ID support)
  console.log('[CoreLink HTTP] Registering email providers...');
  emailService.registerProvider('com.corelink.gmail', new GmailProvider());
  emailService.registerProvider('com.corelink.outlook', new OutlookProvider());
  console.log('[CoreLink HTTP] Email providers registered');

  // Initialize UniversalEmailRouter (handles virtual ID translation)
  const emailRouter = new UniversalEmailRouter(db, credentialManager);
  await emailRouter.initialize();
  console.log('[CoreLink HTTP] UniversalEmailRouter initialized');

  // Initialize plugin registry (still used for tool schema definitions)
  const pluginRegistry = new PluginRegistry(db);
  await pluginRegistry.loadPlugins();

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

    // Register universal email tools (with virtual ID support)
    server.registerTool(
      'list_emails',
      {
        description: 'List emails from ALL configured email accounts (Gmail, Outlook, etc.). Aggregates and sorts by timestamp. Returns virtual IDs.',
        inputSchema: z.object({
          max_results: z.number().optional(),
          query: z.string().optional(),
          labels: z.array(z.string()).optional(),
          isRead: z.boolean().optional(),
        }),
      },
      async (args: any): Promise<CallToolResult> => {
        console.error('[MCP HTTP] list_emails tool called with args:', JSON.stringify(args));
        try {
          const result = await emailRouter.listEmails(args);
          console.error('[MCP HTTP] list_emails returned:', JSON.stringify(result.data).substring(0, 200));
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
          console.error('[MCP HTTP] list_emails error:', errorMessage);
          return {
            content: [
              {
                type: 'text',
                text: `Error: ${errorMessage}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    server.registerTool(
      'read_email',
      {
        description: 'Read a single email by virtual ID. The email_id is obtained from list_emails or search_emails results.',
        inputSchema: z.object({
          email_id: z.string(),
        }),
      },
      async (args: any): Promise<CallToolResult> => {
        try {
          const result = await emailRouter.readEmail(args);
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
                text: `Error: ${errorMessage}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    server.registerTool(
      'send_email',
      {
        description: 'Send an email from the primary email account (or specify account_id to use a different account). Uses virtual account IDs.',
        inputSchema: z.object({
          to: z.union([z.string(), z.array(z.string())]),
          subject: z.string(),
          body: z.string(),
          cc: z.union([z.string(), z.array(z.string())]).optional(),
          bcc: z.union([z.string(), z.array(z.string())]).optional(),
          htmlBody: z.string().optional(),
          account_id: z.string().optional(),
        }),
      },
      async (args: any): Promise<CallToolResult> => {
        try {
          const result = await emailRouter.sendEmail(args);
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
                text: `Error: ${errorMessage}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    server.registerTool(
      'search_emails',
      {
        description: 'Search emails across ALL configured email accounts. Returns aggregated results sorted by timestamp with virtual IDs.',
        inputSchema: z.object({
          query: z.string(),
          max_results: z.number().optional(),
          from: z.string().optional(),
          to: z.string().optional(),
          subject: z.string().optional(),
          hasAttachment: z.boolean().optional(),
          dateFrom: z.string().optional(),
          dateTo: z.string().optional(),
        }),
      },
      async (args: any): Promise<CallToolResult> => {
        try {
          const result = await emailRouter.searchEmails(args);
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
                text: `Error: ${errorMessage}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

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
        tools: 4, // Universal email tools: list_emails, read_email, send_email, search_emails
      },
    };
  });

  // Register OAuth routes
  fastify.register(async (instance) => {
    await oauthRoutes(instance, credentialManager);
    await outlookOAuthRoutes(instance, credentialManager);
  });

  // Register account management routes
  fastify.register(async (instance) => {
    await accountRoutes(instance, credentialManager);
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
║   - Universal email tools: 4                      ║
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
