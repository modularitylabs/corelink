/**
 * CoreLink Calendar Service
 *
 * Orchestrates multiple calendar providers (Google Calendar, Outlook Calendar, etc.)
 * to provide a unified calendar interface.
 */

import type { ICalendarProvider } from './ICalendarProvider.js';
import type { Account, CalendarEvent, ListEventsArgs, CreateEventArgs, UpdateEventArgs } from './types.js';

export class CalendarService {
  private providers: Map<string, ICalendarProvider> = new Map();

  registerProvider(pluginId: string, provider: ICalendarProvider): void {
    this.providers.set(pluginId, provider);
    console.log(`[CalendarService] Registered provider: ${pluginId}`);
  }

  async listEvents(accounts: Account[], args: ListEventsArgs): Promise<CalendarEvent[]> {
    if (accounts.length === 0) return [];

    const maxResults = args.max_results || 20;

    const eventPromises = accounts.map(async account => {
      const provider = this.providers.get(account.pluginId);
      if (!provider) {
        console.warn(`[CalendarService] No provider found for ${account.pluginId}`);
        return [];
      }
      try {
        return await provider.listEvents(account, { ...args, max_results: maxResults });
      } catch (error) {
        console.error(
          `[CalendarService] Failed to list events from ${account.email}:`,
          error instanceof Error ? error.message : String(error)
        );
        return [];
      }
    });

    const eventArrays = await Promise.all(eventPromises);
    const allEvents = eventArrays.flat();

    // Sort by start time
    allEvents.sort((a, b) => {
      const aTime = new Date(a.startTime).getTime();
      const bTime = new Date(b.startTime).getTime();
      return aTime - bTime;
    });

    return allEvents.slice(0, maxResults);
  }

  async createEvent(account: Account, args: CreateEventArgs): Promise<CalendarEvent> {
    const provider = this.providers.get(account.pluginId);
    if (!provider) throw new Error(`No provider found for ${account.pluginId}`);
    return provider.createEvent(account, args);
  }

  async updateEvent(account: Account, args: UpdateEventArgs): Promise<CalendarEvent> {
    const provider = this.providers.get(account.pluginId);
    if (!provider) throw new Error(`No provider found for ${account.pluginId}`);
    return provider.updateEvent(account, args);
  }

  async deleteEvent(account: Account, eventId: string): Promise<{ success: boolean }> {
    const provider = this.providers.get(account.pluginId);
    if (!provider) throw new Error(`No provider found for ${account.pluginId}`);
    return provider.deleteEvent(account, eventId);
  }
}

export const calendarService = new CalendarService();
