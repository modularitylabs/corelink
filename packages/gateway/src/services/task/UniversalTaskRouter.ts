/**
 * Universal Task Router
 *
 * Routes MCP tool calls to the TaskService, implementing the business logic
 * for universal task tools that work across all providers and accounts.
 *
 * Strategy:
 * - Read operations (list): Aggregate ALL accounts
 * - Write operations (create, update, complete): Use primary account
 */

import type { ActionResult } from '@corelink/core';
import { taskService } from './TaskService.js';
import { CredentialManager } from '../credential-manager.js';
import type { Account, Task, ListTasksArgs, CreateTaskArgs, UpdateTaskArgs } from './types.js';

const TASK_PLUGIN_IDS = ['com.corelink.todoist', 'com.corelink.microsoft-todo'];

function strip(task: Task): Omit<Task, 'raw'> {
  const { raw: _raw, ...clean } = task;
  return clean;
}

export class UniversalTaskRouter {
  constructor(
    private credentialManager: CredentialManager
  ) {}

  /**
   * List tasks from ALL task accounts
   * Aggregates results from Todoist, Microsoft Todo, and any other connected providers
   */
  async listTasks(args: Record<string, unknown>): Promise<ActionResult> {
    console.error('[UniversalTaskRouter] listTasks called with args:', JSON.stringify(args));

    const accounts = await this.getAllTaskAccounts();
    console.error(`[UniversalTaskRouter] Found ${accounts.length} task account(s)`);

    if (accounts.length === 0) {
      return {
        data: [],
        summary: 'No task accounts connected',
        metadata: { accountCount: 0 },
      };
    }

    const listArgs: ListTasksArgs = {
      project_id: args.project_id as string | undefined,
      filter: args.filter as string | undefined,
      max_results: (args.max_results as number) || 20,
    };

    const tasks = await taskService.listTasks(accounts, listArgs);
    console.error(`[UniversalTaskRouter] TaskService returned ${tasks.length} task(s)`);

    const clean = tasks.map(strip);
    return {
      data: clean,
      summary: `Retrieved ${clean.length} tasks from ${accounts.length} account(s)`,
      metadata: {
        accountCount: accounts.length,
        taskCount: clean.length,
      },
    };
  }

  /**
   * Create a task in the primary task account
   */
  async createTask(args: Record<string, unknown>): Promise<ActionResult> {
    const account = await this.getPrimaryTaskAccount();
    if (!account) {
      throw new Error('No task account connected. Please connect Todoist or Microsoft Todo first.');
    }

    const createArgs: CreateTaskArgs = {
      title: args.title as string,
      description: args.description as string | undefined,
      due_date: args.due_date as string | undefined,
      priority: args.priority as number | undefined,
      project_id: args.project_id as string | undefined,
    };

    if (!createArgs.title) {
      throw new Error('title is required');
    }

    const task = await taskService.createTask(account, createArgs);

    return {
      data: strip(task),
      summary: `Created task "${task.title}" in ${account.email}`,
      metadata: { accountId: account.id },
    };
  }

  /**
   * Update a task (uses primary account)
   */
  async updateTask(args: Record<string, unknown>): Promise<ActionResult> {
    const account = await this.getPrimaryTaskAccount();
    if (!account) {
      throw new Error('No task account connected. Please connect Todoist or Microsoft Todo first.');
    }

    const updateArgs: UpdateTaskArgs = {
      task_id: args.task_id as string,
      title: args.title as string | undefined,
      description: args.description as string | undefined,
      due_date: args.due_date as string | undefined,
      priority: args.priority as number | undefined,
    };

    if (!updateArgs.task_id) {
      throw new Error('task_id is required');
    }

    const task = await taskService.updateTask(account, updateArgs);

    return {
      data: strip(task),
      summary: `Updated task "${task.title}"`,
      metadata: { accountId: account.id },
    };
  }

  /**
   * Complete a task (uses primary account)
   */
  async completeTask(args: Record<string, unknown>): Promise<ActionResult> {
    const account = await this.getPrimaryTaskAccount();
    if (!account) {
      throw new Error('No task account connected. Please connect Todoist or Microsoft Todo first.');
    }

    const taskId = args.task_id as string;
    if (!taskId) {
      throw new Error('task_id is required');
    }

    const result = await taskService.completeTask(account, taskId);

    if (!result.success) {
      throw new Error(result.error || 'Failed to complete task');
    }

    return {
      data: result,
      summary: `Completed task ${taskId}`,
      metadata: { accountId: account.id },
    };
  }

  /**
   * Get all task accounts (across all task providers)
   * Loads credentials into account metadata for provider access
   */
  private async getAllTaskAccounts(): Promise<Account[]> {
    const allAccounts = await this.credentialManager.listAccounts();

    const taskAccounts = allAccounts.filter(account =>
      TASK_PLUGIN_IDS.includes(account.pluginId)
    );

    const accountsWithCredentials = await Promise.all(
      taskAccounts.map(async account => {
        try {
          const credentials = await this.credentialManager.getAccountCredentials(account.id);
          if (credentials) {
            return {
              ...account,
              metadata: {
                ...account.metadata,
                ...credentials.data,
              },
            };
          }
          return account;
        } catch (error) {
          console.error(`[UniversalTaskRouter] Failed to load credentials for ${account.email}:`, error);
          return account;
        }
      })
    );

    return accountsWithCredentials as Account[];
  }

  /**
   * Get primary task account (for write operations)
   */
  private async getPrimaryTaskAccount(): Promise<Account | null> {
    const allAccounts = await this.getAllTaskAccounts();

    const primary = allAccounts.find(account => account.isPrimary);
    if (primary) return primary;

    return allAccounts[0] || null;
  }
}
