/**
 * Universal Calendar Router
 *
 * Routes MCP tool calls to the CalendarService, implementing the business logic
 * for universal calendar tools that work across all providers and accounts.
 *
 * Strategy:
 * - Read operations (list): Aggregate ALL calendar accounts
 * - Write operations (create, update, delete): Use primary account
 */

import type { ActionResult } from '@corelink/core';
import { calendarService } from './CalendarService.js';
import { CredentialManager } from '../credential-manager.js';
import type { Account, CalendarEvent, ListEventsArgs, CreateEventArgs, UpdateEventArgs } from './types.js';

const CALENDAR_PLUGIN_IDS = ['com.corelink.google-calendar', 'com.corelink.outlook-calendar'];

function strip(event: CalendarEvent): Omit<CalendarEvent, 'raw'> {
  const { raw: _raw, ...clean } = event;
  return clean;
}

export class UniversalCalendarRouter {
  constructor(private credentialManager: CredentialManager) {}

  /**
   * List events from ALL calendar accounts
   */
  async listEvents(args: Record<string, unknown>): Promise<ActionResult> {
    console.error('[UniversalCalendarRouter] listEvents called with args:', JSON.stringify(args));

    const accounts = await this.getAllCalendarAccounts();
    console.error(`[UniversalCalendarRouter] Found ${accounts.length} calendar account(s)`);

    if (accounts.length === 0) {
      return {
        data: [],
        summary: 'No calendar accounts connected',
        metadata: { accountCount: 0 },
      };
    }

    const listArgs: ListEventsArgs = {
      calendar_id: args.calendar_id as string | undefined,
      start_date: args.start_date as string | undefined,
      end_date: args.end_date as string | undefined,
      max_results: (args.max_results as number) || 20,
      query: args.query as string | undefined,
    };

    const events = await calendarService.listEvents(accounts, listArgs);
    console.error(`[UniversalCalendarRouter] CalendarService returned ${events.length} event(s)`);

    const clean = events.map(strip);
    return {
      data: clean,
      summary: `Retrieved ${clean.length} events from ${accounts.length} account(s)`,
      metadata: {
        accountCount: accounts.length,
        eventCount: clean.length,
      },
    };
  }

  /**
   * Create an event in the primary calendar account
   */
  async createEvent(args: Record<string, unknown>): Promise<ActionResult> {
    const account = await this.getPrimaryCalendarAccount();
    if (!account) {
      throw new Error('No calendar account connected. Please connect Google Calendar or Outlook Calendar first.');
    }

    const createArgs: CreateEventArgs = {
      title: args.title as string,
      start_time: args.start_time as string,
      end_time: args.end_time as string,
      description: args.description as string | undefined,
      attendees: args.attendees as string[] | undefined,
      calendar_id: args.calendar_id as string | undefined,
    };

    if (!createArgs.title) throw new Error('title is required');
    if (!createArgs.start_time) throw new Error('start_time is required');
    if (!createArgs.end_time) throw new Error('end_time is required');

    const event = await calendarService.createEvent(account, createArgs);

    return {
      data: strip(event),
      summary: `Created event "${event.title}" in ${account.email}`,
      metadata: { accountId: account.id },
    };
  }

  /**
   * Update an event in the primary calendar account
   */
  async updateEvent(args: Record<string, unknown>): Promise<ActionResult> {
    const account = await this.getPrimaryCalendarAccount();
    if (!account) {
      throw new Error('No calendar account connected. Please connect Google Calendar or Outlook Calendar first.');
    }

    const updateArgs: UpdateEventArgs = {
      event_id: args.event_id as string,
      title: args.title as string | undefined,
      start_time: args.start_time as string | undefined,
      end_time: args.end_time as string | undefined,
      description: args.description as string | undefined,
      attendees: args.attendees as string[] | undefined,
    };

    if (!updateArgs.event_id) throw new Error('event_id is required');

    const event = await calendarService.updateEvent(account, updateArgs);

    return {
      data: strip(event),
      summary: `Updated event "${event.title}"`,
      metadata: { accountId: account.id },
    };
  }

  /**
   * Delete an event from the primary calendar account
   */
  async deleteEvent(args: Record<string, unknown>): Promise<ActionResult> {
    const account = await this.getPrimaryCalendarAccount();
    if (!account) {
      throw new Error('No calendar account connected. Please connect Google Calendar or Outlook Calendar first.');
    }

    const eventId = args.event_id as string;
    if (!eventId) throw new Error('event_id is required');

    const result = await calendarService.deleteEvent(account, eventId);

    if (!result.success) {
      throw new Error(`Failed to delete event ${eventId}`);
    }

    return {
      data: result,
      summary: `Deleted event ${eventId}`,
      metadata: { accountId: account.id },
    };
  }

  /**
   * Get all calendar accounts (across all calendar providers)
   */
  private async getAllCalendarAccounts(): Promise<Account[]> {
    const allAccounts = await this.credentialManager.listAccounts();

    const calendarAccounts = allAccounts.filter(account =>
      CALENDAR_PLUGIN_IDS.includes(account.pluginId)
    );

    const accountsWithCredentials = await Promise.all(
      calendarAccounts.map(async account => {
        try {
          const credentials = await this.credentialManager.getAccountCredentials(account.id);
          if (credentials) {
            return {
              ...account,
              metadata: {
                ...account.metadata,
                ...credentials.data,
              },
            };
          }
          return account;
        } catch (error) {
          console.error(`[UniversalCalendarRouter] Failed to load credentials for ${account.email}:`, error);
          return account;
        }
      })
    );

    return accountsWithCredentials as Account[];
  }

  /**
   * Get primary calendar account (for write operations)
   */
  private async getPrimaryCalendarAccount(): Promise<Account | null> {
    const allAccounts = await this.getAllCalendarAccounts();
    const primary = allAccounts.find(account => account.isPrimary);
    if (primary) return primary;
    return allAccounts[0] || null;
  }
}
