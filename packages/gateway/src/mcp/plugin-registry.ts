/**
 * Plugin Registry
 *
 * Manages all CoreLink plugins and provides tool discovery.
 */

import { ICoreLinkPlugin, ToolDefinition } from '@corelink/core';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Database } from '../db/index.js';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Plugin Registry
 * Responsible for loading, managing, and querying plugins
 */
export class PluginRegistry {
  private plugins: Map<string, ICoreLinkPlugin> = new Map();
  private toolToPlugin: Map<string, string> = new Map(); // toolName -> pluginId
  private universalTools: Map<string, Tool> = new Map(); // Universal tools (not plugin-specific)

  constructor(_db: Database) {
    // Database reserved for future use (policy engine, plugin metadata, etc.)
  }

  /**
   * Load all plugins from the plugins directory
   */
  async loadPlugins() {
    // Find plugins directory
    const projectRoot = path.join(process.cwd(), '..', '..');
    const pluginsDir = path.join(projectRoot, 'plugins');

    if (!fs.existsSync(pluginsDir)) {
      console.warn(`[PluginRegistry] Plugins directory not found: ${pluginsDir}`);
      return;
    }

    // Get all plugin directories
    const pluginDirs = fs.readdirSync(pluginsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    console.error(`[PluginRegistry] Found ${pluginDirs.length} plugin(s): ${pluginDirs.join(', ')}`);

    // Load each plugin
    for (const pluginName of pluginDirs) {
      try {
        await this.loadPlugin(pluginName, pluginsDir);
      } catch (error) {
        console.error(`[PluginRegistry] Failed to load plugin "${pluginName}":`, error);
      }
    }
  }

  /**
   * Load a single plugin
   */
  private async loadPlugin(pluginName: string, pluginsDir: string) {
    const pluginPath = path.join(pluginsDir, pluginName, 'src', 'index.ts');

    // Check if plugin file exists
    if (!fs.existsSync(pluginPath)) {
      console.warn(`[PluginRegistry] Plugin entry point not found: ${pluginPath}`);
      return;
    }

    try {
      // Import plugin (using dynamic import for TypeScript files)
      const pluginModule = await import(pluginPath);
      const PluginClass = pluginModule.default || pluginModule[Object.keys(pluginModule)[0]];

      if (!PluginClass) {
        throw new Error('Plugin does not export a default class');
      }

      // Instantiate plugin
      const plugin: ICoreLinkPlugin = new PluginClass();

      // Register plugin
      this.plugins.set(plugin.id, plugin);

      // Register tools with plugin prefix to make them unique
      const standardTools = plugin.getStandardTools();
      for (const tool of standardTools) {
        const uniqueName = `${plugin.id}__${tool.name}`;
        this.toolToPlugin.set(uniqueName, plugin.id);
      }

      // Register native tools if available
      if (plugin.getNativeTools) {
        const nativeTools = plugin.getNativeTools();
        for (const tool of nativeTools) {
          const uniqueName = `${plugin.id}__${tool.name}`;
          this.toolToPlugin.set(uniqueName, plugin.id);
        }
      }

      console.error(`[PluginRegistry] Loaded plugin: ${plugin.name} (${plugin.id}) - ${standardTools.length} tools`);
    } catch (error) {
      throw new Error(`Failed to load plugin from ${pluginPath}: ${error}`);
    }
  }

  /**
   * Register a universal tool (not associated with any specific plugin)
   * Used for service-level tools that aggregate across multiple providers
   */
  registerUniversalTool(tool: Tool): void {
    this.universalTools.set(tool.name, tool);
    console.error(`[PluginRegistry] Registered universal tool: ${tool.name}`);
  }

  /**
   * Check if a tool is a universal tool
   */
  isUniversalTool(toolName: string): boolean {
    return this.universalTools.has(toolName);
  }

  /**
   * Get all available tools (universal tools + plugin tools)
   */
  async getAllTools(): Promise<Tool[]> {
    const tools: Tool[] = [];

    // Add universal tools first (these take precedence)
    for (const tool of this.universalTools.values()) {
      tools.push(tool);
    }

    // REMOVED: Provider-specific tools are no longer exposed
    // The gateway now only exposes universal tools for service abstraction

    return tools;
  }

  /**
   * Convert CoreLink tool definition to MCP tool format
   * Tool names are prefixed with plugin ID to ensure uniqueness
   *
   * NOTE: Currently unused as we only expose universal tools, but kept for future use
   */
  private convertToMCPTool(tool: ToolDefinition, plugin: ICoreLinkPlugin): Tool {
    return {
      name: `${plugin.id}__${tool.name}`,
      description: `[${plugin.name}] ${tool.description}`,
      inputSchema: tool.inputSchema as any,
    };
  }

  // Suppress unused warning - this is intentionally unused but kept for future provider-specific tools
  // @ts-ignore
  private _suppressUnusedWarning = this.convertToMCPTool;

  /**
   * Get plugin that provides a specific tool
   */
  async getPluginForTool(toolName: string): Promise<ICoreLinkPlugin | null> {
    const pluginId = this.toolToPlugin.get(toolName);
    if (!pluginId) {
      return null;
    }

    return this.plugins.get(pluginId) || null;
  }

  /**
   * Get plugin by ID
   */
  getPlugin(pluginId: string): ICoreLinkPlugin | null {
    return this.plugins.get(pluginId) || null;
  }

  /**
   * Get all plugins
   */
  getAllPlugins(): ICoreLinkPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get number of loaded plugins
   */
  getPluginCount(): number {
    return this.plugins.size;
  }

  /**
   * Check if a plugin is loaded
   */
  hasPlugin(pluginId: string): boolean {
    return this.plugins.has(pluginId);
  }
}
