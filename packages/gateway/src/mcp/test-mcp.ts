/**
 * MCP Server Test Script
 *
 * Simple test to verify MCP server initialization and plugin loading
 */

import { initDatabase } from '../db/index.js';
import { CredentialManager } from '../services/credential-manager.js';
import { CoreLinkMCPServer } from './server.js';

async function testMCPServer() {
  console.log('🧪 Testing CoreLink MCP Server\n');

  try {
    // Initialize database
    console.log('1. Initializing database...');
    const { db } = initDatabase();
    console.log('   ✓ Database initialized\n');

    // Initialize credential manager
    console.log('2. Initializing credential manager...');
    const credentialManager = new CredentialManager(db);
    console.log('   ✓ Credential manager initialized\n');

    // Create MCP server
    console.log('3. Creating MCP server...');
    const mcpServer = new CoreLinkMCPServer({
      name: 'CoreLink Gateway (Test)',
      version: '0.1.0',
      db,
      credentialManager,
    });
    console.log('   ✓ MCP server created\n');

    // Load plugins
    console.log('4. Loading plugins...');
    const registry = mcpServer.getRegistry();
    await registry.loadPlugins();

    const pluginCount = registry.getPluginCount();
    console.log(`   ✓ Loaded ${pluginCount} plugin(s)\n`);

    // List all plugins
    console.log('5. Available plugins:');
    const plugins = registry.getAllPlugins();
    for (const plugin of plugins) {
      console.log(`   - ${plugin.name} (${plugin.id})`);
      console.log(`     Category: ${plugin.category}`);
      console.log(`     Version: ${plugin.version}`);
    }
    console.log('');

    // List all tools
    console.log('6. Available tools:');
    const tools = await registry.getAllTools();
    for (const tool of tools) {
      console.log(`   - ${tool.name}: ${tool.description}`);
    }
    console.log('');

    console.log('✅ All tests passed!\n');
    console.log('To start the MCP server for real:');
    console.log('  npm run dev:mcp -w @corelink/gateway\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testMCPServer();
