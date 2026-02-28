# Task-Based Execution System (HIGH PRIORITY)

**Goal**: Implement persistent task queue with session-based worker pools to support REQUIRE_APPROVAL, cancellation, and resource fairness.

**Motivation**:
- **REQUIRED for REQUIRE_APPROVAL policy** - Cannot keep HTTP connections open for hours waiting for user approval
- **Runaway agent protection** - User can cancel 5,000 queued requests from UI
- **Resource fairness** - Prevent one AI agent from monopolizing all workers

**Architecture**: See **[Task Queue Architecture](./TASK_QUEUE_ARCHITECTURE.md)** for complete specification.

---

#### 11.1: Database Schema & Migrations

**Goal**: Add `task_queue` table with indices for performance

**Tasks**:

1. **Create task_queue table schema**
   - Add to `packages/gateway/src/db/schema.ts`
   - Fields: id, session_id, tool_name, args, status, priority, worker_id, attempts, max_attempts
   - Timestamps: created_at, started_at, completed_at, timeout_at
   - Results: result, error, policy_decision, approval_request_id, redacted_fields

2. **Add database indices**
   ```sql
   CREATE INDEX idx_session_status ON task_queue(session_id, status);
   CREATE INDEX idx_status_priority ON task_queue(status, priority DESC, created_at ASC);
   CREATE INDEX idx_worker ON task_queue(worker_id);
   CREATE INDEX idx_cleanup ON task_queue(completed_at, status);
   ```

3. **Create migration**
   - Generate Drizzle migration: `npx drizzle-kit generate:sqlite`
   - Test migration on development database
   - Document rollback strategy

4. **Add configuration constants**
   - Create `packages/gateway/src/config/task-queue.ts`
   - Constants: WORKERS_PER_SESSION (3), TASK_RETENTION_DAYS (30), TASK_TIMEOUT_MS (300000), WORKER_POLL_INTERVAL_MS (1000), MAX_TASK_ATTEMPTS (3)

**Files to create**:
- Update `packages/gateway/src/db/schema.ts`
- `packages/gateway/src/config/task-queue.ts`
- Migration file in `packages/gateway/src/db/migrations/`

**Estimated time**: 0.5 days

---

#### 11.2: Core Task Queue Implementation

**Goal**: Build SessionTaskManager, SessionWorkerPool, and Worker classes

**Tasks**:

1. **Create Worker class**
   - Polling loop (claim task → execute → repeat)
   - Atomic task claiming (database transaction with row lock)
   - AbortController support for cancellation
   - Error handling with retry logic (transient vs permanent errors)
   - Exponential backoff for retries

2. **Create SessionWorkerPool class**
   - Spawn N workers (WORKERS_PER_SESSION = 3)
   - Track worker states
   - Coordinate cancellation across workers
   - Graceful shutdown (abort in-flight tasks)

3. **Create SessionTaskManager class**
   - Manage session pools (create/destroy)
   - Enqueue tasks (with policy evaluation)
   - Query task status
   - Cancel tasks (single and bulk)
   - Session lifecycle integration

4. **Integrate with PolicyEngine**
   - ALLOW → status='queued'
   - BLOCK → status='failed' (immediate)
   - REQUIRE_APPROVAL → status='pending_approval'
   - REDACT → execute with redacted args

5. **Add approval workflow**
   - When user approves: UPDATE status='queued' (workers pick up automatically)
   - When user denies: UPDATE status='cancelled'
   - Support arg modification on approval

**Files to create**:
- `packages/gateway/src/services/task-queue/SessionTaskManager.ts`
- `packages/gateway/src/services/task-queue/SessionWorkerPool.ts`
- `packages/gateway/src/services/task-queue/Worker.ts`
- `packages/gateway/src/services/task-queue/types.ts`

**Files to modify**:
- `packages/gateway/src/services/policy-engine.ts` (integration)
- `packages/gateway/src/routes/approval.ts` (add approve/deny endpoints)

**Estimated time**: 2-3 days

---

#### 11.3: MCP Integration (Hybrid Strategy)

**Goal**: Support both MCP Tasks (async) and non-MCP-Tasks (sync) clients

**Tasks**:

1. **Detect client capabilities**
   - Check `context.capabilities?.tasks === true` in MCP handler
   - Route to async or sync execution path

2. **Implement async execution (MCP Tasks supported)**
   - Return task ID immediately
   - Client polls via GET `/mcp/tasks/{taskId}`
   - Return task status + result when completed

3. **Implement sync execution (MCP Tasks NOT supported)**
   - Enqueue task (still goes through queue!)
   - Call `taskManager.enqueueAndWait(taskId, timeout)`
   - Poll database until completed/failed/cancelled
   - Return result when ready (HTTP connection stays open)
   - User can still cancel from UI (aborts worker, returns error)

4. **Add polling endpoint**
   - GET `/mcp/tasks/{taskId}` → { status, result, error }
   - Support filtering by session_id for bulk queries

5. **Update MCP tool handlers**
   - Replace direct execution with task enqueuing
   - Pass abort signal through to providers

**Files to create**:
- `packages/gateway/src/mcp/task-handler.ts`
- `packages/gateway/src/routes/tasks.ts`

**Files to modify**:
- `packages/gateway/src/index.ts` (MCP server setup)
- All tool handlers in MCP server (list_emails, read_email, etc.)

**Estimated time**: 1-2 days

---

#### 11.4: Provider AbortController Integration

**Goal**: Propagate cancellation to Gmail/Outlook API calls

**Tasks**:

1. **Update IEmailProvider interface**
   - Add optional `signal?: AbortSignal` parameter to all methods
   - `listEmails(account, args, options?: { signal?: AbortSignal })`
   - `readEmail(account, emailId, options?: { signal?: AbortSignal })`
   - `sendEmail(account, args, options?: { signal?: AbortSignal })`
   - `searchEmails(account, args, options?: { signal?: AbortSignal })`

2. **Update GmailProvider**
   - Pass abort signal to googleapis calls
   - Handle AbortError (don't retry)
   - Test cancellation works (abort mid-request)

3. **Update OutlookProvider**
   - Pass abort signal to Graph API calls
   - Handle AbortError

4. **Update UniversalEmailRouter**
   - Accept abort signal in all methods
   - Propagate to provider calls

**Files to modify**:
- `packages/gateway/src/services/email/IEmailProvider.ts`
- `packages/gateway/src/services/email/providers/GmailProvider.ts`
- `packages/gateway/src/services/email/providers/OutlookProvider.ts`
- `packages/gateway/src/services/email/UniversalEmailRouter.ts`

**Estimated time**: 1 day

---

#### 11.5: Task Monitoring & Cancellation UI

**Goal**: Build web UI for viewing and cancelling tasks

**Tasks**:

1. **Create Task Monitor page** (`/tasks`)
   - Real-time task list (SSE or polling)
   - Group by session
   - Show status: queued (count), running (count), pending approval (count), completed (count)
   - Filter by status, session, date range

2. **Add cancellation controls**
   - "Cancel All" button per session
   - "Cancel" button per individual task
   - Confirmation dialog ("Cancel 4,990 queued tasks?")
   - Show cancellation success feedback

3. **Task detail view**
   - Click task to see full details
   - Show: tool_name, args, result/error, timestamps
   - Show worker_id (which worker is executing)
   - Show policy decision

4. **Add to navigation**
   - Add "Tasks" link to main navigation
   - Badge showing pending approval count

5. **Real-time updates**
   - SSE endpoint: GET `/api/tasks/stream?session_id={id}`
   - Update UI when tasks complete/fail
   - Show progress (e.g., "Processing 3/100 tasks")

**Files to create**:
- `packages/web/src/pages/Tasks.tsx`
- `packages/web/src/components/TaskList.tsx`
- `packages/web/src/components/TaskDetail.tsx`
- `packages/gateway/src/routes/tasks.ts` (REST API + SSE)

**Files to modify**:
- `packages/web/src/App.tsx` (add route)

**Estimated time**: 2 days

---

#### 11.6: Task Retention & Cleanup

**Goal**: Auto-delete old tasks to prevent database bloat

**Tasks**:

1. **Create cleanup job**
   - Delete completed/failed tasks older than 30 days
   - Preserve pending_approval tasks (completed_at IS NULL)
   - Run daily via scheduled job

2. **Add job scheduler**
   - Use `node-cron` or similar
   - Schedule: `0 3 * * *` (3 AM daily)
   - Log cleanup stats (X tasks deleted)

3. **Add manual cleanup endpoint**
   - POST `/api/tasks/cleanup` (admin only)
   - Support dry-run mode (return count without deleting)
   - Support custom retention period

4. **Add cleanup configuration**
   - Environment variable: TASK_RETENTION_DAYS (default: 30)
   - UI setting: "Task retention period"

**Files to create**:
- `packages/gateway/src/services/task-cleanup.ts`
- `packages/gateway/src/jobs/index.ts` (job scheduler)

**Files to modify**:
- `packages/gateway/src/index.ts` (start cleanup job)
- `packages/gateway/src/routes/tasks.ts` (add cleanup endpoint)

**Estimated time**: 0.5 days

---

#### 11.7: Testing & Documentation

**Goal**: Ensure task queue works reliably

**Tasks**:

1. **Unit tests**
   - SessionTaskManager: enqueue, cancel, status queries
   - Worker: claim, execute, retry logic
   - SessionWorkerPool: worker lifecycle, cancellation

2. **Integration tests**
   - Full workflow: enqueue → execute → complete
   - REQUIRE_APPROVAL flow: enqueue → pending → approve → execute
   - Cancellation: cancel queued, cancel running
   - Session isolation: multiple sessions run independently
   - Retry logic: transient errors trigger retry

3. **Load tests**
   - 1000 tasks enqueued simultaneously
   - 10 concurrent sessions
   - Measure: task latency, database performance

4. **Update documentation**
   - Add to main README: "Task Queue" section
   - Update ARCHITECTURE.md (already done)
   - Add API documentation (OpenAPI spec)
   - Add developer guide: "How task queue works"

**Files to create**:
- `packages/gateway/tests/task-queue.test.ts`
- `packages/gateway/tests/integration/task-workflow.test.ts`

**Estimated time**: 1-2 days

---

**Phase 11 Summary**:

**Total Estimated Time: 8-11 days**

**What This Achieves**:
1. ✅ REQUIRE_APPROVAL policy works (tasks wait for user approval)
2. ✅ User can cancel runaway agents from UI
3. ✅ Fair resource allocation across multiple AI agents
4. ✅ Complete audit trail of all task executions
5. ✅ Supports both MCP Tasks (async) and non-MCP (sync) clients
6. ✅ Graceful error handling with retries
7. ✅ Database stays clean (30-day retention)

**Success Criteria**:
- ✅ AI agent sends 5,000 requests, user cancels all from UI successfully
- ✅ Policy requiring approval works: task waits, user approves, task executes
- ✅ Multiple AI agents run concurrently without starvation
- ✅ Cancelled in-flight tasks abort immediately (AbortController works)
- ✅ Task queue survives server restart (persistent)
- ✅ UI shows real-time task status
- ✅ Database cleanup runs daily without issues

**Priority Justification**: This is **CRITICAL for V1** because:
- REQUIRE_APPROVAL policy (Phase 4) cannot work without task queue
- User safety feature (cancel runaway agents) is essential
- Multi-agent support requires fairness (session isolation)
- Foundation for approval workflow UI
- Enables async operations for long-running tools (future: large email searches, bulk operations)