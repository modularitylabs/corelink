/**
 * CoreLink MCP Server Entry Point
 *
 * Standalone MCP server that runs via stdio for AI agent communication.
 * This is separate from the HTTP server (index.ts) because MCP uses stdio transport.
 */

import { config } from 'dotenv';
import * as path from 'path';
import { initDatabase } from './db/index.js';
import { CredentialManager } from './services/credential-manager.js';
import { CoreLinkMCPServer } from './mcp/index.js';

// Load environment variables
const projectRoot = path.join(process.cwd(), '..', '..');
const envPath = path.join(projectRoot, '.env');
config({ path: envPath });

/**
 * Start MCP server
 */
async function startMCPServer() {
  try {
    // Initialize database
    const { db } = initDatabase();

    // Initialize credential manager
    const credentialManager = new CredentialManager(db);

    // Create and start MCP server
    const mcpServer = new CoreLinkMCPServer({
      name: 'CoreLink Gateway',
      version: '0.1.0',
      db,
      credentialManager,
    });

    // Start server
    await mcpServer.start();

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.error('[CoreLink MCP] Shutting down...');
      await mcpServer.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.error('[CoreLink MCP] Shutting down...');
      await mcpServer.stop();
      process.exit(0);
    });
  } catch (error) {
    console.error('[CoreLink MCP] Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startMCPServer();
