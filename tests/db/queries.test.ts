import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import * as connection from '../../src/db/connection';
import {
  upsertUser,
  updateUserLastMessage,
  getUser,
  upsertChannel,
  getChannel,
  getGuildChannels,
  insertMessage,
  getMessages,
  deleteMessage,
  upsertUserActivity,
  getUserLastActivity,
  insertEvent,
  getEvents,
  cancelEvent,
  insertSummary,
  updateSummaryRating,
  getUserSummaries,
} from '../../src/db/queries';
import { User, Channel, Message, Event, Summary } from '../../src/types/database';

// Mock the connection module
jest.mock('../../src/db/connection');

describe('database queries', () => {
  let mockQuery: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery = jest.fn();
    (connection.query as any) = mockQuery;
  });

  describe('User queries', () => {
    describe('upsertUser', () => {
      it('should insert or update user successfully', async () => {
        const mockUser: User = {
          id: 1,
          user_id: 'user123',
          username: 'testuser',
          discriminator: '1234',
          global_name: 'Test User',
          guild_id: 'guild123',
          joined_at: new Date('2025-01-01T00:00:00Z'),
          last_message_at: null,
          created_at: new Date(),
          updated_at: new Date(),
        };

        mockQuery.mockResolvedValue({ rows: [mockUser] });

        const result = await upsertUser(
          'user123',
          'testuser',
          'guild123',
          new Date('2025-01-01T00:00:00Z'),
          '1234',
          'Test User'
        );

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO users'),
          ['user123', 'testuser', '1234', 'Test User', 'guild123', expect.any(Date)]
        );
        expect(result).toEqual(mockUser);
      });

      it('should handle optional parameters', async () => {
        const mockUser: User = {
          id: 1,
          user_id: 'user123',
          username: 'testuser',
          discriminator: null,
          global_name: null,
          guild_id: 'guild123',
          joined_at: new Date('2025-01-01T00:00:00Z'),
          last_message_at: null,
          created_at: new Date(),
          updated_at: new Date(),
        };

        mockQuery.mockResolvedValue({ rows: [mockUser] });

        await upsertUser('user123', 'testuser', 'guild123', new Date('2025-01-01T00:00:00Z'));

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO users'),
          ['user123', 'testuser', undefined, undefined, 'guild123', expect.any(Date)]
        );
      });
    });

    describe('updateUserLastMessage', () => {
      it('should update user last message timestamp', async () => {
        mockQuery.mockResolvedValue({ rowCount: 1 });

        const timestamp = new Date();
        await updateUserLastMessage('user123', timestamp);

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE users'),
          [timestamp, 'user123']
        );
      });
    });

    describe('getUser', () => {
      it('should get user by ID', async () => {
        const mockUser: User = {
          id: 1,
          user_id: 'user123',
          username: 'testuser',
          discriminator: '1234',
          global_name: 'Test User',
          guild_id: 'guild123',
          joined_at: new Date(),
          last_message_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        };

        mockQuery.mockResolvedValue({ rows: [mockUser] });

        const result = await getUser('user123');

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('SELECT * FROM users'),
          ['user123']
        );
        expect(result).toEqual(mockUser);
      });

      it('should return null when user not found', async () => {
        mockQuery.mockResolvedValue({ rows: [] });

        const result = await getUser('nonexistent');

        expect(result).toBeNull();
      });
    });
  });

  describe('Channel queries', () => {
    describe('upsertChannel', () => {
      it('should insert or update channel successfully', async () => {
        const mockChannel: Channel = {
          id: 1,
          channel_id: 'channel123',
          guild_id: 'guild123',
          channel_name: 'general',
          channel_type: 'text',
          parent_id: null,
          is_thread: false,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        };

        mockQuery.mockResolvedValue({ rows: [mockChannel] });

        const result = await upsertChannel(
          'channel123',
          'guild123',
          'general',
          'text',
          undefined,
          false
        );

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO channels'),
          ['channel123', 'guild123', 'general', 'text', undefined, false]
        );
        expect(result).toEqual(mockChannel);
      });

      it('should handle thread channels with parent', async () => {
        const mockChannel: Channel = {
          id: 1,
          channel_id: 'thread456',
          guild_id: 'guild123',
          channel_name: 'thread-1',
          channel_type: 'thread',
          parent_id: 'channel123',
          is_thread: true,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        };

        mockQuery.mockResolvedValue({ rows: [mockChannel] });

        await upsertChannel('thread456', 'guild123', 'thread-1', 'thread', 'channel123', true);

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO channels'),
          ['thread456', 'guild123', 'thread-1', 'thread', 'channel123', true]
        );
      });
    });

    describe('getChannel', () => {
      it('should get channel by ID', async () => {
        const mockChannel: Channel = {
          id: 1,
          channel_id: 'channel123',
          guild_id: 'guild123',
          channel_name: 'general',
          channel_type: 'text',
          parent_id: null,
          is_thread: false,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        };

        mockQuery.mockResolvedValue({ rows: [mockChannel] });

        const result = await getChannel('channel123');

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('SELECT * FROM channels'),
          ['channel123']
        );
        expect(result).toEqual(mockChannel);
      });

      it('should return null when channel not found', async () => {
        mockQuery.mockResolvedValue({ rows: [] });

        const result = await getChannel('nonexistent');

        expect(result).toBeNull();
      });
    });

    describe('getGuildChannels', () => {
      it('should get all active channels for guild', async () => {
        const mockChannels: Channel[] = [
          {
            id: 1,
            channel_id: 'channel1',
            guild_id: 'guild123',
            channel_name: 'announcements',
            channel_type: 'text',
            parent_id: null,
            is_thread: false,
            is_active: true,
            created_at: new Date(),
            updated_at: new Date(),
          },
          {
            id: 2,
            channel_id: 'channel2',
            guild_id: 'guild123',
            channel_name: 'general',
            channel_type: 'text',
            parent_id: null,
            is_thread: false,
            is_active: true,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ];

        mockQuery.mockResolvedValue({ rows: mockChannels });

        const result = await getGuildChannels('guild123');

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('WHERE guild_id = $1 AND is_active = TRUE'),
          ['guild123']
        );
        expect(result).toEqual(mockChannels);
      });
    });
  });

  describe('Message queries', () => {
    describe('insertMessage', () => {
      it('should insert message successfully', async () => {
        const mockMessage: Message = {
          id: 1,
          message_id: 'msg123',
          channel_id: 'channel123',
          user_id: 'user123',
          guild_id: 'guild123',
          content: 'Hello world',
          posted_at: new Date(),
          has_mentions: false,
          mention_users: [],
          mention_roles: [],
          has_attachments: false,
          attachment_count: 0,
          reply_to_message_id: null,
          thread_id: null,
          created_at: new Date(),
        };

        mockQuery.mockResolvedValue({ rows: [mockMessage] });

        const result = await insertMessage(
          'msg123',
          'channel123',
          'user123',
          'guild123',
          'Hello world',
          new Date()
        );

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO messages'),
          expect.arrayContaining([
            'msg123',
            'channel123',
            'user123',
            'guild123',
            'Hello world',
            expect.any(Date),
            false,
            [],
            [],
            false,
            0,
            undefined,
            undefined,
          ])
        );
        expect(result).toEqual(mockMessage);
      });

      it('should handle message with mentions and attachments', async () => {
        const mockMessage: Message = {
          id: 1,
          message_id: 'msg123',
          channel_id: 'channel123',
          user_id: 'user123',
          guild_id: 'guild123',
          content: '@user456 check this',
          posted_at: new Date(),
          has_mentions: true,
          mention_users: ['user456'],
          mention_roles: ['role789'],
          has_attachments: true,
          attachment_count: 2,
          reply_to_message_id: 'msg000',
          thread_id: null,
          created_at: new Date(),
        };

        mockQuery.mockResolvedValue({ rows: [mockMessage] });

        await insertMessage(
          'msg123',
          'channel123',
          'user123',
          'guild123',
          '@user456 check this',
          new Date(),
          ['user456'],
          ['role789'],
          2,
          'msg000'
        );

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO messages'),
          expect.arrayContaining([
            true, // has_mentions
            ['user456'], // mention_users
            ['role789'], // mention_roles
            true, // has_attachments
            2, // attachment_count
            'msg000', // reply_to_message_id
          ])
        );
      });
    });

    describe('getMessages', () => {
      it('should get messages with basic filter', async () => {
        const mockMessages = [
          {
            id: 1,
            message_id: 'msg1',
            content: 'Test',
            author_name: 'user1',
            channel_name: 'general',
          },
        ];

        mockQuery.mockResolvedValue({ rows: mockMessages });

        const result = await getMessages({
          guildId: 'guild123',
        });

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('WHERE m.guild_id = $1'),
          expect.arrayContaining(['guild123', 100, 0])
        );
        expect(result).toEqual(mockMessages);
      });

      it('should filter by channel IDs', async () => {
        mockQuery.mockResolvedValue({ rows: [] });

        await getMessages({
          guildId: 'guild123',
          channelIds: ['channel1', 'channel2'],
        });

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('m.channel_id = ANY($2)'),
          expect.arrayContaining([['channel1', 'channel2']])
        );
      });

      it('should filter by user ID', async () => {
        mockQuery.mockResolvedValue({ rows: [] });

        await getMessages({
          guildId: 'guild123',
          userId: 'user123',
        });

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('m.user_id = $2'),
          expect.arrayContaining(['user123'])
        );
      });

      it('should filter by time range', async () => {
        mockQuery.mockResolvedValue({ rows: [] });

        const since = new Date('2026-01-01T00:00:00Z');
        const until = new Date('2026-01-10T00:00:00Z');

        await getMessages({
          guildId: 'guild123',
          since,
          until,
        });

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('m.posted_at >= $2'),
          expect.arrayContaining([since, until])
        );
      });

      it('should filter by mentions', async () => {
        mockQuery.mockResolvedValue({ rows: [] });

        await getMessages({
          guildId: 'guild123',
          hasMentions: true,
        });

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('m.has_mentions = $2'),
          expect.arrayContaining([true])
        );
      });

      it('should filter by mentioned user', async () => {
        mockQuery.mockResolvedValue({ rows: [] });

        await getMessages({
          guildId: 'guild123',
          mentionUserId: 'user456',
        });

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('= ANY(m.mention_users)'),
          expect.arrayContaining(['user456'])
        );
      });

      it('should support custom limit and offset', async () => {
        mockQuery.mockResolvedValue({ rows: [] });

        await getMessages({
          guildId: 'guild123',
          limit: 50,
          offset: 10,
        });

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('LIMIT'),
          expect.arrayContaining([50, 10])
        );
      });

      it('should combine multiple filters', async () => {
        mockQuery.mockResolvedValue({ rows: [] });

        await getMessages({
          guildId: 'guild123',
          channelIds: ['channel1'],
          userId: 'user123',
          since: new Date('2026-01-01'),
          hasMentions: true,
          limit: 25,
        });

        const sql = mockQuery.mock.calls[0][0];
        expect(sql).toContain('m.guild_id = $1');
        expect(sql).toContain('m.channel_id = ANY($2)');
        expect(sql).toContain('m.user_id = $3');
        expect(sql).toContain('m.posted_at >= $4');
        expect(sql).toContain('m.has_mentions = $5');
        expect(sql).toContain('LIMIT');
      });
    });

    describe('deleteMessage', () => {
      it('should delete message by ID', async () => {
        mockQuery.mockResolvedValue({ rowCount: 1 });

        await deleteMessage('msg123');

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('DELETE FROM messages'),
          ['msg123']
        );
      });
    });
  });

  describe('User Activity queries', () => {
    describe('upsertUserActivity', () => {
      it('should insert or update user activity', async () => {
        const mockActivity = {
          id: 1,
          user_id: 'user123',
          guild_id: 'guild123',
          channel_id: 'channel123',
          last_activity_at: new Date(),
          message_count: 5,
          created_at: new Date(),
          updated_at: new Date(),
        };

        mockQuery.mockResolvedValue({ rows: [mockActivity] });

        const result = await upsertUserActivity({
          userId: 'user123',
          guildId: 'guild123',
          channelId: 'channel123',
          timestamp: new Date(),
        });

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO user_activity'),
          expect.arrayContaining(['user123', 'guild123', 'channel123', expect.any(Date)])
        );
        expect(result).toEqual(mockActivity);
      });
    });

    describe('getUserLastActivity', () => {
      it('should get user last activity timestamp', async () => {
        const lastActivity = new Date('2026-01-10T12:00:00Z');
        mockQuery.mockResolvedValue({
          rows: [{ last_activity_at: lastActivity }],
        });

        const result = await getUserLastActivity('user123', 'guild123');

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('MAX(last_activity_at)'),
          ['user123', 'guild123']
        );
        expect(result).toEqual(lastActivity);
      });

      it('should return null when no activity found', async () => {
        mockQuery.mockResolvedValue({ rows: [] });

        const result = await getUserLastActivity('user123', 'guild123');

        expect(result).toBeNull();
      });

      it('should return null when activity is null', async () => {
        mockQuery.mockResolvedValue({
          rows: [{ last_activity_at: null }],
        });

        const result = await getUserLastActivity('user123', 'guild123');

        expect(result).toBeNull();
      });
    });
  });

  describe('Event queries', () => {
    describe('insertEvent', () => {
      it('should insert event successfully', async () => {
        const mockEvent: Event = {
          id: 1,
          event_id: 'evt_123',
          guild_id: 'guild123',
          title: 'Gaming Night',
          description: 'Community gaming',
          event_type: 'gaming',
          scheduled_start: new Date('2026-01-15T20:00:00Z'),
          scheduled_end: new Date('2026-01-15T23:00:00Z'),
          location: null,
          channel_id: 'channel123',
          organizer_user_id: 'user123',
          source_type: 'detected',
          source_message_id: 'msg123',
          confidence_score: 85,
          is_cancelled: false,
          is_recurring: false,
          recurrence_rule: null,
          participant_roles: [],
          created_at: new Date(),
          updated_at: new Date(),
        };

        mockQuery.mockResolvedValue({ rows: [mockEvent] });

        const result = await insertEvent(
          'guild123',
          'Gaming Night',
          'gaming',
          new Date('2026-01-15T20:00:00Z'),
          'detected',
          'evt_123',
          'Community gaming',
          new Date('2026-01-15T23:00:00Z'),
          undefined,
          'channel123',
          'user123',
          'msg123',
          85
        );

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO events'),
          expect.arrayContaining([
            'evt_123',
            'guild123',
            'Gaming Night',
            'Community gaming',
            'gaming',
            expect.any(Date),
            expect.any(Date),
            undefined,
            'channel123',
            'user123',
            'detected',
            'msg123',
            85,
            false,
            undefined,
            [],
          ])
        );
        expect(result).toEqual(mockEvent);
      });
    });

    describe('getEvents', () => {
      it('should get events with basic filter', async () => {
        const mockEvents: Event[] = [
          {
            id: 1,
            event_id: 'evt_1',
            guild_id: 'guild123',
            title: 'Event 1',
            description: null,
            event_type: 'gaming',
            scheduled_start: new Date(),
            scheduled_end: null,
            location: null,
            channel_id: null,
            organizer_user_id: null,
            source_type: 'detected',
            source_message_id: null,
            confidence_score: 80,
            is_cancelled: false,
            is_recurring: false,
            recurrence_rule: null,
            participant_roles: [],
            created_at: new Date(),
            updated_at: new Date(),
          },
        ];

        mockQuery.mockResolvedValue({ rows: mockEvents });

        const result = await getEvents({ guildId: 'guild123' });

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('WHERE guild_id = $1'),
          ['guild123']
        );
        expect(result).toEqual(mockEvents);
      });

      it('should filter by channel', async () => {
        mockQuery.mockResolvedValue({ rows: [] });

        await getEvents({
          guildId: 'guild123',
          channelId: 'channel123',
        });

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('channel_id = $2'),
          expect.arrayContaining(['channel123'])
        );
      });

      it('should filter by start time range', async () => {
        mockQuery.mockResolvedValue({ rows: [] });

        const startAfter = new Date('2026-01-10T00:00:00Z');
        const startBefore = new Date('2026-01-20T00:00:00Z');

        await getEvents({
          guildId: 'guild123',
          startAfter,
          startBefore,
        });

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('scheduled_start >= $2'),
          expect.arrayContaining([startAfter, startBefore])
        );
      });

      it('should filter by event types', async () => {
        mockQuery.mockResolvedValue({ rows: [] });

        await getEvents({
          guildId: 'guild123',
          eventTypes: ['gaming', 'meeting'],
        });

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('event_type = ANY($2)'),
          expect.arrayContaining([['gaming', 'meeting']])
        );
      });

      it('should exclude cancelled events by default', async () => {
        mockQuery.mockResolvedValue({ rows: [] });

        await getEvents({ guildId: 'guild123' });

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('is_cancelled = FALSE'),
          expect.any(Array)
        );
      });

      it('should include cancelled events when requested', async () => {
        mockQuery.mockResolvedValue({ rows: [] });

        await getEvents({
          guildId: 'guild123',
          includeCancel: true,
        });

        const sql = mockQuery.mock.calls[0][0];
        expect(sql).not.toContain('is_cancelled = FALSE');
      });

      it('should filter by minimum confidence', async () => {
        mockQuery.mockResolvedValue({ rows: [] });

        await getEvents({
          guildId: 'guild123',
          minConfidence: 70,
        });

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('confidence_score IS NULL OR confidence_score >= $2'),
          expect.arrayContaining([70])
        );
      });
    });

    describe('cancelEvent', () => {
      it('should cancel event by ID', async () => {
        mockQuery.mockResolvedValue({ rowCount: 1 });

        await cancelEvent('evt_123');

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE events SET is_cancelled = TRUE'),
          ['evt_123']
        );
      });
    });
  });

  describe('Summary queries', () => {
    describe('insertSummary', () => {
      it('should insert summary successfully', async () => {
        const mockSummary: Summary = {
          id: 1,
          user_id: 'user123',
          guild_id: 'guild123',
          summary_content: 'Summary text',
          detail_level: 'brief',
          message_count: 50,
          time_range_start: new Date('2026-01-09T00:00:00Z'),
          time_range_end: new Date('2026-01-10T00:00:00Z'),
          satisfaction_rating: null,
          created_at: new Date(),
        };

        mockQuery.mockResolvedValue({ rows: [mockSummary] });

        const result = await insertSummary(
          'user123',
          'guild123',
          'Summary text',
          'brief',
          50,
          new Date('2026-01-09T00:00:00Z'),
          new Date('2026-01-10T00:00:00Z')
        );

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO summaries'),
          [
            'user123',
            'guild123',
            'Summary text',
            'brief',
            50,
            expect.any(Date),
            expect.any(Date),
          ]
        );
        expect(result).toEqual(mockSummary);
      });
    });

    describe('updateSummaryRating', () => {
      it('should update summary rating', async () => {
        mockQuery.mockResolvedValue({ rowCount: 1 });

        await updateSummaryRating(1, 5);

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE summaries SET satisfaction_rating'),
          [5, 1]
        );
      });
    });

    describe('getUserSummaries', () => {
      it('should get user summaries with default limit', async () => {
        const mockSummaries: Summary[] = [
          {
            id: 1,
            user_id: 'user123',
            guild_id: 'guild123',
            summary_content: 'Summary 1',
            detail_level: 'brief',
            message_count: 50,
            time_range_start: new Date(),
            time_range_end: new Date(),
            satisfaction_rating: 5,
            created_at: new Date(),
          },
        ];

        mockQuery.mockResolvedValue({ rows: mockSummaries });

        const result = await getUserSummaries('user123');

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('WHERE user_id = $1'),
          ['user123', 10]
        );
        expect(result).toEqual(mockSummaries);
      });

      it('should support custom limit', async () => {
        mockQuery.mockResolvedValue({ rows: [] });

        await getUserSummaries('user123', 25);

        expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ['user123', 25]);
      });
    });
  });
});
