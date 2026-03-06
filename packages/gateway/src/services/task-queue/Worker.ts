/**
 * Worker - Polls queue, claims tasks, executes them
 *
 * Workers run in an async polling loop on the Node.js event loop (not OS threads).
 * Each worker independently claims tasks from the database using atomic transactions.
 *
 * CANCELLATION STRATEGY:
 * - We do NOT abort in-flight HTTP requests (too complex, indeterminate state)
 * - Instead, we let running tasks complete naturally (~2 seconds max)
 * - After execution, we check if task was cancelled during execution
 * - If cancelled, we discard the result and keep status as 'cancelled'
 * - This gives us deterministic behavior and simpler implementation
 *
 * NOTE: AbortController/AbortSignal is currently NOT IMPLEMENTED.
 * The signal parameter exists in provider interfaces for future use if needed.
 * If you implement abort logic for any flow, remove this note and update documentation.
 */

import type { Database } from 'better-sqlite3';
import { eq, and, lt, isNull, or, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { taskQueue } from '../../db/schema.js';
import {
  WORKER_POLL_INTERVAL_MS,
  TASK_TIMEOUT_MS,
  TaskStatus,
  TRANSIENT_HTTP_CODES,
  TRANSIENT_ERROR_MESSAGES,
} from '../../config/task-queue.js';
import type {
  Task,
  ToolExecutor,
  WorkerState,
} from './types.js';

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Worker class
 */
export class Worker {
  private workerId: string;
  private sessionId: string;
  private db: ReturnType<typeof drizzle>;
  private toolExecutor: ToolExecutor;
  private isShuttingDown: boolean = false;
  private currentTaskId: string | null = null;
  private tasksCompleted: number = 0;
  private tasksFailed: number = 0;

  constructor(
    workerId: string,
    sessionId: string,
    sqliteDb: Database,
    toolExecutor: ToolExecutor
  ) {
    this.workerId = workerId;
    this.sessionId = sessionId;
    this.db = drizzle(sqliteDb);
    this.toolExecutor = toolExecutor;
  }

  /**
   * Get worker state (for monitoring)
   */
  getState(): WorkerState {
    return {
      id: this.workerId,
      sessionId: this.sessionId,
      status: this.isShuttingDown ? 'shutdown' : this.currentTaskId ? 'busy' : 'idle',
      currentTaskId: this.currentTaskId,
      tasksCompleted: this.tasksCompleted,
      tasksFailed: this.tasksFailed,
    };
  }

  /**
   * Start worker polling loop
   */
  async start(): Promise<void> {
    console.log(`[Worker ${this.workerId}] Starting polling loop`);

    while (!this.isShuttingDown) {
      try {
        // Claim next task (atomic via DB transaction)
        const task = await this.claimNextTask();

        if (!task) {
          // No work available, sleep and retry
          await sleep(WORKER_POLL_INTERVAL_MS);
          continue;
        }

        // Execute task
        await this.executeTask(task);
      } catch (error) {
        console.error(`[Worker ${this.workerId}] Unexpected error in polling loop:`, error);
        // Don't crash the worker, just log and continue
        await sleep(WORKER_POLL_INTERVAL_MS);
      }
    }

    console.log(`[Worker ${this.workerId}] Stopped`);
  }

  /**
   * Shutdown worker gracefully
   * Stops polling (in-flight tasks will complete naturally)
   */
  async shutdown(): Promise<void> {
    console.log(`[Worker ${this.workerId}] Shutting down...`);
    this.isShuttingDown = true;
    // Note: Current task (if any) will complete naturally
  }

  /**
   * Check if this worker is currently executing a specific task
   */
  isExecuting(taskId: string): boolean {
    return this.currentTaskId === taskId;
  }

  /**
   * Claim next task from queue (atomic transaction)
   * Returns null if no tasks available
   */
  private async claimNextTask(): Promise<Task | null> {
    try {
      // Use database transaction for atomicity
      return await this.db.transaction(async (tx) => {
        const now = new Date().toISOString();

        // Find next available task
        const tasks = await tx
          .select()
          .from(taskQueue)
          .where(
            and(
              eq(taskQueue.sessionId, this.sessionId),
              eq(taskQueue.status, TaskStatus.QUEUED),
              lt(taskQueue.attempts, taskQueue.maxAttempts),
              or(isNull(taskQueue.timeoutAt), sql`${taskQueue.timeoutAt} > ${now}`)
            )
          )
          .orderBy(taskQueue.priority, taskQueue.createdAt)
          .limit(1);

        if (tasks.length === 0) {
          return null;
        }

        const task = tasks[0];

        // Claim it (update status to running)
        await tx
          .update(taskQueue)
          .set({
            status: TaskStatus.RUNNING,
            workerId: this.workerId,
            startedAt: now,
            attempts: task.attempts + 1,
          })
          .where(eq(taskQueue.id, task.id));

        console.log(
          `[Worker ${this.workerId}] Claimed task ${task.id} (${task.toolName}), attempt ${task.attempts + 1}/${task.maxAttempts}`
        );

        return {
          ...task,
          status: task.status as TaskStatus,
          workerId: this.workerId,
          startedAt: now,
          attempts: task.attempts + 1
        };
      });
    } catch (error) {
      console.error(`[Worker ${this.workerId}] Error claiming task:`, error);
      return null;
    }
  }

  /**
   * Execute task
   *
   * NOTE: We do NOT abort in-flight requests. Instead:
   * 1. Execute the task normally
   * 2. After completion, check if task was cancelled during execution
   * 3. If cancelled, discard result (status already updated by cancel operation)
   * 4. If not cancelled, save result normally
   */
  private async executeTask(task: Task): Promise<void> {
    this.currentTaskId = task.id;

    try {
      console.log(`[Worker ${this.workerId}] Executing task ${task.id}`);

      // Parse args
      const args = JSON.parse(task.args) as Record<string, unknown>;

      // Execute with timeout
      const timeoutMs = task.timeoutAt
        ? new Date(task.timeoutAt).getTime() - Date.now()
        : TASK_TIMEOUT_MS;

      const result = await Promise.race([
        this.toolExecutor(task.toolName, args, {
          taskId: task.id,
          sessionId: task.sessionId,
          // signal: undefined - Not currently used (see class documentation)
        }),
        this.createTimeout(timeoutMs),
      ]);

      // Check if task was cancelled while we were executing
      const currentTask = await this.db
        .select()
        .from(taskQueue)
        .where(eq(taskQueue.id, task.id))
        .limit(1);

      if (currentTask.length > 0 && currentTask[0].status === 'cancelled') {
        console.log(`[Worker ${this.workerId}] Task ${task.id} was cancelled during execution, discarding result`);
        // Result already marked as cancelled by cancel operation, nothing to do
        return;
      }

      // Task not cancelled, save result normally
      await this.markCompleted(task.id, result);
      this.tasksCompleted++;

      console.log(`[Worker ${this.workerId}] Task ${task.id} completed successfully`);
    } catch (error) {
      await this.handleError(task, error as Error);
      this.tasksFailed++;
    } finally {
      this.currentTaskId = null;
    }
  }

  /**
   * Create timeout promise
   */
  private async createTimeout(ms: number): Promise<never> {
    await sleep(ms);
    throw new Error('Task execution timeout');
  }

  /**
   * Mark task as completed
   */
  private async markCompleted(taskId: string, result: unknown): Promise<void> {
    try {
      await this.db
        .update(taskQueue)
        .set({
          status: TaskStatus.COMPLETED,
          completedAt: new Date().toISOString(),
          result: JSON.stringify(result),
          error: null,
        })
        .where(eq(taskQueue.id, taskId));
    } catch (error) {
      console.error(`[Worker ${this.workerId}] Error marking task completed:`, error);
    }
  }

  /**
   * Mark task as failed
   */
  private async markFailed(taskId: string, error: string): Promise<void> {
    try {
      await this.db
        .update(taskQueue)
        .set({
          status: TaskStatus.FAILED,
          completedAt: new Date().toISOString(),
          error,
        })
        .where(eq(taskQueue.id, taskId));
    } catch (err) {
      console.error(`[Worker ${this.workerId}] Error marking task failed:`, err);
    }
  }

  /**
   * Mark task as cancelled
   * NOTE: Currently not used - cancellation is handled by checking status after execution completes
   */
  // private async markCancelled(taskId: string): Promise<void> {
  //   try {
  //     await this.db
  //       .update(taskQueue)
  //       .set({
  //         status: TaskStatus.CANCELLED,
  //         completedAt: new Date().toISOString(),
  //         error: 'Task cancelled by user',
  //       })
  //       .where(eq(taskQueue.id, taskId));
  //   } catch (error) {
  //     console.error(`[Worker ${this.workerId}] Error marking task cancelled:`, error);
  //   }
  // }

  /**
   * Requeue task for retry
   */
  private async requeueForRetry(task: Task, backoffMs: number): Promise<void> {
    try {
      const timeoutAt = new Date(Date.now() + backoffMs).toISOString();
      await this.db
        .update(taskQueue)
        .set({
          status: TaskStatus.QUEUED,
          workerId: null,
          startedAt: null,
          timeoutAt,
        })
        .where(eq(taskQueue.id, task.id));

      console.log(
        `[Worker ${this.workerId}] Requeued task ${task.id} for retry after ${backoffMs}ms`
      );
    } catch (error) {
      console.error(`[Worker ${this.workerId}] Error requeueing task:`, error);
    }
  }

  /**
   * Handle task execution error
   */
  private async handleError(task: Task, error: Error): Promise<void> {
    console.error(`[Worker ${this.workerId}] Task ${task.id} failed:`, error);

    // Check if task was cancelled during execution
    const currentTask = await this.db
      .select()
      .from(taskQueue)
      .where(eq(taskQueue.id, task.id))
      .limit(1);

    if (currentTask.length > 0 && currentTask[0].status === 'cancelled') {
      console.log(`[Worker ${this.workerId}] Task ${task.id} was cancelled, keeping cancelled status`);
      return; // Already marked as cancelled
    }

    // Check if it's a timeout
    if (error.message?.includes('timeout') || error.name === 'TaskTimeoutError') {
      // Don't retry timeouts
      await this.markFailed(task.id, `Task timeout: ${error.message}`);
      return;
    }

    // Check if error is transient
    const isTransient = this.isTransientError(error);
    const canRetry = task.attempts < task.maxAttempts;

    if (isTransient && canRetry) {
      // Exponential backoff: 1s, 2s, 4s, 8s, ... (max 30s)
      const backoffMs = Math.min(1000 * Math.pow(2, task.attempts), 30000);
      await this.requeueForRetry(task, backoffMs);
    } else {
      // Permanent failure or max retries exceeded
      const errorMessage = isTransient
        ? `Max retries exceeded (${task.attempts}/${task.maxAttempts}): ${error.message}`
        : `Permanent error: ${error.message}`;
      await this.markFailed(task.id, errorMessage);
    }
  }

  /**
   * Check if error is transient (retryable)
   */
  private isTransientError(error: Error): boolean {
    // Check HTTP status codes
    const statusCode = (error as any).statusCode || (error as any).status;
    if (statusCode && TRANSIENT_HTTP_CODES.includes(statusCode)) {
      return true;
    }

    // Check error messages
    const message = error.message?.toLowerCase() || '';
    return TRANSIENT_ERROR_MESSAGES.some((pattern) =>
      message.includes(pattern.toLowerCase())
    );
  }
}
