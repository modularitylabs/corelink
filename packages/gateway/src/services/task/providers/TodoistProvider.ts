/**
 * Todoist Task Provider
 *
 * Implements ITaskProvider for Todoist using the Todoist REST API v1.
 * Uses raw fetch — no SDK dependency required.
 */

import type { ITaskProvider } from '../ITaskProvider.js';
import type { Account, Task, TaskResult, ListTasksArgs, CreateTaskArgs, UpdateTaskArgs } from '../types.js';

const TODOIST_API = 'https://api.todoist.com/api/v1';

export class TodoistProvider implements ITaskProvider {
  async listTasks(account: Account, args: ListTasksArgs): Promise<Task[]> {
    const token = this.getToken(account);
    const params = new URLSearchParams();
    if (args.project_id) params.set('project_id', args.project_id);

    // Build filter string from structured args + any native filter
    const filterParts: string[] = [];
    if (args.filter) filterParts.push(args.filter);
    if (args.overdue) filterParts.push('overdue');
    if (args.priority) filterParts.push(`p${args.priority}`);
    if (args.due_before) filterParts.push(`due before: ${args.due_before}`);
    if (args.due_after) filterParts.push(`due after: ${args.due_after}`);
    if (filterParts.length > 0) params.set('filter', filterParts.join(' & '));

    const url = `${TODOIST_API}/tasks${params.size > 0 ? '?' + params.toString() : ''}`;
    const response = await fetch(url, { headers: this.headers(token) });

    if (!response.ok) {
      throw new Error(`Todoist listTasks failed: ${response.status} ${await response.text()}`);
    }

    const tasks = (await response.json()) as any[];
    const maxResults = args.max_results || 20;
    return tasks.slice(0, maxResults).map(t => this.normalize(t, account));
  }

  async createTask(account: Account, args: CreateTaskArgs): Promise<Task> {
    const token = this.getToken(account);
    const body: Record<string, unknown> = { content: args.title };
    if (args.description) body.description = args.description;
    if (args.due_date) body.due_date = args.due_date;
    if (args.priority) body.priority = args.priority;
    if (args.project_id) body.project_id = args.project_id;

    const response = await fetch(`${TODOIST_API}/tasks`, {
      method: 'POST',
      headers: { ...this.headers(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Todoist createTask failed: ${response.status} ${await response.text()}`);
    }

    return this.normalize(await response.json(), account);
  }

  async updateTask(account: Account, args: UpdateTaskArgs): Promise<Task> {
    const token = this.getToken(account);
    const body: Record<string, unknown> = {};
    if (args.title !== undefined) body.content = args.title;
    if (args.description !== undefined) body.description = args.description;
    if (args.due_date !== undefined) body.due_date = args.due_date;
    if (args.priority !== undefined) body.priority = args.priority;

    const response = await fetch(`${TODOIST_API}/tasks/${args.task_id}`, {
      method: 'POST',
      headers: { ...this.headers(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Todoist updateTask failed: ${response.status} ${await response.text()}`);
    }

    return this.normalize(await response.json(), account);
  }

  async completeTask(account: Account, taskId: string): Promise<TaskResult> {
    const token = this.getToken(account);

    const response = await fetch(`${TODOIST_API}/tasks/${taskId}/close`, {
      method: 'POST',
      headers: this.headers(token),
    });

    if (!response.ok) {
      const text = await response.text();
      return { success: false, taskId, error: `${response.status} ${text}` };
    }

    return { success: true, taskId };
  }

  private getToken(account: Account): string {
    const token = (account.metadata as any)?.accessToken as string | undefined;
    if (!token) throw new Error(`No access token found for account: ${account.email}`);
    return token;
  }

  private headers(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
  }

  /**
   * Normalize Todoist task to CoreLink Task type.
   * Todoist priority: 1=normal, 2=medium, 3=high, 4=urgent (already 1–4).
   */
  private normalize(task: any, account: Account): Task {
    return {
      id: task.id,
      accountId: account.id,
      providerId: account.pluginId,
      title: task.content,
      description: task.description || undefined,
      due: task.due?.date || undefined,
      priority: task.priority,
      status: task.is_completed ? 'completed' : 'active',
      projectId: task.project_id || undefined,
      createdAt: task.created_at || undefined,
      raw: task,
    };
  }
}
