import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ChatInputCommandInteraction } from 'discord.js';
import { execute, data } from '../../src/commands/quest';
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

describe('/quest command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('command data', () => {
    it('should have correct name', () => {
      expect(data.name).toBe('quest');
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

    it('should check rate limit before processing', async () => {
      const interaction = createMockInteraction();
      mockQuestService.checkRateLimit.mockReturnValue({
        allowed: false,
        retryAfter: 60000,
      });
      mockQuestService.getRateLimitMessage.mockReturnValue('Rate limited!');

      await execute(interaction);

      expect(mockQuestService.checkRateLimit).toHaveBeenCalledWith('user-123', 'quest');
      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'Rate limited!',
        ephemeral: true,
      });
      expect(interaction.deferReply).not.toHaveBeenCalled();
    });

    it('should defer reply for non-rate-limited requests', async () => {
      const interaction = createMockInteraction();
      mockQuestService.checkRateLimit.mockReturnValue({ allowed: true });
      mockQuestService.assignQuest.mockResolvedValue({
        success: true,
        message: 'Quest assigned!',
        quest: {
          id: 'quest-123',
          name: 'Test Quest',
        } as any,
      });

      await execute(interaction);

      expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    });

    it('should call assignQuest with correct parameters', async () => {
      const interaction = createMockInteraction({
        userId: 'user-456',
        guildId: 'guild-789',
      });
      mockQuestService.checkRateLimit.mockReturnValue({ allowed: true });
      mockQuestService.assignQuest.mockResolvedValue({
        success: true,
        message: 'Quest assigned!',
      });

      await execute(interaction);

      expect(mockQuestService.assignQuest).toHaveBeenCalledWith('user-456', 'guild-789');
    });

    it('should display success message when quest assigned', async () => {
      const interaction = createMockInteraction();
      mockQuestService.checkRateLimit.mockReturnValue({ allowed: true });
      mockQuestService.assignQuest.mockResolvedValue({
        success: true,
        message: '🎯 **New Quest: Test Quest**\n\nComplete this quest to earn 100 XP!',
        quest: {
          id: 'quest-123',
          name: 'Test Quest',
          xp_reward: 100,
        } as any,
      });

      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: expect.stringContaining('New Quest'),
      });
    });

    it('should display message when user already has active quest', async () => {
      const interaction = createMockInteraction();
      mockQuestService.checkRateLimit.mockReturnValue({ allowed: true });
      mockQuestService.assignQuest.mockResolvedValue({
        success: false,
        message: 'You already have an active quest!',
      });

      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: expect.stringContaining('already have an active quest'),
      });
    });

    it('should display message when no quests available', async () => {
      const interaction = createMockInteraction();
      mockQuestService.checkRateLimit.mockReturnValue({ allowed: true });
      mockQuestService.assignQuest.mockResolvedValue({
        success: false,
        message: 'No quests available in this server.',
      });

      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: expect.stringContaining('No quests available'),
      });
    });

    it('should handle errors gracefully', async () => {
      const interaction = createMockInteraction();
      mockQuestService.checkRateLimit.mockReturnValue({ allowed: true });
      mockQuestService.assignQuest.mockRejectedValue(new Error('Database error'));

      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: expect.stringContaining('error occurred'),
      });
    });

    it('should display all completed message when user finished all quests', async () => {
      const interaction = createMockInteraction();
      mockQuestService.checkRateLimit.mockReturnValue({ allowed: true });
      mockQuestService.assignQuest.mockResolvedValue({
        success: false,
        message: 'Congratulations! You have completed all available quests!',
      });

      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: expect.stringContaining('Congratulations'),
      });
    });
  });
});
