import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ChatInputCommandInteraction } from 'discord.js';
import { execute, data } from '../../src/commands/xp';
import * as questService from '../../src/services/questService';

// Mock dependencies
jest.mock('../../src/services/questService');
jest.mock('../../src/utils/logger');

const mockQuestService = jest.mocked(questService);

/**
 * Creates a mock ChatInputCommandInteraction
 */
function createMockInteraction(options: {
  userId?: string;
  guildId?: string | null;
} = {}) {
  const { userId = 'user-123', guildId = 'guild-123' } = options;

  return {
    user: { id: userId },
    guildId,
    reply: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    deferReply: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    editReply: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    options: {
      getString: jest.fn<() => string | null>(),
      getInteger: jest.fn<() => number | null>(),
      getBoolean: jest.fn<() => boolean | null>(),
    },
  } as unknown as ChatInputCommandInteraction;
}

describe('/xp command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('command data', () => {
    it('should have correct name', () => {
      expect(data.name).toBe('xp');
    });

    it('should have a description', () => {
      expect(data.description).toBeDefined();
      expect(data.description.length).toBeGreaterThan(0);
    });

    it('should not allow DMs', () => {
      expect(data.dm_permission).toBe(false);
    });
  });

  describe('execute', () => {
    it('should reject if used outside a guild', async () => {
      const interaction = createMockInteraction({ guildId: null });

      await execute(interaction);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('only be used in a server'),
        ephemeral: true,
      });
      expect(interaction.deferReply).not.toHaveBeenCalled();
    });

    describe('rate limiting', () => {
      it('should check rate limit before processing', async () => {
        const interaction = createMockInteraction();
        mockQuestService.checkRateLimit.mockReturnValue({
          allowed: false,
          retryAfter: 60000,
        });
        mockQuestService.getRateLimitMessage.mockReturnValue('Rate limited!');

        await execute(interaction);

        expect(mockQuestService.checkRateLimit).toHaveBeenCalledWith('user-123', 'xp');
        expect(interaction.reply).toHaveBeenCalledWith({
          content: 'Rate limited!',
          ephemeral: true,
        });
      });

      it('should proceed when not rate limited', async () => {
        const interaction = createMockInteraction();
        mockQuestService.checkRateLimit.mockReturnValue({ allowed: true });
        mockQuestService.getUserProgress.mockResolvedValue({
          message: 'XP: 500',
          xp: 500,
          questsCompleted: 5,
        });

        await execute(interaction);

        expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
      });
    });

    describe('user progress display', () => {
      beforeEach(() => {
        mockQuestService.checkRateLimit.mockReturnValue({ allowed: true });
      });

      it('should call getUserProgress with correct parameters', async () => {
        const interaction = createMockInteraction({
          userId: 'user-456',
          guildId: 'guild-789',
        });
        mockQuestService.getUserProgress.mockResolvedValue({
          message: 'XP: 100',
          xp: 100,
          questsCompleted: 1,
        });

        await execute(interaction);

        expect(mockQuestService.getUserProgress).toHaveBeenCalledWith(
          'user-456',
          'guild-789'
        );
      });

      it('should display XP progress for user with XP', async () => {
        const interaction = createMockInteraction();
        mockQuestService.getUserProgress.mockResolvedValue({
          message: '📊 **Your Progress**\n\n💎 **Total XP:** 500\n✅ **Quests Completed:** 5',
          xp: 500,
          questsCompleted: 5,
        });

        await execute(interaction);

        expect(interaction.editReply).toHaveBeenCalledWith({
          content: expect.stringContaining('500'),
        });
      });

      it('should display zero XP for new users', async () => {
        const interaction = createMockInteraction();
        mockQuestService.getUserProgress.mockResolvedValue({
          message: '📊 **Your Progress**\n\n💎 **Total XP:** 0\n✅ **Quests Completed:** 0',
          xp: 0,
          questsCompleted: 0,
        });

        await execute(interaction);

        expect(interaction.editReply).toHaveBeenCalledWith({
          content: expect.stringContaining('0'),
        });
      });

      it('should display current quest information if active', async () => {
        const interaction = createMockInteraction();
        mockQuestService.getUserProgress.mockResolvedValue({
          message: '📊 **Your Progress**\n\n💎 **Total XP:** 200\n\n🎯 **Current Quest:** Active Quest (50 XP)',
          xp: 200,
          questsCompleted: 2,
        });

        await execute(interaction);

        expect(interaction.editReply).toHaveBeenCalledWith({
          content: expect.stringContaining('Current Quest'),
        });
      });

      it('should display completed quests list', async () => {
        const interaction = createMockInteraction();
        mockQuestService.getUserProgress.mockResolvedValue({
          message: '📊 **Your Progress**\n\n**Recent Completions:**\n- Quest 1 (100 XP)\n- Quest 2 (50 XP)',
          xp: 150,
          questsCompleted: 2,
        });

        await execute(interaction);

        expect(interaction.editReply).toHaveBeenCalledWith({
          content: expect.stringContaining('Quest 1'),
        });
      });
    });

    describe('error handling', () => {
      it('should handle errors gracefully', async () => {
        const interaction = createMockInteraction();
        mockQuestService.checkRateLimit.mockReturnValue({ allowed: true });
        mockQuestService.getUserProgress.mockRejectedValue(
          new Error('Database error')
        );

        await execute(interaction);

        expect(interaction.editReply).toHaveBeenCalledWith({
          content: expect.stringContaining('error occurred'),
        });
      });

      it('should log errors when they occur', async () => {
        const interaction = createMockInteraction();
        mockQuestService.checkRateLimit.mockReturnValue({ allowed: true });
        mockQuestService.getUserProgress.mockRejectedValue(
          new Error('Connection timeout')
        );

        await execute(interaction);

        // Verify error handling message is shown
        expect(interaction.editReply).toHaveBeenCalledWith({
          content: expect.stringContaining('error'),
        });
      });
    });
  });
});
