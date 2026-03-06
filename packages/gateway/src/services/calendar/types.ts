/**
 * CoreLink Calendar Service Types
 *
 * Normalized types for calendar operations across different providers
 * (Google Calendar, Outlook Calendar, etc.)
 */

import type { Account as EmailAccount } from '../email/types.js';

/**
 * Re-export Account type (same shape as email/task Account)
 */
export type Account = EmailAccount;

/**
 * Normalized calendar event structure
 */
export interface CalendarEvent {
  id: string;
  accountId: string;
  providerId: string;
  title: string;
  description?: string;
  startTime: string;    // ISO8601
  endTime: string;      // ISO8601
  location?: string;
  attendees?: string[];
  calendarId?: string;
  isAllDay?: boolean;
  raw?: Record<string, unknown>;
}

/**
 * Arguments for listing calendar events
 */
export interface ListEventsArgs {
  calendar_id?: string;
  start_date?: string;   // ISO8601
  end_date?: string;     // ISO8601
  max_results?: number;
  query?: string;
}

/**
 * Arguments for creating a calendar event
 */
export interface CreateEventArgs {
  title: string;
  start_time: string;   // ISO8601
  end_time: string;     // ISO8601
  description?: string;
  attendees?: string[];
  calendar_id?: string;
}

/**
 * Arguments for updating a calendar event
 */
export interface UpdateEventArgs {
  event_id: string;
  title?: string;
  start_time?: string;
  end_time?: string;
  description?: string;
  attendees?: string[];
}
