import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  GuildMember,
  Guild,
  User,
  MessageFlags,
} from 'discord.js';
import { handleCatchupCommand, handleExpandButton } from '../../src/commands/catchup';
import * as summaryService from '../../src/services/summaryService';
import * as logger from '../../src/utils/logger';

// Mock dependencies
jest.mock('../../src/services/summaryService');
jest.mock('../../src/utils/logger');

describe('catchup command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handleCatchupCommand', () => {
    let mockInteraction: Partial<ChatInputCommandInteraction>;
    let mockGuildMember: Partial<GuildMember>;
    let mockUser: Partial<User>;
    let mockGuild: Partial<Guild>;

    beforeEach(() => {
      mockUser = {
        id: 'user123',
        username: 'testuser',
      };

      mockGuild = {
        id: 'guild123',
        name: 'Test Guild',
      };

      mockGuildMember = {
        id: 'user123',
        user: mockUser as User,
        guild: mockGuild as Guild,
        roles: {
          cache: new Map(),
        } as any,
      };

      mockInteraction = {
        user: mockUser as User,
        guildId: 'guild123',
        guild: mockGuild as Guild,
        member: mockGuildMember as GuildMember,
        deferReply: jest.fn().mockResolvedValue(undefined),
        editReply: jest.fn().mockResolvedValue(undefined),
        options: {
          getString: jest.fn().mockReturnValue(null),
        } as any,
      };
    });

    it('should generate catchup summary successfully', async () => {
      const mockSummaryResult = {
        summary: '🎯 **Important for You**\n- You were mentioned 3 times\n\n💬 **Active Discussions**\n- General chat is active',
        messageCount: 50,
        mentionCount: 3,
        timeRangeStart: new Date('2026-01-09T10:00:00Z'),
        timeRangeEnd: new Date('2026-01-10T10:00:00Z'),
        summaryId: 1,
      };

      (summaryService.generateCatchupSummary as jest.Mock).mockResolvedValue(
        mockSummaryResult
      );

      await handleCatchupCommand(mockInteraction as ChatInputCommandInteraction);

      expect(mockInteraction.deferReply).toHaveBeenCalledWith({
        flags: [MessageFlags.Ephemeral],
      });

      expect(summaryService.generateCatchupSummary).toHaveBeenCalledWith({
        guildMember: mockGuildMember,
        detailLevel: 'brief',
        customTimeframe: undefined,
      });

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [
          expect.objectContaining({
            data: expect.objectContaining({
              title: '📋 Catchup Summary',
              description: mockSummaryResult.summary,
            }),
          }),
        ],
        components: expect.arrayContaining([
          expect.objectContaining({
            components: expect.arrayContaining([
              expect.objectContaining({
                data: expect.objectContaining({
                  label: 'Brief',
                }),
              }),
            ]),
          }),
        ]),
      });

      expect(logger.logger.info).toHaveBeenCalledWith(
        '/catchup command completed',
        expect.objectContaining({
          userId: 'user123',
          messageCount: 50,
        })
      );
    });

    it('should use custom timeframe when provided', async () => {
      (mockInteraction.options!.getString as jest.Mock).mockReturnValue('6h');

      (summaryService.generateCatchupSummary as jest.Mock).mockResolvedValue({
        summary: 'Summary',
        messageCount: 10,
        mentionCount: 0,
        timeRangeStart: new Date(),
        timeRangeEnd: new Date(),
      });

      await handleCatchupCommand(mockInteraction as ChatInputCommandInteraction);

      expect(summaryService.generateCatchupSummary).toHaveBeenCalledWith({
        guildMember: mockGuildMember,
        detailLevel: 'brief',
        customTimeframe: '6h',
      });
    });

    it('should not show buttons when message count is low', async () => {
      (summaryService.generateCatchupSummary as jest.Mock).mockResolvedValue({
        summary: 'All caught up!',
        messageCount: 3,
        mentionCount: 0,
        timeRangeStart: new Date(),
        timeRangeEnd: new Date(),
      });

      await handleCatchupCommand(mockInteraction as ChatInputCommandInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: expect.any(Array),
        components: [],
      });
    });

    it('should handle string member (API member)', async () => {
      mockInteraction.member = 'stringMember' as any;

      await handleCatchupCommand(mockInteraction as ChatInputCommandInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: 'Could not find your server membership. Please try again.',
      });
      expect(summaryService.generateCatchupSummary).not.toHaveBeenCalled();
    });

    it('should handle missing member', async () => {
      mockInteraction.member = null as any;

      await handleCatchupCommand(mockInteraction as ChatInputCommandInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: 'Could not find your server membership. Please try again.',
      });
    });

    it('should handle summary generation error', async () => {
      const error = new Error('Failed to generate summary');
      (summaryService.generateCatchupSummary as jest.Mock).mockRejectedValue(error);

      await handleCatchupCommand(mockInteraction as ChatInputCommandInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: '❌ Failed to generate summary',
      });

      expect(logger.logger.error).toHaveBeenCalledWith(
        'Error handling /catchup command',
        expect.objectContaining({
          userId: 'user123',
          error: 'Failed to generate summary',
        })
      );
    });

    it('should handle non-Error objects in catch block', async () => {
      (summaryService.generateCatchupSummary as jest.Mock).mockRejectedValue('string error');

      await handleCatchupCommand(mockInteraction as ChatInputCommandInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: '❌ An unexpected error occurred.',
      });
    });

    it('should handle error when replying fails', async () => {
      const error = new Error('Summary failed');
      (summaryService.generateCatchupSummary as jest.Mock).mockRejectedValue(error);
      (mockInteraction.editReply as jest.Mock).mockRejectedValue(
        new Error('Reply failed')
      );

      await handleCatchupCommand(mockInteraction as ChatInputCommandInteraction);

      expect(logger.logger.error).toHaveBeenCalledWith(
        'Failed to send error message',
        expect.objectContaining({
          error: 'Reply failed',
        })
      );
    });

    it('should create summary cache entry', async () => {
      const mockSummaryResult = {
        summary: 'Summary',
        messageCount: 50,
        mentionCount: 3,
        timeRangeStart: new Date('2026-01-09T10:00:00Z'),
        timeRangeEnd: new Date('2026-01-10T10:00:00Z'),
        summaryId: 1,
      };

      (summaryService.generateCatchupSummary as jest.Mock).mockResolvedValue(
        mockSummaryResult
      );

      await handleCatchupCommand(mockInteraction as ChatInputCommandInteraction);

      // Cache key should be in the button custom IDs
      const editReplyCall = (mockInteraction.editReply as jest.Mock).mock.calls[0][0];
      const buttonCustomId = editReplyCall.components[0].components[0].data.custom_id;

      expect(buttonCustomId).toMatch(/^expand_user123-guild123-\d+_brief$/);
    });
  });

  describe('handleExpandButton', () => {
    let mockInteraction: Partial<ButtonInteraction>;
    let mockGuildMember: Partial<GuildMember>;
    let mockUser: Partial<User>;
    let mockGuild: Partial<Guild>;

    beforeEach(() => {
      mockUser = {
        id: 'user123',
        username: 'testuser',
      };

      mockGuild = {
        id: 'guild123',
        name: 'Test Guild',
        members: {
          cache: new Map(),
        } as any,
      };

      mockGuildMember = {
        id: 'user123',
        user: mockUser as User,
        guild: mockGuild as Guild,
        roles: {
          cache: new Map(),
        } as any,
      };

      (mockGuild.members!.cache as Map<string, GuildMember>).set(
        'user123',
        mockGuildMember as GuildMember
      );

      mockInteraction = {
        user: mockUser as User,
        guildId: 'guild123',
        guild: mockGuild as Guild,
        customId: 'expand_user123-guild123-1234567890_detailed',
        deferUpdate: jest.fn().mockResolvedValue(undefined),
        editReply: jest.fn().mockResolvedValue(undefined),
        followUp: jest.fn().mockResolvedValue(undefined),
      };

      // Mock generateCatchupSummary for expansion
      (summaryService.generateCatchupSummary as jest.Mock).mockResolvedValue({
        summary: 'Detailed summary',
        messageCount: 50,
        mentionCount: 3,
        timeRangeStart: new Date(),
        timeRangeEnd: new Date(),
      });
    });

    it('should expand summary to detailed level', async () => {
      // First create a cache entry via handleCatchupCommand
      const catchupInteraction = {
        ...mockInteraction,
        deferReply: jest.fn().mockResolvedValue(undefined),
        member: mockGuildMember,
        options: {
          getString: jest.fn().mockReturnValue(null),
        } as any,
      } as any;

      (summaryService.generateCatchupSummary as jest.Mock).mockResolvedValue({
        summary: 'Brief summary',
        messageCount: 50,
        mentionCount: 3,
        timeRangeStart: new Date(),
        timeRangeEnd: new Date(),
        summaryId: 1,
      });

      await handleCatchupCommand(catchupInteraction);

      // Get the cache key from the button
      const editReplyCall = (catchupInteraction.editReply as jest.Mock).mock.calls[0][0];
      const buttonCustomId = editReplyCall.components[0].components[0].data.custom_id;
      const cacheKey = buttonCustomId.split('_')[1];

      // Now test expansion
      mockInteraction.customId = `expand_${cacheKey}_detailed`;

      (summaryService.generateCatchupSummary as jest.Mock).mockResolvedValue({
        summary: 'Detailed summary with more info',
        messageCount: 50,
        mentionCount: 3,
        timeRangeStart: new Date(),
        timeRangeEnd: new Date(),
      });

      await handleExpandButton(mockInteraction as ButtonInteraction);

      expect(mockInteraction.deferUpdate).toHaveBeenCalled();
      expect(summaryService.generateCatchupSummary).toHaveBeenCalledWith({
        guildMember: mockGuildMember,
        detailLevel: 'detailed',
      });
      expect(mockInteraction.editReply).toHaveBeenCalled();
    });

    it('should handle expired cache', async () => {
      mockInteraction.customId = 'expand_nonexistent-cache-key_detailed';

      await handleExpandButton(mockInteraction as ButtonInteraction);

      expect(mockInteraction.followUp).toHaveBeenCalledWith({
        content: 'This summary has expired. Please run `/catchup` again.',
        ephemeral: true,
      });
      expect(summaryService.generateCatchupSummary).not.toHaveBeenCalled();
    });

    it('should reject requests from different users', async () => {
      // Create cache for user123
      const catchupInteraction = {
        ...mockInteraction,
        deferReply: jest.fn().mockResolvedValue(undefined),
        member: mockGuildMember,
        options: {
          getString: jest.fn().mockReturnValue(null),
        } as any,
      } as any;

      (summaryService.generateCatchupSummary as jest.Mock).mockResolvedValue({
        summary: 'Summary',
        messageCount: 50,
        mentionCount: 3,
        timeRangeStart: new Date(),
        timeRangeEnd: new Date(),
        summaryId: 1,
      });

      await handleCatchupCommand(catchupInteraction);

      const editReplyCall = (catchupInteraction.editReply as jest.Mock).mock.calls[0][0];
      const buttonCustomId = editReplyCall.components[0].components[0].data.custom_id;
      const cacheKey = buttonCustomId.split('_')[1];

      // Try to expand as different user
      mockInteraction.user = { id: 'user456', username: 'otheruser' } as User;
      mockInteraction.customId = `expand_${cacheKey}_detailed`;

      await handleExpandButton(mockInteraction as ButtonInteraction);

      expect(mockInteraction.followUp).toHaveBeenCalledWith({
        content: 'This is not your summary.',
        ephemeral: true,
      });
    });

    it('should handle missing guild member', async () => {
      mockInteraction.guild = {
        ...mockGuild,
        members: {
          cache: new Map(), // Empty cache
        } as any,
      } as Guild;

      await handleExpandButton(mockInteraction as ButtonInteraction);

      expect(mockInteraction.followUp).toHaveBeenCalledWith({
        content: 'Could not find your server membership.',
        ephemeral: true,
      });
    });

    it('should handle expansion error', async () => {
      // Create cache entry
      const catchupInteraction = {
        ...mockInteraction,
        deferReply: jest.fn().mockResolvedValue(undefined),
        member: mockGuildMember,
        options: {
          getString: jest.fn().mockReturnValue(null),
        } as any,
      } as any;

      (summaryService.generateCatchupSummary as jest.Mock).mockResolvedValue({
        summary: 'Summary',
        messageCount: 50,
        mentionCount: 3,
        timeRangeStart: new Date(),
        timeRangeEnd: new Date(),
        summaryId: 1,
      });

      await handleCatchupCommand(catchupInteraction);

      const editReplyCall = (catchupInteraction.editReply as jest.Mock).mock.calls[0][0];
      const buttonCustomId = editReplyCall.components[0].components[0].data.custom_id;
      const cacheKey = buttonCustomId.split('_')[1];

      mockInteraction.customId = `expand_${cacheKey}_detailed`;

      // Make expansion fail
      (summaryService.generateCatchupSummary as jest.Mock).mockRejectedValue(
        new Error('Expansion failed')
      );

      await handleExpandButton(mockInteraction as ButtonInteraction);

      expect(mockInteraction.followUp).toHaveBeenCalledWith({
        content: 'Failed to expand summary. Please try again.',
        ephemeral: true,
      });

      expect(logger.logger.error).toHaveBeenCalledWith(
        'Error handling expand button',
        expect.objectContaining({
          userId: 'user123',
          error: 'Expansion failed',
        })
      );
    });

    it('should handle followUp error', async () => {
      mockInteraction.customId = 'expand_nonexistent_detailed';
      (mockInteraction.followUp as jest.Mock).mockRejectedValue(
        new Error('FollowUp failed')
      );

      await handleExpandButton(mockInteraction as ButtonInteraction);

      expect(logger.logger.error).toHaveBeenCalledWith(
        'Failed to send error message',
        expect.objectContaining({
          error: 'FollowUp failed',
        })
      );
    });
  });
});
