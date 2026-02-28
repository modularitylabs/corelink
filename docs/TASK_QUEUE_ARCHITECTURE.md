# CoreLink Task Queue Architecture

**Version**: 1.0.0
**Last Updated**: 2026-02-28
**Status**: Design Document

---

## Table of Contents

1. [Overview](#overview)
2. [Motivation](#motivation)
3. [Architecture Overview](#architecture-overview)
4. [Database Schema](#database-schema)
5. [Core Components](#core-components)
6. [Task Lifecycle](#task-lifecycle)
7. [MCP Integration Strategy](#mcp-integration-strategy)
8. [Cancellation Architecture](#cancellation-architecture)
9. [Session Isolation](#session-isolation)
10. [Configuration](#configuration)
11. [Error Handling](#error-handling)
12. [Performance Considerations](#performance-considerations)

---

## Overview

CoreLink implements a **persistent, session-based task queue** to support:
- **REQUIRE_APPROVAL policy action** (tasks may wait hours for user approval)
- **User cancellation** (stop runaway AI agents from UI)
- **Resource fairness** (prevent one agent from starving others)
- **Audit trail** (complete history of all task executions)

This is a **mandatory architectural component**, not an optimization. Without it, REQUIRE_APPROVAL cannot be implemented.

---

## Motivation

### Problem 1: REQUIRE_APPROVAL Cannot Work Synchronously

**Scenario**: User has a policy that requires approval before sending emails to executives.

```json
{
  "action": "REQUIRE_APPROVAL",
  "condition": {
    "and": [
      {"==": [{"var": "tool"}, "send_email"]},
      {"in": ["ceo@company.com", {"var": "args.to"}]}
    ]
  }
}
```

**With synchronous execution**:
- AI agent calls `send_email(to='ceo@company.com')`
- HTTP connection must stay open until user approves
- Users take minutes/hours to review
- Connection times out ❌
- **IMPOSSIBLE TO IMPLEMENT**

**With task queue**:
- Request enqueued immediately with `status='pending_approval'`
- Return task ID to AI agent (connection closes)
- User approves from UI when ready
- Task transitions to `queued` → worker executes
- AI agent polls for result
- **WORKS PERFECTLY** ✅

### Problem 2: Runaway Agent Protection

**Scenario**: Buggy AI agent sends 5,000 `read_email` requests.

**Without task queue**:
- All 5,000 requests start executing immediately
- API quota exhausted in seconds
- No way to stop them (requests already in-flight)
- User helpless ❌

**With task queue**:
- All 5,000 requests enqueued
- Only 3 execute at a time (worker limit)
- User sees in UI: "4,990 queued, 3 running, 7 completed"
- User clicks "Cancel All"
- Queued tasks (4,990) → instant cancellation
- Running tasks (3) → abort via AbortController
- **CRISIS AVERTED** ✅

### Problem 3: Resource Fairness

**Scenario**: Two AI agents active simultaneously.

**Without task queue**:
- Agent A (ChatGPT) sends 100 requests
- Agent B (Claude) sends 10 requests
- All 110 requests execute in parallel
- Rate limits hit immediately
- Both agents fail ❌

**With session-based task queue**:
- Agent A gets 3 workers (executes 3 at a time)
- Agent B gets 3 workers (executes 3 at a time)
- Both make progress fairly
- No starvation ✅

---

## Architecture Overview

### High-Level Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      AI Agent Layer                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Claude Code  │  │   ChatGPT    │  │  Custom AI   │      │
│  │ (Session 1)  │  │ (Session 2)  │  │ (Session 3)  │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
└─────────┼──────────────────┼──────────────────┼─────────────┘
          │                  │                  │
          │   MCP Protocol   │                  │
          ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│                    MCP Server Layer                          │
│              ┌────────────────────────┐                      │
│              │   SessionTaskManager   │                      │
│              └───────────┬────────────┘                      │
│                          │                                   │
│          ┌───────────────┼───────────────┐                  │
│          ▼               ▼               ▼                  │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐            │
│   │  Session │    │  Session │    │  Session │            │
│   │  Pool 1  │    │  Pool 2  │    │  Pool 3  │            │
│   └────┬─────┘    └────┬─────┘    └────┬─────┘            │
│        │               │               │                    │
│   [W1][W2][W3]    [W1][W2][W3]    [W1][W2][W3]            │
│        │               │               │                    │
└────────┼───────────────┼───────────────┼────────────────────┘
         │               │               │
         ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────┐
│              Persistent Task Queue (SQLite)                  │
│                                                              │
│  Session 1 Tasks    Session 2 Tasks    Session 3 Tasks     │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐      │
│  │ queued: 97  │   │ queued: 5   │   │ queued: 0   │      │
│  │ running: 3  │   │ running: 3  │   │ running: 2  │      │
│  │ pending: 12 │   │ pending: 0  │   │ pending: 1  │      │
│  │ completed:8 │   │ completed:2 │   │ completed:4 │      │
│  └─────────────┘   └─────────────┘   └─────────────┘      │
└─────────────────────────────────────────────────────────────┘
         │               │               │
         ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────┐
│                  External APIs Layer                         │
│   [Gmail API]    [Outlook API]    [Todoist API]            │
└─────────────────────────────────────────────────────────────┘
```

### Key Characteristics

1. **Persistent**: Tasks stored in SQLite, survive server restarts
2. **Session-isolated**: Each MCP session gets own worker pool
3. **Fair**: Fixed workers per session (3 workers = max 3 concurrent requests)
4. **Cancellable**: Both queued (instant) and in-flight (abort) tasks
5. **Auditable**: Complete lifecycle tracking

---

## Database Schema

### task_queue Table

```sql
CREATE TABLE task_queue (
  -- Identity
  id TEXT PRIMARY KEY,              -- task_abc123xyz (nanoid)
  session_id TEXT NOT NULL,         -- MCP session identifier

  -- Task definition
  tool_name TEXT NOT NULL,          -- 'read_email', 'list_emails', etc.
  args TEXT NOT NULL,               -- JSON serialized arguments

  -- Execution state
  status TEXT NOT NULL,             -- 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'pending_approval'
  priority INTEGER DEFAULT 0,       -- Higher = more urgent (RESERVED FOR FUTURE)

  -- Worker tracking
  worker_id TEXT,                   -- Which worker claimed this (e.g., 'session1-worker-2')
  attempts INTEGER DEFAULT 0,       -- Retry count (incremented on each claim)
  max_attempts INTEGER DEFAULT 3,   -- Max retries before marking failed

  -- Timing
  created_at TEXT NOT NULL,         -- ISO8601 timestamp
  started_at TEXT,                  -- When worker claimed it
  completed_at TEXT,                -- When finished (success or failure)
  timeout_at TEXT,                  -- Auto-fail if not completed by this time

  -- Results
  result TEXT,                      -- JSON serialized result (on success)
  error TEXT,                       -- Error message (on failure)

  -- Policy integration
  policy_decision TEXT,             -- 'ALLOW' | 'BLOCK' | 'REDACT' | 'REQUIRE_APPROVAL'
  approval_request_id TEXT,         -- Foreign key to approval_requests table
  redacted_fields TEXT,             -- JSON array of redacted field paths

  -- Indices for performance
  INDEX idx_session_status (session_id, status),
  INDEX idx_status_priority (status, priority DESC, created_at ASC),
  INDEX idx_worker (worker_id),
  INDEX idx_cleanup (completed_at, status)  -- For 30-day cleanup
);
```

### Task Retention Policy

**Auto-cleanup after 30 days**:
```sql
-- Scheduled job runs daily
DELETE FROM task_queue
WHERE completed_at IS NOT NULL
  AND datetime(completed_at) < datetime('now', '-30 days');
```

**Rationale**:
- ✅ Audit trail for compliance (30 days is standard)
- ✅ Prevents database bloat
- ✅ Completed/failed tasks don't need indefinite storage
- ⚠️ Pending approval tasks are NOT deleted (completed_at is NULL)

---

## Core Components

### 1. SessionTaskManager

**Purpose**: Orchestrates all task operations across sessions.

**Responsibilities**:
- Create/destroy session worker pools
- Enqueue tasks (with policy evaluation)
- Cancel tasks (single or bulk)
- Query task status

**API**:
```typescript
class SessionTaskManager {
  // Session lifecycle
  async createSession(sessionId: string): Promise<void>
  async destroySession(sessionId: string): Promise<void>

  // Task operations
  async enqueueTask(
    sessionId: string,
    tool: string,
    args: Record<string, unknown>
  ): Promise<string>  // Returns taskId

  async getTaskStatus(taskId: string): Promise<TaskStatus>

  async cancelTask(taskId: string): Promise<void>
  async cancelAllForSession(sessionId: string): Promise<number>  // Returns count

  // For non-MCP-Tasks clients
  async enqueueAndWait(
    sessionId: string,
    tool: string,
    args: Record<string, unknown>,
    timeoutMs?: number
  ): Promise<TaskResult>
}
```

### 2. SessionWorkerPool

**Purpose**: Manages fixed worker pool for a single session.

**Configuration**:
```typescript
const WORKERS_PER_SESSION = 3;  // Explicit constant
```

**Responsibilities**:
- Spawn N worker instances on creation
- Distribute work to workers (workers self-select via polling)
- Coordinate cancellation across workers
- Shutdown cleanly on session end

**API**:
```typescript
class SessionWorkerPool {
  constructor(
    private sessionId: string,
    private workerCount: number = WORKERS_PER_SESSION
  )

  async start(): Promise<void>
  async shutdown(): Promise<void>
  async cancelTask(taskId: string): Promise<void>
  async cancelAll(): Promise<void>
}
```

### 3. Worker

**Purpose**: Polls queue, claims tasks, executes them.

**Worker Loop**:
```typescript
class Worker {
  async start() {
    while (!this.pool.isShutdown) {
      // 1. Claim next task (atomic via DB transaction)
      const task = await this.claimNextTask();

      if (!task) {
        // No work available
        await sleep(WORKER_POLL_INTERVAL_MS);
        continue;
      }

      // 2. Execute with abort support
      this.currentTaskId = task.id;
      this.abortController = new AbortController();

      try {
        const result = await this.executeTask(task);
        await this.markCompleted(task.id, result);
      } catch (error) {
        await this.handleError(task, error);
      } finally {
        this.currentTaskId = null;
        this.abortController = null;
      }
    }
  }

  async claimNextTask(): Promise<Task | null> {
    // Atomic operation: find + claim in single transaction
    return await db.transaction(async (tx) => {
      const task = await tx.query(`
        SELECT * FROM task_queue
        WHERE session_id = ?
          AND status = 'queued'
          AND attempts < max_attempts
          AND (timeout_at IS NULL OR timeout_at > ?)
        ORDER BY priority DESC, created_at ASC
        LIMIT 1
        FOR UPDATE  -- Lock row
      `, [this.sessionId, new Date().toISOString()]);

      if (!task) return null;

      // Claim it
      await tx.execute(`
        UPDATE task_queue
        SET status = 'running',
            worker_id = ?,
            started_at = ?,
            attempts = attempts + 1
        WHERE id = ?
      `, [this.workerId, new Date().toISOString(), task.id]);

      return task;
    });
  }
}
```

**Key Features**:
- **Self-selecting**: Workers independently claim tasks (no central dispatcher)
- **Atomic claiming**: Database transaction prevents duplicate claims
- **Abort support**: Each worker tracks AbortController for cancellation
- **Non-blocking**: Async/await, runs on Node.js event loop (not OS threads)

---

## Task Lifecycle

### State Transition Diagram

```
                    ┌──────────────┐
                    │  AI Request  │
                    └──────┬───────┘
                           │
                           ▼
                  ┌────────────────┐
                  │ Policy Engine  │
                  └────┬───┬───┬───┘
                       │   │   │
        ┌──────────────┘   │   └──────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
   ┌────────┐      ┌──────────────┐      ┌───────┐
   │ BLOCK  │      │REQUIRE_APPROVAL│      │ ALLOW │
   └───┬────┘      └──────┬─────────┘      └───┬───┘
       │                  │                    │
       ▼                  ▼                    ▼
  ┌─────────┐      ┌────────────────┐   ┌──────────┐
  │ failed  │      │pending_approval│   │  queued  │
  └─────────┘      └────────┬───────┘   └────┬─────┘
                            │                │
                   ┌────────┴────────┐       │
                   ▼                 ▼       │
              ┌─────────┐      ┌──────────┐ │
              │cancelled│      │ approved │ │
              └─────────┘      └────┬─────┘ │
                                    │       │
                                    └───┬───┘
                                        ▼
                                  ┌──────────┐
                                  │  queued  │
                                  └────┬─────┘
                                       │
                             ┌─────────┴─────────┐
                             ▼                   ▼
                      ┌──────────┐        ┌───────────┐
                      │ running  │        │ cancelled │
                      └────┬─────┘        └───────────┘
                           │
                  ┌────────┴────────┐
                  ▼                 ▼
           ┌───────────┐      ┌─────────┐
           │ completed │      │ failed  │
           └───────────┘      └─────────┘
```

### Status Descriptions

| Status | Description | Terminal? | Next States |
|--------|-------------|-----------|-------------|
| `queued` | Waiting for worker to claim | No | `running`, `cancelled` |
| `pending_approval` | Waiting for user approval | No | `queued`, `cancelled` |
| `running` | Worker executing | No | `completed`, `failed`, `cancelled` |
| `completed` | Successfully finished | Yes | - |
| `failed` | Execution failed | Yes | - |
| `cancelled` | User or system cancelled | Yes | - |

---

## MCP Integration Strategy

### Problem: Client Capability Detection

**Challenge**: Some AI agents support MCP Tasks (async), others don't (sync only).

**Solution**: Hybrid execution model.

### Strategy A: Client Supports MCP Tasks ✅

```typescript
// AI Agent request
POST /mcp/tools/call
{
  "tool": "read_email",
  "arguments": { "id": "email_abc123" }
}

// CoreLink response (immediate)
{
  "task": {
    "id": "task_xyz789",
    "status": "queued",
    "pollInterval": 1000,
    "ttl": 300000  // 5 minutes
  }
}

// AI Agent polls
GET /mcp/tasks/task_xyz789
→ { "status": "running" }
→ { "status": "running" }
→ { "status": "completed", "result": { "email": {...} } }
```

**Benefits**:
- Immediate response (low latency)
- User can cancel before execution
- UI shows task in progress
- AI agent can do other work while waiting

### Strategy B: Client Does NOT Support MCP Tasks ❌

```typescript
// Same AI Agent request
POST /mcp/tools/call
{
  "tool": "read_email",
  "arguments": { "id": "email_abc123" }
}

// CoreLink enqueues task BUT waits for completion
const taskId = await taskManager.enqueueTask(...);
const result = await taskManager.waitForTask(taskId, 300000);  // 5min timeout

// CoreLink response (after completion)
{
  "content": [
    { "type": "text", "text": "Email content here..." }
  ]
}
```

**Key Points**:
- Request STILL goes through queue (cancellable, fair, logged)
- HTTP connection stays open until completion
- From AI agent perspective: looks synchronous
- From CoreLink perspective: still async internally
- User can still cancel from UI (aborts worker, returns error to agent)

### Capability Detection

```typescript
class MCPToolHandler {
  async handleToolCall(request: ToolRequest, context: MCPContext) {
    // Check if client advertised 'tasks' capability
    const supportsAsync = context.capabilities?.tasks === true;

    if (supportsAsync) {
      // Return task handle immediately
      const taskId = await sessionTaskManager.enqueueTask(
        context.sessionId,
        request.tool,
        request.arguments
      );

      return {
        task: {
          id: taskId,
          status: 'queued',
          pollInterval: 1000,
          ttl: TASK_TIMEOUT_MS
        }
      };
    } else {
      // Enqueue and wait (HTTP connection stays open)
      const result = await sessionTaskManager.enqueueAndWait(
        context.sessionId,
        request.tool,
        request.arguments,
        TASK_TIMEOUT_MS
      );

      return {
        content: [{ type: 'text', text: JSON.stringify(result) }]
      };
    }
  }
}
```

### waitForTask Implementation

```typescript
async waitForTask(taskId: string, timeoutMs: number): Promise<TaskResult> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const task = await db.query('SELECT * FROM task_queue WHERE id = ?', [taskId]);

    if (task.status === 'completed') {
      return JSON.parse(task.result);
    }

    if (task.status === 'failed') {
      throw new Error(task.error || 'Task failed');
    }

    if (task.status === 'cancelled') {
      throw new Error('Task was cancelled by user');
    }

    // Poll every 500ms
    await sleep(500);
  }

  // Timeout - cancel the task
  await this.cancelTask(taskId);
  throw new Error('Task execution timeout');
}
```

---

## Cancellation Architecture

### Cancellation Targets

1. **Queued tasks** - Not started yet
2. **Pending approval tasks** - Waiting for user
3. **Running tasks** - Currently executing

### Cancellation Methods

#### 1. Cancel Single Task

```typescript
async cancelTask(taskId: string): Promise<void> {
  const task = await db.query('SELECT * FROM task_queue WHERE id = ?', [taskId]);
  if (!task) return;

  if (task.status === 'queued' || task.status === 'pending_approval') {
    // Not running yet - just update status
    await db.execute(`
      UPDATE task_queue
      SET status = 'cancelled',
          completed_at = ?
      WHERE id = ?
    `, [new Date().toISOString(), taskId]);
  } else if (task.status === 'running') {
    // Find worker and signal abort
    const pool = this.sessionPools.get(task.session_id);
    if (pool) {
      await pool.cancelTask(taskId);
    }
  }
}
```

#### 2. Cancel All Tasks for Session

```typescript
async cancelAllForSession(sessionId: string): Promise<number> {
  // Cancel in-flight tasks via workers
  const pool = this.sessionPools.get(sessionId);
  if (pool) {
    await pool.cancelAll();
  }

  // Bulk cancel queued/pending tasks
  const result = await db.execute(`
    UPDATE task_queue
    SET status = 'cancelled',
        completed_at = ?
    WHERE session_id = ?
      AND status IN ('queued', 'pending_approval', 'running')
  `, [new Date().toISOString(), sessionId]);

  return result.changes;
}
```

#### 3. Worker Abort Mechanism

```typescript
class Worker {
  private abortController: AbortController | null = null;
  private currentTaskId: string | null = null;

  async executeTask(task: Task) {
    this.abortController = new AbortController();

    try {
      // Pass abort signal to tool execution
      const result = await emailRouter.executeTool(
        task.tool_name,
        JSON.parse(task.args),
        { signal: this.abortController.signal }
      );

      return result;
    } catch (error) {
      if (error.name === 'AbortError') {
        // Task was cancelled
        throw new CancellationError('Task cancelled by user');
      }
      throw error;
    }
  }

  async cancel(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
    }
  }
}
```

#### 4. Propagating Abort to Providers

```typescript
class GmailProvider {
  async readEmail(
    account: Account,
    emailId: string,
    options?: { signal?: AbortSignal }
  ): Promise<Email> {
    const gmail = this.getGmailClient(account);

    // Node.js fetch-like APIs support AbortSignal
    const response = await gmail.users.messages.get({
      userId: 'me',
      id: emailId
    }, {
      signal: options?.signal  // Pass abort signal to API call
    });

    return this.normalizeEmail(response.data);
  }
}
```

### UI Cancellation Flow

```
┌──────────────┐                ┌──────────────────┐
│  User clicks │   HTTP POST    │  SessionTask     │
│ "Cancel All" │───────────────>│     Manager      │
└──────────────┘                └────────┬─────────┘
                                         │
                          ┌──────────────┴──────────────┐
                          ▼                             ▼
                   ┌─────────────┐             ┌────────────────┐
                   │ Update DB:  │             │  Worker Pool:  │
                   │ SET status= │             │  Abort all     │
                   │ 'cancelled' │             │  in-flight     │
                   └─────────────┘             └────────┬───────┘
                                                        │
                                    ┌───────────────────┼───────────────────┐
                                    ▼                   ▼                   ▼
                             ┌──────────┐        ┌──────────┐        ┌──────────┐
                             │ Worker 1 │        │ Worker 2 │        │ Worker 3 │
                             │  abort() │        │  abort() │        │  abort() │
                             └────┬─────┘        └────┬─────┘        └────┬─────┘
                                  │                   │                   │
                                  ▼                   ▼                   ▼
                            ┌──────────────────────────────────────────────┐
                            │      Gmail/Outlook API Calls Aborted         │
                            └──────────────────────────────────────────────┘
```

---

## Session Isolation

### Why Session-Based Pools?

**Problem**: Global worker pool leads to unfairness.

**Example**:
- Agent A (runaway): 1000 queued tasks
- Agent B (normal): 5 queued tasks
- Global pool (10 workers): All workers busy with Agent A
- Agent B: Starved indefinitely ❌

**Solution**: Each session gets dedicated workers.

**Example with session pools**:
- Agent A: 3 workers, executes 3 tasks at a time
- Agent B: 3 workers, executes 3 tasks at a time
- Both make progress ✅
- Agent A doesn't monopolize resources

### Session Lifecycle

```typescript
// On MCP session connect
mcp.on('session.connect', async (sessionId) => {
  await sessionTaskManager.createSession(sessionId);
  // Spawns 3 workers for this session
});

// On MCP session disconnect
mcp.on('session.disconnect', async (sessionId) => {
  await sessionTaskManager.destroySession(sessionId);
  // 1. Shutdown workers (abort in-flight tasks)
  // 2. Cancel all queued/pending tasks
  // 3. Cleanup session pool
});
```

### Multi-Session Concurrency

**Total system concurrency** = `N_sessions × WORKERS_PER_SESSION`

**Example**:
- 5 active AI agents
- 3 workers per session
- **15 concurrent API calls maximum**

**Trade-offs**:
- ✅ Fair resource allocation
- ✅ Isolation (one agent can't starve others)
- ⚠️ More concurrency than global pool (but that's acceptable)
- ⚠️ Each session uses memory for workers (but workers are lightweight)

---

## Configuration

### Constants

```typescript
// packages/gateway/src/config/task-queue.ts

/**
 * Number of workers per session.
 * Each worker can execute one task concurrently.
 * Higher = faster execution per session, more resource usage.
 */
export const WORKERS_PER_SESSION = 3;

/**
 * Task retention period in days.
 * Completed/failed tasks older than this are auto-deleted.
 * Pending approval tasks are exempt.
 */
export const TASK_RETENTION_DAYS = 30;

/**
 * Default timeout for task execution (milliseconds).
 * Tasks not completed within this time are auto-failed.
 */
export const TASK_TIMEOUT_MS = 300000;  // 5 minutes

/**
 * Worker polling interval when queue is empty (milliseconds).
 * Lower = more responsive, higher CPU usage.
 */
export const WORKER_POLL_INTERVAL_MS = 1000;  // 1 second

/**
 * Maximum retry attempts for failed tasks.
 * Transient errors (rate limits, timeouts) trigger retries.
 */
export const MAX_TASK_ATTEMPTS = 3;
```

### Future Configuration (Not Implemented Yet)

```typescript
// Per-session worker limits (future enhancement)
interface SessionConfig {
  sessionId: string;
  maxWorkers: number;  // Override default for trusted agents
  maxQueueSize: number;  // Reject new tasks if queue too large
}

// Global limits (future enhancement)
interface GlobalConfig {
  maxTotalWorkers: number;  // Hard cap across all sessions
  maxSessionsActive: number;  // Limit concurrent sessions
}
```

---

## Error Handling

### Error Categories

1. **Policy Rejection** (`status = 'failed'`)
   - Policy engine returned BLOCK
   - Task marked failed immediately
   - No retries

2. **Transient Errors** (retryable)
   - Rate limit (429)
   - Timeout
   - Network error
   - Retry with exponential backoff (up to MAX_TASK_ATTEMPTS)

3. **Permanent Errors** (not retryable)
   - Invalid arguments (400)
   - Authentication failed (401)
   - Not found (404)
   - Mark as failed immediately

4. **Cancellation** (`status = 'cancelled'`)
   - User-initiated
   - Not an error, just terminated early

### Retry Logic

```typescript
async handleError(task: Task, error: Error): Promise<void> {
  const isTransient = this.isTransientError(error);
  const canRetry = task.attempts < task.max_attempts;

  if (isTransient && canRetry) {
    // Requeue for retry with exponential backoff
    const backoffMs = Math.min(1000 * Math.pow(2, task.attempts), 30000);
    await db.execute(`
      UPDATE task_queue
      SET status = 'queued',
          worker_id = NULL,
          started_at = NULL,
          timeout_at = datetime('now', '+${backoffMs} milliseconds')
      WHERE id = ?
    `, [task.id]);
  } else {
    // Permanent failure
    await db.execute(`
      UPDATE task_queue
      SET status = 'failed',
          error = ?,
          completed_at = ?
      WHERE id = ?
    `, [error.message, new Date().toISOString(), task.id]);
  }
}

isTransientError(error: Error): boolean {
  const transientCodes = [429, 500, 502, 503, 504];
  const transientMessages = ['timeout', 'ECONNRESET', 'ETIMEDOUT'];

  return (
    transientCodes.includes(error.statusCode) ||
    transientMessages.some(msg => error.message.includes(msg))
  );
}
```

---

## Performance Considerations

### Database Indices

```sql
-- Fast session-specific queries
CREATE INDEX idx_session_status ON task_queue(session_id, status);

-- Fast worker claiming (sorted by priority + age)
CREATE INDEX idx_status_priority ON task_queue(status, priority DESC, created_at ASC);

-- Fast worker lookup (for cancellation)
CREATE INDEX idx_worker ON task_queue(worker_id);

-- Fast cleanup job
CREATE INDEX idx_cleanup ON task_queue(completed_at, status);
```

### Query Performance

**Worker claiming** (hot path):
```sql
-- Executed by every worker every 1 second
SELECT * FROM task_queue
WHERE session_id = ?
  AND status = 'queued'
  AND attempts < max_attempts
ORDER BY priority DESC, created_at ASC
LIMIT 1;
```
- Uses `idx_session_status` index
- ~1ms query time for 100k tasks
- No table scan

**Cleanup job** (cold path):
```sql
-- Executed once per day
DELETE FROM task_queue
WHERE completed_at IS NOT NULL
  AND datetime(completed_at) < datetime('now', '-30 days');
```
- Uses `idx_cleanup` index
- Deletes in batches to avoid locking

### Memory Usage

**Per-worker overhead**:
- ~500KB per worker (V8 context)
- 3 workers × N sessions = ~1.5MB × N
- For 10 sessions: ~15MB total (negligible)

**Task queue overhead**:
- ~1KB per task in database
- 1M tasks = ~1GB database file
- Mitigated by 30-day cleanup

### Scalability Limits

**Current architecture scales to**:
- **100 concurrent sessions** (300 workers total)
- **10,000 queued tasks per session** (reasonable)
- **1M tasks per day** (with cleanup)

**Bottlenecks** (if exceeded):
- SQLite lock contention (workers claiming tasks)
- Solution: Shard by session_id (separate DB per session)

---

## Diagrams

### Sequence Diagram: Normal Task Execution

```
AI Agent          MCP Server       SessionTaskManager    Worker Pool      Database         Gmail API
   │                   │                    │                  │              │                │
   │  read_email(123)  │                    │                  │              │                │
   ├──────────────────>│                    │                  │              │                │
   │                   │  enqueueTask()     │                  │              │                │
   │                   ├───────────────────>│                  │              │                │
   │                   │                    │  Policy: ALLOW   │              │                │
   │                   │                    │  INSERT queued   │              │                │
   │                   │                    ├─────────────────────────────────>│                │
   │                   │                    │                  │              │                │
   │  { taskId: ... }  │                    │                  │              │                │
   │<──────────────────┤                    │                  │              │                │
   │                   │                    │                  │  Poll queue  │                │
   │                   │                    │                  ├─────────────>│                │
   │                   │                    │                  │  Claim task  │                │
   │                   │                    │                  │<─────────────┤                │
   │                   │                    │                  │              │                │
   │                   │                    │                  │  Execute read_email(123)      │
   │                   │                    │                  ├──────────────────────────────>│
   │                   │                    │                  │              │     Email data │
   │                   │                    │                  │<──────────────────────────────┤
   │                   │                    │                  │              │                │
   │                   │                    │                  │  UPDATE completed             │
   │                   │                    │                  ├─────────────>│                │
   │                   │                    │                  │              │                │
   │  GET /tasks/...   │                    │                  │              │                │
   ├──────────────────>│                    │                  │              │                │
   │                   │  getTaskStatus()   │                  │              │                │
   │                   ├───────────────────>│                  │              │                │
   │                   │                    │  SELECT task     │              │                │
   │                   │                    ├─────────────────────────────────>│                │
   │                   │                    │                  │  Task + result                │
   │                   │                    │<─────────────────────────────────┤                │
   │  { status: completed, result: {...} }  │                  │              │                │
   │<──────────────────┴────────────────────┘                  │              │                │
```

### Sequence Diagram: REQUIRE_APPROVAL Flow

```
AI Agent      MCP Server    PolicyEngine   Database    User (UI)    Worker
   │              │               │            │            │           │
   │ send_email() │               │            │            │           │
   ├─────────────>│               │            │            │           │
   │              │  evaluate()   │            │            │           │
   │              ├──────────────>│            │            │           │
   │              │               │  REQUIRE_APPROVAL       │           │
   │              │<──────────────┤            │            │           │
   │              │               │            │            │           │
   │              │  INSERT pending_approval   │            │           │
   │              ├───────────────────────────>│            │           │
   │  { taskId }  │               │            │            │           │
   │<─────────────┤               │            │            │           │
   │              │               │            │            │           │
   │              │               │            │  View pending requests │
   │              │               │            │<───────────┤           │
   │              │               │            │            │           │
   │              │               │            │  Approve   │           │
   │              │               │            │───────────>│           │
   │              │               │  UPDATE status='queued' │           │
   │              │               │            │<───────────┤           │
   │              │               │            │            │           │
   │              │               │            │  Poll queue            │
   │              │               │            │<───────────────────────┤
   │              │               │            │  Claim task            │
   │              │               │            ├───────────────────────>│
   │              │               │            │            │  Execute  │
   │              │               │            │            │  send_email
   │  Poll result │               │            │            │           │
   ├─────────────>│               │  SELECT    │            │           │
   │              ├───────────────────────────>│            │           │
   │  { completed }                │            │            │           │
   │<─────────────┤               │            │            │           │
```

---

## Implementation Checklist

- [ ] Database migration: Add `task_queue` table with indices
- [ ] Create `SessionTaskManager` class
- [ ] Create `SessionWorkerPool` class
- [ ] Create `Worker` class with abort support
- [ ] Integrate with `PolicyEngine` for REQUIRE_APPROVAL
- [ ] Implement MCP Tasks capability detection
- [ ] Add `enqueueAndWait()` for non-MCP-Tasks clients
- [ ] Create REST API endpoints for cancellation
- [ ] Build UI for task monitoring and cancellation
- [ ] Implement 30-day cleanup job
- [ ] Add configuration constants
- [ ] Update audit logging to track task lifecycle
- [ ] Add AbortController support to all providers (Gmail, Outlook)
- [ ] Write unit tests for task queue operations
- [ ] Write integration tests for cancellation
- [ ] Document API in OpenAPI spec
- [ ] Update user documentation

---

## References

- [MCP Tasks Specification](https://modelcontextprotocol.io/docs/concepts/tasks)
- [AbortController API](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)
- [SQLite Transaction Isolation](https://www.sqlite.org/isolation.html)
- [CoreLink Policy Engine](./POLICY_ARCHITECTURE.md)
- [CoreLink Multi-Account Architecture](./ARCHITECTURE.md#multi-account-architecture)

---

**Last Updated**: 2026-02-28
**Next Review**: 2026-03-28
**Maintained by**: CoreLink Team
