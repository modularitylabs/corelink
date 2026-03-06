/**
 * Google Calendar Provider
 *
 * Implements ICalendarProvider for Google Calendar using the googleapis library.
 */

import { google } from 'googleapis';
import type { ICalendarProvider } from '../ICalendarProvider.js';
import type { Account, CalendarEvent, ListEventsArgs, CreateEventArgs, UpdateEventArgs } from '../types.js';

export class GoogleCalendarProvider implements ICalendarProvider {
  private getCalendar(account: Account) {
    const metadata = account.metadata as any;
    if (!metadata?.accessToken) {
      throw new Error(`No access token found for account: ${account.email}`);
    }
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: metadata.accessToken });
    return google.calendar({ version: 'v3', auth });
  }

  async listEvents(account: Account, args: ListEventsArgs): Promise<CalendarEvent[]> {
    const calendar = this.getCalendar(account);
    const maxResults = args.max_results || 20;

    const params: Record<string, unknown> = {
      calendarId: args.calendar_id || 'primary',
      maxResults,
      singleEvents: true,
      orderBy: 'startTime',
    };

    if (args.start_date) params.timeMin = new Date(args.start_date).toISOString();
    if (args.end_date) params.timeMax = new Date(args.end_date).toISOString();
    if (args.query) params.q = args.query;

    const response = await calendar.events.list(params as any);
    const events = response.data.items || [];

    return events.map(e => this.normalize(e, account, args.calendar_id || 'primary'));
  }

  async createEvent(account: Account, args: CreateEventArgs): Promise<CalendarEvent> {
    const calendar = this.getCalendar(account);
    const calendarId = args.calendar_id || 'primary';

    const resource: Record<string, unknown> = {
      summary: args.title,
      start: { dateTime: args.start_time },
      end: { dateTime: args.end_time },
    };

    if (args.description) resource.description = args.description;
    if (args.attendees && args.attendees.length > 0) {
      resource.attendees = args.attendees.map(email => ({ email }));
    }

    const response = await calendar.events.insert({
      calendarId,
      requestBody: resource,
    });

    return this.normalize(response.data, account, calendarId);
  }

  async updateEvent(account: Account, args: UpdateEventArgs): Promise<CalendarEvent> {
    const calendar = this.getCalendar(account);
    const calendarId = 'primary';

    const resource: Record<string, unknown> = {};
    if (args.title !== undefined) resource.summary = args.title;
    if (args.start_time !== undefined) resource.start = { dateTime: args.start_time };
    if (args.end_time !== undefined) resource.end = { dateTime: args.end_time };
    if (args.description !== undefined) resource.description = args.description;
    if (args.attendees !== undefined) {
      resource.attendees = args.attendees.map(email => ({ email }));
    }

    const response = await calendar.events.patch({
      calendarId,
      eventId: args.event_id,
      requestBody: resource,
    });

    return this.normalize(response.data, account, calendarId);
  }

  async deleteEvent(account: Account, eventId: string): Promise<{ success: boolean }> {
    const calendar = this.getCalendar(account);
    try {
      await calendar.events.delete({ calendarId: 'primary', eventId });
      return { success: true };
    } catch (error) {
      console.error(`[GoogleCalendarProvider] deleteEvent failed:`, error);
      return { success: false };
    }
  }

  private normalize(e: any, account: Account, calendarId: string): CalendarEvent {
    const isAllDay = !!(e.start?.date && !e.start?.dateTime);
    return {
      id: e.id || '',
      accountId: account.id,
      providerId: account.pluginId,
      title: e.summary || '(No title)',
      description: e.description || undefined,
      startTime: e.start?.dateTime ?? e.start?.date ?? '',
      endTime: e.end?.dateTime ?? e.end?.date ?? '',
      location: e.location || undefined,
      attendees: e.attendees?.map((a: any) => a.email).filter(Boolean) || undefined,
      calendarId,
      isAllDay,
      raw: e,
    };
  }
}
