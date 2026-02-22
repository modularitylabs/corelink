/**
 * API Client for CoreLink Gateway
 */

const API_URL = 'http://localhost:3000';

// ===== Types =====

export type PolicyAction = 'ALLOW' | 'BLOCK' | 'REDACT' | 'REQUIRE_APPROVAL';

export type PolicyCategory = 'email' | 'calendar' | 'task' | 'file' | 'global';

export interface Account {
  id: string;
  pluginId: string;
  email: string;
  displayName?: string;
  isPrimary: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Policy {
  id: string;
  pluginId?: string | null;
  category?: string | null;
  action: PolicyAction;
  condition: Record<string, any>;
  description?: string;
  priority: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RedactionPattern {
  id: string;
  name: string;
  pattern: string;
  replacement: string;
  description?: string;
  enabled: boolean;
  createdAt: string;
}

export interface ApprovalRequest {
  id: string;
  pluginId: string;
  agentName: string;
  tool: string;
  args: Record<string, any>;
  requestedAt: string;
  status: 'pending' | 'approved' | 'denied';
  approvedAt?: string;
  deniedAt?: string;
  approvedArgs?: Record<string, any>;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  pluginId: string;
  category?: string;
  agentName: string;
  tool: string;
  args: Record<string, any>;
  policyDecision: {
    action: PolicyAction;
    ruleId?: string;
    reason?: string;
  };
  status: 'success' | 'denied' | 'error';
  error?: string;
}

export interface AuditStats {
  totalRequests: number;
  allowedRequests: number;
  blockedRequests: number;
  redactedRequests: number;
  approvalRequests: number;
  erroredRequests: number;
  byPlugin?: Record<string, number>;
  byAgent?: Record<string, number>;
}

// ===== Policy API =====

export async function getPolicies(): Promise<Policy[]> {
  const response = await fetch(`${API_URL}/api/policies`);
  if (!response.ok) throw new Error('Failed to fetch policies');
  return response.json();
}

export async function getPolicy(id: string): Promise<Policy> {
  const response = await fetch(`${API_URL}/api/policies/${id}`);
  if (!response.ok) throw new Error('Failed to fetch policy');
  return response.json();
}

export async function createPolicy(policy: {
  pluginId?: string | null;
  category?: string | null;
  action: PolicyAction;
  condition: Record<string, any>;
  description?: string;
  priority?: number;
  enabled?: boolean;
}): Promise<Policy> {
  const response = await fetch(`${API_URL}/api/policies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(policy),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create policy');
  }
  return response.json();
}

export async function updatePolicy(
  id: string,
  updates: {
    pluginId?: string | null;
    category?: string | null;
    action?: PolicyAction;
    condition?: Record<string, any>;
    description?: string;
    priority?: number;
    enabled?: boolean;
  }
): Promise<{ success: boolean; id: string }> {
  const response = await fetch(`${API_URL}/api/policies/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update policy');
  }
  return response.json();
}

export async function deletePolicy(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/policies/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to delete policy');
}

// ===== Redaction Patterns API =====

export async function getRedactionPatterns(): Promise<RedactionPattern[]> {
  const response = await fetch(`${API_URL}/api/redaction-patterns`);
  if (!response.ok) throw new Error('Failed to fetch redaction patterns');
  return response.json();
}

export async function createRedactionPattern(pattern: {
  name: string;
  pattern: string;
  replacement?: string;
  description?: string;
  enabled?: boolean;
}): Promise<RedactionPattern> {
  const response = await fetch(`${API_URL}/api/redaction-patterns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pattern),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create redaction pattern');
  }
  return response.json();
}

export async function updateRedactionPattern(
  id: string,
  updates: {
    name?: string;
    pattern?: string;
    replacement?: string;
    description?: string;
    enabled?: boolean;
  }
): Promise<{ success: boolean; id: string }> {
  const response = await fetch(`${API_URL}/api/redaction-patterns/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update redaction pattern');
  }
  return response.json();
}

export async function deleteRedactionPattern(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/redaction-patterns/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to delete redaction pattern');
}

// ===== Approval Requests API =====

export async function getApprovalRequests(): Promise<ApprovalRequest[]> {
  const response = await fetch(`${API_URL}/api/approval-requests`);
  if (!response.ok) throw new Error('Failed to fetch approval requests');
  return response.json();
}

export async function approveRequest(
  id: string,
  approvedArgs?: Record<string, unknown>
): Promise<ApprovalRequest> {
  const response = await fetch(`${API_URL}/api/approval-requests/${id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approvedArgs }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to approve request');
  }
  return response.json();
}

export async function denyRequest(id: string): Promise<ApprovalRequest> {
  const response = await fetch(`${API_URL}/api/approval-requests/${id}/deny`, {
    method: 'POST',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to deny request');
  }
  return response.json();
}

// ===== Audit Logs API =====

export async function getAuditLogs(filters?: {
  startDate?: string;
  endDate?: string;
  pluginId?: string;
  category?: string;
  agentName?: string;
  status?: 'success' | 'denied' | 'error';
  action?: PolicyAction;
  limit?: number;
  offset?: number;
}): Promise<{ logs: AuditLog[]; total: number; limit: number; offset: number }> {
  const params = new URLSearchParams();
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined) params.append(key, String(value));
    });
  }

  const response = await fetch(`${API_URL}/api/audit-logs?${params}`);
  if (!response.ok) throw new Error('Failed to fetch audit logs');
  return response.json();
}

export async function getAuditLog(id: string): Promise<AuditLog> {
  const response = await fetch(`${API_URL}/api/audit-logs/${id}`);
  if (!response.ok) throw new Error('Failed to fetch audit log');
  return response.json();
}

export async function getAuditStats(filters?: {
  startDate?: string;
  endDate?: string;
}): Promise<AuditStats> {
  const params = new URLSearchParams();
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined) params.append(key, String(value));
    });
  }

  const response = await fetch(`${API_URL}/api/audit-stats?${params}`);
  if (!response.ok) throw new Error('Failed to fetch audit stats');
  return response.json();
}

export async function getRecentActivity(limit = 20): Promise<AuditLog[]> {
  const response = await fetch(`${API_URL}/api/audit-logs/recent?limit=${limit}`);
  if (!response.ok) throw new Error('Failed to fetch recent activity');
  return response.json();
}

// ===== Account Management API =====

export async function getAccounts(pluginId?: string): Promise<Account[]> {
  const url = pluginId
    ? `${API_URL}/api/accounts?pluginId=${pluginId}`
    : `${API_URL}/api/accounts`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch accounts');
  return response.json();
}

export async function getAccount(accountId: string): Promise<Account> {
  const response = await fetch(`${API_URL}/api/accounts/${accountId}`);
  if (!response.ok) throw new Error('Failed to fetch account');
  return response.json();
}

export async function getPrimaryAccount(pluginId: string): Promise<Account | null> {
  const response = await fetch(`${API_URL}/api/accounts/primary?pluginId=${pluginId}`);
  if (!response.ok) throw new Error('Failed to fetch primary account');
  return response.json();
}

export async function setPrimaryAccount(accountId: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/accounts/${accountId}/set-primary`, {
    method: 'POST',
  });
  if (!response.ok) throw new Error('Failed to set primary account');
}

export async function updateAccount(
  accountId: string,
  updates: {
    displayName?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const response = await fetch(`${API_URL}/api/accounts/${accountId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!response.ok) throw new Error('Failed to update account');
}

export async function deleteAccount(accountId: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/accounts/${accountId}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to delete account');
}

// ===== OAuth API =====

export async function getGmailStatus(): Promise<{ accounts: Account[] }> {
  const response = await fetch(`${API_URL}/oauth/gmail/status`);
  if (!response.ok) throw new Error('Failed to fetch Gmail status');
  return response.json();
}

export async function getOutlookStatus(): Promise<{ accounts: Account[] }> {
  const response = await fetch(`${API_URL}/oauth/outlook/status`);
  if (!response.ok) throw new Error('Failed to fetch Outlook status');
  return response.json();
}

export async function startGmailOAuth(): Promise<{ authUrl: string }> {
  const response = await fetch(`${API_URL}/oauth/gmail/start`);
  if (!response.ok) throw new Error('Failed to start Gmail OAuth');
  return response.json();
}

export async function startOutlookOAuth(): Promise<{ authUrl: string }> {
  const response = await fetch(`${API_URL}/oauth/outlook/start`);
  if (!response.ok) throw new Error('Failed to start Outlook OAuth');
  return response.json();
}

export async function disconnectGmail(): Promise<void> {
  const response = await fetch(`${API_URL}/oauth/gmail`, { method: 'DELETE' });
  if (!response.ok) throw new Error('Failed to disconnect Gmail');
}

export async function disconnectOutlook(): Promise<void> {
  const response = await fetch(`${API_URL}/oauth/outlook`, { method: 'DELETE' });
  if (!response.ok) throw new Error('Failed to disconnect Outlook');
}
