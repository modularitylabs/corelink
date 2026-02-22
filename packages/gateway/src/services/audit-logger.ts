/**
 * CoreLink Audit Logger Service
 *
 * Provides comprehensive audit logging for all AI-driven actions.
 * Tracks policy decisions, execution results, and performance metrics.
 */

import { randomUUID } from 'crypto';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { AuditEntry, AuditQuery, AuditStats } from '@corelink/core';
import { db } from '../db/index.js';
import { auditLogs } from '../db/schema.js';
import type { PolicyAction } from '@corelink/core';

/**
 * Parameters for creating an audit log entry
 */
export interface CreateAuditLogParams {
  agentName: string;
  agentVersion?: string;
  pluginId: string;
  toolName: string;
  inputArgs: Record<string, unknown>;
  policyDecision: {
    action: PolicyAction;
    ruleId?: string;
    redactedFields?: string[];
    reason?: string;
  };
  status: 'success' | 'denied' | 'error';
  errorMessage?: string;
  executionTimeMs: number;
  dataSummary: string;
  metadata?: Record<string, unknown>;
}

/**
 * Audit Logger Service
 *
 * Handles all audit logging functionality including:
 * - Creating audit log entries
 * - Querying audit logs with filters
 * - Generating audit statistics
 * - Data retention and cleanup
 */
export class AuditLogger {
  /**
   * Create a new audit log entry
   */
  async log(params: CreateAuditLogParams): Promise<AuditEntry> {
    const id = randomUUID();
    const timestamp = new Date().toISOString();

    const entry: AuditEntry = {
      id,
      timestamp,
      agentName: params.agentName,
      agentVersion: params.agentVersion,
      pluginId: params.pluginId,
      toolName: params.toolName,
      inputArgs: params.inputArgs,
      policyDecision: params.policyDecision,
      status: params.status,
      errorMessage: params.errorMessage,
      executionTimeMs: params.executionTimeMs,
      dataSummary: params.dataSummary,
      metadata: params.metadata,
    };

    // Insert into database
    await db.insert(auditLogs).values({
      id,
      timestamp,
      agentName: params.agentName,
      agentVersion: params.agentVersion,
      pluginId: params.pluginId,
      toolName: params.toolName,
      inputArgs: JSON.stringify(params.inputArgs),
      policyAction: params.policyDecision.action,
      policyRuleId: params.policyDecision.ruleId,
      redactedFields: params.policyDecision.redactedFields
        ? JSON.stringify(params.policyDecision.redactedFields)
        : null,
      policyReason: params.policyDecision.reason,
      status: params.status,
      errorMessage: params.errorMessage,
      executionTimeMs: params.executionTimeMs,
      dataSummary: params.dataSummary,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    });

    return entry;
  }

  /**
   * Query audit logs with filters
   */
  async query(filters: AuditQuery = {}): Promise<AuditEntry[]> {
    const conditions = [];

    // Date range filters
    if (filters.startDate) {
      conditions.push(gte(auditLogs.timestamp, filters.startDate));
    }
    if (filters.endDate) {
      conditions.push(lte(auditLogs.timestamp, filters.endDate));
    }

    // Exact match filters
    if (filters.pluginId) {
      conditions.push(eq(auditLogs.pluginId, filters.pluginId));
    }
    if (filters.agentName) {
      conditions.push(eq(auditLogs.agentName, filters.agentName));
    }
    if (filters.status) {
      conditions.push(eq(auditLogs.status, filters.status));
    }
    if (filters.action) {
      conditions.push(eq(auditLogs.policyAction, filters.action));
    }

    // Build query
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const results = await db
      .select()
      .from(auditLogs)
      .where(whereClause)
      .orderBy(desc(auditLogs.timestamp))
      .limit(filters.limit || 100)
      .offset(filters.offset || 0);

    // Transform database results to AuditEntry format
    return results.map((row: any) => ({
      id: row.id,
      timestamp: row.timestamp,
      agentName: row.agentName,
      agentVersion: row.agentVersion || undefined,
      pluginId: row.pluginId,
      toolName: row.toolName,
      inputArgs: JSON.parse(row.inputArgs),
      policyDecision: {
        action: row.policyAction as PolicyAction,
        ruleId: row.policyRuleId || undefined,
        redactedFields: row.redactedFields
          ? JSON.parse(row.redactedFields)
          : undefined,
        reason: row.policyReason || undefined,
      },
      status: row.status as 'success' | 'denied' | 'error',
      errorMessage: row.errorMessage || undefined,
      executionTimeMs: row.executionTimeMs,
      dataSummary: row.dataSummary,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    }));
  }

  /**
   * Get aggregate statistics
   */
  async getStats(filters: Pick<AuditQuery, 'startDate' | 'endDate'> = {}): Promise<AuditStats> {
    const conditions = [];

    if (filters.startDate) {
      conditions.push(gte(auditLogs.timestamp, filters.startDate));
    }
    if (filters.endDate) {
      conditions.push(lte(auditLogs.timestamp, filters.endDate));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get all logs matching filters
    const logs = await db
      .select()
      .from(auditLogs)
      .where(whereClause);

    // Calculate statistics
    const stats: AuditStats = {
      totalRequests: logs.length,
      allowedRequests: 0,
      blockedRequests: 0,
      redactedRequests: 0,
      approvalRequests: 0,
      erroredRequests: 0,
      byPlugin: {},
      byAgent: {},
    };

    for (const log of logs) {
      // Count by policy action
      switch (log.policyAction) {
        case 'ALLOW':
          stats.allowedRequests++;
          break;
        case 'BLOCK':
          stats.blockedRequests++;
          break;
        case 'REDACT':
          stats.redactedRequests++;
          break;
        case 'REQUIRE_APPROVAL':
          stats.approvalRequests++;
          break;
      }

      // Count errors
      if (log.status === 'error') {
        stats.erroredRequests++;
      }

      // Count by plugin
      stats.byPlugin[log.pluginId] = (stats.byPlugin[log.pluginId] || 0) + 1;

      // Count by agent
      stats.byAgent[log.agentName] = (stats.byAgent[log.agentName] || 0) + 1;
    }

    return stats;
  }

  /**
   * Get a single audit log entry by ID
   */
  async getById(id: string): Promise<AuditEntry | null> {
    const results = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.id, id))
      .limit(1);

    if (results.length === 0) {
      return null;
    }

    const row = results[0];
    return {
      id: row.id,
      timestamp: row.timestamp,
      agentName: row.agentName,
      agentVersion: row.agentVersion || undefined,
      pluginId: row.pluginId,
      toolName: row.toolName,
      inputArgs: JSON.parse(row.inputArgs),
      policyDecision: {
        action: row.policyAction as PolicyAction,
        ruleId: row.policyRuleId || undefined,
        redactedFields: row.redactedFields
          ? JSON.parse(row.redactedFields)
          : undefined,
        reason: row.policyReason || undefined,
      },
      status: row.status as 'success' | 'denied' | 'error',
      errorMessage: row.errorMessage || undefined,
      executionTimeMs: row.executionTimeMs,
      dataSummary: row.dataSummary,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }

  /**
   * Delete old audit logs (data retention)
   *
   * @param daysToKeep Number of days to retain logs (default: 90)
   * @returns Number of deleted entries
   */
  async cleanup(daysToKeep: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    const cutoffTimestamp = cutoffDate.toISOString();

    const result = await db
      .delete(auditLogs)
      .where(lte(auditLogs.timestamp, cutoffTimestamp));

    return result.changes || 0;
  }

  /**
   * Get recent activity (last N entries)
   */
  async getRecentActivity(limit: number = 20): Promise<AuditEntry[]> {
    return this.query({ limit });
  }

  /**
   * Count total audit logs
   */
  async count(filters: Omit<AuditQuery, 'limit' | 'offset'> = {}): Promise<number> {
    const conditions = [];

    if (filters.startDate) {
      conditions.push(gte(auditLogs.timestamp, filters.startDate));
    }
    if (filters.endDate) {
      conditions.push(lte(auditLogs.timestamp, filters.endDate));
    }
    if (filters.pluginId) {
      conditions.push(eq(auditLogs.pluginId, filters.pluginId));
    }
    if (filters.agentName) {
      conditions.push(eq(auditLogs.agentName, filters.agentName));
    }
    if (filters.status) {
      conditions.push(eq(auditLogs.status, filters.status));
    }
    if (filters.action) {
      conditions.push(eq(auditLogs.policyAction, filters.action));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(auditLogs)
      .where(whereClause);

    return result[0]?.count || 0;
  }
}

// Export singleton instance
export const auditLogger = new AuditLogger();
