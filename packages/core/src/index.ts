/**
 * CoreLink Core Package
 *
 * Shared types, utilities, and interfaces for the CoreLink ecosystem.
 */

export * from './types/index.js';

/**
 * Package version
 */
export const VERSION = '0.1.0';

/**
 * Standard tool names for service abstraction
 * These are the "universal" tool names that plugins should implement
 */
export const STANDARD_TOOLS = {
  // Email
  EMAIL_LIST: 'list_emails',
  EMAIL_SEND: 'send_email',
  EMAIL_SEARCH: 'search_emails',
  EMAIL_READ: 'read_email',

  // Tasks
  TASK_CREATE: 'create_task',
  TASK_LIST: 'list_tasks',
  TASK_UPDATE: 'update_task',
  TASK_COMPLETE: 'complete_task',

  // Calendar
  CALENDAR_CREATE_EVENT: 'create_calendar_event',
  CALENDAR_LIST_EVENTS: 'list_calendar_events',
  CALENDAR_UPDATE_EVENT: 'update_calendar_event',

  // Notes
  NOTE_CREATE: 'create_note',
  NOTE_SEARCH: 'search_notes',
  NOTE_READ: 'read_note',
  NOTE_UPDATE: 'update_note',
} as const;

export type StandardToolName = (typeof STANDARD_TOOLS)[keyof typeof STANDARD_TOOLS];
