/**
 * Outlook Calendar Provider
 *
 * Implements ICalendarProvider for Outlook/Microsoft 365 Calendar
 * using the Microsoft Graph API client.
 */

import { Client } from '@microsoft/microsoft-graph-client';
import type { ICalendarProvider } from '../ICalendarProvider.js';
import type { Account, CalendarEvent, ListEventsArgs, CreateEventArgs, UpdateEventArgs } from '../types.js';

export class OutlookCalendarProvider implements ICalendarProvider {
  private getClient(account: Account): Client {
    const metadata = account.metadata as any;
    if (!metadata?.accessToken) {
      throw new Error(`No access token found for account: ${account.email}`);
    }
    return Client.init({
      authProvider: done => done(null, metadata.accessToken),
    });
  }

  async listEvents(account: Account, args: ListEventsArgs): Promise<CalendarEvent[]> {
    const client = this.getClient(account);
    const maxResults = args.max_results || 20;

    // Default time range: now to +7 days if not specified
    const startDateTime = args.start_date
      ? new Date(args.start_date).toISOString()
      : new Date().toISOString();
    const endDateTime = args.end_date
      ? new Date(args.end_date).toISOString()
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    let api = client
      .api('/me/calendarView')
      .query({ startDateTime, endDateTime })
      .top(maxResults)
      .orderby('start/dateTime');

    if (args.query) {
      const escaped = args.query.replace(/'/g, "''");
      api = api.filter(`contains(subject,'${escaped}')`);
    }

    const response = await api.get();
    const events: any[] = response.value || [];

    return events.map(e => this.normalize(e, account));
  }

  async createEvent(account: Account, args: CreateEventArgs): Promise<CalendarEvent> {
    const client = this.getClient(account);

    const body: Record<string, unknown> = {
      subject: args.title,
      start: { dateTime: args.start_time, timeZone: 'UTC' },
      end: { dateTime: args.end_time, timeZone: 'UTC' },
    };

    if (args.description) {
      body.body = { contentType: 'text', content: args.description };
    }

    if (args.attendees && args.attendees.length > 0) {
      body.attendees = args.attendees.map(email => ({
        emailAddress: { address: email },
        type: 'required',
      }));
    }

    const event = await client.api('/me/events').post(body);
    return this.normalize(event, account);
  }

  async updateEvent(account: Account, args: UpdateEventArgs): Promise<CalendarEvent> {
    const client = this.getClient(account);

    const body: Record<string, unknown> = {};
    if (args.title !== undefined) body.subject = args.title;
    if (args.start_time !== undefined) body.start = { dateTime: args.start_time, timeZone: 'UTC' };
    if (args.end_time !== undefined) body.end = { dateTime: args.end_time, timeZone: 'UTC' };
    if (args.description !== undefined) {
      body.body = { contentType: 'text', content: args.description };
    }
    if (args.attendees !== undefined) {
      body.attendees = args.attendees.map(email => ({
        emailAddress: { address: email },
        type: 'required',
      }));
    }

    const event = await client.api(`/me/events/${args.event_id}`).patch(body);
    return this.normalize(event, account);
  }

  async deleteEvent(account: Account, eventId: string): Promise<{ success: boolean }> {
    const client = this.getClient(account);
    try {
      await client.api(`/me/events/${eventId}`).delete();
      return { success: true };
    } catch (error) {
      console.error(`[OutlookCalendarProvider] deleteEvent failed:`, error);
      return { success: false };
    }
  }

  private normalize(e: any, account: Account): CalendarEvent {
    const isAllDay = !!e.isAllDay;
    return {
      id: e.id || '',
      accountId: account.id,
      providerId: account.pluginId,
      title: e.subject || '(No title)',
      description: e.bodyPreview || e.body?.content || undefined,
      startTime: e.start?.dateTime ? new Date(e.start.dateTime).toISOString() : (e.start?.date ?? ''),
      endTime: e.end?.dateTime ? new Date(e.end.dateTime).toISOString() : (e.end?.date ?? ''),
      location: e.location?.displayName || undefined,
      attendees: e.attendees
        ?.map((a: any) => a.emailAddress?.address)
        .filter(Boolean) || undefined,
      isAllDay,
      raw: e,
    };
  }
}
