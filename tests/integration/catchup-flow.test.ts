import { ChatInputCommandInteraction } from 'discord.js';
import { handleCatchupCommand } from '../../src/commands/catchup';
import * as summaryService from '../../src/services/summaryService';
import * as messageService from '../../src/services/messageService';
import * as dbQueries from '../../src/db/queries';
import { logger } from '../../src/utils/logger';

// Mock dependencies
jest.mock('../../src/services/summaryService');
jest.mock('../../src/services/messageService');
jest.mock('../../src/db/queries');
jest.mock('../../src/utils/logger');

describe('Integration: /catchup command flow', () => {
  let mockInteraction: jest.Mocked<ChatInputCommandInteraction>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockInteraction = {
      user: {
        id: 'user123',
        username: 'testuser',
      },
      guildId: 'guild123',
      channelId: 'channel123',
      member: {
        user: { id: 'user123', username: 'testuser' },
        guild: { id: 'guild123', name: 'Test Guild' },
        roles: { cache: new Map() },
      },
      options: {
        getString: jest.fn().mockReturnValue(null),
      },
      reply: jest.fn().mockResolvedValue(undefined),
      deferReply: jest.fn().mockResolvedValue(undefined),
      editReply: jest.fn().mockResolvedValue(undefined),
    } as any;
  });

  describe('successful catchup generation', () => {
    it('should generate and return a summary for user with recent activity', async () => {
      // Mock user has recent activity
      (dbQueries.getUserLastActivity as jest.Mock).mockResolvedValue(
        new Date(Date.now() - 1000 * 60 * 60) // 1 hour ago
      );

      // Mock messages retrieved
      (messageService.canUserAccessChannel as jest.Mock).mockResolvedValue(true);
      (dbQueries.getMessages as jest.Mock).mockResolvedValue([
        {
          messageId: 'msg1',
          channelId: 'channel123',
          authorId: 'user456',
          content: 'Hello everyone!',
          timestamp: new Date(),
        },
        {
          messageId: 'msg2',
          channelId: 'channel123',
          authorId: 'user789',
          content: 'How is everyone doing?',
          timestamp: new Date(),
        },
      ]);

      // Mock summary generation (matches current API)
      (summaryService.generateCatchupSummary as jest.Mock).mockResolvedValue({
        summary: '## Recent Activity\n\nThere have been 2 messages in the past hour.',
        summaryId: 1,
        timeRangeStart: new Date(Date.now() - 1000 * 60 * 60),
        timeRangeEnd: new Date(),
        messageCount: 2,
        mentionCount: 0,
      });

      await handleCatchupCommand(mockInteraction);

      // Verify the flow
      expect(mockInteraction.deferReply).toHaveBeenCalledWith({ flags: [64] }); // 64 = MessageFlags.Ephemeral
      expect(summaryService.generateCatchupSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          guildMember: expect.anything(),
          detailLevel: 'brief',
        })
      );
      // editReply is called with embeds and components
      expect(mockInteraction.editReply).toHaveBeenCalled();
    });

    it('should handle custom timeframe parameter', async () => {
      mockInteraction.options.getString = jest.fn().mockReturnValue('6h');

      (dbQueries.getUserLastActivity as jest.Mock).mockResolvedValue(
        new Date(Date.now() - 1000 * 60 * 60 * 6) // 6 hours ago
      );

      (messageService.canUserAccessChannel as jest.Mock).mockResolvedValue(true);
      (dbQueries.getMessages as jest.Mock).mockResolvedValue([]);

      (summaryService.generateCatchupSummary as jest.Mock).mockResolvedValue({
        summary: '## No Recent Activity\n\nNo messages in the past 6 hours.',
        summaryId: 1,
        timeRangeStart: new Date(Date.now() - 1000 * 60 * 60 * 6),
        timeRangeEnd: new Date(),
        messageCount: 0,
        mentionCount: 0,
      });

      await handleCatchupCommand(mockInteraction);

      expect(summaryService.generateCatchupSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          guildMember: expect.anything(),
          detailLevel: 'brief',
          customTimeframe: '6h',
        })
      );
    });

    it('should filter messages based on user permissions', async () => {
      (dbQueries.getUserLastActivity as jest.Mock).mockResolvedValue(
        new Date(Date.now() - 1000 * 60 * 60)
      );

      // User can only access some channels
      (messageService.canUserAccessChannel as jest.Mock).mockImplementation(
        (_userId, _guildId, channelId) => {
          return Promise.resolve(channelId === 'channel123');
        }
      );

      (dbQueries.getMessages as jest.Mock).mockResolvedValue([
        {
          messageId: 'msg1',
          channelId: 'channel123',
          authorId: 'user456',
          content: 'Visible message',
          timestamp: new Date(),
        },
        {
          messageId: 'msg2',
          channelId: 'channel456', // User cannot access
          authorId: 'user789',
          content: 'Hidden message',
          timestamp: new Date(),
        },
      ]);

      (summaryService.generateCatchupSummary as jest.Mock).mockResolvedValue({
        summary: '## Recent Activity\n\nYou have 1 accessible message.',
        summaryId: 1,
        timeRangeStart: new Date(Date.now() - 1000 * 60 * 60),
        timeRangeEnd: new Date(),
        messageCount: 1,
        mentionCount: 0,
      });

      await handleCatchupCommand(mockInteraction);

      expect(summaryService.generateCatchupSummary).toHaveBeenCalled();
    });
  });

  describe('error scenarios', () => {
    it('should handle database connection errors', async () => {
      // The command handler calls summaryService.generateCatchupSummary which internally uses db
      (summaryService.generateCatchupSummary as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      await handleCatchupCommand(mockInteraction);

      expect(logger.error).toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Database connection failed'),
        })
      );
    });

    it('should handle AI service failures', async () => {
      (dbQueries.getUserLastActivity as jest.Mock).mockResolvedValue(
        new Date(Date.now() - 1000 * 60 * 60)
      );

      (messageService.canUserAccessChannel as jest.Mock).mockResolvedValue(true);
      (dbQueries.getMessages as jest.Mock).mockResolvedValue([]);

      (summaryService.generateCatchupSummary as jest.Mock).mockRejectedValue(
        new Error('Claude API rate limited')
      );

      await handleCatchupCommand(mockInteraction);

      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle permission check failures', async () => {
      (dbQueries.getUserLastActivity as jest.Mock).mockResolvedValue(
        new Date()
      );

      (messageService.canUserAccessChannel as jest.Mock).mockRejectedValue(
        new Error('Failed to check permissions')
      );

      await handleCatchupCommand(mockInteraction);

      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle user with no previous activity', async () => {
      (dbQueries.getUserLastActivity as jest.Mock).mockResolvedValue(null);

      (messageService.canUserAccessChannel as jest.Mock).mockResolvedValue(true);
      (dbQueries.getMessages as jest.Mock).mockResolvedValue([]);

      (summaryService.generateCatchupSummary as jest.Mock).mockResolvedValue({
        summary: '## Welcome!\n\nThis is your first time using /catchup.',
        summaryId: 1,
        timeRangeStart: new Date(Date.now() - 1000 * 60 * 60 * 24),
        timeRangeEnd: new Date(),
        messageCount: 0,
        mentionCount: 0,
      });

      await handleCatchupCommand(mockInteraction);

      expect(summaryService.generateCatchupSummary).toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalled();
    });

    it('should handle large message volumes', async () => {
      (dbQueries.getUserLastActivity as jest.Mock).mockResolvedValue(
        new Date(Date.now() - 1000 * 60 * 60 * 24) // 1 day ago
      );

      (messageService.canUserAccessChannel as jest.Mock).mockResolvedValue(true);

      // Generate 1000 mock messages
      const messages = Array.from({ length: 1000 }, (_, i) => ({
        messageId: `msg${i}`,
        channelId: 'channel123',
        authorId: `user${i % 10}`,
        content: `Message ${i}`,
        timestamp: new Date(Date.now() - i * 1000),
      }));

      (dbQueries.getMessages as jest.Mock).mockResolvedValue(messages);

      (summaryService.generateCatchupSummary as jest.Mock).mockResolvedValue({
        summary: '## Very Active Day\n\nThere have been 1000 messages!',
        summaryId: 1,
        timeRangeStart: new Date(Date.now() - 1000 * 60 * 60 * 24),
        timeRangeEnd: new Date(),
        messageCount: 1000,
        mentionCount: 0,
      });

      await handleCatchupCommand(mockInteraction);

      expect(summaryService.generateCatchupSummary).toHaveBeenCalled();
    });

    it('should handle user mentioned in many messages', async () => {
      (dbQueries.getUserLastActivity as jest.Mock).mockResolvedValue(
        new Date(Date.now() - 1000 * 60 * 60)
      );

      (messageService.canUserAccessChannel as jest.Mock).mockResolvedValue(true);
      (dbQueries.getMessages as jest.Mock).mockResolvedValue([
        {
          messageId: 'msg1',
          channelId: 'channel123',
          authorId: 'user456',
          content: 'Hey <@user123>, check this out!',
          timestamp: new Date(),
          mentions: ['user123'],
        },
        {
          messageId: 'msg2',
          channelId: 'channel123',
          authorId: 'user789',
          content: '<@user123> are you there?',
          timestamp: new Date(),
          mentions: ['user123'],
        },
      ]);

      (summaryService.generateCatchupSummary as jest.Mock).mockResolvedValue({
        summary: '## You Were Mentioned!\n\nYou were mentioned 2 times.',
        summaryId: 1,
        timeRangeStart: new Date(Date.now() - 1000 * 60 * 60),
        timeRangeEnd: new Date(),
        messageCount: 2,
        mentionCount: 2,
      });

      await handleCatchupCommand(mockInteraction);

      // editReply is called with embeds
      expect(mockInteraction.editReply).toHaveBeenCalled();
    });

    it('should handle messages from multiple channels', async () => {
      (dbQueries.getUserLastActivity as jest.Mock).mockResolvedValue(
        new Date(Date.now() - 1000 * 60 * 60)
      );

      (messageService.canUserAccessChannel as jest.Mock).mockResolvedValue(true);
      (dbQueries.getMessages as jest.Mock).mockResolvedValue([
        {
          messageId: 'msg1',
          channelId: 'channel123',
          authorId: 'user456',
          content: 'Message in channel 1',
          timestamp: new Date(),
        },
        {
          messageId: 'msg2',
          channelId: 'channel456',
          authorId: 'user789',
          content: 'Message in channel 2',
          timestamp: new Date(),
        },
        {
          messageId: 'msg3',
          channelId: 'channel789',
          authorId: 'user101',
          content: 'Message in channel 3',
          timestamp: new Date(),
        },
      ]);

      (summaryService.generateCatchupSummary as jest.Mock).mockResolvedValue({
        summary: '## Multi-Channel Activity\n\nActivity across 3 channels.',
        summaryId: 1,
        timeRangeStart: new Date(Date.now() - 1000 * 60 * 60),
        timeRangeEnd: new Date(),
        messageCount: 3,
        mentionCount: 0,
      });

      await handleCatchupCommand(mockInteraction);

      expect(summaryService.generateCatchupSummary).toHaveBeenCalled();
    });
  });
});
