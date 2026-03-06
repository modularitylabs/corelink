/**
 * Task Cleanup Service
 *
 * Automatically deletes old completed/failed tasks to prevent database bloat.
 * Preserves pending_approval tasks (never auto-deleted).
 */

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { and, lt, inArray } from 'drizzle-orm';
import { taskQueue } from '../db/schema.js';
import { schema } from '../db/index.js';
import { TaskStatus, TASK_RETENTION_DAYS } from '../config/task-queue.js';

/**
 * Cleanup statistics
 */
export interface CleanupStats {
  deletedCount: number;
  oldestDeletedTask?: string;
  newestDeletedTask?: string;
  retentionDays: number;
}

/**
 * Task cleanup service
 */
export class TaskCleanupService {
  private db: BetterSQLite3Database<typeof schema>;

  constructor(db: BetterSQLite3Database<typeof schema>) {
    this.db = db;
  }

  /**
   * Clean up old completed/failed tasks
   *
   * @param retentionDays - How many days to keep tasks (default: TASK_RETENTION_DAYS = 30)
   * @param dryRun - If true, return count without deleting
   * @returns Cleanup statistics
   */
  async cleanup(retentionDays: number = TASK_RETENTION_DAYS, dryRun: boolean = false): Promise<CleanupStats> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffIso = cutoffDate.toISOString();

    console.log(`[TaskCleanup] ${dryRun ? 'DRY RUN - ' : ''}Cleaning up tasks older than ${cutoffDate.toISOString()} (${retentionDays} days)`);

    try {
      // Find tasks to delete:
      // - Status: completed or failed
      // - Completed before cutoff date
      // - NOT pending_approval (those are never auto-deleted)
      const tasksToDelete = await this.db
        .select({
          id: taskQueue.id,
          completedAt: taskQueue.completedAt,
        })
        .from(taskQueue)
        .where(
          and(
            inArray(taskQueue.status, [TaskStatus.COMPLETED, TaskStatus.FAILED]),
            lt(taskQueue.completedAt, cutoffIso),
          )
        )
        .all();

      if (tasksToDelete.length === 0) {
        console.log('[TaskCleanup] No tasks to delete');
        return {
          deletedCount: 0,
          retentionDays,
        };
      }

      console.log(`[TaskCleanup] Found ${tasksToDelete.length} tasks to delete`);

      // Find oldest and newest for stats
      const completedDates = tasksToDelete
        .map((t) => t.completedAt)
        .filter((d): d is string => d !== null)
        .sort();

      const stats: CleanupStats = {
        deletedCount: tasksToDelete.length,
        oldestDeletedTask: completedDates[0],
        newestDeletedTask: completedDates[completedDates.length - 1],
        retentionDays,
      };

      if (!dryRun) {
        // Delete tasks
        const taskIds = tasksToDelete.map((t) => t.id);
        await this.db.delete(taskQueue).where(
          inArray(taskQueue.id, taskIds)
        );

        console.log(`[TaskCleanup] Deleted ${tasksToDelete.length} tasks`);
      } else {
        console.log(`[TaskCleanup] DRY RUN - Would delete ${tasksToDelete.length} tasks`);
      }

      return stats;
    } catch (error) {
      console.error('[TaskCleanup] Error during cleanup:', error);
      throw error;
    }
  }

  /**
   * Get count of tasks eligible for cleanup
   */
  async getCleanupCount(retentionDays: number = TASK_RETENTION_DAYS): Promise<number> {
    const stats = await this.cleanup(retentionDays, true);
    return stats.deletedCount;
  }
}
