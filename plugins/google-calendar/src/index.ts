/**
 * Google Calendar Plugin for CoreLink
 *
 * Schema definitions for Google Calendar operations.
 * Execution is handled by the gateway via GoogleCalendarProvider.
 */

import {
  ActionResult,
  ConfigField,
  ExecutionContext,
  ICoreLinkPlugin,
  PluginError,
  STANDARD_TOOLS,
  ToolDefinition,
} from '@corelink/core';

export class GoogleCalendarPlugin implements ICoreLinkPlugin {
  readonly id = 'com.corelink.google-calendar';
  readonly name = 'Google Calendar';
  readonly version = '0.1.0';
  readonly category = 'calendar' as const;
  readonly description = 'Access Google Calendar events with granular control';

  getConfigSchema(): Record<string, ConfigField> {
    return {
      clientId: {
        type: 'text',
        label: 'Google Client ID',
        description: 'OAuth 2.0 Client ID from Google Cloud Console',
        required: true,
      },
    };
  }

  getStandardTools(): ToolDefinition[] {
    return [
      {
        name: STANDARD_TOOLS.CALENDAR_LIST_EVENTS,
        description: 'List events from Google Calendar',
        inputSchema: {
          type: 'object',
          properties: {
            calendar_id: { type: 'string', description: 'Calendar ID (default: primary)' },
            start_date: { type: 'string', description: 'Start date filter (ISO8601)' },
            end_date: { type: 'string', description: 'End date filter (ISO8601)' },
            max_results: { type: 'number', description: 'Max events to return', default: 20 },
            query: { type: 'string', description: 'Search query' },
          },
        },
      },
      {
        name: STANDARD_TOOLS.CALENDAR_CREATE_EVENT,
        description: 'Create a new event in Google Calendar',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Event title' },
            start_time: { type: 'string', description: 'Start time (ISO8601)' },
            end_time: { type: 'string', description: 'End time (ISO8601)' },
            description: { type: 'string', description: 'Event description' },
            attendees: { type: 'array', items: { type: 'string' }, description: 'Attendee emails' },
            calendar_id: { type: 'string', description: 'Calendar ID (default: primary)' },
          },
          required: ['title', 'start_time', 'end_time'],
        },
      },
      {
        name: STANDARD_TOOLS.CALENDAR_UPDATE_EVENT,
        description: 'Update an existing Google Calendar event',
        inputSchema: {
          type: 'object',
          properties: {
            event_id: { type: 'string', description: 'Event ID to update' },
            title: { type: 'string', description: 'New event title' },
            start_time: { type: 'string', description: 'New start time (ISO8601)' },
            end_time: { type: 'string', description: 'New end time (ISO8601)' },
            description: { type: 'string', description: 'New event description' },
            attendees: { type: 'array', items: { type: 'string' }, description: 'Attendee emails' },
          },
          required: ['event_id'],
        },
      },
      {
        name: 'delete_calendar_event',
        description: 'Delete a Google Calendar event',
        inputSchema: {
          type: 'object',
          properties: {
            event_id: { type: 'string', description: 'Event ID to delete' },
          },
          required: ['event_id'],
        },
      },
    ];
  }

  async execute(
    _toolName: string,
    _args: Record<string, unknown>,
    _context: ExecutionContext
  ): Promise<ActionResult> {
    throw new PluginError(
      'GoogleCalendarPlugin.execute() should not be called directly. Use the gateway CalendarService.'
    );
  }
}

export default GoogleCalendarPlugin;
