/**
 * CoreLink Plugin System Types
 *
 * These interfaces define the contract that all CoreLink plugins must implement.
 * This enables service abstraction and allows AI agents to work with different
 * providers through a unified interface.
 */

/**
 * Standard tool definition for MCP protocol
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema
}

/**
 * Result returned by plugin execution
 */
export interface ActionResult {
  data: unknown;
  summary: string; // Human-readable summary for audit logs
  metadata?: Record<string, unknown>;
}

/**
 * Context provided to plugins during execution
 */
export interface ExecutionContext {
  auth: PluginCredentials;
  settings: Record<string, unknown>;
  logger: (message: string, level?: 'info' | 'warn' | 'error') => void;
}

/**
 * Encrypted credentials for a plugin
 */
export interface PluginCredentials {
  type: 'oauth2' | 'api_key' | 'basic';
  data: Record<string, unknown>;
}

/**
 * Plugin categories for organization
 */
export type PluginCategory = 'email' | 'task' | 'calendar' | 'notes' | 'storage' | 'system';

/**
 * Configuration schema for Web UI
 */
export interface ConfigField {
  type: 'text' | 'password' | 'select' | 'checkbox' | 'url';
  label: string;
  description?: string;
  required?: boolean;
  default?: unknown;
  options?: Array<{ label: string; value: string }>;
}

/**
 * Main plugin interface that all CoreLink plugins must implement
 */
export interface ICoreLinkPlugin {
  // Metadata
  readonly id: string; // e.g., "com.corelink.gmail"
  readonly name: string; // e.g., "Gmail"
  readonly version: string;
  readonly category: PluginCategory;
  readonly description: string;

  /**
   * Returns standard/universal tools exposed by this plugin
   * These follow the "Least Common Header" pattern for service abstraction
   */
  getStandardTools(): ToolDefinition[];

  /**
   * Returns provider-specific tools (optional)
   * For features unique to this service that can't be abstracted
   */
  getNativeTools?(): ToolDefinition[];

  /**
   * Returns configuration schema for the Web UI
   * Used to dynamically generate auth/setup forms
   */
  getConfigSchema(): Record<string, ConfigField>;

  /**
   * Execute a tool with given arguments
   * This is the main entry point called by the MCP gateway
   */
  execute(toolName: string, args: Record<string, unknown>, context: ExecutionContext): Promise<ActionResult>;

  /**
   * Initialize plugin (setup, validation, etc.)
   */
  initialize?(context: ExecutionContext): Promise<void>;

  /**
   * Cleanup on plugin unload
   */
  destroy?(): Promise<void>;
}

/**
 * Plugin manifest for discovery and registration
 */
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  category: PluginCategory;
  description: string;
  author: string;
  homepage?: string;
  repository?: string;
  entryPoint: string; // Path to main export
}
