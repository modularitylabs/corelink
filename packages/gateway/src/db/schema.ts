/**
 * CoreLink Database Schema
 *
 * SQLite database schema using Drizzle ORM
 */

import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Accounts (multi-account support)
 * Maps email addresses to plugins for multi-account scenarios
 */
export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(), // UUID
  pluginId: text('plugin_id').notNull(), // Foreign key to plugin
  email: text('email').notNull(), // Account identifier (e.g., "work@gmail.com")
  displayName: text('display_name'), // Optional friendly name
  isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
  metadata: text('metadata'), // JSON blob for provider-specific data
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Plugin credentials (OAuth tokens, API keys, etc.)
 * Encrypted at rest using Node.js crypto
 * Now associated with specific accounts for multi-account support
 */
export const credentials = sqliteTable('credentials', {
  id: text('id').primaryKey(),
  accountId: text('account_id'), // Foreign key to accounts.id (nullable for migration compatibility)
  pluginId: text('plugin_id').notNull(), // Kept for backward compatibility during migration
  type: text('type').notNull(), // 'oauth2' | 'api_key' | 'basic'
  encryptedData: text('encrypted_data').notNull(), // JSON blob, encrypted
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Plugin settings and configuration
 */
export const pluginSettings = sqliteTable('plugin_settings', {
  pluginId: text('plugin_id').primaryKey(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  settings: text('settings').notNull(), // JSON blob
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Policy rules
 */
export const policyRules = sqliteTable('policy_rules', {
  id: text('id').primaryKey(),
  category: text('category'), // null = global, 'email' | 'task' | 'calendar' | 'notes' | 'storage' | 'system'
  pluginId: text('plugin_id'), // null = category-level rule, non-null = plugin-specific override
  action: text('action').notNull(), // 'ALLOW' | 'BLOCK' | 'REDACT' | 'REQUIRE_APPROVAL'
  condition: text('condition').notNull(), // JSON Logic expression
  description: text('description'),
  priority: integer('priority').notNull().default(0),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Redaction patterns
 */
export const redactionPatterns = sqliteTable('redaction_patterns', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  pattern: text('pattern').notNull(), // Regex pattern
  replacement: text('replacement').notNull().default('[REDACTED]'),
  description: text('description'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Audit log entries
 */
export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  timestamp: text('timestamp')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  agentName: text('agent_name').notNull(),
  agentVersion: text('agent_version'),

  // Request
  category: text('category'), // 'email' | 'task' | 'calendar' | 'notes' | 'storage' | 'system'
  pluginId: text('plugin_id').notNull(),
  toolName: text('tool_name').notNull(),
  inputArgs: text('input_args').notNull(), // JSON blob

  // Policy decision
  policyAction: text('policy_action').notNull(),
  policyRuleId: text('policy_rule_id'),
  redactedFields: text('redacted_fields'), // JSON array
  policyReason: text('policy_reason'),

  // Result
  status: text('status').notNull(), // 'success' | 'denied' | 'error'
  errorMessage: text('error_message'),
  executionTimeMs: integer('execution_time_ms').notNull(),
  dataSummary: text('data_summary').notNull(),

  // Metadata
  metadata: text('metadata'), // JSON blob
});

/**
 * Approval requests (for REQUIRE_APPROVAL policy)
 */
export const approvalRequests = sqliteTable('approval_requests', {
  id: text('id').primaryKey(),
  timestamp: text('timestamp')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  pluginId: text('plugin_id').notNull(),
  toolName: text('tool_name').notNull(),
  args: text('args').notNull(), // JSON blob
  ruleId: text('rule_id').notNull(),
  status: text('status').notNull().default('pending'), // 'pending' | 'approved' | 'denied'
  approvedArgs: text('approved_args'), // JSON blob, user-modified
  resolvedAt: text('resolved_at'),
});

/**
 * Active provider mapping (for service abstraction)
 * Maps categories to active plugin IDs
 */
export const activeProviders = sqliteTable('active_providers', {
  category: text('category').primaryKey(), // 'email' | 'task' | 'calendar' | 'notes'
  pluginId: text('plugin_id').notNull(),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
