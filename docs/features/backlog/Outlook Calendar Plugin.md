# Outlook Calendar Plugin (HIGH PRIORITY)

## Goal

Add calendar support for Microsoft 365 accounts by implementing the Outlook Calendar plugin using the Microsoft Graph API. This reuses the exact same OAuth flow and client library already in place for the Outlook email plugin.

## Motivation

- Users who already connected their Outlook account for email expect calendar access too
- `@microsoft/microsoft-graph-client` is already a project dependency (used by `plugins/outlook/`)
- The OAuth routes in `packages/gateway/src/routes/outlook-oauth.ts` are reusable — no new app registration needed (same Microsoft app, add `Calendars.ReadWrite` scope)
- Completes the Microsoft suite: email ✓ → calendar → tasks (Microsoft Todo)
- AI agents can schedule meetings, check availability, and create events with the same credentials

## Standard Tools

| Tool | Args | Description |
|------|------|-------------|
| `list_calendar_events` | `calendar_id?`, `start_date?`, `end_date?`, `max_results?` | List events from the user's calendar |
| `create_calendar_event` | `title`, `start_time`, `end_time`, `description?`, `attendees?` | Create a new calendar event |
| `update_calendar_event` | `event_id`, `title?`, `start_time?`, `end_time?`, `description?`, `attendees?` | Update an existing event |
| `delete_calendar_event` | `event_id` | Delete a calendar event |

## Implementation Plan

#### Phase 6.2.1: Plugin Scaffold

1. Create `plugins/outlook-calendar/` directory with `package.json` and `tsconfig.json`
2. Implement `OutlookCalendarPlugin` using `@microsoft/microsoft-graph-client`

```typescript
import { Client } from '@microsoft/microsoft-graph-client';
import type { ICoreLinkPlugin, PluginTool } from '@corelink/core';
import { STANDARD_TOOLS } from '@corelink/core';

export class OutlookCalendarPlugin implements ICoreLinkPlugin {
  readonly id = 'com.corelink.outlook-calendar';
  readonly name = 'Outlook Calendar';
  readonly version = '1.0.0';
  readonly category = 'calendar';

  constructor(private accessToken: string) {}

  private getClient(): Client {
    return Client.init({
      authProvider: (done) => done(null, this.accessToken),
    });
  }

  getTools(): PluginTool[] {
    return [
      { name: STANDARD_TOOLS.CALENDAR_LIST_EVENTS, /* ... */ },
      { name: STANDARD_TOOLS.CALENDAR_CREATE_EVENT, /* ... */ },
      { name: STANDARD_TOOLS.CALENDAR_UPDATE_EVENT, /* ... */ },
      { name: 'delete_calendar_event', /* ... */ },
    ];
  }
}
```

#### Phase 6.2.2: OAuth Scope Extension

The existing Microsoft app registration needs `Calendars.ReadWrite` added:
- Add scope to the OAuth authorization URL in `packages/gateway/src/routes/outlook-oauth.ts`
- Or create a separate calendar-specific OAuth flow if scope separation is desired

```typescript
// In outlook-oauth.ts — extend scopes
const scopes = [
  'https://graph.microsoft.com/Mail.ReadWrite',
  'https://graph.microsoft.com/Mail.Send',
  'https://graph.microsoft.com/Calendars.ReadWrite',  // Add this
  'offline_access',
];
```

No new app registration needed — same Client ID, same redirect URI.

#### Phase 6.2.3: Tool Implementations

```typescript
private async listCalendarEvents(args: Record<string, unknown>) {
  const client = this.getClient();
  const calendarId = args.calendar_id as string ?? 'primary';

  let url = calendarId === 'primary'
    ? '/me/calendarView'
    : `/me/calendars/${calendarId}/calendarView`;

  const startDateTime = args.start_date as string ?? new Date().toISOString();
  const endDateTime = args.end_date as string ?? new Date(Date.now() + 7 * 86400000).toISOString();

  const events = await client
    .api(url)
    .query({ startDateTime, endDateTime })
    .top((args.max_results as number) ?? 20)
    .get();

  return events.value.map((e: any) => ({
    id: e.id,
    title: e.subject,
    start: e.start.dateTime,
    end: e.end.dateTime,
    description: e.bodyPreview,
    attendees: e.attendees?.map((a: any) => a.emailAddress.address),
  }));
}

private async createCalendarEvent(args: Record<string, unknown>) {
  const client = this.getClient();
  const event = await client.api('/me/events').post({
    subject: args.title,
    start: { dateTime: args.start_time, timeZone: 'UTC' },
    end: { dateTime: args.end_time, timeZone: 'UTC' },
    body: { contentType: 'Text', content: args.description ?? '' },
    attendees: (args.attendees as string[] ?? []).map(email => ({
      emailAddress: { address: email },
      type: 'required',
    })),
  });
  return { id: event.id, title: event.subject };
}
```

#### Phase 6.2.4: Web UI Integration

- Add "Outlook Calendar" section to the Outlook connection card in `packages/web/src/App.tsx`
- If scopes already include `Calendars.ReadWrite`, show calendar status alongside email status
- Otherwise, add a "Grant Calendar Access" button that re-triggers OAuth with the extended scope

## Files to Create

- `plugins/outlook-calendar/package.json`
- `plugins/outlook-calendar/tsconfig.json`
- `plugins/outlook-calendar/src/index.ts`

## Files to Modify

- `packages/gateway/src/routes/outlook-oauth.ts` — Add `Calendars.ReadWrite` scope
- `packages/gateway/src/index.ts` — Register `OutlookCalendarPlugin`
- `packages/web/src/App.tsx` — Add calendar connection status

## Dependencies

Already available (shared from outlook plugin):
- `@microsoft/microsoft-graph-client`

No new dependencies needed.

## Estimated Time

5–7 hours

## Priority Justification

**Ranked #2** because:
1. Zero new library or OAuth app setup — reuses everything from the Outlook email plugin
2. Adding a scope to an existing OAuth flow is the only infrastructure change
3. Microsoft Graph calendar API is well-documented and consistent with the email API already implemented
4. Completes the Microsoft productivity suite in one step (email + calendar share credentials)

## Success Criteria

- [ ] `list_calendar_events` returns events from the connected Outlook account
- [ ] `create_calendar_event` creates an event visible in Outlook/Teams calendar
- [ ] `update_calendar_event` modifies event fields
- [ ] `delete_calendar_event` removes an event
- [ ] Uses existing Microsoft OAuth credentials (no re-auth if scope already granted)
- [ ] Web UI shows Outlook Calendar connection status
