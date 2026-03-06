# Todoist Plugin (HIGHEST PRIORITY)

## Goal

Implement the Todoist task plugin to complete the task management abstraction layer. The scaffold already exists (`plugins/todoist/`) with dependencies installed — this is the lowest-effort, highest-value plugin in the backlog.

## Motivation

- Completes the task use-case across providers (pairs with Microsoft Todo for the same abstraction Gmail/Outlook provide for email)
- `plugins/todoist/` is already scaffolded with `package.json`, `tsconfig.json`, and `@doist/todoist-api-typescript` installed
- Todoist has a large user base and clean REST API — high user demand with minimal implementation risk
- Validates the `TASK_*` standard tool constants already in `packages/core/src/index.ts`

## Standard Tools

| Tool | Args | Description |
|------|------|-------------|
| `list_tasks` | `project_id?`, `filter?`, `max_results?` | List tasks, optionally filtered by project or Todoist filter string |
| `create_task` | `title`, `description?`, `due_date?`, `priority?` | Create a new task |
| `update_task` | `task_id`, `title?`, `description?`, `due_date?`, `priority?` | Update an existing task |
| `complete_task` | `task_id` | Mark a task as complete |

## Implementation Plan

#### Phase 7.1: Plugin Scaffold Completion

1. Create `plugins/todoist/src/index.ts` implementing `ICoreLinkPlugin`
2. Use `TodoistApi` from `@doist/todoist-api-typescript`
3. Auth method: OAuth 2.0 (Todoist supports PKCE) or API token (simpler for v1)

```typescript
import { TodoistApi } from '@doist/todoist-api-typescript';
import type { ICoreLinkPlugin, PluginTool } from '@corelink/core';
import { STANDARD_TOOLS } from '@corelink/core';

export class TodoistPlugin implements ICoreLinkPlugin {
  readonly id = 'com.corelink.todoist';
  readonly name = 'Todoist';
  readonly version = '1.0.0';
  readonly category = 'task';

  private api: TodoistApi;

  constructor(private apiToken: string) {
    this.api = new TodoistApi(apiToken);
  }

  getTools(): PluginTool[] {
    return [
      { name: STANDARD_TOOLS.TASK_LIST, /* ... */ },
      { name: STANDARD_TOOLS.TASK_CREATE, /* ... */ },
      { name: STANDARD_TOOLS.TASK_UPDATE, /* ... */ },
      { name: STANDARD_TOOLS.TASK_COMPLETE, /* ... */ },
    ];
  }

  async executeTool(name: string, args: Record<string, unknown>) {
    switch (name) {
      case STANDARD_TOOLS.TASK_LIST:
        return this.listTasks(args);
      case STANDARD_TOOLS.TASK_CREATE:
        return this.createTask(args);
      case STANDARD_TOOLS.TASK_UPDATE:
        return this.updateTask(args);
      case STANDARD_TOOLS.TASK_COMPLETE:
        return this.completeTask(args);
    }
  }
}
```

#### Phase 7.2: OAuth / API Token Auth Route (gateway)

**Option A — API Token (v1, simpler)**:
- Add a `/api/todoist/connect` endpoint that accepts an API token (from Todoist settings)
- Store encrypted via `CredentialManager` under key `todoist:<accountId>`
- No OAuth callback needed

**Option B — OAuth 2.0 PKCE (v2, consistent with other plugins)**:
- Register app at `https://developer.todoist.com/appconsole.html`
- Add `packages/gateway/src/routes/todoist-oauth.ts` following the pattern of `oauth.ts` (Gmail)
- Scopes: `data:read_write,data:delete`

Start with Option A for speed; migrate to Option B when standardizing auth.

#### Phase 7.3: Tool Implementations

```typescript
private async listTasks(args: Record<string, unknown>) {
  const tasks = await this.api.getTasks({
    projectId: args.project_id as string | undefined,
    filter: args.filter as string | undefined,
  });
  return tasks.slice(0, (args.max_results as number) ?? 20).map(t => ({
    id: t.id,
    title: t.content,
    description: t.description,
    due: t.due?.date,
    priority: t.priority,
    projectId: t.projectId,
  }));
}

private async createTask(args: Record<string, unknown>) {
  const task = await this.api.addTask({
    content: args.title as string,
    description: args.description as string | undefined,
    dueDate: args.due_date as string | undefined,
    priority: args.priority as number | undefined,
  });
  return { id: task.id, title: task.content };
}

private async updateTask(args: Record<string, unknown>) {
  await this.api.updateTask(args.task_id as string, {
    content: args.title as string | undefined,
    description: args.description as string | undefined,
    dueDate: args.due_date as string | undefined,
    priority: args.priority as number | undefined,
  });
  return { success: true };
}

private async completeTask(args: Record<string, unknown>) {
  await this.api.closeTask(args.task_id as string);
  return { success: true };
}
```

#### Phase 7.4: Web UI Integration

- Add a "Todoist" connection card to `packages/web/src/App.tsx`
- For API token auth: show a text input + "Connect" button
- For OAuth: show the standard "Connect with Todoist" OAuth button
- Display connected account label (fetch from `GET /me` endpoint)

## Files to Create

- `plugins/todoist/src/index.ts` — Main plugin implementation
- `packages/gateway/src/routes/todoist-oauth.ts` — OAuth routes (or API token endpoint)

## Files to Modify

- `packages/gateway/src/index.ts` — Register Todoist routes + plugin instance
- `packages/web/src/App.tsx` — Add Todoist connection card

## Dependencies

Already installed:
- `@doist/todoist-api-typescript` (in `plugins/todoist/node_modules/`)

No new dependencies needed.

## Estimated Time

4–6 hours (API token auth) | 6–8 hours (OAuth 2.0 PKCE)

## Priority Justification

**Ranked #1** because:
1. Scaffold already exists — `plugins/todoist/` has `package.json`, `tsconfig.json`, and installed deps
2. Zero new library setup cost — `@doist/todoist-api-typescript` is a clean, well-documented SDK
3. Completes the task abstraction layer, making CoreLink useful for AI agents that manage to-dos
4. Todoist's REST API is simpler than Google/Microsoft Graph — fastest path to a working plugin

## Success Criteria

- [ ] `list_tasks` returns tasks from Todoist account via MCP
- [ ] `create_task` creates a task visible in Todoist app
- [ ] `update_task` modifies an existing task
- [ ] `complete_task` closes a task
- [ ] Credentials stored encrypted in SQLite
- [ ] Web UI shows Todoist connection status
- [ ] Plugin registered in gateway and loads on startup
