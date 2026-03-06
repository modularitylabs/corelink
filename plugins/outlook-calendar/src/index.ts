/**
 * Outlook Calendar Plugin for CoreLink
 *
 * Schema definitions for Outlook Calendar operations.
 * Execution is handled by the gateway via OutlookCalendarProvider.
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

export class OutlookCalendarPlugin implements ICoreLinkPlugin {
  readonly id = 'com.corelink.outlook-calendar';
  readonly name = 'Outlook Calendar';
  readonly version = '0.1.0';
  readonly category = 'calendar' as const;
  readonly description = 'Access Outlook Calendar events with granular control';

  getConfigSchema(): Record<string, ConfigField> {
    return {
      clientId: {
        type: 'text',
        label: 'Microsoft Client ID',
        description: 'OAuth 2.0 Client ID from Azure App Registration',
        required: true,
      },
    };
  }

  getStandardTools(): ToolDefinition[] {
    return [
      {
        name: STANDARD_TOOLS.CALENDAR_LIST_EVENTS,
        description: 'List events from Outlook Calendar',
        inputSchema: {
          type: 'object',
          properties: {
            start_date: { type: 'string', description: 'Start date filter (ISO8601)' },
            end_date: { type: 'string', description: 'End date filter (ISO8601)' },
            max_results: { type: 'number', description: 'Max events to return', default: 20 },
            query: { type: 'string', description: 'Search query' },
          },
        },
      },
      {
        name: STANDARD_TOOLS.CALENDAR_CREATE_EVENT,
        description: 'Create a new event in Outlook Calendar',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Event title' },
            start_time: { type: 'string', description: 'Start time (ISO8601)' },
            end_time: { type: 'string', description: 'End time (ISO8601)' },
            description: { type: 'string', description: 'Event description' },
            attendees: { type: 'array', items: { type: 'string' }, description: 'Attendee emails' },
          },
          required: ['title', 'start_time', 'end_time'],
        },
      },
      {
        name: STANDARD_TOOLS.CALENDAR_UPDATE_EVENT,
        description: 'Update an existing Outlook Calendar event',
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
        description: 'Delete an Outlook Calendar event',
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
      'OutlookCalendarPlugin.execute() should not be called directly. Use the gateway CalendarService.'
    );
  }
}

export default OutlookCalendarPlugin;
