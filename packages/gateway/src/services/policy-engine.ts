/**
 * CoreLink Policy Engine Service
 *
 * Evaluates JSON Logic-based policy rules to enforce granular access control
 * for AI agents. Supports ALLOW, BLOCK, REDACT, and REQUIRE_APPROVAL actions.
 */

import { randomUUID } from 'crypto';
import jsonLogic from 'json-logic-js';
import { desc, eq, isNull, or } from 'drizzle-orm';
import type { PolicyAction, PolicyResult, ApprovalRequest } from '@corelink/core';
import { db } from '../db/index.js';
import { policyRules, redactionPatterns, approvalRequests } from '../db/schema.js';

/**
 * Context provided for policy evaluation
 */
export interface PolicyEvaluationContext {
  tool: string;
  plugin: string;
  agent: string;
  agentVersion?: string;
  args: Record<string, unknown>;
  category?: string;
}

/**
 * Extended policy result with redaction info
 */
export interface ExtendedPolicyResult extends PolicyResult {
  redactedFields?: string[];
  approvalRequestId?: string;
}

/**
 * Policy Engine Service
 *
 * Responsible for:
 * - Loading policy rules from database
 * - Evaluating JSON Logic conditions
 * - Handling all 4 policy actions
 * - Managing approval workflows
 * - Redacting sensitive data
 */
export class PolicyEngine {
  private defaultAction: PolicyAction = 'BLOCK';

  /**
   * Evaluate policy for a given request
   *
   * @param context The request context (tool, plugin, args, etc.)
   * @returns Policy decision with action and metadata
   */
  async evaluate(context: PolicyEvaluationContext): Promise<ExtendedPolicyResult> {
    // Load applicable rules (global + category-specific + plugin-specific)
    const rules = await this.loadRules(context.plugin, context.category);

    // Sort by priority (higher priority first)
    const sortedRules = rules.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    // Evaluate each rule until we find a match
    for (const rule of sortedRules) {
      if (!rule.enabled) {
        continue;
      }

      const condition = JSON.parse(rule.condition);
      const matches = jsonLogic.apply(condition, context);

      if (matches) {
        // Rule matched - return the action
        const result: ExtendedPolicyResult = {
          action: rule.action as PolicyAction,
          matchedRuleId: rule.id,
          reason: rule.description || `Matched rule: ${rule.id}`,
        };

        // Handle special actions
        if (rule.action === 'REDACT') {
          // Apply redaction to args
          const { redactedArgs, redactedFields } = await this.redactData(context.args);
          result.modifiedArgs = redactedArgs;
          result.redactedFields = redactedFields;
        } else if (rule.action === 'REQUIRE_APPROVAL') {
          // Create approval request
          const approvalRequest = await this.createApprovalRequest({
            pluginId: context.plugin,
            toolName: context.tool,
            args: context.args,
            ruleId: rule.id,
          });
          result.approvalRequestId = approvalRequest.id;
        }

        return result;
      }
    }

    // No rules matched - apply default action
    return {
      action: this.defaultAction,
      reason: 'No policy rules matched - using default action',
    };
  }

  /**
   * Load policy rules for evaluation
   *
   * Loads rules in hierarchical order:
   * 1. Global rules (category = null, pluginId = null)
   * 2. Category-specific rules (category matches, pluginId = null)
   * 3. Plugin-specific rules (pluginId matches)
   */
  async loadRules(pluginId: string, category?: string): Promise<Array<{
    id: string;
    action: string;
    condition: string;
    description: string | null;
    priority: number;
    enabled: boolean;
  }>> {
    const rules = await db
      .select()
      .from(policyRules)
      .where(
        or(
          // Global rules (apply to all categories and plugins)
          isNull(policyRules.category),
          // Category-specific rules (apply to all plugins in this category)
          category ? eq(policyRules.category, category) : undefined,
          // Plugin-specific rules (highest specificity)
          eq(policyRules.pluginId, pluginId)
        )
      )
      .orderBy(desc(policyRules.priority));

    return rules.map((rule: any) => ({
      id: rule.id,
      action: rule.action,
      condition: rule.condition,
      description: rule.description,
      priority: rule.priority,
      enabled: Boolean(rule.enabled),
    }));
  }

  /**
   * Redact sensitive data from args or results using regex patterns
   */
  async redactData(
    data: Record<string, unknown>
  ): Promise<{ redactedArgs: Record<string, unknown>; redactedFields: string[] }> {
    // Load active redaction patterns
    const patterns = await db
      .select()
      .from(redactionPatterns)
      .where(eq(redactionPatterns.enabled, true));

    if (patterns.length === 0) {
      return { redactedArgs: data, redactedFields: [] };
    }

    const redactedFields: string[] = [];
    const redactedArgs = JSON.parse(JSON.stringify(data)); // Deep clone

    // Recursively apply redaction patterns
    const redactObject = (obj: any, path: string = ''): void => {
      for (const [key, value] of Object.entries(obj)) {
        const fieldPath = path ? `${path}.${key}` : key;

        if (typeof value === 'string') {
          let redacted = value;
          let wasRedacted = false;

          for (const pattern of patterns) {
            try {
              const regex = new RegExp(pattern.pattern, 'g');
              const beforeRedaction = redacted;
              redacted = redacted.replace(regex, pattern.replacement);

              if (redacted !== beforeRedaction) {
                wasRedacted = true;
              }
            } catch (error) {
              // Invalid regex - skip this pattern
              console.error(`Invalid redaction pattern: ${pattern.pattern}`, error);
            }
          }

          if (wasRedacted) {
            obj[key] = redacted;
            redactedFields.push(fieldPath);
          }
        } else if (typeof value === 'object' && value !== null) {
          redactObject(value, fieldPath);
        }
      }
    };

    redactObject(redactedArgs);

    return { redactedArgs, redactedFields };
  }

  /**
   * Redact result data (for REDACT action)
   */
  async redactResult(
    result: any
  ): Promise<{ redactedResult: any; redactedFields: string[] }> {
    if (typeof result !== 'object' || result === null) {
      return { redactedResult: result, redactedFields: [] };
    }

    const { redactedArgs, redactedFields } = await this.redactData(result as Record<string, unknown>);
    return { redactedResult: redactedArgs, redactedFields };
  }

  /**
   * Create an approval request for REQUIRE_APPROVAL action
   */
  async createApprovalRequest(params: {
    pluginId: string;
    toolName: string;
    args: Record<string, unknown>;
    ruleId: string;
  }): Promise<ApprovalRequest> {
    const id = randomUUID();
    const timestamp = new Date().toISOString();

    await db.insert(approvalRequests).values({
      id,
      timestamp,
      pluginId: params.pluginId,
      toolName: params.toolName,
      args: JSON.stringify(params.args),
      ruleId: params.ruleId,
      status: 'pending',
      approvedArgs: null,
      resolvedAt: null,
    });

    return {
      id,
      timestamp,
      pluginId: params.pluginId,
      toolName: params.toolName,
      args: params.args,
      ruleId: params.ruleId,
      status: 'pending',
    };
  }

  /**
   * Get an approval request by ID
   */
  async getApprovalRequest(id: string): Promise<ApprovalRequest | null> {
    const results = await db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.id, id))
      .limit(1);

    if (results.length === 0) {
      return null;
    }

    const row = results[0];
    return {
      id: row.id,
      timestamp: row.timestamp,
      pluginId: row.pluginId,
      toolName: row.toolName,
      args: JSON.parse(row.args),
      ruleId: row.ruleId,
      status: row.status as 'pending' | 'approved' | 'denied',
      approvedArgs: row.approvedArgs ? JSON.parse(row.approvedArgs) : undefined,
    };
  }

  /**
   * Approve an approval request (optionally with modified args)
   */
  async approveRequest(
    id: string,
    approvedArgs?: Record<string, unknown>
  ): Promise<ApprovalRequest | null> {
    const request = await this.getApprovalRequest(id);
    if (!request) {
      return null;
    }

    if (request.status !== 'pending') {
      throw new Error(`Approval request ${id} is already ${request.status}`);
    }

    const resolvedAt = new Date().toISOString();

    await db
      .update(approvalRequests)
      .set({
        status: 'approved',
        approvedArgs: approvedArgs ? JSON.stringify(approvedArgs) : null,
        resolvedAt,
      })
      .where(eq(approvalRequests.id, id));

    return {
      ...request,
      status: 'approved',
      approvedArgs,
    };
  }

  /**
   * Deny an approval request
   */
  async denyRequest(id: string): Promise<ApprovalRequest | null> {
    const request = await this.getApprovalRequest(id);
    if (!request) {
      return null;
    }

    if (request.status !== 'pending') {
      throw new Error(`Approval request ${id} is already ${request.status}`);
    }

    const resolvedAt = new Date().toISOString();

    await db
      .update(approvalRequests)
      .set({
        status: 'denied',
        resolvedAt,
      })
      .where(eq(approvalRequests.id, id));

    return {
      ...request,
      status: 'denied',
    };
  }

  /**
   * List all pending approval requests
   */
  async getPendingApprovals(): Promise<ApprovalRequest[]> {
    const results = await db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.status, 'pending'))
      .orderBy(desc(approvalRequests.timestamp));

    return results.map((row: any) => ({
      id: row.id,
      timestamp: row.timestamp,
      pluginId: row.pluginId,
      toolName: row.toolName,
      args: JSON.parse(row.args),
      ruleId: row.ruleId,
      status: 'pending' as const,
    }));
  }

  /**
   * Set the default action (fallback when no rules match)
   */
  setDefaultAction(action: PolicyAction): void {
    this.defaultAction = action;
  }

  /**
   * Get the current default action
   */
  getDefaultAction(): PolicyAction {
    return this.defaultAction;
  }
}

// Export singleton instance
export const policyEngine = new PolicyEngine();
