/**
 * CoreLink Audit Log Types
 *
 * Provides transparency and accountability for all AI-driven
 * data access and modifications.
 */

import { PolicyAction } from './policy.js';

/**
 * Audit log entry for a single action
 */
export interface AuditEntry {
  id: string;
  timestamp: string; // ISO8601
  agentName: string; // e.g., "Claude Code", "ChatGPT"
  agentVersion?: string;

  // Request details
  pluginId: string;
  toolName: string;
  inputArgs: Record<string, unknown>;

  // Policy decision
  policyDecision: {
    action: PolicyAction;
    ruleId?: string;
    redactedFields?: string[];
    reason?: string;
  };

  // Execution details
  status: 'success' | 'denied' | 'error';
  errorMessage?: string;
  executionTimeMs: number;
  dataSummary: string; // Human-readable summary

  // Optional metadata
  metadata?: Record<string, unknown>;
}

/**
 * Aggregated audit statistics
 */
export interface AuditStats {
  totalRequests: number;
  allowedRequests: number;
  blockedRequests: number;
  redactedRequests: number;
  approvalRequests: number;
  erroredRequests: number;
  byPlugin: Record<string, number>;
  byAgent: Record<string, number>;
}

/**
 * Audit log query filters
 */
export interface AuditQuery {
  startDate?: string;
  endDate?: string;
  pluginId?: string;
  agentName?: string;
  status?: AuditEntry['status'];
  action?: PolicyAction;
  limit?: number;
  offset?: number;
}

/**
 * Audit export format
 */
export interface AuditExport {
  version: string;
  exportDate: string;
  entries: AuditEntry[];
  stats: AuditStats;
}
