/**
 * SessionWorkerPool - Manages worker pool for a single MCP session
 *
 * Responsibilities:
 * - Spawn N worker instances on creation
 * - Coordinate cancellation across workers
 * - Shutdown cleanly on session end
 */

import type { Database } from 'better-sqlite3';
import { eq, and, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { taskQueue } from '../../db/schema.js';
import { WORKERS_PER_SESSION, TaskStatus } from '../../config/task-queue.js';
import { Worker } from './Worker.js';
import type { ToolExecutor, SessionPoolState, TaskStats } from './types.js';

/**
 * SessionWorkerPool class
 */
export class SessionWorkerPool {
  private sessionId: string;
  private workerCount: number;
  private workers: Worker[] = [];
  private db: ReturnType<typeof drizzle>;
  private isShutdown: boolean = false;
  private workerPromises: Promise<void>[] = [];

  constructor(
    sessionId: string,
    sqliteDb: Database,
    toolExecutor: ToolExecutor,
    workerCount: number = WORKERS_PER_SESSION
  ) {
    this.sessionId = sessionId;
    this.workerCount = workerCount;
    this.db = drizzle(sqliteDb);

    // Spawn workers
    for (let i = 0; i < workerCount; i++) {
      const workerId = `worker-${sessionId}-${i}`;
      const worker = new Worker(workerId, sessionId, sqliteDb, toolExecutor);
      this.workers.push(worker);
    }

    console.log(
      `[SessionWorkerPool ${sessionId}] Created with ${workerCount} workers`
    );
  }

  /**
   * Start all workers
   */
  async start(): Promise<void> {
    if (this.isShutdown) {
      throw new Error('Cannot start a shutdown worker pool');
    }

    console.log(`[SessionWorkerPool ${this.sessionId}] Starting ${this.workerCount} workers`);

    // Start all workers in parallel
    this.workerPromises = this.workers.map((worker) => worker.start());
  }

  /**
   * Shutdown all workers
   * Aborts in-flight tasks and stops polling
   */
  async shutdown(): Promise<void> {
    if (this.isShutdown) {
      return; // Already shutdown
    }

    console.log(`[SessionWorkerPool ${this.sessionId}] Shutting down...`);
    this.isShutdown = true;

    // Shutdown all workers in parallel
    await Promise.all(this.workers.map((worker) => worker.shutdown()));

    // Wait for all worker loops to exit
    await Promise.allSettled(this.workerPromises);

    // Cancel all queued/pending tasks for this session
    await this.cancelAll();

    console.log(`[SessionWorkerPool ${this.sessionId}] Shutdown complete`);
  }

  /**
   * Cancel specific task
   *
   * NOTE: We do NOT abort in-flight HTTP requests.
   * If task is running, it will complete naturally and result will be discarded.
   * See Worker class documentation for details on cancellation strategy.
   */
  async cancelTask(taskId: string): Promise<boolean> {
    // Check if any worker is currently executing this task
    const isRunning = this.workers.some((worker) => worker.isExecuting(taskId));

    if (isRunning) {
      console.log(
        `[SessionWorkerPool ${this.sessionId}] Task ${taskId} is currently running, will complete naturally and result will be discarded`
      );
    }

    // Update database status to cancelled
    try {
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
            eq(taskQueue.sessionId, this.sessionId),
            inArray(taskQueue.status, [
              TaskStatus.QUEUED,
              TaskStatus.PENDING_APPROVAL,
              TaskStatus.RUNNING,
            ])
          )
        );

      console.log(
        `[SessionWorkerPool ${this.sessionId}] Marked task ${taskId} as cancelled`
      );

      return result.changes > 0;
    } catch (error) {
      console.error(
        `[SessionWorkerPool ${this.sessionId}] Error cancelling task ${taskId}:`,
        error
      );
      return false;
    }
  }

  /**
   * Cancel all tasks for this session
   * Returns number of tasks cancelled
   *
   * NOTE: Running tasks will complete naturally and results will be discarded.
   */
  async cancelAll(): Promise<number> {
    console.log(`[SessionWorkerPool ${this.sessionId}] Cancelling all tasks`);

    // Count running tasks for logging
    const runningCount = this.workers.filter(
      (worker) => worker.getState().currentTaskId !== null
    ).length;

    if (runningCount > 0) {
      console.log(
        `[SessionWorkerPool ${this.sessionId}] ${runningCount} task(s) currently running, will complete naturally`
      );
    }

    // Bulk cancel queued/pending/running tasks in database
    try {
      const result = await this.db
        .update(taskQueue)
        .set({
          status: TaskStatus.CANCELLED,
          completedAt: new Date().toISOString(),
          error: 'Session shutdown - all tasks cancelled',
        })
        .where(
          and(
            eq(taskQueue.sessionId, this.sessionId),
            inArray(taskQueue.status, [
              TaskStatus.QUEUED,
              TaskStatus.PENDING_APPROVAL,
              TaskStatus.RUNNING,
            ])
          )
        );

      const cancelledCount = result.changes || 0;
      console.log(
        `[SessionWorkerPool ${this.sessionId}] Cancelled ${cancelledCount} tasks`
      );

      return cancelledCount;
    } catch (error) {
      console.error(
        `[SessionWorkerPool ${this.sessionId}] Error cancelling all tasks:`,
        error
      );
      return 0;
    }
  }

  /**
   * Get pool state (for monitoring)
   */
  async getState(): Promise<SessionPoolState> {
    const stats = await this.getStats();

    return {
      sessionId: this.sessionId,
      workerCount: this.workerCount,
      workers: this.workers.map((worker) => worker.getState()),
      isShutdown: this.isShutdown,
      stats,
    };
  }

  /**
   * Get task statistics for this session
   */
  async getStats(): Promise<TaskStats> {
    try {
      const tasks = await this.db
        .select()
        .from(taskQueue)
        .where(eq(taskQueue.sessionId, this.sessionId));

      const stats: TaskStats = {
        sessionId: this.sessionId,
        queued: 0,
        running: 0,
        pendingApproval: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
        total: tasks.length,
      };

      for (const task of tasks) {
        switch (task.status) {
          case TaskStatus.QUEUED:
            stats.queued++;
            break;
          case TaskStatus.RUNNING:
            stats.running++;
            break;
          case TaskStatus.PENDING_APPROVAL:
            stats.pendingApproval++;
            break;
          case TaskStatus.COMPLETED:
            stats.completed++;
            break;
          case TaskStatus.FAILED:
            stats.failed++;
            break;
          case TaskStatus.CANCELLED:
            stats.cancelled++;
            break;
        }
      }

      return stats;
    } catch (error) {
      console.error(
        `[SessionWorkerPool ${this.sessionId}] Error getting stats:`,
        error
      );
      return {
        sessionId: this.sessionId,
        queued: 0,
        running: 0,
        pendingApproval: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
        total: 0,
      };
    }
  }
}
