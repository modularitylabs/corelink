# Microsoft Todo Plugin (MEDIUM PRIORITY)

## Goal

Add task management for Microsoft 365 users by implementing the Microsoft Todo plugin using the Microsoft Graph API. This completes the Microsoft productivity suite (email + calendar + tasks) and reuses all existing Microsoft infrastructure.

## Motivation

- Microsoft Todo is the default task app for Office 365 and Microsoft Teams users — large overlap with the existing Outlook user base
- `@microsoft/microsoft-graph-client` is already a dependency — zero new library setup
- The Microsoft Graph Tasks API (`/me/todo/lists`) is consistent with the Calendar and Mail APIs already implemented
- Adds `Outlook + Microsoft Todo` parity to `Gmail + Google Tasks` (even without a Google Tasks plugin yet, the abstraction is in place)
- Completes the Microsoft suite, making CoreLink fully useful for Microsoft-centric workflows

## Standard Tools

| Tool | Args | Description |
|------|------|-------------|
| `list_tasks` | `project_id?`, `filter?`, `max_results?` | List tasks from a Todo list (or all lists) |
| `create_task` | `title`, `description?`, `due_date?`, `priority?` | Create a new task |
| `update_task` | `task_id`, `title?`, `description?`, `due_date?`, `priority?` | Update an existing task |
| `complete_task` | `task_id` | Mark a task as complete |

Note: `project_id` maps to a Microsoft Todo list ID. If omitted, the default "Tasks" list is used.

## Implementation Plan

#### Phase 8.1: Plugin Scaffold

1. Create `plugins/microsoft-todo/` with `package.json` and `tsconfig.json`
2. Implement `MicrosoftTodoPlugin` using `@microsoft/microsoft-graph-client`

```typescript
import { Client } from '@microsoft/microsoft-graph-client';
import type { ICoreLinkPlugin, PluginTool } from '@corelink/core';
import { STANDARD_TOOLS } from '@corelink/core';

export class MicrosoftTodoPlugin implements ICoreLinkPlugin {
  readonly id = 'com.corelink.microsoft-todo';
  readonly name = 'Microsoft Todo';
  readonly version = '1.0.0';
  readonly category = 'task';

  constructor(private accessToken: string) {}

  private getClient(): Client {
    return Client.init({
      authProvider: (done) => done(null, this.accessToken),
    });
  }

  getTools(): PluginTool[] {
    return [
      { name: STANDARD_TOOLS.TASK_LIST, /* ... */ },
      { name: STANDARD_TOOLS.TASK_CREATE, /* ... */ },
      { name: STANDARD_TOOLS.TASK_UPDATE, /* ... */ },
      { name: STANDARD_TOOLS.TASK_COMPLETE, /* ... */ },
    ];
  }
}
```

#### Phase 8.2: OAuth Scope Extension

Add `Tasks.ReadWrite` to the Microsoft OAuth flow:

```typescript
// In outlook-oauth.ts — extend scopes
const scopes = [
  'https://graph.microsoft.com/Mail.ReadWrite',
  'https://graph.microsoft.com/Mail.Send',
  'https://graph.microsoft.com/Calendars.ReadWrite',
  'https://graph.microsoft.com/Tasks.ReadWrite',  // Add this
  'offline_access',
];
```

Same Microsoft app registration, same Client ID — just one more scope.

#### Phase 8.3: Tool Implementations

```typescript
private async listTasks(args: Record<string, unknown>) {
  const client = this.getClient();
  const listId = args.project_id as string ?? 'AQMkADAwATM0MDAAMS1iMmE5LTUzN2EtMDACLTAwCgAuAAADNvY0bPGF4EmCtGFvdORwIQEAAAIBEgAAABJsPlzUJXxLjV-YR-3TZQAAAB';
  // Use 'tasks' as shorthand for the default Tasks list
  const url = args.project_id
    ? `/me/todo/lists/${listId}/tasks`
    : '/me/todo/lists/tasks/tasks';

  const result = await client.api(url)
    .filter(args.filter as string | undefined ?? '')
    .top((args.max_results as number) ?? 20)
    .get();

  return result.value.map((t: any) => ({
    id: t.id,
    title: t.title,
    description: t.body?.content,
    due: t.dueDateTime?.dateTime,
    status: t.status,
    importance: t.importance,
  }));
}

private async createTask(args: Record<string, unknown>) {
  const client = this.getClient();
  const task = await client.api('/me/todo/lists/tasks/tasks').post({
    title: args.title as string,
    body: args.description ? { contentType: 'text', content: args.description } : undefined,
    dueDateTime: args.due_date ? { dateTime: args.due_date, timeZone: 'UTC' } : undefined,
    importance: args.priority === 4 ? 'high' : args.priority === 1 ? 'low' : 'normal',
  });
  return { id: task.id, title: task.title };
}

private async completeTask(args: Record<string, unknown>) {
  const client = this.getClient();
  await client.api(`/me/todo/lists/tasks/tasks/${args.task_id}`).patch({
    status: 'completed',
  });
  return { success: true };
}
```

#### Phase 8.4: Web UI Integration

- Add "Microsoft Todo" to the Microsoft connection card in `packages/web/src/App.tsx`
- Show task list connection status alongside email and calendar
- No separate auth step if `Tasks.ReadWrite` is already in the Microsoft OAuth scope

## Files to Create

- `plugins/microsoft-todo/package.json`
- `plugins/microsoft-todo/tsconfig.json`
- `plugins/microsoft-todo/src/index.ts`

## Files to Modify

- `packages/gateway/src/routes/outlook-oauth.ts` — Add `Tasks.ReadWrite` scope
- `packages/gateway/src/index.ts` — Register `MicrosoftTodoPlugin`
- `packages/web/src/App.tsx` — Add Microsoft Todo connection status

## Dependencies

Already available (shared from outlook plugin):
- `@microsoft/microsoft-graph-client`

No new dependencies needed.

## Estimated Time

4–6 hours

## Priority Justification

**Ranked #4** (after both calendar plugins) because:
1. Reuses identical Microsoft infrastructure — lowest marginal effort after Outlook Calendar
2. Completes the full Microsoft productivity suite (email + calendar + tasks = one OAuth)
3. Ranked below both calendar plugins because calendar is higher value for AI agent scheduling use cases
4. Todoist is ranked higher overall because it's already scaffolded; this ranks above storage plugins because it completes an abstraction layer rather than adding a new one

## Success Criteria

- [ ] `list_tasks` returns tasks from Microsoft Todo
- [ ] `create_task` creates a task visible in Microsoft Todo app
- [ ] `update_task` modifies task fields
- [ ] `complete_task` marks a task as complete
- [ ] Uses existing Microsoft OAuth credentials (one re-auth to add scope)
- [ ] Web UI shows Microsoft Todo connection status
- [ ] Works alongside Todoist under the same `TASK_*` standard tool interface
