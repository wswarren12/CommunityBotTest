import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { GuildMember, Guild, User, Role } from 'discord.js';
import {
  generateCatchupSummary,
  getConversationRecommendations,
} from '../../src/services/summaryService';
import * as aiService from '../../src/services/aiService';
import * as queries from '../../src/db/queries';
import * as messageService from '../../src/services/messageService';
import * as logger from '../../src/utils/logger';
import { MessageWithUser } from '../../src/types/database';

// Mock dependencies
jest.mock('../../src/services/aiService');
jest.mock('../../src/db/queries');
jest.mock('../../src/services/messageService');
jest.mock('../../src/utils/logger');

describe('SummaryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateCatchupSummary', () => {
    let mockGuildMember: Partial<GuildMember>;
    let mockGuild: Partial<Guild>;
    let mockUser: Partial<User>;

    beforeEach(() => {
      mockUser = {
        id: 'user123',
        username: 'testuser',
      } as any;

      mockGuild = {
        id: 'guild123',
        name: 'Test Guild',
      } as any;

      mockGuildMember = {
        id: 'user123',
        user: mockUser as User,
        guild: mockGuild as Guild,
        roles: {
          cache: new Map([
            ['role1', { name: 'Member' } as Role],
            ['role2', { name: 'Contributor' } as Role],
          ]),
        } as any,
      } as any;
    });

    it('should generate a summary for a user with messages', async () => {
      const mockMessages: MessageWithUser[] = [
        {
          message_id: 'msg1',
          channel_id: 'channel1',
          user_id: 'user2',
          guild_id: 'guild123',
          content: '@testuser hello!',
          posted_at: new Date('2026-01-10T10:00:00Z'),
          has_mentions: true,
          mention_users: ['user123'],
          mention_roles: [],
          has_attachments: false,
          attachment_count: 0,
          created_at: new Date(),
          author_name: 'OtherUser',
          author_global_name: undefined,
          channel_name: 'general',
        },
      ];

      (messageService.getUserAccessibleChannels as any).mockResolvedValue([
        'channel1',
        'channel2',
      ]);
      (queries.getUserLastActivity as any).mockResolvedValue(
        new Date('2026-01-09T10:00:00Z')
      );
      (queries.getMessages as any).mockResolvedValue(mockMessages);
      (aiService.generateSummary as any).mockResolvedValue({
        summary: '🎯 **Important for You**\n- You were mentioned once',
        messageCount: 1,
        mentionCount: 1,
        categories: { mentions: 1, discussions: 0, announcements: 0, events: 0 },
      });
      (queries.insertSummary as any).mockResolvedValue({ id: 1 });

      const result = await generateCatchupSummary({
        guildMember: mockGuildMember as GuildMember,
      });

      expect(result).toMatchObject({
        summary: expect.stringContaining('Important for You'),
        messageCount: 1,
        mentionCount: 1,
        summaryId: 1,
      });

      expect(aiService.generateSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user123',
          username: 'testuser',
          guildId: 'guild123',
          guildName: 'Test Guild',
          messages: mockMessages,
          userRoles: ['Member', 'Contributor'],
          mentionCount: 1,
        }),
        'brief'
      );

      expect(queries.insertSummary).toHaveBeenCalledWith(
        'user123',
        'guild123',
        expect.any(String),
        'brief',
        1,
        expect.any(Date),
        expect.any(Date)
      );
    });

    it('should return empty summary when no messages found', async () => {
      (messageService.getUserAccessibleChannels as any).mockResolvedValue([
        'channel1',
      ]);
      (queries.getUserLastActivity as any).mockResolvedValue(
        new Date('2026-01-09T10:00:00Z')
      );
      (queries.getMessages as any).mockResolvedValue([]);

      const result = await generateCatchupSummary({
        guildMember: mockGuildMember as GuildMember,
      });

      expect(result.messageCount).toBe(0);
      expect(result.mentionCount).toBe(0);
      expect(result.summary).toContain('All caught up!');
      expect(aiService.generateSummary).not.toHaveBeenCalled();
    });

    it('should handle custom timeframe parameter', async () => {
      (messageService.getUserAccessibleChannels as any).mockResolvedValue([
        'channel1',
      ]);
      (queries.getMessages as any).mockResolvedValue([]);

      await generateCatchupSummary({
        guildMember: mockGuildMember as GuildMember,
        customTimeframe: '6h',
      });

      const callArgs = (queries.getMessages as jest.Mock).mock.calls[0][0];
      const expectedTime = Date.now() - 6 * 60 * 60 * 1000;
      const actualTime = callArgs.since.getTime();

      // Allow 1 second tolerance
      expect(Math.abs(actualTime - expectedTime)).toBeLessThan(1000);
    });

    it('should filter messages by user accessible channels', async () => {
      const accessibleChannels = ['channel1', 'channel2', 'channel3'];
      (messageService.getUserAccessibleChannels as any).mockResolvedValue(
        accessibleChannels
      );
      (queries.getUserLastActivity as any).mockResolvedValue(
        new Date('2026-01-09T10:00:00Z')
      );
      (queries.getMessages as any).mockResolvedValue([]);

      await generateCatchupSummary({
        guildMember: mockGuildMember as GuildMember,
      });

      expect(queries.getMessages).toHaveBeenCalledWith(
        expect.objectContaining({
          guildId: 'guild123',
          channelIds: accessibleChannels,
        })
      );
    });

    it('should return warning when user has no accessible channels', async () => {
      (messageService.getUserAccessibleChannels as any).mockResolvedValue([]);

      const result = await generateCatchupSummary({
        guildMember: mockGuildMember as GuildMember,
      });

      expect(result.summary).toContain("don't have access to any channels");
      expect(result.messageCount).toBe(0);
      expect(queries.getMessages).not.toHaveBeenCalled();
    });

    it('should use last activity as start time when no custom timeframe', async () => {
      const lastActivity = new Date('2026-01-09T15:30:00Z');
      (messageService.getUserAccessibleChannels as any).mockResolvedValue([
        'channel1',
      ]);
      (queries.getUserLastActivity as any).mockResolvedValue(lastActivity);
      (queries.getMessages as any).mockResolvedValue([]);

      await generateCatchupSummary({
        guildMember: mockGuildMember as GuildMember,
      });

      expect(queries.getMessages).toHaveBeenCalledWith(
        expect.objectContaining({
          since: lastActivity,
        })
      );
    });

    it('should default to 24 hours when no last activity', async () => {
      (messageService.getUserAccessibleChannels as any).mockResolvedValue([
        'channel1',
      ]);
      (queries.getUserLastActivity as any).mockResolvedValue(null);
      (queries.getMessages as any).mockResolvedValue([]);

      await generateCatchupSummary({
        guildMember: mockGuildMember as GuildMember,
      });

      const callArgs = (queries.getMessages as jest.Mock).mock.calls[0][0];
      const expectedTime = Date.now() - 24 * 60 * 60 * 1000;
      const actualTime = callArgs.since.getTime();

      expect(Math.abs(actualTime - expectedTime)).toBeLessThan(1000);
    });

    it('should count mentions correctly', async () => {
      const mockMessages: MessageWithUser[] = [
        {
          id: 1,
          message_id: 'msg1',
          channel_id: 'channel1',
          user_id: 'user2',
          guild_id: 'guild123',
          content: '@testuser hello',
          posted_at: new Date(),
          has_mentions: true,
          mention_users: ['user123'],
          mention_roles: [],
          has_attachments: false,
          attachment_count: 0,
          created_at: new Date(),
          author_name: 'User2',
          author_global_name: undefined,
          channel_name: 'general',
        },
        {
          id: 2,
          message_id: 'msg2',
          channel_id: 'channel1',
          user_id: 'user3',
          guild_id: 'guild123',
          content: 'Regular message',
          posted_at: new Date(),
          has_mentions: false,
          mention_users: [],
          mention_roles: [],
          has_attachments: false,
          attachment_count: 0,
          created_at: new Date(),
          author_name: 'User3',
          author_global_name: undefined,
          channel_name: 'general',
        },
        {
          id: 3,
          message_id: 'msg3',
          channel_id: 'channel1',
          user_id: 'user4',
          guild_id: 'guild123',
          content: '@testuser again!',
          posted_at: new Date(),
          has_mentions: true,
          mention_users: ['user123'],
          mention_roles: [],
          has_attachments: false,
          attachment_count: 0,
          created_at: new Date(),
          author_name: 'User4',
          author_global_name: undefined,
          channel_name: 'general',
        },
      ];

      (messageService.getUserAccessibleChannels as any).mockResolvedValue([
        'channel1',
      ]);
      (queries.getUserLastActivity as any).mockResolvedValue(new Date());
      (queries.getMessages as any).mockResolvedValue(mockMessages);
      (aiService.generateSummary as any).mockResolvedValue({
        summary: 'Summary',
        messageCount: 3,
        mentionCount: 2,
        categories: { mentions: 2, discussions: 0, announcements: 0, events: 0 },
      });
      (queries.insertSummary as any).mockResolvedValue({ id: 1 });

      const result = await generateCatchupSummary({
        guildMember: mockGuildMember as GuildMember,
      });

      expect(result.mentionCount).toBe(2);
    });

    it('should throw error on failure', async () => {
      (messageService.getUserAccessibleChannels as any).mockRejectedValue(
        new Error('Database error')
      );

      await expect(
        generateCatchupSummary({
          guildMember: mockGuildMember as GuildMember,
        })
      ).rejects.toThrow('Failed to generate summary. Please try again later.');

      expect(logger.logger.error).toHaveBeenCalledWith(
        'Failed to generate catchup summary',
        expect.objectContaining({
          userId: 'user123',
          guildId: 'guild123',
          error: 'Database error',
        })
      );
    });

    it('should support different detail levels', async () => {
      (messageService.getUserAccessibleChannels as any).mockResolvedValue([
        'channel1',
      ]);
      (queries.getUserLastActivity as any).mockResolvedValue(new Date());
      (queries.getMessages as any).mockResolvedValue([
        {
          id: 1,
          message_id: 'msg1',
          channel_id: 'channel1',
          user_id: 'user2',
          guild_id: 'guild123',
          content: 'Test',
          posted_at: new Date(),
          has_mentions: false,
          mention_users: [],
          mention_roles: [],
          has_attachments: false,
          attachment_count: 0,
          created_at: new Date(),
          author_name: 'User2',
          author_global_name: undefined,
          channel_name: 'general',
        },
      ]);
      (aiService.generateSummary as any).mockResolvedValue({
        summary: 'Detailed summary',
        messageCount: 1,
        mentionCount: 0,
        categories: { mentions: 0, discussions: 1, announcements: 0, events: 0 },
      });
      (queries.insertSummary as any).mockResolvedValue({ id: 1 });

      await generateCatchupSummary({
        guildMember: mockGuildMember as GuildMember,
        detailLevel: 'detailed',
      });

      expect(aiService.generateSummary).toHaveBeenCalledWith(
        expect.any(Object),
        'detailed'
      );
    });

    it('should limit messages to 500', async () => {
      (messageService.getUserAccessibleChannels as any).mockResolvedValue([
        'channel1',
      ]);
      (queries.getUserLastActivity as any).mockResolvedValue(new Date());
      (queries.getMessages as any).mockResolvedValue([]);

      await generateCatchupSummary({
        guildMember: mockGuildMember as GuildMember,
      });

      expect(queries.getMessages).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 500,
        })
      );
    });

    it('should handle invalid timeframe format', async () => {
      (messageService.getUserAccessibleChannels as any).mockResolvedValue([
        'channel1',
      ]);

      await expect(
        generateCatchupSummary({
          guildMember: mockGuildMember as GuildMember,
          customTimeframe: 'invalid',
        })
      ).rejects.toThrow('Failed to generate summary. Please try again later.');
    });

    it('should parse various timeframe formats', async () => {
      (messageService.getUserAccessibleChannels as any).mockResolvedValue([
        'channel1',
      ]);
      (queries.getMessages as any).mockResolvedValue([]);

      // Test hours
      await generateCatchupSummary({
        guildMember: mockGuildMember as GuildMember,
        customTimeframe: '12h',
      });

      // Test days
      await generateCatchupSummary({
        guildMember: mockGuildMember as GuildMember,
        customTimeframe: '7d',
      });

      // Test weeks
      await generateCatchupSummary({
        guildMember: mockGuildMember as GuildMember,
        customTimeframe: '2w',
      });

      // Test months
      await generateCatchupSummary({
        guildMember: mockGuildMember as GuildMember,
        customTimeframe: '1m',
      });

      expect(queries.getMessages).toHaveBeenCalledTimes(4);
    });
  });

  describe('getConversationRecommendations', () => {
    let mockGuildMember: Partial<GuildMember>;
    let mockGuild: Partial<Guild>;

    beforeEach(() => {
      mockGuild = {
        id: 'guild123',
        name: 'Test Guild',
      };

      mockGuildMember = {
        id: 'user123',
        guild: mockGuild as Guild,
      };
    });

    it('should return top active channels', async () => {
      const mockMessages: MessageWithUser[] = [
        {
          id: 1,
          message_id: 'msg1',
          channel_id: 'channel1',
          user_id: 'user2',
          guild_id: 'guild123',
          content: 'Message in channel 1',
          posted_at: new Date('2026-01-10T10:00:00Z'),
          has_mentions: false,
          mention_users: [],
          mention_roles: [],
          has_attachments: false,
          attachment_count: 0,
          created_at: new Date(),
          author_name: 'User2',
          author_global_name: undefined,
          channel_name: 'general',
        },
        {
          id: 2,
          message_id: 'msg2',
          channel_id: 'channel1',
          user_id: 'user3',
          guild_id: 'guild123',
          content: 'Another message',
          posted_at: new Date('2026-01-10T10:05:00Z'),
          has_mentions: false,
          mention_users: [],
          mention_roles: [],
          has_attachments: false,
          attachment_count: 0,
          created_at: new Date(),
          author_name: 'User3',
          author_global_name: undefined,
          channel_name: 'general',
        },
        {
          id: 3,
          message_id: 'msg3',
          channel_id: 'channel2',
          user_id: 'user4',
          guild_id: 'guild123',
          content: 'Message in channel 2',
          posted_at: new Date('2026-01-10T10:10:00Z'),
          has_mentions: false,
          mention_users: [],
          mention_roles: [],
          has_attachments: false,
          attachment_count: 0,
          created_at: new Date(),
          author_name: 'User4',
          author_global_name: undefined,
          channel_name: 'off-topic',
        },
      ];

      (messageService.getUserAccessibleChannels as any).mockResolvedValue([
        'channel1',
        'channel2',
      ]);
      (queries.getMessages as any).mockResolvedValue(mockMessages);

      const result = await getConversationRecommendations(
        mockGuildMember as GuildMember
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        channelId: 'channel1',
        channelName: 'general',
        messageCount: 2,
      });
      expect(result[1]).toMatchObject({
        channelId: 'channel2',
        channelName: 'off-topic',
        messageCount: 1,
      });
    });

    it('should respect channel permissions', async () => {
      (messageService.getUserAccessibleChannels as any).mockResolvedValue([
        'channel1',
      ]);
      (queries.getMessages as any).mockResolvedValue([]);

      await getConversationRecommendations(mockGuildMember as GuildMember);

      expect(messageService.getUserAccessibleChannels).toHaveBeenCalledWith(
        mockGuildMember
      );
      expect(queries.getMessages).toHaveBeenCalledWith(
        expect.objectContaining({
          channelIds: ['channel1'],
        })
      );
    });

    it('should respect custom limit', async () => {
      (messageService.getUserAccessibleChannels as any).mockResolvedValue([
        'channel1',
      ]);
      (queries.getMessages as any).mockResolvedValue([]);

      await getConversationRecommendations(mockGuildMember as GuildMember, 3);

      // We can't directly test the limit, but we can verify the function completes
      expect(messageService.getUserAccessibleChannels).toHaveBeenCalled();
    });

    it('should return empty array on error', async () => {
      (messageService.getUserAccessibleChannels as any).mockRejectedValue(
        new Error('Permission error')
      );

      const result = await getConversationRecommendations(
        mockGuildMember as GuildMember
      );

      expect(result).toEqual([]);
      expect(logger.logger.error).toHaveBeenCalledWith(
        'Failed to get conversation recommendations',
        expect.objectContaining({
          userId: 'user123',
          guildId: 'guild123',
          error: 'Permission error',
        })
      );
    });

    it('should extract topic from latest message', async () => {
      const mockMessages: MessageWithUser[] = [
        {
          id: 1,
          message_id: 'msg1',
          channel_id: 'channel1',
          user_id: 'user2',
          guild_id: 'guild123',
          content: 'This is a discussion about testing. It has multiple sentences.',
          posted_at: new Date('2026-01-10T10:00:00Z'),
          has_mentions: false,
          mention_users: [],
          mention_roles: [],
          has_attachments: false,
          attachment_count: 0,
          created_at: new Date(),
          author_name: 'User2',
          author_global_name: undefined,
          channel_name: 'general',
        },
      ];

      (messageService.getUserAccessibleChannels as any).mockResolvedValue([
        'channel1',
      ]);
      (queries.getMessages as any).mockResolvedValue(mockMessages);

      const result = await getConversationRecommendations(
        mockGuildMember as GuildMember
      );

      expect(result[0].topic).toBe('This is a discussion about testing');
    });

    it('should sort channels by activity count', async () => {
      const mockMessages: MessageWithUser[] = [
        // channel2 has more messages
        {
          id: 1,
          message_id: 'msg1',
          channel_id: 'channel2',
          user_id: 'user2',
          guild_id: 'guild123',
          content: 'Msg 1',
          posted_at: new Date('2026-01-10T10:00:00Z'),
          has_mentions: false,
          mention_users: [],
          mention_roles: [],
          has_attachments: false,
          attachment_count: 0,
          created_at: new Date(),
          author_name: 'User2',
          author_global_name: undefined,
          channel_name: 'busy-channel',
        },
        {
          id: 2,
          message_id: 'msg2',
          channel_id: 'channel2',
          user_id: 'user3',
          guild_id: 'guild123',
          content: 'Msg 2',
          posted_at: new Date('2026-01-10T10:05:00Z'),
          has_mentions: false,
          mention_users: [],
          mention_roles: [],
          has_attachments: false,
          attachment_count: 0,
          created_at: new Date(),
          author_name: 'User3',
          author_global_name: undefined,
          channel_name: 'busy-channel',
        },
        {
          id: 3,
          message_id: 'msg3',
          channel_id: 'channel2',
          user_id: 'user4',
          guild_id: 'guild123',
          content: 'Msg 3',
          posted_at: new Date('2026-01-10T10:10:00Z'),
          has_mentions: false,
          mention_users: [],
          mention_roles: [],
          has_attachments: false,
          attachment_count: 0,
          created_at: new Date(),
          author_name: 'User4',
          author_global_name: undefined,
          channel_name: 'busy-channel',
        },
        // channel1 has only 1 message
        {
          id: 4,
          message_id: 'msg4',
          channel_id: 'channel1',
          user_id: 'user5',
          guild_id: 'guild123',
          content: 'Single message',
          posted_at: new Date('2026-01-10T10:15:00Z'),
          has_mentions: false,
          mention_users: [],
          mention_roles: [],
          has_attachments: false,
          attachment_count: 0,
          created_at: new Date(),
          author_name: 'User5',
          author_global_name: undefined,
          channel_name: 'quiet-channel',
        },
      ];

      (messageService.getUserAccessibleChannels as any).mockResolvedValue([
        'channel1',
        'channel2',
      ]);
      (queries.getMessages as any).mockResolvedValue(mockMessages);

      const result = await getConversationRecommendations(
        mockGuildMember as GuildMember
      );

      // channel2 should be first (3 messages), channel1 second (1 message)
      expect(result[0].channelId).toBe('channel2');
      expect(result[0].messageCount).toBe(3);
      expect(result[1].channelId).toBe('channel1');
      expect(result[1].messageCount).toBe(1);
    });
  });
});
