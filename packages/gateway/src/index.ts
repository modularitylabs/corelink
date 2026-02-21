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
import { CredentialManager } from './services/credential-manager.js';
import { oauthRoutes } from './routes/oauth.js';
import { outlookOAuthRoutes } from './routes/outlook-oauth.js';

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

async function start() {
  // Validate environment before starting
  validateEnvironment();
  // Initialize database
  const { db } = initDatabase();
  runMigrations(db);

  // Initialize services
  const credentialManager = new CredentialManager(db);

  // Create Fastify instance
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
  });

  // Enable CORS for web UI
  await fastify.register(cors, {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  });

  // Health check
  fastify.get('/health', async () => {
    return { status: 'ok', version: '0.1.0' };
  });

  // Register OAuth routes
  fastify.register(async (instance) => {
    await oauthRoutes(instance, credentialManager);
    await outlookOAuthRoutes(instance, credentialManager);
  });

  // Start server
  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`
╔═══════════════════════════════════════════════════╗
║                                                   ║
║   🔗 CoreLink Gateway Server                     ║
║                                                   ║
║   Server:  http://localhost:${PORT}                ║
║   Status:  Running                                ║
║                                                   ║
║   Next steps:                                     ║
║   1. Start the web UI: npm run dev -w @corelink/web
║   2. Visit http://localhost:5173                  ║
║   3. Connect Gmail or Outlook                     ║
║                                                   ║
╚═══════════════════════════════════════════════════╝
    `);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
