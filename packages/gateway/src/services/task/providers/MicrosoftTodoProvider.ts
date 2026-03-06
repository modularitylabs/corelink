/**
 * Microsoft Todo Task Provider
 *
 * Implements ITaskProvider for Microsoft Todo using Microsoft Graph API
 */

import { Client } from '@microsoft/microsoft-graph-client';
import type { ITaskProvider } from '../ITaskProvider.js';
import type { Account, Task, TaskResult, ListTasksArgs, CreateTaskArgs, UpdateTaskArgs } from '../types.js';

/**
 * Microsoft Graph Todo task type (simplified)
 */
interface TodoTask {
  id?: string;
  title?: string;
  body?: { content?: string; contentType?: string };
  dueDateTime?: { dateTime?: string; timeZone?: string };
  importance?: 'low' | 'normal' | 'high';
  status?: 'notStarted' | 'inProgress' | 'completed' | 'waitingOnOthers' | 'deferred';
  createdDateTime?: string;
  completedDateTime?: { dateTime?: string };
  linkedResources?: unknown[];
}

/**
 * Microsoft Graph Todo list type (simplified)
 */
interface TodoList {
  id?: string;
  displayName?: string;
  wellknownListName?: string;
}

/**
 * Priority mapping: MS importance → CoreLink priority (1-4)
 */
function importanceToPriority(importance?: string): number {
  switch (importance) {
    case 'high': return 4;
    case 'normal': return 2;
    case 'low': return 1;
    default: return 2;
  }
}

/**
 * Priority mapping: CoreLink priority (1-4) → MS importance
 */
function priorityToImportance(priority?: number): 'low' | 'normal' | 'high' {
  if (!priority) return 'normal';
  if (priority >= 4) return 'high';
  if (priority >= 3) return 'high';
  if (priority >= 2) return 'normal';
  return 'low';
}

export class MicrosoftTodoProvider implements ITaskProvider {
  /**
   * List tasks from a Microsoft Todo account
   */
  async listTasks(account: Account, args: ListTasksArgs): Promise<Task[]> {
    const client = this.getGraphClient(account);
    const maxResults = args.max_results || 20;

    // Build OData filter
    const odataFilter = this.buildODataFilter(args);

    // If a specific list is requested, query just that one
    if (args.project_id) {
      const response = await client
        .api(`/me/todo/lists/${args.project_id}/tasks`)
        .top(maxResults)
        .filter(odataFilter)
        .get();
      const tasks: TodoTask[] = response.value || [];
      return tasks.map(task => this.normalizeTask(task, account, args.project_id!));
    }

    // Otherwise fetch from ALL lists in parallel
    const listsResponse = await client.api('/me/todo/lists').get();
    const lists: TodoList[] = listsResponse.value || [];

    const perList = Math.ceil(maxResults / Math.max(lists.length, 1));

    const taskArrays = await Promise.all(
      lists.map(async list => {
        try {
          const response = await client
            .api(`/me/todo/lists/${list.id}/tasks`)
            .top(perList)
            .filter(odataFilter)
            .get();
          const tasks: TodoTask[] = response.value || [];
          return tasks.map(task => this.normalizeTask(task, account, list.id!, list.displayName));
        } catch {
          return [];
        }
      })
    );

    return taskArrays.flat().slice(0, maxResults);
  }

  /**
   * Create a new task in Microsoft Todo
   */
  async createTask(account: Account, args: CreateTaskArgs): Promise<Task> {
    const client = this.getGraphClient(account);
    const listId = args.project_id || await this.getDefaultListId(client);

    const taskBody: Record<string, unknown> = {
      title: args.title,
      importance: priorityToImportance(args.priority),
    };

    if (args.description) {
      taskBody.body = { content: args.description, contentType: 'text' };
    }

    if (args.due_date) {
      taskBody.dueDateTime = {
        dateTime: new Date(args.due_date).toISOString(),
        timeZone: 'UTC',
      };
    }

    const task: TodoTask = await client
      .api(`/me/todo/lists/${listId}/tasks`)
      .post(taskBody);

    return this.normalizeTask(task, account, listId);
  }

  /**
   * Update an existing task in Microsoft Todo
   */
  async updateTask(account: Account, args: UpdateTaskArgs): Promise<Task> {
    const client = this.getGraphClient(account);

    // Task ID format: "listId:taskId" or just taskId (we'll try to resolve)
    const { listId, taskId } = this.parseTaskId(args.task_id);
    const resolvedListId = listId || await this.getDefaultListId(client);

    const updateBody: Record<string, unknown> = {};

    if (args.title) updateBody.title = args.title;
    if (args.priority !== undefined) updateBody.importance = priorityToImportance(args.priority);
    if (args.description !== undefined) {
      updateBody.body = { content: args.description, contentType: 'text' };
    }
    if (args.due_date !== undefined) {
      updateBody.dueDateTime = args.due_date
        ? { dateTime: new Date(args.due_date).toISOString(), timeZone: 'UTC' }
        : null;
    }

    const task: TodoTask = await client
      .api(`/me/todo/lists/${resolvedListId}/tasks/${taskId}`)
      .patch(updateBody);

    return this.normalizeTask(task, account, resolvedListId);
  }

  /**
   * Mark a task as completed in Microsoft Todo
   */
  async completeTask(account: Account, taskIdStr: string): Promise<TaskResult> {
    const client = this.getGraphClient(account);
    const { listId, taskId } = this.parseTaskId(taskIdStr);
    const resolvedListId = listId || await this.getDefaultListId(client);

    try {
      await client
        .api(`/me/todo/lists/${resolvedListId}/tasks/${taskId}`)
        .patch({ status: 'completed' });

      return { success: true, taskId: taskIdStr };
    } catch (error) {
      return {
        success: false,
        taskId: taskIdStr,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Build OData filter string from structured ListTasksArgs
   */
  private buildODataFilter(args: ListTasksArgs): string {
    const parts: string[] = ["status ne 'completed'"];

    if (args.priority !== undefined) {
      const importance = priorityToImportance(args.priority);
      parts.push(`importance eq '${importance}'`);
    }

    const today = new Date().toISOString();

    if (args.overdue) {
      parts.push(`dueDateTime/dateTime lt '${today}'`);
    }
    if (args.due_before) {
      parts.push(`dueDateTime/dateTime lt '${new Date(args.due_before).toISOString()}'`);
    }
    if (args.due_after) {
      parts.push(`dueDateTime/dateTime gt '${new Date(args.due_after).toISOString()}'`);
    }

    return parts.join(' and ');
  }

  /**
   * Create authenticated Microsoft Graph client
   */
  private getGraphClient(account: Account): Client {
    const metadata = account.metadata as any;
    if (!metadata?.accessToken) {
      throw new Error(`No access token found for account: ${account.email}`);
    }

    return Client.init({
      authProvider: done => {
        done(null, metadata.accessToken);
      },
    });
  }

  /**
   * Get the default Todo list ID
   */
  private async getDefaultListId(client: Client): Promise<string> {
    const response = await client.api('/me/todo/lists').get();
    const lists: TodoList[] = response.value || [];

    const defaultList = lists.find(l => l.wellknownListName === 'defaultList');
    if (defaultList?.id) {
      return defaultList.id;
    }

    // Fallback to first list
    if (lists[0]?.id) {
      return lists[0].id;
    }

    throw new Error('No Microsoft Todo lists found');
  }

  /**
   * Parse task ID - MS Todo tasks are stored with format "listId:taskId" for cross-list support
   * Falls back to treating the full string as just the taskId
   */
  private parseTaskId(taskIdStr: string): { listId?: string; taskId: string } {
    const colonIndex = taskIdStr.indexOf(':');
    if (colonIndex > 0) {
      return {
        listId: taskIdStr.substring(0, colonIndex),
        taskId: taskIdStr.substring(colonIndex + 1),
      };
    }
    return { taskId: taskIdStr };
  }

  /**
   * Normalize Microsoft Graph task to CoreLink Task type
   */
  private normalizeTask(task: TodoTask, account: Account, listId: string, listName?: string): Task {
    // Store taskId as "listId:taskId" for update/complete operations
    const compositeId = `${listId}:${task.id}`;

    return {
      id: compositeId,
      accountId: account.id,
      providerId: account.pluginId,
      title: task.title || '',
      description: task.body?.content || undefined,
      due: task.dueDateTime?.dateTime
        ? new Date(task.dueDateTime.dateTime).toISOString().split('T')[0]
        : undefined,
      priority: importanceToPriority(task.importance),
      status: task.status === 'completed' ? 'completed' : 'active',
      projectId: listId,
      projectName: listName,
      createdAt: task.createdDateTime || undefined,
      completedAt: task.completedDateTime?.dateTime || undefined,
      raw: task as unknown as Record<string, unknown>,
    };
  }
}
