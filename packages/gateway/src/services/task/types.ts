/**
 * CoreLink Task Service Types
 *
 * Normalized types for task operations across different providers (Todoist, Microsoft Todo, etc.)
 */

import type { Account as EmailAccount } from '../email/types.js';

/**
 * Re-export Account type (same shape as email Account)
 */
export type Account = EmailAccount;

/**
 * Normalized task structure
 */
export interface Task {
  id: string;             // Provider-specific ID
  accountId: string;      // Which account
  providerId: string;     // "com.corelink.todoist" | "com.corelink.microsoft-todo"
  title: string;
  description?: string;
  due?: string;           // ISO8601 date
  priority?: number;      // 1 (low) – 4 (urgent), normalized across providers
  status: 'active' | 'completed';
  projectId?: string;
  projectName?: string;
  createdAt?: string;
  completedAt?: string;
  raw?: Record<string, unknown>;
}

/**
 * Arguments for listing tasks
 */
export interface ListTasksArgs {
  project_id?: string;
  filter?: string;       // Provider-native filter string (advanced use)
  max_results?: number;
  priority?: number;     // 1 (low) – 4 (urgent)
  overdue?: boolean;     // Only tasks past their due date
  due_before?: string;   // ISO8601 date — tasks due before this date
  due_after?: string;    // ISO8601 date — tasks due after this date
}

/**
 * Arguments for creating a task
 */
export interface CreateTaskArgs {
  title: string;
  description?: string;
  due_date?: string;
  priority?: number;
  project_id?: string;
}

/**
 * Arguments for updating a task
 */
export interface UpdateTaskArgs {
  task_id: string;
  title?: string;
  description?: string;
  due_date?: string;
  priority?: number;
}

/**
 * Result of a task mutation (create/update/complete)
 */
export interface TaskResult {
  success: boolean;
  taskId?: string;
  error?: string;
}
