/**
 * CoreLink Policy Engine Types
 *
 * Defines the security and access control layer that governs
 * what AI agents can and cannot access.
 */

/**
 * Policy actions that can be taken
 */
export type PolicyAction = 'ALLOW' | 'BLOCK' | 'REDACT' | 'REQUIRE_APPROVAL';

/**
 * Policy rule definition
 */
export interface PolicyRule {
  id: string;
  enabled: boolean;
  action: PolicyAction;
  condition: string; // JSON Logic expression
  description?: string;
  priority?: number; // Higher priority rules are evaluated first
}

/**
 * Scope-specific policy configuration
 */
export interface PolicyScope {
  pluginId: string;
  rules: PolicyRule[];
  enabled: boolean;
}

/**
 * Global redaction patterns
 */
export interface RedactionPattern {
  id: string;
  name: string;
  enabled: boolean;
  pattern: string; // Regex pattern
  replacement?: string; // Default: "[REDACTED]"
  description?: string;
}

/**
 * Complete policy configuration
 */
export interface PolicyConfig {
  version: number;
  globalRules: PolicyRule[];
  redactionPatterns: RedactionPattern[];
  scopes: PolicyScope[];
  defaultAction: PolicyAction; // Fallback if no rules match
}

/**
 * Result of policy evaluation
 */
export interface PolicyResult {
  action: PolicyAction;
  matchedRuleId?: string;
  reason?: string;
  modifiedArgs?: Record<string, unknown>; // For redacted inputs
}

/**
 * Approval request when REQUIRE_APPROVAL is triggered
 */
export interface ApprovalRequest {
  id: string;
  timestamp: string;
  pluginId: string;
  toolName: string;
  args: Record<string, unknown>;
  ruleId: string;
  status: 'pending' | 'approved' | 'denied';
  approvedArgs?: Record<string, unknown>; // User-modified args
}
