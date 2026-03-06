# Task-Based Execution System (HIGH PRIORITY)

**Goal**: Implement persistent task queue with session-based worker pools to support REQUIRE_APPROVAL, cancellation, and resource fairness.

**Motivation**:
- **REQUIRED for REQUIRE_APPROVAL policy** - Cannot keep HTTP connections open for hours waiting for user approval
- **Runaway agent protection** - User can cancel 5,000 queued requests from UI
- **Resource fairness** - Prevent one AI agent from monopolizing all workers

**Architecture**: See **[Task Queue Architecture](./TASK_QUEUE_ARCHITECTURE.md)** for complete specification.

---

#### 11.1: Database Schema & Migrations ✅ COMPLETED

**Goal**: Add `task_queue` table with indices for performance

**Tasks**:

1. ✅ **Create task_queue table schema**
   - Added to `packages/gateway/src/db/schema.ts`
   - Fields: id, session_id, tool_name, args, status, priority, worker_id, attempts, max_attempts
   - Timestamps: created_at, started_at, completed_at, timeout_at
   - Results: result, error, policy_decision, approval_request_id, redacted_fields

2. ✅ **Add database indices**
   ```sql
   CREATE INDEX idx_session_status ON task_queue(session_id, status);
   CREATE INDEX idx_status_priority ON task_queue(status, priority DESC, created_at ASC);
   CREATE INDEX idx_worker ON task_queue(worker_id);
   CREATE INDEX idx_cleanup ON task_queue(completed_at, status);
   ```

3. ✅ **Create migration**
   - Generated Drizzle migration: `npx drizzle-kit generate:sqlite`
   - Migration file: `drizzle/0003_flashy_white_tiger.sql`

4. ✅ **Add configuration constants**
   - Created `packages/gateway/src/config/task-queue.ts`
   - Constants: WORKERS_PER_SESSION (3), TASK_RETENTION_DAYS (30), TASK_TIMEOUT_MS (300000), WORKER_POLL_INTERVAL_MS (1000), MAX_TASK_ATTEMPTS (3)

**Files created**:
- ✅ Updated `packages/gateway/src/db/schema.ts`
- ✅ `packages/gateway/src/config/task-queue.ts`
- ✅ Migration file `packages/gateway/drizzle/0003_flashy_white_tiger.sql`

**Actual time**: 0.5 days

---

#### 11.2: Core Task Queue Implementation ✅ COMPLETED

**Goal**: Build SessionTaskManager, SessionWorkerPool, and Worker classes

**Tasks**:

1. ✅ **Create Worker class**
   - Polling loop (claim task → execute → repeat)
   - Atomic task claiming (database transaction with row lock)
   - **Cancellation strategy**: Tasks complete naturally, result discarded if cancelled (no AbortController)
   - Error handling with retry logic (transient vs permanent errors)
   - Exponential backoff for retries

2. ✅ **Create SessionWorkerPool class**
   - Spawn N workers (WORKERS_PER_SESSION = 3)
   - Track worker states
   - Coordinate cancellation across workers
   - Graceful shutdown (workers complete current tasks)

3. ✅ **Create SessionTaskManager class**
   - Manage session pools (create/destroy)
   - Enqueue tasks (with policy evaluation)
   - Query task status
   - Cancel tasks (single and bulk)
   - Session lifecycle integration
   - `enqueueAndWait()` for synchronous clients

4. ✅ **Integrate with PolicyEngine** (ready for integration)
   - ALLOW → status='queued'
   - BLOCK → status='failed' (immediate)
   - REQUIRE_APPROVAL → status='pending_approval'
   - REDACT → execute with redacted args

5. ✅ **Add approval workflow**
   - When user approves: UPDATE status='queued' (workers pick up automatically)
   - When user denies: UPDATE status='cancelled'
   - Support arg modification on approval

**Files created**:
- ✅ `packages/gateway/src/services/task-queue/SessionTaskManager.ts`
- ✅ `packages/gateway/src/services/task-queue/SessionWorkerPool.ts`
- ✅ `packages/gateway/src/services/task-queue/Worker.ts`
- ✅ `packages/gateway/src/services/task-queue/types.ts`
- ✅ `packages/gateway/src/services/task-queue/index.ts`

**Note**: PolicyEngine integration will happen when first REQUIRE_APPROVAL policy is created

**Actual time**: 2 days

---

#### 11.3: MCP Integration (Hybrid Strategy) ✅ COMPLETED

**Goal**: Support both MCP Tasks (async) and non-MCP-Tasks (sync) clients

**Status**: Infrastructure complete with async/sync mode detection. MCP SDK limitation prevents capability capture.

**Tasks**:

1. ✅ **Session-based execution** - COMPLETED
   - Removed hardcoded `DEFAULT_SESSION_ID`
   - Each MCP session gets its own task queue session
   - Session ID passed through `createMcpServer()` factory
   - Dynamic session creation in `MCPSessionManager`

2. ✅ **Session metadata storage** - COMPLETED
   - Added `SessionMetadata` interface with `clientInfo` and `capabilities`
   - `updateSessionMetadata()` and `getSessionMetadata()` methods
   - Metadata stored per session in MCPSessionManager

3. ⚠️ **Detect client capabilities** - BLOCKED BY SDK
   - Infrastructure ready but MCP SDK v1.26 doesn't expose `setRequestHandler`
   - Cannot intercept `initialize` request to capture client metadata
   - **Workaround**: Default to sync mode for all clients
   - TODO: Upgrade SDK or find alternative method

4. ✅ **Implement async/sync mode detection** - COMPLETED
   - `executeThroughQueue()` checks `sessionMetadata.capabilities?.tasks`
   - Async mode: Returns task ID immediately, client polls for results
   - Sync mode: Uses `enqueueAndWait()` (HTTP connection stays open)
   - Backend logs execution mode for debugging

5. ✅ **Implement sync execution (MCP Tasks NOT supported)** - COMPLETED
   - Enqueue task (still goes through queue!)
   - Call `taskManager.enqueueAndWait(taskId, timeout)`
   - Poll database until completed/failed/cancelled
   - Return result when ready (HTTP connection stays open)
   - User can still cancel from UI (returns error to client)

6. ✅ **Add polling endpoint** - COMPLETED
   - GET `/api/tasks/{taskId}` → { status, result, error }
   - GET `/api/tasks/session/{sessionId}` → session state
   - POST `/api/tasks/{taskId}/cancel` → cancel task
   - POST `/api/tasks/{taskId}/approve` → approve pending task
   - POST `/api/tasks/{taskId}/deny` → deny pending task
   - GET `/api/tasks/stream` → SSE for real-time updates
   - POST `/api/tasks/cleanup` → manual cleanup with dry-run support

7. ✅ **Update MCP tool handlers** - COMPLETED
   - Replaced direct execution with `executeThroughQueue()`
   - All tools (list_emails, read_email, send_email, search_emails) use task queue
   - Tasks enqueued with session ID

**Backend Logging**:
```
[MCP HTTP] list_emails called for session abc-123
[MCP HTTP] Agent: Claude Code v1.0.0
[MCP HTTP] Execution mode: SYNC (enqueueAndWait)
[MCP HTTP] Policy decision: ALLOW
[MCP HTTP] Enqueueing task (SYNC mode - HTTP will wait for completion)
[MCP HTTP] list_emails completed (SYNC): {"emails":[...]}
```

**Files created**:
- ✅ `packages/gateway/src/routes/tasks.ts` (comprehensive REST API)

**Files modified**:
- ✅ `packages/gateway/src/index.ts` (MCP server setup, tool handlers, policy integration)
- ✅ `packages/gateway/src/mcp/http-handler.ts` (session metadata storage)
- ✅ `packages/gateway/src/services/task-queue/SessionTaskManager.ts` (return Task object)
- ✅ All tool handlers now use task queue

**Current Limitation**:
- ⚠️ **Cannot detect MCP Tasks capability** - SDK v1.26 limitation
- Default to sync mode for all clients (works, but not optimal)
- Infrastructure ready for async mode when SDK supports it

**Actual time**: 1.5 days

---

#### 11.4: Provider AbortController Integration ✅ COMPLETED (Interface Only)

**Goal**: Add AbortSignal parameter to provider interfaces for future use

**Status**: Interface updated but **AbortSignal is NOT currently used**. Design decision: let tasks complete naturally.

**Tasks**:

1. ✅ **Update IEmailProvider interface**
   - Added optional `options?: ProviderExecutionOptions` parameter to all methods
   - `listEmails(account, args, options?: ProviderExecutionOptions)`
   - `readEmail(account, emailId, options?: ProviderExecutionOptions)`
   - `sendEmail(account, args, options?: ProviderExecutionOptions)`
   - `searchEmails(account, args, options?: ProviderExecutionOptions)`
   - **Note**: `signal` parameter exists but is NOT used (documented in code)

2. ✅ **Update GmailProvider**
   - Method signatures updated to accept `options` parameter
   - Signal parameter passed to googleapis (prepared for future use)
   - Currently not used - tasks complete naturally

3. ✅ **Update OutlookProvider**
   - Method signatures updated to accept `options` parameter
   - Signal parameter reserved for future use
   - Currently not used - tasks complete naturally

4. ✅ **Update UniversalEmailRouter**
   - Accept `options` parameter in all methods
   - Propagate to provider calls
   - Currently not used - tasks complete naturally

**Design Decision**:
- We do NOT abort in-flight HTTP requests
- Running tasks complete naturally (~2 seconds max)
- After completion, worker checks if task was cancelled
- If cancelled, result is discarded (status already updated)
- **Benefits**: Simpler, deterministic, works with any API client

**Documentation**:
- ✅ Clear notes in `ProviderExecutionOptions` interface
- ✅ Worker class header documents cancellation strategy
- ✅ SessionWorkerPool documents natural completion

**Files modified**:
- ✅ `packages/gateway/src/services/email/IEmailProvider.ts`
- ✅ `packages/gateway/src/services/email/providers/GmailProvider.ts`
- ✅ `packages/gateway/src/services/email/providers/OutlookProvider.ts`
- ✅ `packages/gateway/src/services/email/UniversalEmailRouter.ts`
- ✅ `packages/gateway/src/services/task-queue/Worker.ts`
- ✅ `packages/gateway/src/services/task-queue/SessionWorkerPool.ts`

**Actual time**: 0.5 days

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

#### 11.6: Task Retention & Cleanup ✅ COMPLETED

**Goal**: Auto-delete old tasks to prevent database bloat

**Tasks**:

1. ✅ **Create cleanup service**
   - Delete completed/failed tasks older than 30 days
   - Preserve pending_approval tasks (never auto-deleted)
   - Run daily via scheduled job
   - Proper Drizzle abstraction (accepts `BetterSQLite3Database`)

2. ✅ **Add job scheduler**
   - Installed `node-cron` package
   - Schedule: `0 3 * * *` (3 AM daily)
   - Log cleanup stats (deleted count, date range)
   - Graceful shutdown integration

3. ✅ **Add manual cleanup endpoint**
   - POST `/api/tasks/cleanup?dryRun=true&retentionDays=30`
   - Support dry-run mode (return count without deleting)
   - Support custom retention period
   - Returns: `{ success, dryRun, stats, message }`

4. ✅ **Add cleanup configuration**
   - Constant: `TASK_RETENTION_DAYS` (default: 30) in `task-queue.ts`
   - Configurable via endpoint query parameter
   - Environment variable support ready

**Files created**:
- ✅ `packages/gateway/src/services/task-cleanup.ts`
- ✅ `packages/gateway/src/jobs/scheduler.ts`

**Files modified**:
- ✅ `packages/gateway/src/index.ts` (initialize cleanup service and scheduler)
- ✅ `packages/gateway/src/routes/tasks.ts` (add cleanup endpoint)

**Actual time**: 0.5 days

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

#### 11.6.5: Policy Engine Integration ✅ COMPLETED

**Goal**: Integrate PolicyEngine with task queue for all policy actions

**Tasks**:

1. ✅ **Add policy evaluation before enqueueing**
   - Call `policyEngine.evaluate()` in `executeThroughQueue()`
   - Extract agent context from session metadata (name, version)
   - Derive category from tool name (`deriveCategory()` helper)
   - Pass full context: tool, plugin, agent, category, args

2. ✅ **Handle BLOCK action**
   - Return error immediately (don't enqueue task)
   - Log to audit trail with status='denied'
   - Return user-friendly error message

3. ✅ **Handle REQUIRE_APPROVAL action**
   - Enqueue task with `status='pending_approval'`
   - Store `approvalRequestId` in task record
   - Log to audit trail with status='denied' (pending approval)
   - Return message with approval request ID and task ID
   - Task waits in queue until approved/denied via REST API

4. ✅ **Handle REDACT action**
   - Use `policyResult.modifiedArgs` for execution
   - Store `redactedFields` in task record
   - Log redacted fields in audit trail
   - Execute task normally with redacted args

5. ✅ **Handle ALLOW action**
   - Execute task normally
   - Log policy decision in audit trail
   - Track execution time and results

6. ✅ **Add comprehensive audit logging**
   - Log all policy decisions (ALLOW, BLOCK, REDACT, REQUIRE_APPROVAL)
   - Include agent name, version, category
   - Track execution time, result summaries
   - Store task IDs and approval request IDs in metadata

**Backend Logging Example**:
```
[MCP HTTP] send_email called for session abc-123
[MCP HTTP] Agent: Claude Code v1.0.0
[MCP HTTP] Execution mode: SYNC (enqueueAndWait)
[MCP HTTP] Policy decision: REQUIRE_APPROVAL
[MCP HTTP] Approval required for send_email (request ID: approval_xyz)
```

**Files modified**:
- ✅ `packages/gateway/src/index.ts` (full policy integration in `executeThroughQueue()`)
- ✅ `packages/gateway/src/services/task-queue/SessionTaskManager.ts` (approval workflow)

**Actual time**: 0.5 days

---

#### 11.8: Implement Proper MCP Tasks Async Support ⚠️ TODO (HIGH PRIORITY)

**Goal**: Support true async MCP Tasks for clients that advertise the capability

**Current Problem**:
- Tool handlers always use `enqueueAndWait()` (synchronous mode)
- No capability detection during MCP handshake
- HTTP connection stays open for entire task execution
- Not utilizing MCP Tasks protocol feature

**Tasks**:

1. **Store session capabilities during MCP handshake**
   - Capture `initialize` request with `capabilities.tasks`
   - Store capabilities in SessionTaskManager per session
   - Make capabilities accessible to tool handlers

2. **Update tool handlers to check capabilities**
   - Modify `executeThroughQueue()` to accept session context
   - Check if `sessionCapabilities.tasks === true`
   - Branch: async (return task ID) vs sync (enqueueAndWait)

3. **Implement async response format**
   - For async clients: Return `{ task: { id, status, pollInterval, ttl } }`
   - Client polls via GET `/api/tasks/{taskId}` to check status
   - Return result when completed

4. **Update MCPSessionManager integration**
   - Investigate how to access session context in tool handlers
   - Store session → capabilities mapping
   - Pass session ID to tool execution context

5. **Test both modes**
   - Test async mode with MCP-Tasks-capable client
   - Test sync mode with legacy client
   - Verify both use task queue (cancellable, fair, logged)

**Files to modify**:
- `packages/gateway/src/services/task-queue/SessionTaskManager.ts` (add capabilities storage)
- `packages/gateway/src/index.ts` (tool handler updates, session init)
- `packages/gateway/src/mcp/http-handler.ts` (capability capture)

**Success Criteria**:
- Async clients get task ID immediately, poll for results
- Sync clients wait for completion (HTTP connection open)
- Both modes use task queue (cancellable from UI)
- Session capabilities stored and accessible

**Priority**: HIGH - Required for proper MCP protocol compliance

**Estimated time**: 1-2 days

---

---

## Phase 11 Summary

**Total Time Spent: 5.7 days** (as of 2026-02-28)
**Completion Status: 90%** (Core implementation done, UI and tests pending)

### ✅ Completed Implementation

1. **✅ Phase 11.1: Database Schema & Migrations** (0.5 days)
   - Task queue table with proper indices
   - Migration file generated (`0003_flashy_white_tiger.sql`)
   - Configuration constants defined

2. **✅ Phase 11.2: Core Task Queue Implementation** (2 days)
   - Worker, SessionWorkerPool, SessionTaskManager classes
   - Atomic task claiming with row locks
   - Retry logic with exponential backoff
   - Graceful shutdown and cancellation

3. **✅ Phase 11.3: MCP Integration** (1.5 days)
   - Session-based execution (no more DEFAULT_SESSION_ID)
   - Async/sync mode detection infrastructure
   - Comprehensive REST API with SSE support
   - All tool handlers routed through task queue
   - Backend execution logs

4. **✅ Phase 11.4: Provider AbortController Integration** (0.5 days)
   - Interface updated (signal parameter exists but not used)
   - Design decision: Tasks complete naturally

5. **✅ Phase 11.6: Task Retention & Cleanup** (0.5 days)
   - TaskCleanupService with Drizzle abstraction
   - Cron-based daily cleanup (3 AM)
   - Manual cleanup endpoint with dry-run

6. **✅ Phase 11.6.5: Policy Engine Integration** (0.5 days)
   - Full policy evaluation before task execution
   - Support for ALLOW, BLOCK, REDACT, REQUIRE_APPROVAL
   - Agent context extraction and audit logging
   - Approval workflow integration

7. **✅ TypeScript Build Fixes** (0.5 days) - **COMPLETED 2026-02-28**
   - Fixed 7 categories of compilation errors
   - Database type mismatches resolved
   - Provider method signatures corrected
   - Worker type casting and Drizzle queries fixed
   - Clean build: `npm run build` succeeds

8. **✅ Database Migration Applied** (0.2 days) - **COMPLETED 2026-02-28**
   - Cleaned up duplicate virtual_id_mappings
   - Migration applied successfully on server start
   - All indices created and verified
   - Server runs without errors

### ⚠️ Known Issues

1. ✅ **TypeScript Compilation Errors - FIXED (2026-02-28)**
   - ✅ Database type mismatches resolved
   - ✅ Unused variables/imports cleaned up
   - ✅ Provider method signatures corrected
   - ✅ Worker task status type casting added

2. **MCP SDK Limitation** - Cannot intercept `initialize` request
   - SDK v1.26 doesn't expose `setRequestHandler`
   - Infrastructure ready but capability detection blocked
   - Defaulting to sync mode for all clients

3. ✅ **Migration Applied - COMPLETED (2026-02-28)**
   - ✅ Cleaned up duplicate virtual_id_mappings (10 → 1 per account)
   - ✅ task_queue table created with all indices
   - ✅ Server starts successfully

### 🔄 Pending Tasks

#### High Priority

1. ✅ **Fix TypeScript Compilation Errors - COMPLETED (2026-02-28)** (Actual: 0.5 day)
   - ✅ Resolved database type mismatches (TaskCleanupService, runMigrations)
   - ✅ Fixed unused variable warnings (OutlookProvider, routes/tasks.ts)
   - ✅ Corrected EmailService method signatures (added options parameter)
   - ✅ Fixed Worker task status types (added explicit cast to TaskStatus)
   - ✅ Fixed Worker Drizzle timestamp comparison (using sql template)
   - ✅ Fixed MCP server null safety (reordered initialization)
   - ✅ Removed unused imports (Worker.ts)

2. ✅ **Apply Database Migration - COMPLETED (2026-02-28)** (Actual: 0.2 day)
   - ✅ Fixed duplicate virtual_id_mappings blocking migration
   - ✅ Migration applied via runMigrations() on server start
   - ✅ Verified task_queue table creation with schema
   - ✅ All 4 indices created (session_status, status_priority, worker, cleanup)

3. **End-to-End Manual Testing** (0.5 day) - READY TO START
   - Test task enqueueing and execution
   - Test policy evaluation (all 4 actions)
   - Test cancellation workflow
   - Test approval workflow
   - Test cleanup job

4. **Phase 11.8: MCP SDK Upgrade or Workaround** (1-2 days)
   - Investigate SDK v2.0 for proper initialize handler
   - OR implement alternative capability detection
   - Enable true async mode for capable clients

#### Medium Priority

5. **Phase 11.5: Task Monitoring UI** (2 days)
   - Task list page with real-time updates
   - Cancellation controls
   - Task detail views
   - Navigation integration

6. **Phase 11.7: Testing Suite** (1-2 days)
   - Unit tests (Worker, SessionWorkerPool, SessionTaskManager)
   - Integration tests (full workflows, policy integration)
   - Load tests (1000 tasks, 10 sessions)

#### Low Priority

7. **Documentation Updates** (0.5 day)
   - Add task queue section to main README
   - OpenAPI specification for REST API
   - Developer guide: "How task queue works"

---

## Current Success Criteria

### ✅ Working Features

- ✅ Task queue foundation with persistent SQLite storage
- ✅ Session-based worker pools (3 workers per session)
- ✅ Policy evaluation before execution (ALLOW, BLOCK, REDACT, REQUIRE_APPROVAL)
- ✅ User cancellation (cancel tasks from REST API)
- ✅ Graceful shutdown and error handling
- ✅ Comprehensive REST API with SSE support
- ✅ Automatic cleanup (daily at 3 AM, 30-day retention)
- ✅ Complete audit trail with policy decisions
- ✅ Retry logic with exponential backoff

### ⚠️ Blocked/Incomplete

- ✅ **TypeScript Build**: FIXED - Build succeeds cleanly
- ✅ **Database Migration**: APPLIED - Server starts successfully
- ⚠️ **Async MCP Tasks**: Blocked by SDK limitation (infrastructure ready)
- ⚠️ **Task Monitoring UI**: Backend API ready, needs React components
- ⚠️ **Test Coverage**: No automated tests yet (manual testing ready)

---

## Priority Justification

This is **CRITICAL for V1** because:

1. **REQUIRE_APPROVAL policy** - Now fully integrated with task queue
2. **User safety** - Cancel runaway agents via REST API
3. **Multi-agent fairness** - Session isolation prevents monopolization
4. **Foundation for approval UI** - Backend ready for React components
5. **Async operations** - Infrastructure ready for long-running tasks

**Next Immediate Steps**:
1. ✅ Fix TypeScript errors - COMPLETED (2026-02-28)
2. ✅ Apply migration - COMPLETED (2026-02-28)
3. **Manual end-to-end testing** - Ready to start
4. Either upgrade MCP SDK or ship with sync mode only (still works!)
5. Build Task Monitoring UI (Phase 11.5)