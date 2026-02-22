/**
 * CoreLink Policy Management API Routes
 *
 * Provides REST API endpoints for managing policies, redaction patterns,
 * approval requests, and audit logs.
 */

import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { policyEngine } from '../services/policy-engine.js';
import { auditLogger } from '../services/audit-logger.js';
import { db } from '../db/index.js';
import { policyRules, redactionPatterns } from '../db/schema.js';
import type { PolicyAction } from '@corelink/core';

/**
 * Register policy management routes
 */
export async function policyRoutes(instance: FastifyInstance) {
  // ===== Policy Rules =====

  /**
   * List all policy rules
   * GET /api/policies
   */
  instance.get('/api/policies', async (_request, reply) => {
    try {
      const rules = await db.select().from(policyRules);

      return rules.map((rule: any) => ({
        id: rule.id,
        pluginId: rule.pluginId,
        action: rule.action,
        condition: JSON.parse(rule.condition),
        description: rule.description,
        priority: rule.priority,
        enabled: Boolean(rule.enabled),
        createdAt: rule.createdAt,
        updatedAt: rule.updatedAt,
      }));
    } catch (error) {
      reply.status(500);
      return {
        error: 'Failed to fetch policies',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });

  /**
   * Get a single policy rule
   * GET /api/policies/:id
   */
  instance.get<{ Params: { id: string } }>('/api/policies/:id', async (request, reply) => {
    try {
      const results = await db
        .select()
        .from(policyRules)
        .where(eq(policyRules.id, request.params.id))
        .limit(1);

      if (results.length === 0) {
        reply.status(404);
        return { error: 'Policy not found' };
      }

      const rule = results[0];
      return {
        id: rule.id,
        pluginId: rule.pluginId,
        action: rule.action,
        condition: JSON.parse(rule.condition),
        description: rule.description,
        priority: rule.priority,
        enabled: Boolean(rule.enabled),
        createdAt: rule.createdAt,
        updatedAt: rule.updatedAt,
      };
    } catch (error) {
      reply.status(500);
      return {
        error: 'Failed to fetch policy',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });

  /**
   * Create a new policy rule
   * POST /api/policies
   */
  instance.post<{
    Body: {
      pluginId?: string | null;
      action: PolicyAction;
      condition: Record<string, any>;
      description?: string;
      priority?: number;
      enabled?: boolean;
    };
  }>('/api/policies', async (request, reply) => {
    try {
      const { pluginId, action, condition, description, priority, enabled } = request.body;

      // Validate action
      const validActions: PolicyAction[] = ['ALLOW', 'BLOCK', 'REDACT', 'REQUIRE_APPROVAL'];
      if (!validActions.includes(action)) {
        reply.status(400);
        return { error: 'Invalid action. Must be one of: ALLOW, BLOCK, REDACT, REQUIRE_APPROVAL' };
      }

      // Validate condition (must be valid JSON Logic)
      if (!condition || typeof condition !== 'object') {
        reply.status(400);
        return { error: 'Condition must be a valid JSON Logic object' };
      }

      const id = randomUUID();
      const now = new Date().toISOString();

      await db.insert(policyRules).values({
        id,
        pluginId: pluginId || null,
        action,
        condition: JSON.stringify(condition),
        description: description || null,
        priority: priority || 0,
        enabled: enabled !== undefined ? enabled : true,
        createdAt: now,
        updatedAt: now,
      });

      reply.status(201);
      return {
        id,
        pluginId,
        action,
        condition,
        description,
        priority: priority || 0,
        enabled: enabled !== undefined ? enabled : true,
        createdAt: now,
        updatedAt: now,
      };
    } catch (error) {
      reply.status(500);
      return {
        error: 'Failed to create policy',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });

  /**
   * Update a policy rule
   * PUT /api/policies/:id
   */
  instance.put<{
    Params: { id: string };
    Body: {
      pluginId?: string | null;
      action?: PolicyAction;
      condition?: Record<string, any>;
      description?: string;
      priority?: number;
      enabled?: boolean;
    };
  }>('/api/policies/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      const updates: any = {};

      if (request.body.pluginId !== undefined) {
        updates.pluginId = request.body.pluginId || null;
      }
      if (request.body.action) {
        const validActions: PolicyAction[] = ['ALLOW', 'BLOCK', 'REDACT', 'REQUIRE_APPROVAL'];
        if (!validActions.includes(request.body.action)) {
          reply.status(400);
          return { error: 'Invalid action' };
        }
        updates.action = request.body.action;
      }
      if (request.body.condition) {
        updates.condition = JSON.stringify(request.body.condition);
      }
      if (request.body.description !== undefined) {
        updates.description = request.body.description;
      }
      if (request.body.priority !== undefined) {
        updates.priority = request.body.priority;
      }
      if (request.body.enabled !== undefined) {
        updates.enabled = request.body.enabled;
      }

      updates.updatedAt = new Date().toISOString();

      const result = await db.update(policyRules).set(updates).where(eq(policyRules.id, id));

      if (result.changes === 0) {
        reply.status(404);
        return { error: 'Policy not found' };
      }

      return { success: true, id };
    } catch (error) {
      reply.status(500);
      return {
        error: 'Failed to update policy',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });

  /**
   * Delete a policy rule
   * DELETE /api/policies/:id
   */
  instance.delete<{ Params: { id: string } }>('/api/policies/:id', async (request, reply) => {
    try {
      const result = await db.delete(policyRules).where(eq(policyRules.id, request.params.id));

      if (result.changes === 0) {
        reply.status(404);
        return { error: 'Policy not found' };
      }

      return { success: true };
    } catch (error) {
      reply.status(500);
      return {
        error: 'Failed to delete policy',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // ===== Redaction Patterns =====

  /**
   * List all redaction patterns
   * GET /api/redaction-patterns
   */
  instance.get('/api/redaction-patterns', async (_request, reply) => {
    try {
      const patterns = await db.select().from(redactionPatterns);
      return patterns.map((pattern: any) => ({
        id: pattern.id,
        name: pattern.name,
        pattern: pattern.pattern,
        replacement: pattern.replacement,
        description: pattern.description,
        enabled: Boolean(pattern.enabled),
        createdAt: pattern.createdAt,
      }));
    } catch (error) {
      reply.status(500);
      return {
        error: 'Failed to fetch redaction patterns',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });

  /**
   * Create a new redaction pattern
   * POST /api/redaction-patterns
   */
  instance.post<{
    Body: {
      name: string;
      pattern: string;
      replacement?: string;
      description?: string;
      enabled?: boolean;
    };
  }>('/api/redaction-patterns', async (request, reply) => {
    try {
      const { name, pattern, replacement, description, enabled } = request.body;

      // Validate regex pattern
      try {
        new RegExp(pattern);
      } catch {
        reply.status(400);
        return { error: 'Invalid regex pattern' };
      }

      const id = randomUUID();

      await db.insert(redactionPatterns).values({
        id,
        name,
        pattern,
        replacement: replacement || '[REDACTED]',
        description: description || null,
        enabled: enabled !== undefined ? enabled : true,
        createdAt: new Date().toISOString(),
      });

      reply.status(201);
      return {
        id,
        name,
        pattern,
        replacement: replacement || '[REDACTED]',
        description,
        enabled: enabled !== undefined ? enabled : true,
      };
    } catch (error) {
      reply.status(500);
      return {
        error: 'Failed to create redaction pattern',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });

  /**
   * Update a redaction pattern
   * PUT /api/redaction-patterns/:id
   */
  instance.put<{
    Params: { id: string };
    Body: {
      name?: string;
      pattern?: string;
      replacement?: string;
      description?: string;
      enabled?: boolean;
    };
  }>('/api/redaction-patterns/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      const updates: any = {};

      if (request.body.name) updates.name = request.body.name;
      if (request.body.pattern) {
        // Validate regex
        try {
          new RegExp(request.body.pattern);
        } catch {
          reply.status(400);
          return { error: 'Invalid regex pattern' };
        }
        updates.pattern = request.body.pattern;
      }
      if (request.body.replacement !== undefined) updates.replacement = request.body.replacement;
      if (request.body.description !== undefined) updates.description = request.body.description;
      if (request.body.enabled !== undefined) updates.enabled = request.body.enabled;

      const result = await db.update(redactionPatterns).set(updates).where(eq(redactionPatterns.id, id));

      if (result.changes === 0) {
        reply.status(404);
        return { error: 'Redaction pattern not found' };
      }

      return { success: true, id };
    } catch (error) {
      reply.status(500);
      return {
        error: 'Failed to update redaction pattern',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });

  /**
   * Delete a redaction pattern
   * DELETE /api/redaction-patterns/:id
   */
  instance.delete<{ Params: { id: string } }>('/api/redaction-patterns/:id', async (request, reply) => {
    try {
      const result = await db.delete(redactionPatterns).where(eq(redactionPatterns.id, request.params.id));

      if (result.changes === 0) {
        reply.status(404);
        return { error: 'Redaction pattern not found' };
      }

      return { success: true };
    } catch (error) {
      reply.status(500);
      return {
        error: 'Failed to delete redaction pattern',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // ===== Approval Requests =====

  /**
   * List pending approval requests
   * GET /api/approval-requests
   */
  instance.get('/api/approval-requests', async (_request, reply) => {
    try {
      const pending = await policyEngine.getPendingApprovals();
      return pending;
    } catch (error) {
      reply.status(500);
      return {
        error: 'Failed to fetch approval requests',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });

  /**
   * Get a single approval request
   * GET /api/approval-requests/:id
   */
  instance.get<{ Params: { id: string } }>('/api/approval-requests/:id', async (request, reply) => {
    try {
      const approvalRequest = await policyEngine.getApprovalRequest(request.params.id);

      if (!approvalRequest) {
        reply.status(404);
        return { error: 'Approval request not found' };
      }

      return approvalRequest;
    } catch (error) {
      reply.status(500);
      return {
        error: 'Failed to fetch approval request',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });

  /**
   * Approve an approval request
   * POST /api/approval-requests/:id/approve
   */
  instance.post<{
    Params: { id: string };
    Body: { approvedArgs?: Record<string, unknown> };
  }>('/api/approval-requests/:id/approve', async (request, reply) => {
    try {
      const approvalRequest = await policyEngine.approveRequest(
        request.params.id,
        request.body.approvedArgs
      );

      if (!approvalRequest) {
        reply.status(404);
        return { error: 'Approval request not found' };
      }

      return approvalRequest;
    } catch (error) {
      reply.status(400);
      return {
        error: 'Failed to approve request',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });

  /**
   * Deny an approval request
   * POST /api/approval-requests/:id/deny
   */
  instance.post<{ Params: { id: string } }>('/api/approval-requests/:id/deny', async (request, reply) => {
    try {
      const approvalRequest = await policyEngine.denyRequest(request.params.id);

      if (!approvalRequest) {
        reply.status(404);
        return { error: 'Approval request not found' };
      }

      return approvalRequest;
    } catch (error) {
      reply.status(400);
      return {
        error: 'Failed to deny request',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // ===== Audit Logs =====

  /**
   * Query audit logs
   * GET /api/audit-logs
   */
  instance.get<{
    Querystring: {
      startDate?: string;
      endDate?: string;
      pluginId?: string;
      agentName?: string;
      status?: 'success' | 'denied' | 'error';
      action?: PolicyAction;
      limit?: string;
      offset?: string;
    };
  }>('/api/audit-logs', async (request, reply) => {
    try {
      const filters = {
        startDate: request.query.startDate,
        endDate: request.query.endDate,
        pluginId: request.query.pluginId,
        agentName: request.query.agentName,
        status: request.query.status,
        action: request.query.action,
        limit: request.query.limit ? parseInt(request.query.limit, 10) : 100,
        offset: request.query.offset ? parseInt(request.query.offset, 10) : 0,
      };

      const logs = await auditLogger.query(filters);
      const total = await auditLogger.count(filters);

      return {
        logs,
        total,
        limit: filters.limit,
        offset: filters.offset,
      };
    } catch (error) {
      reply.status(500);
      return {
        error: 'Failed to fetch audit logs',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });

  /**
   * Get a single audit log entry
   * GET /api/audit-logs/:id
   */
  instance.get<{ Params: { id: string } }>('/api/audit-logs/:id', async (request, reply) => {
    try {
      const log = await auditLogger.getById(request.params.id);

      if (!log) {
        reply.status(404);
        return { error: 'Audit log not found' };
      }

      return log;
    } catch (error) {
      reply.status(500);
      return {
        error: 'Failed to fetch audit log',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });

  /**
   * Get audit statistics
   * GET /api/audit-stats
   */
  instance.get<{
    Querystring: {
      startDate?: string;
      endDate?: string;
    };
  }>('/api/audit-stats', async (request, reply) => {
    try {
      const stats = await auditLogger.getStats({
        startDate: request.query.startDate,
        endDate: request.query.endDate,
      });

      return stats;
    } catch (error) {
      reply.status(500);
      return {
        error: 'Failed to fetch audit statistics',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });

  /**
   * Get recent activity
   * GET /api/audit-logs/recent
   */
  instance.get<{
    Querystring: {
      limit?: string;
    };
  }>('/api/audit-logs/recent', async (request, reply) => {
    try {
      const limit = request.query.limit ? parseInt(request.query.limit, 10) : 20;
      const logs = await auditLogger.getRecentActivity(limit);

      return logs;
    } catch (error) {
      reply.status(500);
      return {
        error: 'Failed to fetch recent activity',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });
}
