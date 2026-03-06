/**
 * Task Queue Configuration
 *
 * Configuration constants for the task-based execution system.
 * These values control worker pool sizing, task retention, timeouts, and retry behavior.
 */

/**
 * Number of workers per session.
 * Each worker can execute one task concurrently.
 *
 * Higher value = faster execution per session, more resource usage
 * Lower value = slower execution, less resource usage
 *
 * Default: 3 workers per session
 * - Provides good parallelism for typical AI agent workloads
 * - Prevents one session from monopolizing all resources
 * - Balances responsiveness with resource consumption
 */
export const WORKERS_PER_SESSION = 3;

/**
 * Task retention period in days.
 * Completed/failed tasks older than this are auto-deleted.
 *
 * Notes:
 * - Pending approval tasks are exempt (completed_at IS NULL)
 * - Cleanup job runs daily at 3 AM
 * - 30 days is standard for compliance/audit trails
 *
 * Default: 30 days
 */
export const TASK_RETENTION_DAYS = 30;

/**
 * Default timeout for task execution (milliseconds).
 * Tasks not completed within this time are auto-failed.
 *
 * Notes:
 * - Applies to individual task execution, not total queue time
 * - Worker will abort task execution after this timeout
 * - Can be overridden per-task if needed
 *
 * Default: 300000 ms (5 minutes)
 */
export const TASK_TIMEOUT_MS = 300000; // 5 minutes

/**
 * Worker polling interval when queue is empty (milliseconds).
 *
 * Lower value = more responsive to new tasks, higher CPU usage
 * Higher value = less CPU usage, slower to pick up new tasks
 *
 * Default: 1000 ms (1 second)
 * - Good balance between responsiveness and resource usage
 * - Tasks picked up within 1 second of being queued
 */
export const WORKER_POLL_INTERVAL_MS = 1000; // 1 second

/**
 * Maximum retry attempts for failed tasks.
 * Transient errors (rate limits, timeouts) trigger retries.
 * Permanent errors (auth failures, invalid args) fail immediately.
 *
 * Retry strategy: Exponential backoff
 * - Attempt 1: Immediate
 * - Attempt 2: Wait 1 second
 * - Attempt 3: Wait 2 seconds
 * - Attempt 4: Wait 4 seconds
 * - Max backoff: 30 seconds
 *
 * Default: 3 attempts
 */
export const MAX_TASK_ATTEMPTS = 3;

/**
 * Task status enumeration
 */
export enum TaskStatus {
  QUEUED = 'queued', // Waiting for worker to claim
  PENDING_APPROVAL = 'pending_approval', // Waiting for user approval
  RUNNING = 'running', // Worker executing
  COMPLETED = 'completed', // Successfully finished
  FAILED = 'failed', // Execution failed (permanent error or max retries exceeded)
  CANCELLED = 'cancelled', // User or system cancelled
}

/**
 * Transient error detection
 * These HTTP status codes indicate temporary failures that should be retried
 */
export const TRANSIENT_HTTP_CODES = [429, 500, 502, 503, 504];

/**
 * Transient error messages
 * Error messages containing these strings indicate temporary failures
 */
export const TRANSIENT_ERROR_MESSAGES = [
  'timeout',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'ECONNREFUSED',
  'rate limit',
  'Rate limit',
  'Too Many Requests',
];
