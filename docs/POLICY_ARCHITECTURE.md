# CoreLink Policy Implementation Architecture

## Overview

CoreLink implements a comprehensive policy-based access control system that evaluates requests from AI agents and determines what actions are permitted, blocked, redacted, or require user approval. The system is built on JSON Logic for flexible condition evaluation.

---

## 1. Database Schema (packages/gateway/src/db/schema.ts)

### Key Tables

#### `policyRules` Table
Stores policy rules that govern what AI agents can do.

```typescript
policyRules {
  id: string (PRIMARY KEY)           // UUID
  pluginId: string | null            // null = global rule, otherwise plugin-specific
  action: string                     // 'ALLOW' | 'BLOCK' | 'REDACT' | 'REQUIRE_APPROVAL'
  condition: string                  // JSON Logic expression (stored as JSON string)
  description: string | null         // Human-readable description
  priority: integer (default: 0)     // Higher priority rules evaluated first
  enabled: boolean (default: true)   // Can be disabled without deletion
  createdAt: string (auto)           // ISO timestamp
  updatedAt: string (auto)           // ISO timestamp
}
```

**Key Points:**
- `pluginId = null` indicates a global rule that applies to all plugins
- `pluginId = "com.corelink.gmail"` applies only to that specific plugin
- Policy evaluation is order-independent due to priority system
- Conditions use JSON Logic for safe, injectable-proof evaluation

#### `redactionPatterns` Table
Defines regex patterns to redact sensitive data from results.

```typescript
redactionPatterns {
  id: string (PRIMARY KEY)
  name: string                       // e.g., "Email Addresses"
  pattern: string                    // Regex pattern
  replacement: string (default: "[REDACTED]")
  description: string | null
  enabled: boolean (default: true)
  createdAt: string (auto)
}
```

#### `approvalRequests` Table
Tracks pending approvals when `REQUIRE_APPROVAL` action is triggered.

```typescript
approvalRequests {
  id: string (PRIMARY KEY)
  timestamp: string (auto)
  pluginId: string
  toolName: string
  args: string                       // JSON blob of tool arguments
  ruleId: string                     // Which policy rule triggered this
  status: string                     // 'pending' | 'approved' | 'denied'
  approvedArgs: string | null        // JSON blob - user can modify args before approving
  resolvedAt: string | null          // When the request was resolved
}
```

#### `activeProviders` Table
Maps service categories to the active plugin for service abstraction.

```typescript
activeProviders {
  category: string (PRIMARY KEY)     // 'email' | 'task' | 'calendar' | 'notes'
  pluginId: string                   // Active plugin ID for this category
  updatedAt: string (auto)
}
```

#### Supporting Tables
- `auditLogs`: Complete audit trail of all policy decisions and executions
- `credentials`: OAuth tokens (encrypted)
- `pluginSettings`: Plugin configuration

---

## 2. Policy Types (packages/core/src/types/policy.ts)

### PolicyAction
```typescript
type PolicyAction = 'ALLOW' | 'BLOCK' | 'REDACT' | 'REQUIRE_APPROVAL'

// ALLOW:              Execute the request normally
// BLOCK:              Deny the request and return error
// REDACT:             Execute but apply redaction patterns to results
// REQUIRE_APPROVAL:   Create an approval request and hold execution
```

### PolicyRule
```typescript
interface PolicyRule {
  id: string;
  enabled: boolean;
  action: PolicyAction;
  condition: string;              // JSON Logic expression
  description?: string;
  priority?: number;              // Higher = evaluated first
}
```

### PolicyResult
```typescript
interface PolicyResult {
  action: PolicyAction;
  matchedRuleId?: string;         // Which rule matched
  reason?: string;
  modifiedArgs?: Record<string, unknown>;  // For REDACT action
}
```

### ApprovalRequest
```typescript
interface ApprovalRequest {
  id: string;
  timestamp: string;
  pluginId: string;
  toolName: string;
  args: Record<string, unknown>;
  ruleId: string;
  status: 'pending' | 'approved' | 'denied';
  approvedArgs?: Record<string, unknown>;  // User can modify args
}
```

---

## 3. Policy Engine Service (packages/gateway/src/services/policy-engine.ts)

### PolicyEvaluationContext
```typescript
interface PolicyEvaluationContext {
  tool: string;              // e.g., "list_emails"
  plugin: string;            // e.g., "com.corelink.gmail"
  agent: string;             // e.g., "Claude Code"
  agentVersion?: string;
  args: Record<string, unknown>;  // Tool arguments
  category?: string;         // e.g., "email" (for service abstraction)
}
```

### Policy Evaluation Flow

1. **Load Rules**: Fetch all applicable rules (global + plugin-specific)
2. **Sort by Priority**: Higher priority rules evaluated first
3. **Evaluate Conditions**: Use json-logic-js to safely evaluate conditions
4. **Match Action**: Return the first matching rule's action
5. **Default Action**: If no rules match, use default action (BLOCK)

### Key Methods

#### `evaluate(context: PolicyEvaluationContext): Promise<ExtendedPolicyResult>`
Main policy evaluation method. Returns action and metadata.

```typescript
// Example flow:
const context = {
  tool: 'list_emails',
  plugin: 'com.corelink.gmail',
  agent: 'Claude Code',
  args: { max_results: 50 }
};

const result = await policyEngine.evaluate(context);
// Returns: { action: 'ALLOW', matchedRuleId: 'pol-allow-list-50', reason: '...' }
```

#### `loadRules(pluginId: string): Promise<PolicyRule[]>`
Loads both global rules (pluginId = null) and plugin-specific rules from database.

#### `redactData(data: Record<string, unknown>): Promise<{ redactedArgs, redactedFields }>`
Applies all enabled redaction patterns to data using regex.

#### `createApprovalRequest(...): Promise<ApprovalRequest>`
Creates an approval request when REQUIRE_APPROVAL is triggered.

#### `approveRequest(id: string, approvedArgs?: object): Promise<ApprovalRequest>`
User approves a pending request (with optional argument modifications).

#### `denyRequest(id: string): Promise<ApprovalRequest>`
User denies a pending request.

#### `getPendingApprovals(): Promise<ApprovalRequest[]>`
Lists all pending approvals.

---

## 4. Default Policies (packages/gateway/src/db/seed-policies.ts)

CoreLink seeds the database with sensible default policies on first run.

### Default Policy Rules

#### HIGH PRIORITY (200)
Block all send_email operations for safety

```json
{
  "id": "pol-block-send-email",
  "pluginId": null,
  "action": "BLOCK",
  "condition": { "==": [{ "var": "tool" }, "send_email"] },
  "description": "Block all email sending operations for safety",
  "priority": 200
}
```

#### MEDIUM PRIORITY (150)
Require approval for high-volume email reads

```json
{
  "id": "pol-approve-high-volume",
  "pluginId": null,
  "action": "REQUIRE_APPROVAL",
  "condition": {
    "and": [
      { "==": [{ "var": "tool" }, "list_emails"] },
      { ">": [{ "var": "args.max_results" }, 100] }
    ]
  },
  "description": "Require approval when requesting more than 100 emails",
  "priority": 150
}
```

#### MEDIUM PRIORITY (100)
Redact sensitive information from email bodies

```json
{
  "id": "pol-redact-email-body",
  "pluginId": null,
  "action": "REDACT",
  "condition": { "==": [{ "var": "tool" }, "read_email"] },
  "description": "Redact sensitive information from email body content",
  "priority": 100
}
```

#### LOW PRIORITY (30-50)
Allow list_emails with various limits

```json
[
  {
    "id": "pol-allow-list-10",
    "action": "ALLOW",
    "condition": {
      "and": [
        { "==": [{ "var": "tool" }, "list_emails"] },
        { "<=": [{ "var": "args.max_results" }, 10] }
      ]
    },
    "priority": 50
  },
  // ... similar for 50 and 100 emails
]
```

#### LOW PRIORITY (20)
Allow search_emails operations

```json
{
  "id": "pol-allow-search",
  "pluginId": null,
  "action": "ALLOW",
  "condition": { "==": [{ "var": "tool" }, "search_emails"] },
  "priority": 20
}
```

### Default Redaction Patterns

All disabled by default. Users can enable them as needed:

- **Email Addresses**: `[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`
- **US Phone Numbers**: `\b\d{3}[-.]?\d{3}[-.]?\d{4}\b`
- **Social Security Numbers**: `\b\d{3}-\d{2}-\d{4}\b`
- **Credit Card Numbers**: `\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b`
- **API Keys**: `\b[a-zA-Z0-9]{32,}\b`
- **Bearer Tokens**: `Bearer\s+[a-zA-Z0-9._-]+`
- **IPv4 Addresses**: `\b(?:\d{1,3}\.){3}\d{1,3}\b`

---

## 5. REST API Routes (packages/gateway/src/routes/policies.ts)

### Policy Rules Management

#### `GET /api/policies`
List all policy rules

**Response:**
```json
[
  {
    "id": "pol-block-send-email",
    "pluginId": null,
    "action": "BLOCK",
    "condition": { "==": [{ "var": "tool" }, "send_email"] },
    "description": "Block all email sending operations for safety",
    "priority": 200,
    "enabled": true,
    "createdAt": "2025-02-21T10:00:00Z",
    "updatedAt": "2025-02-21T10:00:00Z"
  }
]
```

#### `GET /api/policies/:id`
Get a single policy rule

#### `POST /api/policies`
Create a new policy rule

**Request Body:**
```json
{
  "pluginId": null,
  "action": "ALLOW",
  "condition": { "==": [{ "var": "tool" }, "list_emails"] },
  "description": "Allow email listing",
  "priority": 50,
  "enabled": true
}
```

#### `PUT /api/policies/:id`
Update a policy rule (partial updates supported)

#### `DELETE /api/policies/:id`
Delete a policy rule

---

### Redaction Patterns Management

#### `GET /api/redaction-patterns`
List all redaction patterns

#### `POST /api/redaction-patterns`
Create a new redaction pattern

**Request Body:**
```json
{
  "name": "Email Addresses",
  "pattern": "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}",
  "replacement": "[EMAIL_REDACTED]",
  "description": "Redact email addresses",
  "enabled": false
}
```

#### `PUT /api/redaction-patterns/:id`
Update a redaction pattern

#### `DELETE /api/redaction-patterns/:id`
Delete a redaction pattern

---

### Approval Requests Management

#### `GET /api/approval-requests`
List all pending approval requests

**Response:**
```json
[
  {
    "id": "uuid",
    "timestamp": "2025-02-21T10:05:00Z",
    "pluginId": "com.corelink.gmail",
    "toolName": "list_emails",
    "args": { "max_results": 200 },
    "ruleId": "pol-approve-high-volume",
    "status": "pending"
  }
]
```

#### `GET /api/approval-requests/:id`
Get a single approval request

#### `POST /api/approval-requests/:id/approve`
Approve a request (with optional modified args)

**Request Body:**
```json
{
  "approvedArgs": { "max_results": 100 }
}
```

#### `POST /api/approval-requests/:id/deny`
Deny a request

---

### Audit Logging

#### `GET /api/audit-logs`
Query audit logs with filters

**Query Parameters:**
- `startDate`: ISO timestamp
- `endDate`: ISO timestamp
- `pluginId`: Filter by plugin
- `agentName`: Filter by agent (e.g., "Claude Code")
- `status`: 'success' | 'denied' | 'error'
- `action`: Policy action type
- `limit`: Max results (default: 100)
- `offset`: Pagination offset (default: 0)

**Response:**
```json
{
  "logs": [
    {
      "id": "uuid",
      "timestamp": "2025-02-21T10:05:00Z",
      "agentName": "Claude Code",
      "pluginId": "com.corelink.gmail",
      "toolName": "list_emails",
      "inputArgs": { "max_results": 50 },
      "policyAction": "ALLOW",
      "policyRuleId": "pol-allow-list-50",
      "status": "success",
      "executionTimeMs": 245,
      "dataSummary": "Returned 50 emails"
    }
  ],
  "total": 1000,
  "limit": 100,
  "offset": 0
}
```

#### `GET /api/audit-logs/:id`
Get a single audit log entry

#### `GET /api/audit-stats`
Get audit statistics (counts by action, status, etc.)

#### `GET /api/audit-logs/recent`
Get recent activity (default: last 20 entries)

---

## 6. Policy Evaluation Examples

### Example 1: Allow Small Email Lists

**Policy Rule:**
```json
{
  "id": "pol-allow-list-10",
  "action": "ALLOW",
  "condition": {
    "and": [
      { "==": [{ "var": "tool" }, "list_emails"] },
      { "<=": [{ "var": "args.max_results" }, 10] }
    ]
  },
  "priority": 50
}
```

**Request Context:**
```typescript
{
  tool: 'list_emails',
  plugin: 'com.corelink.gmail',
  args: { max_results: 5 }
}
```

**Evaluation:**
- Check: tool == 'list_emails' ✓
- Check: max_results <= 10 ✓
- Result: ALLOW

---

### Example 2: Require Approval for Large Requests

**Policy Rule:**
```json
{
  "id": "pol-approve-high-volume",
  "action": "REQUIRE_APPROVAL",
  "condition": {
    "and": [
      { "==": [{ "var": "tool" }, "list_emails"] },
      { ">": [{ "var": "args.max_results" }, 100] }
    ]
  },
  "priority": 150
}
```

**Request Context:**
```typescript
{
  tool: 'list_emails',
  plugin: 'com.corelink.gmail',
  args: { max_results: 200 }
}
```

**Evaluation:**
- Check: tool == 'list_emails' ✓
- Check: max_results > 100 ✓
- Result: REQUIRE_APPROVAL
  - Create approval request
  - User must approve before execution

---

### Example 3: Redact Email Bodies

**Policy Rule:**
```json
{
  "id": "pol-redact-email-body",
  "action": "REDACT",
  "condition": { "==": [{ "var": "tool" }, "read_email"] },
  "priority": 100
}
```

**Enabled Redaction Patterns:**
- Email Addresses: `[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}` -> `[EMAIL_REDACTED]`
- Phone Numbers: `\b\d{3}[-.]?\d{3}[-.]?\d{4}\b` -> `[PHONE_REDACTED]`

**Request Context:**
```typescript
{
  tool: 'read_email',
  plugin: 'com.corelink.gmail',
  args: { email_id: 'msg123' }
}
```

**Execution & Redaction:**
1. Fetch email: "Call john.doe@acme.com at 555-123-4567"
2. Apply redaction patterns
3. Result: "Call [EMAIL_REDACTED] at [PHONE_REDACTED]"

---

## 7. Architecture Diagrams

### Policy Evaluation Flow

```
┌─────────────────────────────────────────────────────────────┐
│ AI Agent Request                                            │
│ {                                                           │
│   tool: "list_emails",                                      │
│   plugin: "com.corelink.gmail",                             │
│   args: { max_results: 50 }                                 │
│ }                                                           │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ PolicyEngine.evaluate(context)                              │
├─────────────────────────────────────────────────────────────┤
│ 1. Load applicable rules (global + plugin-specific)         │
│ 2. Sort by priority (descending)                            │
│ 3. For each rule:                                           │
│    - Evaluate JSON Logic condition                          │
│    - If match: execute action handler                       │
│    - If no match: continue to next rule                     │
│ 4. If no rules match: use default action (BLOCK)           │
└────────────────────┬────────────────────────────────────────┘
                     │
          ┌──────────┼──────────┐
          ▼          ▼          ▼
       ┌──────┐  ┌───────┐  ┌──────────┐
       │ALLOW │  │ BLOCK │  │ REDACT/  │
       │      │  │       │  │ APPROVE  │
       └──┬───┘  └───┬───┘  └────┬─────┘
          │          │            │
          ▼          ▼            ▼
    ┌──────────┐ ┌──────────┐ ┌──────────────────┐
    │ Execute  │ │  Deny    │ │ Create approval  │
    │  tool    │ │ request  │ │ request / redact │
    └──────────┘ └──────────┘ └──────────────────┘
          │          │            │
          └──────────┴────────────┘
                     │
                     ▼
    ┌──────────────────────────────┐
    │ Log to audit trail           │
    │ Return PolicyResult          │
    └──────────────────────────────┘
```

### Service Abstraction with Policy

```
┌──────────────────────────────────┐
│ AI Agent                         │
│ Call: list_emails(max: 10)      │
└────────────┬─────────────────────┘
             │
             ▼
    ┌──────────────────────┐
    │ Service Abstraction  │
    │ Lookup active provider for
    │ category: "email"    │
    └────────┬─────────────┘
             │
             ▼
    ┌──────────────────────┐
    │ Active Provider      │
    │ pluginId: "gmail"    │
    └────────┬─────────────┘
             │
             ▼
    ┌──────────────────────┐
    │ Policy Engine        │
    │ Evaluate:            │
    │ - tool: list_emails  │
    │ - plugin: gmail      │
    │ - args: {max: 10}    │
    └────────┬─────────────┘
             │
             ▼
    ┌──────────────────────┐
    │ Policy Result        │
    │ Action: ALLOW        │
    └────────┬─────────────┘
             │
             ▼
    ┌──────────────────────┐
    │ Plugin Execution     │
    │ Gmail.list_emails()  │
    └──────────────────────┘
```

---

## 8. Current Limitations

1. **No Categorization Field**: Policies can't be grouped by use-case or purpose beyond the ID naming convention
2. **No Tags/Labels**: No way to quickly identify policy families or related rules
3. **Static Condition Structure**: Conditions are always full JSON Logic expressions, no template system
4. **No Policy Templates**: Can't create preset policy configurations
5. **No Rule Dependencies**: Can't have policies that depend on other policies
6. **Plugin-Specific Only**: pluginId is either null or specific - no group categories
7. **Approval Workflow Limited**: No escalation or multi-level approvals
8. **No Rate Limiting**: Policies don't support rate limiting (e.g., "max 100 emails per hour")

---

## 9. Future Enhancements

To support better use-case management, consider:

```typescript
// Proposed enhancement: Add categorization
export const policyRules = sqliteTable('policy_rules', {
  // ... existing fields ...
  
  // New fields
  category?: string;           // e.g., "email-safety", "data-privacy", "performance"
  tags?: string[];             // e.g., ["gmail", "sensitive-data", "compliance"]
  useCase?: string;            // e.g., "restrict-sending" or "protect-pii"
  templateId?: string;         // If based on template
  isTemplate?: boolean;        // This rule is a template
});
```

This would enable:
- Filtering policies by use-case
- Grouping related rules visually
- Bulk enable/disable by category
- Policy templates with variable substitution
- Better audit reporting by use-case

---

## Summary

CoreLink's policy system provides:

- **Flexible Rule Engine**: JSON Logic-based conditions without code injection risk
- **Four Actions**: ALLOW, BLOCK, REDACT, REQUIRE_APPROVAL
- **Priority-Based Evaluation**: Higher priority rules match first
- **Scope Control**: Global or plugin-specific rules
- **Redaction Patterns**: Regex-based sensitive data masking
- **Approval Workflow**: Hold requests for user review/modification
- **Complete Audit Trail**: All decisions logged with timestamps and execution metrics

The architecture is clean, extensible, and privacy-focused, with all data stored locally in SQLite.

