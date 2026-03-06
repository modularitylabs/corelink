/**
 * CoreLink Calendar Provider Interface
 *
 * Defines the standard contract that all calendar providers must implement.
 * This enables service abstraction across Google Calendar, Outlook Calendar, etc.
 */

import type { Account, CalendarEvent, ListEventsArgs, CreateEventArgs, UpdateEventArgs } from './types.js';

export interface ICalendarProvider {
  listEvents(account: Account, args: ListEventsArgs): Promise<CalendarEvent[]>;
  createEvent(account: Account, args: CreateEventArgs): Promise<CalendarEvent>;
  updateEvent(account: Account, args: UpdateEventArgs): Promise<CalendarEvent>;
  deleteEvent(account: Account, eventId: string): Promise<{ success: boolean }>;
}
