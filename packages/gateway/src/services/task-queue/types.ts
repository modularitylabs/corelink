/**
 * Task Queue Types and Interfaces
 *
 * Type definitions for the task-based execution system.
 */

import type { TaskStatus } from '../../config/task-queue.js';

/**
 * Task entity (database record)
 */
export interface Task {
  // Identity
  id: string; // task_<nanoid>
  sessionId: string; // MCP session identifier

  // Task definition
  toolName: string; // 'read_email', 'list_emails', etc.
  args: string; // JSON serialized arguments

  // Execution state
  status: TaskStatus;
  priority: number; // Higher = more urgent (RESERVED FOR FUTURE)

  // Worker tracking
  workerId: string | null; // Which worker claimed this
  attempts: number; // Retry count
  maxAttempts: number; // Max retries before marking failed

  // Timing
  createdAt: string; // ISO8601 timestamp
  startedAt: string | null; // When worker claimed it
  completedAt: string | null; // When finished (success or failure)
  timeoutAt: string | null; // Auto-fail if not completed by this time

  // Results
  result: string | null; // JSON serialized result (on success)
  error: string | null; // Error message (on failure)

  // Policy integration
  policyDecision: string | null; // 'ALLOW' | 'BLOCK' | 'REDACT' | 'REQUIRE_APPROVAL'
  approvalRequestId: string | null; // Foreign key to approval_requests table
  redactedFields: string | null; // JSON array of redacted field paths
}

/**
 * Task creation parameters
 */
export interface CreateTaskParams {
  sessionId: string;
  toolName: string;
  args: Record<string, unknown>;
  policyDecision?: string;
  approvalRequestId?: string;
  redactedFields?: string[];
  timeoutMs?: number;
}

/**
 * Task result (returned to client)
 */
export interface TaskResult {
  id: string;
  status: TaskStatus;
  result?: unknown; // Parsed JSON result
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  executionTimeMs?: number;
}

/**
 * Task execution context (passed to tool handlers)
 */
export interface TaskExecutionContext {
  taskId: string;
  sessionId: string;
  signal?: AbortSignal; // For cancellation support
}

/**
 * Task statistics (for monitoring UI)
 */
export interface TaskStats {
  sessionId: string;
  queued: number;
  running: number;
  pendingApproval: number;
  completed: number;
  failed: number;
  cancelled: number;
  total: number;
}

/**
 * Worker state
 */
export interface WorkerState {
  id: string; // worker-<sessionId>-<index>
  sessionId: string;
  status: 'idle' | 'busy' | 'shutdown';
  currentTaskId: string | null;
  tasksCompleted: number;
  tasksFailed: number;
}

/**
 * Session worker pool state
 */
export interface SessionPoolState {
  sessionId: string;
  workerCount: number;
  workers: WorkerState[];
  isShutdown: boolean;
  stats: TaskStats;
}

/**
 * Error types for task execution
 */
export class TaskError extends Error {
  constructor(
    message: string,
    public readonly taskId: string,
    public readonly isTransient: boolean = false
  ) {
    super(message);
    this.name = 'TaskError';
  }
}

export class TaskTimeoutError extends TaskError {
  constructor(taskId: string) {
    super('Task execution timeout', taskId, false);
    this.name = 'TaskTimeoutError';
  }
}

export class TaskCancellationError extends TaskError {
  constructor(taskId: string) {
    super('Task cancelled by user', taskId, false);
    this.name = 'TaskCancellationError';
  }
}

/**
 * Tool executor function signature
 * This is the function that actually executes the MCP tool
 */
export type ToolExecutor = (
  toolName: string,
  args: Record<string, unknown>,
  context: TaskExecutionContext
) => Promise<unknown>;
