# Google Calendar Plugin (HIGH PRIORITY)

## Goal

Add calendar support for Google accounts by implementing the Google Calendar plugin using the Google Calendar API. This reuses the `googleapis` library and PKCE OAuth flow already in place for the Gmail plugin.

## Motivation

- Users who connected Gmail for email naturally expect calendar access from the same Google account
- `googleapis` is already a dependency in `plugins/gmail/` — no new library installation needed
- The Gmail OAuth app can be extended with the `https://www.googleapis.com/auth/calendar` scope
- AI agents can read schedules, book meetings, and check availability via the same standard tools as Outlook Calendar
- Google Calendar is the most widely used calendar service globally — high user demand

## Standard Tools

| Tool | Args | Description |
|------|------|-------------|
| `list_calendar_events` | `calendar_id?`, `start_date?`, `end_date?`, `max_results?` | List events (defaults to primary calendar) |
| `create_calendar_event` | `title`, `start_time`, `end_time`, `description?`, `attendees?` | Create a new event |
| `update_calendar_event` | `event_id`, `title?`, `start_time?`, `end_time?`, `description?`, `attendees?` | Update an existing event |
| `delete_calendar_event` | `event_id` | Delete an event |

## Implementation Plan

#### Phase 6.1.1: Plugin Scaffold

1. Create `plugins/google-calendar/` with `package.json` and `tsconfig.json`
2. Implement `GoogleCalendarPlugin` using `googleapis`

```typescript
import { google } from 'googleapis';
import type { ICoreLinkPlugin, PluginTool } from '@corelink/core';
import { STANDARD_TOOLS } from '@corelink/core';

export class GoogleCalendarPlugin implements ICoreLinkPlugin {
  readonly id = 'com.corelink.google-calendar';
  readonly name = 'Google Calendar';
  readonly version = '1.0.0';
  readonly category = 'calendar';

  constructor(private accessToken: string) {}

  private getCalendar() {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: this.accessToken });
    return google.calendar({ version: 'v3', auth });
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

#### Phase 6.1.2: OAuth Scope Extension

The existing Google OAuth PKCE flow in `packages/gateway/src/routes/oauth.ts` needs `calendar` scope added:

```typescript
// In oauth.ts — extend scopes
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar',  // Add this
];
```

The same Google Cloud project, same Client ID — just add the scope. Users may need to re-authorize if they connected Gmail without the calendar scope.

#### Phase 6.1.3: Tool Implementations

```typescript
private async listCalendarEvents(args: Record<string, unknown>) {
  const calendar = this.getCalendar();
  const calendarId = args.calendar_id as string ?? 'primary';

  const res = await calendar.events.list({
    calendarId,
    timeMin: args.start_date as string ?? new Date().toISOString(),
    timeMax: args.end_date as string,
    maxResults: (args.max_results as number) ?? 20,
    singleEvents: true,
    orderBy: 'startTime',
  });

  return (res.data.items ?? []).map(e => ({
    id: e.id,
    title: e.summary,
    start: e.start?.dateTime ?? e.start?.date,
    end: e.end?.dateTime ?? e.end?.date,
    description: e.description,
    attendees: e.attendees?.map(a => a.email),
  }));
}

private async createCalendarEvent(args: Record<string, unknown>) {
  const calendar = this.getCalendar();
  const res = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: args.title as string,
      description: args.description as string | undefined,
      start: { dateTime: args.start_time as string, timeZone: 'UTC' },
      end: { dateTime: args.end_time as string, timeZone: 'UTC' },
      attendees: (args.attendees as string[] ?? []).map(email => ({ email })),
    },
  });
  return { id: res.data.id, title: res.data.summary };
}

private async updateCalendarEvent(args: Record<string, unknown>) {
  const calendar = this.getCalendar();
  const existing = await calendar.events.get({
    calendarId: 'primary',
    eventId: args.event_id as string,
  });
  await calendar.events.update({
    calendarId: 'primary',
    eventId: args.event_id as string,
    requestBody: {
      ...existing.data,
      summary: (args.title as string) ?? existing.data.summary,
      description: (args.description as string) ?? existing.data.description,
      start: args.start_time
        ? { dateTime: args.start_time as string, timeZone: 'UTC' }
        : existing.data.start,
      end: args.end_time
        ? { dateTime: args.end_time as string, timeZone: 'UTC' }
        : existing.data.end,
    },
  });
  return { success: true };
}

private async deleteCalendarEvent(args: Record<string, unknown>) {
  const calendar = this.getCalendar();
  await calendar.events.delete({
    calendarId: 'primary',
    eventId: args.event_id as string,
  });
  return { success: true };
}
```

#### Phase 6.1.4: Web UI Integration

- Add a "Google Calendar" section to the Gmail connection card in `packages/web/src/App.tsx`
- Show calendar connection status alongside email status
- Add a "Grant Calendar Access" button if the scope was not granted at initial Gmail connect

## Files to Create

- `plugins/google-calendar/package.json`
- `plugins/google-calendar/tsconfig.json`
- `plugins/google-calendar/src/index.ts`

## Files to Modify

- `packages/gateway/src/routes/oauth.ts` — Add `calendar` scope to Gmail OAuth flow
- `packages/gateway/src/index.ts` — Register `GoogleCalendarPlugin`
- `packages/web/src/App.tsx` — Add Google Calendar connection status

## Dependencies

Already available (shared from gmail plugin):
- `googleapis`

No new dependencies needed.

## Estimated Time

5–7 hours

## Priority Justification

**Ranked #3** (behind Outlook Calendar) because:
1. Reuses `googleapis` from Gmail — no new library needed
2. Same PKCE OAuth flow, just one extra scope
3. Slightly behind Outlook Calendar because the Microsoft Graph calendar API is more consistent with the email API already tested; Google Calendar API has its own date/time quirks to handle
4. High user demand (Google Calendar is ubiquitous)

## Success Criteria

- [ ] `list_calendar_events` returns events from Google Calendar
- [ ] `create_calendar_event` creates an event visible in Google Calendar
- [ ] `update_calendar_event` modifies event fields correctly
- [ ] `delete_calendar_event` removes an event
- [ ] Calendar scope added to Google OAuth without breaking existing Gmail flow
- [ ] Web UI shows Google Calendar connection status
- [ ] Works for multi-account (multiple Google accounts each get their own calendar)
