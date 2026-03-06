/**
 * CoreLink Task Service
 *
 * Orchestrates multiple task providers (Todoist, Microsoft Todo, etc.)
 * to provide a unified task interface. Aggregates results from all accounts
 * across all providers.
 */

import type { ITaskProvider } from './ITaskProvider.js';
import type { Account, Task, TaskResult, ListTasksArgs, CreateTaskArgs, UpdateTaskArgs } from './types.js';

/**
 * Task Service - Universal task interface
 *
 * Manages multiple task accounts across different providers
 * and aggregates their results into a unified view.
 */
export class TaskService {
  private providers: Map<string, ITaskProvider> = new Map();

  /**
   * Register a task provider
   *
   * @param pluginId - Provider plugin ID (e.g., "com.corelink.todoist")
   * @param provider - Provider implementation
   */
  registerProvider(pluginId: string, provider: ITaskProvider): void {
    this.providers.set(pluginId, provider);
    console.log(`[TaskService] Registered provider: ${pluginId}`);
  }

  /**
   * Unregister a task provider
   */
  unregisterProvider(pluginId: string): boolean {
    return this.providers.delete(pluginId);
  }

  /**
   * List tasks from ALL configured task accounts
   *
   * Queries all accounts across all providers in parallel,
   * merges results, and returns up to max_results tasks.
   */
  async listTasks(accounts: Account[], args: ListTasksArgs): Promise<Task[]> {
    if (accounts.length === 0) {
      return [];
    }

    const maxResults = args.max_results || 20;

    const taskPromises = accounts.map(async account => {
      const provider = this.providers.get(account.pluginId);
      if (!provider) {
        console.warn(`[TaskService] No provider found for ${account.pluginId}`);
        return [];
      }

      try {
        return await provider.listTasks(account, { ...args, max_results: maxResults });
      } catch (error) {
        console.error(
          `[TaskService] Failed to list tasks from ${account.email}:`,
          error instanceof Error ? error.message : String(error)
        );
        return [];
      }
    });

    const taskArrays = await Promise.all(taskPromises);
    const allTasks = taskArrays.flat();

    return allTasks.slice(0, maxResults);
  }

  /**
   * Create a task in the specified account
   */
  async createTask(account: Account, args: CreateTaskArgs): Promise<Task> {
    const provider = this.providers.get(account.pluginId);
    if (!provider) {
      throw new Error(`No provider found for ${account.pluginId}`);
    }

    return provider.createTask(account, args);
  }

  /**
   * Update a task in the specified account
   */
  async updateTask(account: Account, args: UpdateTaskArgs): Promise<Task> {
    const provider = this.providers.get(account.pluginId);
    if (!provider) {
      throw new Error(`No provider found for ${account.pluginId}`);
    }

    return provider.updateTask(account, args);
  }

  /**
   * Mark a task as completed in the specified account
   */
  async completeTask(account: Account, taskId: string): Promise<TaskResult> {
    const provider = this.providers.get(account.pluginId);
    if (!provider) {
      throw new Error(`No provider found for ${account.pluginId}`);
    }

    return provider.completeTask(account, taskId);
  }
}

// Export singleton instance
export const taskService = new TaskService();
