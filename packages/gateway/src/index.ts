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
import { taskService } from './services/task/TaskService.js';
import { TodoistProvider } from './services/task/providers/TodoistProvider.js';
import { MicrosoftTodoProvider } from './services/task/providers/MicrosoftTodoProvider.js';
import { UniversalTaskRouter } from './services/task/UniversalTaskRouter.js';
import { todoistOAuthRoutes } from './routes/todoist.js';
import { microsoftTodoOAuthRoutes } from './routes/microsoft-todo-oauth.js';
import { SessionTaskManager } from './services/task-queue/index.js';
import type { ToolExecutor, TaskExecutionContext } from './services/task-queue/types.js';
import { taskRoutes } from './routes/tasks.js';
import { policyEngine } from './services/policy-engine.js';
import { auditLogger } from './services/audit-logger.js';
import { TaskCleanupService } from './services/task-cleanup.js';
import { JobScheduler } from './jobs/scheduler.js';

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
 * Derive category from tool name
 */
function deriveCategory(toolName: string): string {
  if (toolName.includes('email')) return 'email';
  if (toolName.includes('task')) return 'task';
  if (toolName.includes('calendar')) return 'calendar';
  return 'system';
}

async function start() {
  // Validate environment before starting
  validateEnvironment();
  // Initialize database
  const { db, sqlite } = initDatabase();
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

  // Initialize TaskService with providers
  console.log('[CoreLink HTTP] Registering task providers...');
  taskService.registerProvider('com.corelink.todoist', new TodoistProvider());
  taskService.registerProvider('com.corelink.microsoft-todo', new MicrosoftTodoProvider());
  console.log('[CoreLink HTTP] Task providers registered');

  // Initialize UniversalTaskRouter
  const taskRouter = new UniversalTaskRouter(credentialManager);
  console.log('[CoreLink HTTP] UniversalTaskRouter initialized');

  // Initialize plugin registry (still used for tool schema definitions)
  const pluginRegistry = new PluginRegistry(db);
  await pluginRegistry.loadPlugins();

  // Create ToolExecutor function (wraps emailRouter calls for task queue)
  const toolExecutor: ToolExecutor = async (
    toolName: string,
    args: Record<string, unknown>,
    context: TaskExecutionContext
  ): Promise<unknown> => {
    console.log(`[ToolExecutor] Executing ${toolName} for task ${context.taskId}`);

    try {
      switch (toolName) {
        case 'list_emails':
          return (await emailRouter.listEmails(args, { signal: context.signal })).data;
        case 'read_email':
          return (await emailRouter.readEmail(args, { signal: context.signal })).data;
        case 'send_email':
          return (await emailRouter.sendEmail(args, { signal: context.signal })).data;
        case 'search_emails':
          return (await emailRouter.searchEmails(args, { signal: context.signal })).data;
        case 'list_tasks':
          return (await taskRouter.listTasks(args)).data;
        case 'create_task':
          return (await taskRouter.createTask(args)).data;
        case 'update_task':
          return (await taskRouter.updateTask(args)).data;
        case 'complete_task':
          return (await taskRouter.completeTask(args)).data;
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    } catch (error) {
      console.error(`[ToolExecutor] Error executing ${toolName}:`, error);
      throw error;
    }
  };

  // Initialize SessionTaskManager
  const taskManager = new SessionTaskManager(sqlite, toolExecutor);
  console.log('[CoreLink] SessionTaskManager initialized');

  // Initialize Task Cleanup Service
  const cleanupService = new TaskCleanupService(db);
  console.log('[CoreLink] TaskCleanupService initialized');

  // Initialize Job Scheduler
  const jobScheduler = new JobScheduler(cleanupService);
  jobScheduler.start();
  console.log('[CoreLink] JobScheduler started');

  // Will be assigned after MCPSessionManager is created
  let mcpSessionManager: MCPSessionManager;

  // Create MCP server factory - each session gets its own server instance
  const createMcpServer = (sessionId: string) => {
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

    // Note: The MCP SDK v1.26 handles initialization automatically
    // We cannot intercept the initialize request to capture client metadata
    // This is a limitation of the current SDK version
    // TODO: Find alternative way to capture client capabilities or upgrade SDK

    // Helper function to wrap tool execution through task queue
    const executeThroughQueue = async (
      toolName: string,
      args: Record<string, unknown>
    ): Promise<CallToolResult> => {
      const startTime = Date.now();

      // Get session metadata
      const sessionMetadata = mcpSessionManager?.getSessionMetadata(sessionId);
      const supportsAsyncTasks = !!sessionMetadata?.capabilities?.tasks;
      const agentName = sessionMetadata?.clientInfo?.name || 'Unknown Client';
      const agentVersion = sessionMetadata?.clientInfo?.version;
      const category = deriveCategory(toolName);

      console.log(`[MCP HTTP] ${toolName} called for session ${sessionId}`);
      console.log(`[MCP HTTP] Agent: ${agentName} v${agentVersion || 'unknown'}`);
      console.log(`[MCP HTTP] Execution mode: ${supportsAsyncTasks ? 'ASYNC (MCP Tasks)' : 'SYNC (enqueueAndWait)'}`);

      try {
        // ===== POLICY EVALUATION =====
        const policyResult = await policyEngine.evaluate({
          tool: toolName,
          plugin: 'universal', // Universal email tools
          agent: agentName,
          agentVersion,
          category,
          args,
        });

        console.log(`[MCP HTTP] Policy decision: ${policyResult.action}`);

        // Handle BLOCK action
        if (policyResult.action === 'BLOCK') {
          const executionTime = Date.now() - startTime;
          await auditLogger.log({
            agentName,
            category,
            pluginId: 'universal',
            toolName,
            inputArgs: args,
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
          console.log(`[MCP HTTP] Approval required for ${toolName} (request ID: ${policyResult.approvalRequestId})`);

          // Enqueue task with pending_approval status
          const task = await taskManager.enqueueTask({
            sessionId,
            toolName,
            args: policyResult.modifiedArgs || args,
            policyDecision: 'REQUIRE_APPROVAL',
            approvalRequestId: policyResult.approvalRequestId,
          });

          const executionTime = Date.now() - startTime;
          await auditLogger.log({
            agentName,
            category,
            pluginId: 'universal',
            toolName,
            inputArgs: args,
            policyDecision: {
              action: 'REQUIRE_APPROVAL',
              ruleId: policyResult.matchedRuleId,
              reason: policyResult.reason,
            },
            status: 'denied', // Approval required = effectively denied until approved
            executionTimeMs: executionTime,
            dataSummary: 'Awaiting user approval',
            metadata: {
              approvalRequestId: policyResult.approvalRequestId,
              taskId: task.id,
            },
          });

          return {
            content: [
              {
                type: 'text',
                text: `Approval Required: ${policyResult.reason || 'This operation requires user approval'}\n\nApproval Request ID: ${policyResult.approvalRequestId}\nTask ID: ${task.id}\n\nPlease approve this request via the CoreLink web dashboard at /approvals.`,
              },
            ],
            isError: true,
          };
        }

        // Use modified args if REDACT action applied
        const executionArgs = policyResult.modifiedArgs || args;

        if (supportsAsyncTasks) {
          // ===== ASYNC MODE: Client supports MCP Tasks =====
          // Enqueue task and return task ID immediately
          const task = await taskManager.enqueueTask({
            sessionId,
            toolName,
            args: executionArgs,
            policyDecision: policyResult.action,
            redactedFields: policyResult.redactedFields,
          });

          console.log(`[MCP HTTP] Task enqueued (ASYNC): ${task.id}`);
          console.log(`[MCP HTTP] Client can poll via GET /api/tasks/${task.id}`);

          // Log task creation (not execution yet)
          // Note: Audit log will show 'success' since task was successfully enqueued
          // Actual execution will be logged separately by the worker
          await auditLogger.log({
            agentName,
            category,
            pluginId: 'universal',
            toolName,
            inputArgs: args,
            policyDecision: {
              action: policyResult.action,
              ruleId: policyResult.matchedRuleId,
              redactedFields: policyResult.redactedFields,
              reason: policyResult.reason,
            },
            status: 'success',
            executionTimeMs: Date.now() - startTime,
            dataSummary: 'Task enqueued for async execution',
            metadata: { taskId: task.id },
          });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  task: {
                    id: task.id,
                    status: task.status,
                    message: 'Task enqueued. Poll /api/tasks/' + task.id + ' for results.',
                    pollInterval: 1000, // Suggest 1 second polling
                  },
                }, null, 2),
              },
            ],
          };
        } else {
          // ===== SYNC MODE: Client does NOT support MCP Tasks =====
          // Enqueue and wait for completion (HTTP connection stays open)
          console.log(`[MCP HTTP] Enqueueing task (SYNC mode - HTTP will wait for completion)`);

          const result = await taskManager.enqueueAndWait({
            sessionId,
            toolName,
            args: executionArgs,
            policyDecision: policyResult.action,
            redactedFields: policyResult.redactedFields,
          });

          console.log(`[MCP HTTP] ${toolName} completed (SYNC): ${JSON.stringify(result.result).substring(0, 200)}`);

          // Log successful execution
          await auditLogger.log({
            agentName,
            category,
            pluginId: 'universal',
            toolName,
            inputArgs: args,
            policyDecision: {
              action: policyResult.action,
              ruleId: policyResult.matchedRuleId,
              redactedFields: policyResult.redactedFields,
              reason: policyResult.reason,
            },
            status: 'success',
            executionTimeMs: Date.now() - startTime,
            dataSummary: 'Operation completed successfully (sync mode)',
          });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result.result, null, 2),
              },
            ],
          };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[MCP HTTP] ${toolName} error:`, errorMessage);

        // Log error
        try {
          const sessionMetadata = mcpSessionManager?.getSessionMetadata(sessionId);
          const agentName = sessionMetadata?.clientInfo?.name || 'Unknown Client';
          const category = deriveCategory(toolName);

          await auditLogger.log({
            agentName,
            category,
            pluginId: 'universal',
            toolName,
            inputArgs: args,
            policyDecision: {
              action: 'ALLOW',
              reason: 'Error during execution',
            },
            status: 'error',
            errorMessage,
            executionTimeMs: Date.now() - startTime,
            dataSummary: 'Error during execution',
          });
        } catch (logError) {
          console.error('[MCP HTTP] Failed to log error:', logError);
        }

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
    };

    // Register universal email tools (with task queue support)
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
        return executeThroughQueue('list_emails', args);
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
        return executeThroughQueue('read_email', args);
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
        return executeThroughQueue('send_email', args);
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
        return executeThroughQueue('search_emails', args);
      }
    );

    // Register universal task tools
    server.registerTool(
      'list_tasks',
      {
        description: 'List tasks from ALL configured task accounts (Todoist, Microsoft Todo, etc.). Aggregates results across providers.',
        inputSchema: z.object({
          project_id: z.string().optional(),
          filter: z.string().optional(),
          max_results: z.number().optional(),
          priority: z.number().min(1).max(4).optional(),
          overdue: z.boolean().optional(),
          due_before: z.string().optional(),
          due_after: z.string().optional(),
        }),
      },
      async (args: any): Promise<CallToolResult> => {
        return executeThroughQueue('list_tasks', args);
      }
    );

    server.registerTool(
      'create_task',
      {
        description: 'Create a new task in the primary task account (Todoist or Microsoft Todo).',
        inputSchema: z.object({
          title: z.string(),
          description: z.string().optional(),
          due_date: z.string().optional(),
          priority: z.number().optional(),
          project_id: z.string().optional(),
        }),
      },
      async (args: any): Promise<CallToolResult> => {
        return executeThroughQueue('create_task', args);
      }
    );

    server.registerTool(
      'update_task',
      {
        description: 'Update an existing task in the primary task account.',
        inputSchema: z.object({
          task_id: z.string(),
          title: z.string().optional(),
          description: z.string().optional(),
          due_date: z.string().optional(),
          priority: z.number().optional(),
        }),
      },
      async (args: any): Promise<CallToolResult> => {
        return executeThroughQueue('update_task', args);
      }
    );

    server.registerTool(
      'complete_task',
      {
        description: 'Mark a task as completed in the primary task account.',
        inputSchema: z.object({
          task_id: z.string(),
        }),
      },
      async (args: any): Promise<CallToolResult> => {
        return executeThroughQueue('complete_task', args);
      }
    );

    return server;
  };

  // Create MCP session manager with server factory
  // Each MCP session will get its own task queue session created dynamically
  mcpSessionManager = new MCPSessionManager((sessionId: string) => {
    // Create task queue session for this MCP session
    taskManager.createSession(sessionId).catch((error) => {
      console.error(`[CoreLink] Failed to create task queue session ${sessionId}:`, error);
    });
    console.log(`[CoreLink] Created task queue session: ${sessionId}`);

    // Return the MCP server instance
    return createMcpServer(sessionId);
  });

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
        tools: 8, // 4 email tools + 4 task tools
      },
    };
  });

  // Register OAuth routes
  fastify.register(async (instance) => {
    await oauthRoutes(instance, credentialManager);
    await outlookOAuthRoutes(instance, credentialManager);
    await todoistOAuthRoutes(instance, credentialManager);
    await microsoftTodoOAuthRoutes(instance, credentialManager);
  });

  // Register account management routes
  fastify.register(async (instance) => {
    await accountRoutes(instance, credentialManager);
  });

  // Register policy management routes
  fastify.register(policyRoutes);

  // Register task management routes
  fastify.register(async (instance) => {
    await taskRoutes(instance, taskManager, cleanupService);
  });

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
    jobScheduler.stop();
    await taskManager.shutdownAll();
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
║   - Universal task tools: 4                       ║
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
