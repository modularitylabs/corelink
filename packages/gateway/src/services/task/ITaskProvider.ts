/**
 * CoreLink Task Provider Interface
 *
 * Defines the standard contract that all task providers must implement.
 * This enables service abstraction across Todoist, Microsoft Todo, etc.
 */

import type { Account, Task, TaskResult, ListTasksArgs, CreateTaskArgs, UpdateTaskArgs } from './types.js';

/**
 * Task Provider Interface
 *
 * All task plugins (Todoist, Microsoft Todo, etc.) must implement
 * this interface to be compatible with the TaskService orchestrator.
 */
export interface ITaskProvider {
  /**
   * List tasks from the specified account
   */
  listTasks(account: Account, args: ListTasksArgs): Promise<Task[]>;

  /**
   * Create a new task in the specified account
   */
  createTask(account: Account, args: CreateTaskArgs): Promise<Task>;

  /**
   * Update an existing task
   */
  updateTask(account: Account, args: UpdateTaskArgs): Promise<Task>;

  /**
   * Mark a task as completed
   */
  completeTask(account: Account, taskId: string): Promise<TaskResult>;
}
