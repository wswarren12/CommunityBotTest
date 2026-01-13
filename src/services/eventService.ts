import { Guild, GuildScheduledEvent } from 'discord.js';
import { detectEvents, EventDetectionRequest, DetectedEvent } from './aiService';
import {
  insertEvent,
  getEvents,
  getMessages,
  cancelEvent,
} from '../db/queries';
import { logger } from '../utils/logger';
import { Event, EventType } from '../types/database';
import crypto from 'crypto';

/**
 * Sync Discord native scheduled events to database
 */
export async function syncDiscordEvents(guild: Guild): Promise<void> {
  try {
    const events = await guild.scheduledEvents.fetch();

    logger.info('Syncing Discord scheduled events', {
      guildId: guild.id,
      eventCount: events.size,
    });

    for (const [, event] of events) {
      await syncDiscordEvent(event);
    }

    logger.info('Discord events synced successfully', {
      guildId: guild.id,
      eventCount: events.size,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to sync Discord events', { guildId: guild.id, error: errorMessage });
  }
}

/**
 * Sync a single Discord event
 */
async function syncDiscordEvent(event: GuildScheduledEvent): Promise<void> {
  try {
    const eventType = mapDiscordEventType(event);

    await insertEvent(
      event.guildId,
      event.name,
      eventType,
      event.scheduledStartAt!,
      'discord',
      event.id,
      event.description || undefined,
      event.scheduledEndAt || undefined,
      event.entityMetadata?.location || undefined,
      event.channelId || undefined,
      event.creatorId || undefined,
      undefined, // No source message for Discord events
      100, // Discord events have 100% confidence
      false,
      undefined,
      undefined
    );

    logger.debug('Discord event synced', {
      eventId: event.id,
      eventName: event.name,
    });
  } catch (error) {
    // Event might already exist, which is fine
    logger.debug('Could not insert Discord event (may already exist)', {
      eventId: event.id,
    });
  }
}

/**
 * Detect events from recent messages using AI
 */
export async function detectEventsFromMessages(
  guildId: string,
  lookbackHours: number = 24
): Promise<DetectedEvent[]> {
  try {
    const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);

    // Get recent messages
    const messages = await getMessages({
      guildId,
      since,
      limit: 200,
    });

    if (messages.length === 0) {
      logger.info('No messages to scan for events', { guildId });
      return [];
    }

    logger.info('Detecting events from messages', {
      guildId,
      messageCount: messages.length,
    });

    // Use AI to detect events
    const serverTimezone = process.env.SERVER_TIMEZONE || 'America/New_York';
    const request: EventDetectionRequest = {
      messages,
      serverTimezone,
      currentDate: new Date(),
    };

    const { events } = await detectEvents(request);

    // Store detected events in database
    for (const event of events) {
      if (event.confidence >= 50) {
        // Only store events with medium+ confidence
        try {
          await insertEvent(
            guildId,
            event.title,
            event.type,
            event.datetime,
            'detected',
            event.id,
            event.description,
            event.endDatetime,
            event.channel,
            undefined, // channel location
            event.organizerId,
            event.sourceMessageId,
            event.confidence,
            !!event.recurring,
            event.recurring ? JSON.stringify(event.recurring) : undefined,
            event.participants
          );

          logger.info('Detected event stored', {
            eventId: event.id,
            title: event.title,
            confidence: event.confidence,
          });
        } catch (error) {
          // Event might already exist
          logger.debug('Could not insert detected event (may already exist)', {
            eventId: event.id,
          });
        }
      }
    }

    logger.info('Event detection completed', {
      guildId,
      detectedCount: events.length,
    });

    return events;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to detect events from messages', { guildId, error: errorMessage });
    return [];
  }
}

/**
 * Get upcoming events for a guild
 */
export async function getUpcomingEvents(
  guildId: string,
  daysAhead: number = 7,
  minConfidence: number = 70
): Promise<Event[]> {
  try {
    const now = new Date();
    const future = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    const events = await getEvents({
      guildId,
      startAfter: now,
      startBefore: future,
      includeCancel: false,
      minConfidence,
    });

    logger.debug('Retrieved upcoming events', {
      guildId,
      eventCount: events.length,
    });

    return events;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to get upcoming events', { guildId, error: errorMessage });
    return [];
  }
}

/**
 * Cancel an event
 */
export async function cancelEventById(eventId: string): Promise<void> {
  try {
    await cancelEvent(eventId);
    logger.info('Event cancelled', { eventId });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to cancel event', { eventId, error: errorMessage });
    throw error;
  }
}

/**
 * Format events for display in summaries
 */
export function formatEventsForSummary(events: Event[]): string {
  if (events.length === 0) {
    return '';
  }

  let formatted = '\n\n📅 **Upcoming Events**\n';

  for (const event of events) {
    const startTime = new Date(event.scheduled_start).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    const confidence = event.confidence_score ? ` (${event.confidence_score}% confidence)` : '';
    const locationValue = event.location || (event.channel_id ? `<#${event.channel_id}>` : '');
    const location = locationValue ? ` • ${locationValue}` : '';

    formatted += `- **${event.title}** • ${startTime}${location}${confidence}\n`;
  }

  return formatted;
}

/**
 * Map Discord event entity type to our event type
 */
function mapDiscordEventType(event: GuildScheduledEvent): EventType {
  // Discord doesn't have specific types, so we use 'other' for native events
  // or try to infer from the name
  const name = event.name.toLowerCase();

  if (name.includes('meeting') || name.includes('standup')) return 'meeting';
  if (name.includes('game') || name.includes('gaming')) return 'gaming';
  if (name.includes('stream')) return 'stream';
  if (name.includes('tournament')) return 'tournament';
  if (name.includes('social') || name.includes('hangout') || name.includes('party')) return 'social';

  return 'other';
}

/**
 * Generate a unique event ID from event details
 */
export function generateEventId(title: string, datetime: Date, organizerId: string): string {
  const hash = crypto
    .createHash('sha256')
    .update(`${title}-${datetime.toISOString()}-${organizerId}`)
    .digest('hex');
  return `evt_${hash.substring(0, 16)}`;
}
