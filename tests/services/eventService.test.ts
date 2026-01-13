import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Guild, GuildScheduledEvent, GuildScheduledEventEntityType, GuildScheduledEventStatus } from 'discord.js';
import {
  syncDiscordEvents,
  detectEventsFromMessages,
  getUpcomingEvents,
  cancelEventById,
  formatEventsForSummary,
  generateEventId,
} from '../../src/services/eventService';
import * as aiService from '../../src/services/aiService';
import * as queries from '../../src/db/queries';
import * as logger from '../../src/utils/logger';
import { Event, EventType, MessageWithUser } from '../../src/types/database';

// Mock dependencies
jest.mock('../../src/services/aiService');
jest.mock('../../src/db/queries');
jest.mock('../../src/utils/logger');

describe('eventService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('syncDiscordEvents', () => {
    let mockGuild: Partial<Guild>;

    beforeEach(() => {
      mockGuild = {
        id: 'guild123',
        scheduledEvents: {
          fetch: jest.fn(),
        } as any,
      };
    });

    it('should sync Discord events successfully', async () => {
      const mockEvent: Partial<GuildScheduledEvent> = {
        id: 'event123',
        guildId: 'guild123',
        name: 'Gaming Night',
        description: 'Community gaming session',
        scheduledStartAt: new Date('2026-01-15T20:00:00Z'),
        scheduledEndAt: new Date('2026-01-15T23:00:00Z'),
        channelId: 'channel123',
        creatorId: 'user123',
        entityMetadata: { location: 'Main Hall' },
      };

      const eventsMap = new Map([['event123', mockEvent as GuildScheduledEvent]]);
      (mockGuild.scheduledEvents!.fetch as jest.Mock).mockResolvedValue(eventsMap);
      (queries.insertEvent as jest.Mock).mockResolvedValue({ id: 1 });

      await syncDiscordEvents(mockGuild as Guild);

      expect(queries.insertEvent).toHaveBeenCalledWith(
        'guild123',
        'Gaming Night',
        'gaming',
        expect.any(Date),
        'discord',
        'event123',
        'Community gaming session',
        expect.any(Date),
        'Main Hall',
        'channel123',
        'user123',
        undefined,
        100,
        false,
        undefined,
        undefined
      );

      expect(logger.logger.info).toHaveBeenCalledWith(
        'Discord events synced successfully',
        expect.objectContaining({
          guildId: 'guild123',
          eventCount: 1,
        })
      );
    });

    it('should map event type from name - meeting', async () => {
      const mockEvent: Partial<GuildScheduledEvent> = {
        id: 'event123',
        guildId: 'guild123',
        name: 'Team Meeting',
        scheduledStartAt: new Date('2026-01-15T20:00:00Z'),
      };

      const eventsMap = new Map([['event123', mockEvent as GuildScheduledEvent]]);
      (mockGuild.scheduledEvents!.fetch as jest.Mock).mockResolvedValue(eventsMap);
      (queries.insertEvent as jest.Mock).mockResolvedValue({ id: 1 });

      await syncDiscordEvents(mockGuild as Guild);

      expect(queries.insertEvent).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'meeting',
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything()
      );
    });

    it('should map event type from name - stream', async () => {
      const mockEvent: Partial<GuildScheduledEvent> = {
        id: 'event123',
        guildId: 'guild123',
        name: 'Live Stream Event',
        scheduledStartAt: new Date('2026-01-15T20:00:00Z'),
      };

      const eventsMap = new Map([['event123', mockEvent as GuildScheduledEvent]]);
      (mockGuild.scheduledEvents!.fetch as jest.Mock).mockResolvedValue(eventsMap);
      (queries.insertEvent as jest.Mock).mockResolvedValue({ id: 1 });

      await syncDiscordEvents(mockGuild as Guild);

      expect(queries.insertEvent).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'stream',
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything()
      );
    });

    it('should map event type from name - tournament', async () => {
      const mockEvent: Partial<GuildScheduledEvent> = {
        id: 'event123',
        guildId: 'guild123',
        name: 'Grand Tournament',
        scheduledStartAt: new Date('2026-01-15T20:00:00Z'),
      };

      const eventsMap = new Map([['event123', mockEvent as GuildScheduledEvent]]);
      (mockGuild.scheduledEvents!.fetch as jest.Mock).mockResolvedValue(eventsMap);
      (queries.insertEvent as jest.Mock).mockResolvedValue({ id: 1 });

      await syncDiscordEvents(mockGuild as Guild);

      expect(queries.insertEvent).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'tournament',
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything()
      );
    });

    it('should map event type from name - social', async () => {
      const mockEvent: Partial<GuildScheduledEvent> = {
        id: 'event123',
        guildId: 'guild123',
        name: 'Social Hangout',
        scheduledStartAt: new Date('2026-01-15T20:00:00Z'),
      };

      const eventsMap = new Map([['event123', mockEvent as GuildScheduledEvent]]);
      (mockGuild.scheduledEvents!.fetch as jest.Mock).mockResolvedValue(eventsMap);
      (queries.insertEvent as jest.Mock).mockResolvedValue({ id: 1 });

      await syncDiscordEvents(mockGuild as Guild);

      expect(queries.insertEvent).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'social',
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything()
      );
    });

    it('should default to "other" type for unknown event names', async () => {
      const mockEvent: Partial<GuildScheduledEvent> = {
        id: 'event123',
        guildId: 'guild123',
        name: 'Random Event',
        scheduledStartAt: new Date('2026-01-15T20:00:00Z'),
      };

      const eventsMap = new Map([['event123', mockEvent as GuildScheduledEvent]]);
      (mockGuild.scheduledEvents!.fetch as jest.Mock).mockResolvedValue(eventsMap);
      (queries.insertEvent as jest.Mock).mockResolvedValue({ id: 1 });

      await syncDiscordEvents(mockGuild as Guild);

      expect(queries.insertEvent).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'other',
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything()
      );
    });

    it('should handle events without optional fields', async () => {
      const mockEvent: Partial<GuildScheduledEvent> = {
        id: 'event123',
        guildId: 'guild123',
        name: 'Simple Event',
        scheduledStartAt: new Date('2026-01-15T20:00:00Z'),
        scheduledEndAt: null,
        description: null,
        channelId: null,
        creatorId: null,
        entityMetadata: null,
      };

      const eventsMap = new Map([['event123', mockEvent as GuildScheduledEvent]]);
      (mockGuild.scheduledEvents!.fetch as jest.Mock).mockResolvedValue(eventsMap);
      (queries.insertEvent as jest.Mock).mockResolvedValue({ id: 1 });

      await syncDiscordEvents(mockGuild as Guild);

      expect(queries.insertEvent).toHaveBeenCalledWith(
        'guild123',
        'Simple Event',
        'other',
        expect.any(Date),
        'discord',
        'event123',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        100,
        false,
        undefined,
        undefined
      );
    });

    it('should handle empty events collection', async () => {
      (mockGuild.scheduledEvents!.fetch as jest.Mock).mockResolvedValue(new Map());

      await syncDiscordEvents(mockGuild as Guild);

      expect(queries.insertEvent).not.toHaveBeenCalled();
      expect(logger.logger.info).toHaveBeenCalledWith(
        'Discord events synced successfully',
        expect.objectContaining({
          eventCount: 0,
        })
      );
    });

    it('should continue syncing even if one event fails', async () => {
      const mockEvent1: Partial<GuildScheduledEvent> = {
        id: 'event1',
        guildId: 'guild123',
        name: 'Event 1',
        scheduledStartAt: new Date('2026-01-15T20:00:00Z'),
      };

      const mockEvent2: Partial<GuildScheduledEvent> = {
        id: 'event2',
        guildId: 'guild123',
        name: 'Event 2',
        scheduledStartAt: new Date('2026-01-16T20:00:00Z'),
      };

      const eventsMap = new Map([
        ['event1', mockEvent1 as GuildScheduledEvent],
        ['event2', mockEvent2 as GuildScheduledEvent],
      ]);

      (mockGuild.scheduledEvents!.fetch as jest.Mock).mockResolvedValue(eventsMap);
      (queries.insertEvent as jest.Mock)
        .mockRejectedValueOnce(new Error('Duplicate event'))
        .mockResolvedValueOnce({ id: 2 });

      await syncDiscordEvents(mockGuild as Guild);

      expect(queries.insertEvent).toHaveBeenCalledTimes(2);
      expect(logger.logger.debug).toHaveBeenCalledWith(
        'Could not insert Discord event (may already exist)',
        expect.objectContaining({ eventId: 'event1' })
      );
    });

    it('should handle fetch error gracefully', async () => {
      (mockGuild.scheduledEvents!.fetch as jest.Mock).mockRejectedValue(
        new Error('API error')
      );

      await syncDiscordEvents(mockGuild as Guild);

      expect(logger.logger.error).toHaveBeenCalledWith(
        'Failed to sync Discord events',
        expect.objectContaining({
          guildId: 'guild123',
          error: 'API error',
        })
      );
    });
  });

  describe('detectEventsFromMessages', () => {
    const mockMessages: MessageWithUser[] = [
      {
        id: 1,
        message_id: 'msg1',
        channel_id: 'channel1',
        user_id: 'user1',
        guild_id: 'guild1',
        content: 'Gaming session on Friday at 8pm',
        posted_at: new Date('2026-01-10T10:00:00Z'),
        has_mentions: false,
        mention_users: [],
        mention_roles: [],
        has_attachments: false,
        attachment_count: 0,
        created_at: new Date(),
        author_name: 'TestUser',
        author_global_name: null,
        channel_name: 'general',
      },
    ];

    beforeEach(() => {
      process.env.SERVER_TIMEZONE = 'America/New_York';
    });

    it('should detect and store events from messages', async () => {
      (queries.getMessages as jest.Mock).mockResolvedValue(mockMessages);

      const detectedEvent: aiService.DetectedEvent = {
        id: 'evt_123',
        title: 'Gaming Session',
        description: 'Community gaming night',
        datetime: new Date('2026-01-17T01:00:00Z'),
        channel: 'general',
        organizerId: 'user1',
        organizerName: 'TestUser',
        type: 'gaming' as EventType,
        participants: [],
        sourceMessageId: 'msg1',
        confidence: 85,
      };

      (aiService.detectEvents as jest.Mock).mockResolvedValue({
        events: [detectedEvent],
      });
      (queries.insertEvent as jest.Mock).mockResolvedValue({ id: 1 });

      const result = await detectEventsFromMessages('guild1', 24);

      expect(queries.getMessages).toHaveBeenCalledWith({
        guildId: 'guild1',
        since: expect.any(Date),
        limit: 200,
      });

      expect(aiService.detectEvents).toHaveBeenCalledWith({
        messages: mockMessages,
        serverTimezone: 'America/New_York',
        currentDate: expect.any(Date),
      });

      expect(queries.insertEvent).toHaveBeenCalledWith(
        'guild1',
        'Gaming Session',
        'gaming',
        detectedEvent.datetime,
        'detected',
        'evt_123',
        'Community gaming night',
        undefined,
        'general',
        undefined,
        'user1',
        'msg1',
        85,
        false,
        undefined,
        ['user1', 'TestUser']
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(detectedEvent);
    });

    it('should filter out low confidence events', async () => {
      (queries.getMessages as jest.Mock).mockResolvedValue(mockMessages);

      const lowConfidenceEvent: aiService.DetectedEvent = {
        id: 'evt_456',
        title: 'Maybe Event',
        datetime: new Date('2026-01-17T01:00:00Z'),
        organizerId: 'user1',
        organizerName: 'TestUser',
        type: 'other' as EventType,
        participants: [],
        sourceMessageId: 'msg1',
        confidence: 30,
      };

      (aiService.detectEvents as jest.Mock).mockResolvedValue({
        events: [lowConfidenceEvent],
      });

      await detectEventsFromMessages('guild1');

      expect(queries.insertEvent).not.toHaveBeenCalled();
    });

    it('should handle recurring events', async () => {
      (queries.getMessages as jest.Mock).mockResolvedValue(mockMessages);

      const recurringEvent: aiService.DetectedEvent = {
        id: 'evt_789',
        title: 'Weekly Standup',
        datetime: new Date('2026-01-17T10:00:00Z'),
        organizerId: 'user1',
        organizerName: 'TestUser',
        type: 'meeting' as EventType,
        participants: [],
        sourceMessageId: 'msg1',
        confidence: 90,
        recurring: {
          frequency: 'weekly',
          endDate: new Date('2026-02-17T10:00:00Z'),
        },
      };

      (aiService.detectEvents as jest.Mock).mockResolvedValue({
        events: [recurringEvent],
      });
      (queries.insertEvent as jest.Mock).mockResolvedValue({ id: 1 });

      await detectEventsFromMessages('guild1');

      expect(queries.insertEvent).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(Date),
        expect.any(String),
        expect.any(String),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.any(String),
        expect.any(String),
        expect.any(Number),
        true,
        JSON.stringify(recurringEvent.recurring),
        expect.any(Array)
      );
    });

    it('should return empty array when no messages found', async () => {
      (queries.getMessages as jest.Mock).mockResolvedValue([]);

      const result = await detectEventsFromMessages('guild1');

      expect(result).toEqual([]);
      expect(aiService.detectEvents).not.toHaveBeenCalled();
      expect(logger.logger.info).toHaveBeenCalledWith(
        'No messages to scan for events',
        { guildId: 'guild1' }
      );
    });

    it('should handle AI service errors gracefully', async () => {
      (queries.getMessages as jest.Mock).mockResolvedValue(mockMessages);
      (aiService.detectEvents as jest.Mock).mockRejectedValue(new Error('AI API error'));

      const result = await detectEventsFromMessages('guild1');

      expect(result).toEqual([]);
      expect(logger.logger.error).toHaveBeenCalledWith(
        'Failed to detect events from messages',
        expect.objectContaining({
          guildId: 'guild1',
          error: 'AI API error',
        })
      );
    });

    it('should continue processing if event insertion fails', async () => {
      (queries.getMessages as jest.Mock).mockResolvedValue(mockMessages);

      const event1: aiService.DetectedEvent = {
        id: 'evt_1',
        title: 'Event 1',
        datetime: new Date('2026-01-17T10:00:00Z'),
        organizerId: 'user1',
        organizerName: 'TestUser',
        type: 'meeting' as EventType,
        participants: [],
        sourceMessageId: 'msg1',
        confidence: 80,
      };

      const event2: aiService.DetectedEvent = {
        id: 'evt_2',
        title: 'Event 2',
        datetime: new Date('2026-01-18T10:00:00Z'),
        organizerId: 'user1',
        organizerName: 'TestUser',
        type: 'social' as EventType,
        participants: [],
        sourceMessageId: 'msg1',
        confidence: 85,
      };

      (aiService.detectEvents as jest.Mock).mockResolvedValue({
        events: [event1, event2],
      });
      (queries.insertEvent as jest.Mock)
        .mockRejectedValueOnce(new Error('Duplicate'))
        .mockResolvedValueOnce({ id: 2 });

      const result = await detectEventsFromMessages('guild1');

      expect(queries.insertEvent).toHaveBeenCalledTimes(2);
      expect(logger.logger.debug).toHaveBeenCalledWith(
        'Could not insert detected event (may already exist)',
        { eventId: 'evt_1' }
      );
    });

    it('should use custom lookback hours', async () => {
      (queries.getMessages as jest.Mock).mockResolvedValue([]);

      await detectEventsFromMessages('guild1', 48);

      const callArgs = (queries.getMessages as jest.Mock).mock.calls[0][0];
      const expectedTime = Date.now() - 48 * 60 * 60 * 1000;
      const actualTime = callArgs.since.getTime();

      expect(Math.abs(actualTime - expectedTime)).toBeLessThan(1000);
    });
  });

  describe('getUpcomingEvents', () => {
    it('should retrieve upcoming events', async () => {
      const mockEvents: Event[] = [
        {
          id: 1,
          event_id: 'evt_1',
          guild_id: 'guild1',
          title: 'Gaming Night',
          description: 'Community gaming',
          event_type: 'gaming',
          scheduled_start: new Date('2026-01-15T20:00:00Z'),
          scheduled_end: new Date('2026-01-15T23:00:00Z'),
          location: null,
          channel_id: 'channel1',
          organizer_user_id: 'user1',
          source_type: 'detected',
          source_message_id: 'msg1',
          confidence_score: 85,
          is_cancelled: false,
          is_recurring: false,
          recurrence_rule: null,
          participant_roles: [],
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      (queries.getEvents as jest.Mock).mockResolvedValue(mockEvents);

      const result = await getUpcomingEvents('guild1', 7, 70);

      expect(queries.getEvents).toHaveBeenCalledWith({
        guildId: 'guild1',
        startAfter: expect.any(Date),
        startBefore: expect.any(Date),
        includeCancel: false,
        minConfidence: 70,
      });

      expect(result).toEqual(mockEvents);
    });

    it('should use default parameters', async () => {
      (queries.getEvents as jest.Mock).mockResolvedValue([]);

      await getUpcomingEvents('guild1');

      expect(queries.getEvents).toHaveBeenCalledWith({
        guildId: 'guild1',
        startAfter: expect.any(Date),
        startBefore: expect.any(Date),
        includeCancel: false,
        minConfidence: 70,
      });
    });

    it('should calculate correct time range', async () => {
      (queries.getEvents as jest.Mock).mockResolvedValue([]);

      const beforeCall = Date.now();
      await getUpcomingEvents('guild1', 14, 80);
      const afterCall = Date.now();

      const callArgs = (queries.getEvents as jest.Mock).mock.calls[0][0];
      const startAfter = callArgs.startAfter.getTime();
      const startBefore = callArgs.startBefore.getTime();

      expect(startAfter).toBeGreaterThanOrEqual(beforeCall);
      expect(startAfter).toBeLessThanOrEqual(afterCall);

      const expectedFuture = startAfter + 14 * 24 * 60 * 60 * 1000;
      expect(Math.abs(startBefore - expectedFuture)).toBeLessThan(100);
    });

    it('should return empty array on error', async () => {
      (queries.getEvents as jest.Mock).mockRejectedValue(new Error('Database error'));

      const result = await getUpcomingEvents('guild1');

      expect(result).toEqual([]);
      expect(logger.logger.error).toHaveBeenCalledWith(
        'Failed to get upcoming events',
        expect.objectContaining({
          guildId: 'guild1',
          error: 'Database error',
        })
      );
    });
  });

  describe('cancelEventById', () => {
    it('should cancel event successfully', async () => {
      (queries.cancelEvent as jest.Mock).mockResolvedValue(undefined);

      await cancelEventById('evt_123');

      expect(queries.cancelEvent).toHaveBeenCalledWith('evt_123');
      expect(logger.logger.info).toHaveBeenCalledWith('Event cancelled', {
        eventId: 'evt_123',
      });
    });

    it('should throw error on failure', async () => {
      (queries.cancelEvent as jest.Mock).mockRejectedValue(new Error('Not found'));

      await expect(cancelEventById('evt_123')).rejects.toThrow('Not found');

      expect(logger.logger.error).toHaveBeenCalledWith(
        'Failed to cancel event',
        expect.objectContaining({
          eventId: 'evt_123',
          error: 'Not found',
        })
      );
    });
  });

  describe('formatEventsForSummary', () => {
    it('should format events for display', () => {
      const mockEvents: Event[] = [
        {
          id: 1,
          event_id: 'evt_1',
          guild_id: 'guild1',
          title: 'Gaming Night',
          description: 'Community gaming',
          event_type: 'gaming',
          scheduled_start: new Date('2026-01-15T20:00:00Z'),
          scheduled_end: null,
          location: 'Main Hall',
          channel_id: null,
          organizer_user_id: 'user1',
          source_type: 'detected',
          source_message_id: 'msg1',
          confidence_score: 85,
          is_cancelled: false,
          is_recurring: false,
          recurrence_rule: null,
          participant_roles: [],
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: 2,
          event_id: 'evt_2',
          guild_id: 'guild1',
          title: 'Team Meeting',
          description: null,
          event_type: 'meeting',
          scheduled_start: new Date('2026-01-16T10:00:00Z'),
          scheduled_end: null,
          location: null,
          channel_id: 'channel123',
          organizer_user_id: 'user2',
          source_type: 'discord',
          source_message_id: null,
          confidence_score: null,
          is_cancelled: false,
          is_recurring: false,
          recurrence_rule: null,
          participant_roles: [],
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      const result = formatEventsForSummary(mockEvents);

      expect(result).toContain('📅 **Upcoming Events**');
      expect(result).toContain('**Gaming Night**');
      expect(result).toContain('Main Hall');
      expect(result).toContain('85% confidence');
      expect(result).toContain('**Team Meeting**');
      expect(result).toContain('<#channel123>');
      expect(result).not.toContain('null% confidence');
    });

    it('should return empty string for no events', () => {
      const result = formatEventsForSummary([]);
      expect(result).toBe('');
    });

    it('should handle events without location or channel', () => {
      const mockEvent: Event = {
        id: 1,
        event_id: 'evt_1',
        guild_id: 'guild1',
        title: 'Event',
        description: null,
        event_type: 'other',
        scheduled_start: new Date('2026-01-15T20:00:00Z'),
        scheduled_end: null,
        location: null,
        channel_id: null,
        organizer_user_id: null,
        source_type: 'detected',
        source_message_id: null,
        confidence_score: null,
        is_cancelled: false,
        is_recurring: false,
        recurrence_rule: null,
        participant_roles: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      const result = formatEventsForSummary([mockEvent]);

      expect(result).toContain('**Event**');
      expect(result).not.toContain('•  •');
    });
  });

  describe('generateEventId', () => {
    it('should generate consistent event IDs', () => {
      const title = 'Gaming Night';
      const datetime = new Date('2026-01-15T20:00:00Z');
      const organizerId = 'user123';

      const id1 = generateEventId(title, datetime, organizerId);
      const id2 = generateEventId(title, datetime, organizerId);

      expect(id1).toBe(id2);
      expect(id1).toMatch(/^evt_[a-f0-9]{12}$/);
    });

    it('should generate different IDs for different inputs', () => {
      const datetime = new Date('2026-01-15T20:00:00Z');
      const organizerId = 'user123';

      const id1 = generateEventId('Event 1', datetime, organizerId);
      const id2 = generateEventId('Event 2', datetime, organizerId);

      expect(id1).not.toBe(id2);
    });

    it('should generate different IDs for different times', () => {
      const title = 'Gaming Night';
      const organizerId = 'user123';

      const id1 = generateEventId(title, new Date('2026-01-15T20:00:00Z'), organizerId);
      const id2 = generateEventId(title, new Date('2026-01-16T20:00:00Z'), organizerId);

      expect(id1).not.toBe(id2);
    });

    it('should generate different IDs for different organizers', () => {
      const title = 'Gaming Night';
      const datetime = new Date('2026-01-15T20:00:00Z');

      const id1 = generateEventId(title, datetime, 'user1');
      const id2 = generateEventId(title, datetime, 'user2');

      expect(id1).not.toBe(id2);
    });
  });
});
