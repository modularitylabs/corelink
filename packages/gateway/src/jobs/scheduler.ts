/**
 * Job Scheduler
 *
 * Manages scheduled background jobs (cron tasks)
 */

import cron, { type ScheduledTask } from 'node-cron';
import type { TaskCleanupService } from '../services/task-cleanup.js';

/**
 * Scheduled job manager
 */
export class JobScheduler {
  private jobs: Map<string, ScheduledTask> = new Map();
  private cleanupService: TaskCleanupService;

  constructor(cleanupService: TaskCleanupService) {
    this.cleanupService = cleanupService;
  }

  /**
   * Start all scheduled jobs
   */
  start(): void {
    console.log('[JobScheduler] Starting scheduled jobs...');

    // Daily cleanup at 3:00 AM
    const cleanupJob = cron.schedule('0 3 * * *', async () => {
      console.log('[JobScheduler] Running daily task cleanup...');
      try {
        const stats = await this.cleanupService.cleanup();
        console.log(`[JobScheduler] Cleanup completed:`, {
          deletedCount: stats.deletedCount,
          retentionDays: stats.retentionDays,
          oldest: stats.oldestDeletedTask,
          newest: stats.newestDeletedTask,
        });
      } catch (error) {
        console.error('[JobScheduler] Cleanup failed:', error);
      }
    });

    this.jobs.set('taskCleanup', cleanupJob);
    console.log('[JobScheduler] Scheduled daily task cleanup at 3:00 AM');

    // Start all jobs
    this.jobs.forEach((job) => job.start());
    console.log(`[JobScheduler] Started ${this.jobs.size} scheduled job(s)`);
  }

  /**
   * Stop all scheduled jobs
   */
  stop(): void {
    console.log('[JobScheduler] Stopping scheduled jobs...');
    this.jobs.forEach((job, name) => {
      job.stop();
      console.log(`[JobScheduler] Stopped job: ${name}`);
    });
    this.jobs.clear();
  }

  /**
   * Get job status
   */
  getStatus(): { name: string; running: boolean }[] {
    return Array.from(this.jobs.entries()).map(([name]) => ({
      name,
      running: true, // node-cron doesn't expose status, assume running if in map
    }));
  }
}
