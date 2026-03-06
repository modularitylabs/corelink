/**
 * SessionTaskManager - Main orchestrator for task queue system
 *
 * Responsibilities:
 * - Create/destroy session worker pools
 * - Enqueue tasks (with policy evaluation)
 * - Cancel tasks (single or bulk)
 * - Query task status
 * - Handle approval workflow
 */

import type { Database } from 'better-sqlite3';
import { nanoid } from 'nanoid';
import { eq, and, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { taskQueue } from '../../db/schema.js';
import { TASK_TIMEOUT_MS, TaskStatus } from '../../config/task-queue.js';
import { SessionWorkerPool } from './SessionWorkerPool.js';
import type {
  CreateTaskParams,
  TaskResult,
  ToolExecutor,
  Task,
  SessionPoolState,
} from './types.js';

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * SessionTaskManager class
 */
export class SessionTaskManager {
  private db: ReturnType<typeof drizzle>;
  private sqliteDb: Database;
  private toolExecutor: ToolExecutor;
  private sessionPools: Map<string, SessionWorkerPool> = new Map();

  constructor(sqliteDb: Database, toolExecutor: ToolExecutor) {
    this.sqliteDb = sqliteDb;
    this.db = drizzle(sqliteDb);
    this.toolExecutor = toolExecutor;

    console.log('[SessionTaskManager] Initialized');
  }

  /**
   * Create session worker pool
   */
  async createSession(sessionId: string): Promise<void> {
    if (this.sessionPools.has(sessionId)) {
      console.warn(`[SessionTaskManager] Session ${sessionId} already exists`);
      return;
    }

    console.log(`[SessionTaskManager] Creating session ${sessionId}`);

    const pool = new SessionWorkerPool(
      sessionId,
      this.sqliteDb,
      this.toolExecutor
    );

    this.sessionPools.set(sessionId, pool);

    // Start workers
    await pool.start();
  }

  /**
   * Destroy session worker pool
   * Shuts down workers and cancels all pending tasks
   */
  async destroySession(sessionId: string): Promise<void> {
    const pool = this.sessionPools.get(sessionId);
    if (!pool) {
      console.warn(`[SessionTaskManager] Session ${sessionId} not found`);
      return;
    }

    console.log(`[SessionTaskManager] Destroying session ${sessionId}`);

    // Shutdown pool (aborts in-flight, cancels queued)
    await pool.shutdown();

    // Remove from map
    this.sessionPools.delete(sessionId);
  }

  /**
   * Enqueue task
   * Returns full task object with ID and status
   */
  async enqueueTask(params: CreateTaskParams): Promise<Task> {
    const taskId = `task_${nanoid()}`;
    const now = new Date().toISOString();

    // Determine initial status based on policy decision
    let status = TaskStatus.QUEUED;
    if (params.policyDecision === 'REQUIRE_APPROVAL') {
      status = TaskStatus.PENDING_APPROVAL;
    } else if (params.policyDecision === 'BLOCK') {
      status = TaskStatus.FAILED;
    }

    // Calculate timeout
    const timeoutAt = params.timeoutMs
      ? new Date(Date.now() + params.timeoutMs).toISOString()
      : new Date(Date.now() + TASK_TIMEOUT_MS).toISOString();

    const taskData = {
      id: taskId,
      sessionId: params.sessionId,
      toolName: params.toolName,
      args: JSON.stringify(params.args),
      status,
      priority: 0, // Reserved for future use
      workerId: null,
      attempts: 0,
      maxAttempts: 3,
      createdAt: now,
      startedAt: null,
      completedAt: null,
      timeoutAt,
      result: null,
      error: status === TaskStatus.FAILED ? 'Blocked by policy' : null,
      policyDecision: params.policyDecision || null,
      approvalRequestId: params.approvalRequestId || null,
      redactedFields: params.redactedFields
        ? JSON.stringify(params.redactedFields)
        : null,
    };

    try {
      await this.db.insert(taskQueue).values(taskData);

      console.log(
        `[SessionTaskManager] Enqueued task ${taskId} (${params.toolName}) with status ${status}`
      );

      return taskData as Task;
    } catch (error) {
      console.error('[SessionTaskManager] Error enqueuing task:', error);
      throw new Error(`Failed to enqueue task: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get task status
   * Returns current task state
   */
  async getTaskStatus(taskId: string): Promise<TaskResult | null> {
    try {
      const tasks = await this.db
        .select()
        .from(taskQueue)
        .where(eq(taskQueue.id, taskId))
        .limit(1);

      if (tasks.length === 0) {
        return null;
      }

      const task = tasks[0];

      // Calculate execution time if completed
      let executionTimeMs: number | undefined;
      if (task.startedAt && task.completedAt) {
        executionTimeMs =
          new Date(task.completedAt).getTime() -
          new Date(task.startedAt).getTime();
      }

      return {
        id: task.id,
        status: task.status as TaskStatus,
        result: task.result ? JSON.parse(task.result) : undefined,
        error: task.error || undefined,
        createdAt: task.createdAt,
        startedAt: task.startedAt || undefined,
        completedAt: task.completedAt || undefined,
        executionTimeMs,
      };
    } catch (error) {
      console.error('[SessionTaskManager] Error getting task status:', error);
      return null;
    }
  }

  /**
   * Cancel specific task
   */
  async cancelTask(taskId: string): Promise<boolean> {
    try {
      // Get task to find session
      const tasks = await this.db
        .select()
        .from(taskQueue)
        .where(eq(taskQueue.id, taskId))
        .limit(1);

      if (tasks.length === 0) {
        console.warn(`[SessionTaskManager] Task ${taskId} not found`);
        return false;
      }

      const task = tasks[0];
      const pool = this.sessionPools.get(task.sessionId);

      if (pool) {
        // Use pool's cancel method (handles both queued and running)
        return await pool.cancelTask(taskId);
      } else {
        // Session pool doesn't exist, just update DB
        const result = await this.db
          .update(taskQueue)
          .set({
            status: TaskStatus.CANCELLED,
            completedAt: new Date().toISOString(),
            error: 'Task cancelled by user',
          })
          .where(
            and(
              eq(taskQueue.id, taskId),
              inArray(taskQueue.status, [
                TaskStatus.QUEUED,
                TaskStatus.PENDING_APPROVAL,
                TaskStatus.RUNNING,
              ])
            )
          );

        return result.changes > 0;
      }
    } catch (error) {
      console.error(`[SessionTaskManager] Error cancelling task ${taskId}:`, error);
      return false;
    }
  }

  /**
   * Cancel all tasks for a session
   * Returns number of tasks cancelled
   */
  async cancelAllForSession(sessionId: string): Promise<number> {
    const pool = this.sessionPools.get(sessionId);

    if (pool) {
      return await pool.cancelAll();
    } else {
      // Session pool doesn't exist, just update DB
      try {
        const result = await this.db
          .update(taskQueue)
          .set({
            status: TaskStatus.CANCELLED,
            completedAt: new Date().toISOString(),
            error: 'All tasks cancelled by user',
          })
          .where(
            and(
              eq(taskQueue.sessionId, sessionId),
              inArray(taskQueue.status, [
                TaskStatus.QUEUED,
                TaskStatus.PENDING_APPROVAL,
                TaskStatus.RUNNING,
              ])
            )
          );

        return result.changes || 0;
      } catch (error) {
        console.error(
          `[SessionTaskManager] Error cancelling all for session ${sessionId}:`,
          error
        );
        return 0;
      }
    }
  }

  /**
   * Approve pending task (for REQUIRE_APPROVAL policy)
   * Transitions task from pending_approval → queued
   */
  async approveTask(taskId: string, modifiedArgs?: Record<string, unknown>): Promise<boolean> {
    try {
      const updates: any = {
        status: TaskStatus.QUEUED,
      };

      // If user modified args, update them
      if (modifiedArgs) {
        updates.args = JSON.stringify(modifiedArgs);
      }

      const result = await this.db
        .update(taskQueue)
        .set(updates)
        .where(
          and(
            eq(taskQueue.id, taskId),
            eq(taskQueue.status, TaskStatus.PENDING_APPROVAL)
          )
        );

      const approved = result.changes > 0;

      if (approved) {
        console.log(`[SessionTaskManager] Approved task ${taskId}`);
      }

      return approved;
    } catch (error) {
      console.error(`[SessionTaskManager] Error approving task ${taskId}:`, error);
      return false;
    }
  }

  /**
   * Deny pending task (for REQUIRE_APPROVAL policy)
   * Transitions task from pending_approval → cancelled
   */
  async denyTask(taskId: string, reason?: string): Promise<boolean> {
    try {
      const result = await this.db
        .update(taskQueue)
        .set({
          status: TaskStatus.CANCELLED,
          completedAt: new Date().toISOString(),
          error: reason || 'Task denied by user',
        })
        .where(
          and(
            eq(taskQueue.id, taskId),
            eq(taskQueue.status, TaskStatus.PENDING_APPROVAL)
          )
        );

      const denied = result.changes > 0;

      if (denied) {
        console.log(`[SessionTaskManager] Denied task ${taskId}`);
      }

      return denied;
    } catch (error) {
      console.error(`[SessionTaskManager] Error denying task ${taskId}:`, error);
      return false;
    }
  }

  /**
   * Enqueue and wait for completion (for non-MCP-Tasks clients)
   * HTTP connection stays open until task completes
   */
  async enqueueAndWait(
    params: CreateTaskParams,
    timeoutMs: number = TASK_TIMEOUT_MS
  ): Promise<TaskResult> {
    const task = await this.enqueueTask(params);
    const taskId = task.id;
    const startTime = Date.now();

    // Poll for completion
    while (Date.now() - startTime < timeoutMs) {
      const status = await this.getTaskStatus(taskId);

      if (!status) {
        throw new Error(`Task ${taskId} not found`);
      }

      // Check terminal states
      if (status.status === TaskStatus.COMPLETED) {
        return status;
      }

      if (status.status === TaskStatus.FAILED) {
        throw new Error(status.error || 'Task failed');
      }

      if (status.status === TaskStatus.CANCELLED) {
        throw new Error('Task was cancelled by user');
      }

      // Still running or queued, wait and retry
      await sleep(500);
    }

    // Timeout - cancel the task
    await this.cancelTask(taskId);
    throw new Error('Task execution timeout');
  }

  /**
   * Get session pool state (for monitoring)
   */
  async getSessionState(sessionId: string): Promise<SessionPoolState | null> {
    const pool = this.sessionPools.get(sessionId);
    if (!pool) {
      return null;
    }

    return await pool.getState();
  }

  /**
   * Get all session states (for monitoring)
   */
  async getAllSessionStates(): Promise<SessionPoolState[]> {
    const states = await Promise.all(
      Array.from(this.sessionPools.values()).map((pool) => pool.getState())
    );

    return states;
  }

  /**
   * Shutdown all sessions
   * Called on server shutdown
   */
  async shutdownAll(): Promise<void> {
    console.log('[SessionTaskManager] Shutting down all sessions');

    await Promise.all(
      Array.from(this.sessionPools.keys()).map((sessionId) =>
        this.destroySession(sessionId)
      )
    );

    console.log('[SessionTaskManager] All sessions shut down');
  }
}
