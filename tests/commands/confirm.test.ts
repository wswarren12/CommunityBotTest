import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ChatInputCommandInteraction } from 'discord.js';
import { execute, data } from '../../src/commands/confirm';
import * as questService from '../../src/services/questService';
import * as db from '../../src/db/queries';
import { UserQuestWithDetails } from '../../src/types/database';

// Mock dependencies
jest.mock('../../src/services/questService');
jest.mock('../../src/db/queries');
jest.mock('../../src/utils/logger');

const mockQuestService = jest.mocked(questService);
const mockDb = jest.mocked(db);

/**
 * Creates a mock ChatInputCommandInteraction
 */
function createMockInteraction(options: {
  userId?: string;
  guildId?: string | null;
  identifier?: string | null;
} = {}) {
  const { userId = 'user-123', guildId = 'guild-123', identifier = null } = options;

  const mockGetString = jest.fn().mockReturnValue(identifier);

  return {
    user: { id: userId },
    guildId,
    reply: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    deferReply: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    editReply: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    options: {
      getString: mockGetString,
    },
  } as unknown as ChatInputCommandInteraction;
}

/**
 * Creates a mock active quest
 */
function createMockActiveQuest(options: {
  verificationType?: string;
  discordNative?: boolean;
} = {}): UserQuestWithDetails {
  const { verificationType = 'wallet_address' } = options;

  return {
    id: 'uq-123',
    user_id: 'user-123',
    guild_id: 'guild-123',
    quest_id: 'quest-123',
    status: 'assigned',
    assigned_at: new Date(),
    verification_attempts: 0,
    xp_awarded: 0,
    quest_name: 'Test Quest',
    quest_description: 'A test quest',
    xp_reward: 100,
    verification_type: verificationType,
  } as UserQuestWithDetails;
}

describe('/confirm command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock for getQuestTasks - returns empty array for legacy quests
    mockDb.getQuestTasks.mockResolvedValue([]);
  });

  describe('command data', () => {
    it('should have correct name', () => {
      expect(data.name).toBe('confirm');
    });

    it('should have a description', () => {
      expect(data.description).toBeDefined();
      expect(data.description.length).toBeGreaterThan(0);
    });

    it('should not allow DMs', () => {
      expect(data.dm_permission).toBe(false);
    });

    it('should have optional identifier option', () => {
      const identifierOption = data.options.find(
        (opt: any) => opt.name === 'identifier'
      ) as any;
      expect(identifierOption).toBeDefined();
      expect(identifierOption?.required).toBe(false);
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
    });

    describe('identifier validation for non-Discord quests', () => {
      it('should require identifier for wallet_address verification', async () => {
        const interaction = createMockInteraction({ identifier: null });
        mockDb.getUserActiveQuest.mockResolvedValue(
          createMockActiveQuest({ verificationType: 'wallet_address' })
        );

        await execute(interaction);

        expect(interaction.reply).toHaveBeenCalledWith({
          content: expect.stringContaining('provide a valid identifier'),
          ephemeral: true,
        });
      });

      it('should require identifier for email verification', async () => {
        const interaction = createMockInteraction({ identifier: 'ab' }); // Too short
        mockDb.getUserActiveQuest.mockResolvedValue(
          createMockActiveQuest({ verificationType: 'email' })
        );

        await execute(interaction);

        expect(interaction.reply).toHaveBeenCalledWith({
          content: expect.stringContaining('minimum 3 characters'),
          ephemeral: true,
        });
      });

      it('should accept valid identifier', async () => {
        const interaction = createMockInteraction({
          identifier: '0x1234567890abcdef',
        });
        mockDb.getUserActiveQuest.mockResolvedValue(
          createMockActiveQuest({ verificationType: 'wallet_address' })
        );
        mockQuestService.checkRateLimit.mockReturnValue({ allowed: true });
        mockQuestService.verifyQuestCompletion.mockResolvedValue({
          success: true,
          message: 'Quest completed!',
          xpAwarded: 100,
        });

        await execute(interaction);

        expect(interaction.deferReply).toHaveBeenCalled();
        expect(mockQuestService.verifyQuestCompletion).toHaveBeenCalledWith(
          'user-123',
          'guild-123',
          '0x1234567890abcdef'
        );
      });
    });

    describe('Discord-native quest verification', () => {
      it('should not require identifier for discord_role verification', async () => {
        const interaction = createMockInteraction({ identifier: null });
        mockDb.getUserActiveQuest.mockResolvedValue(
          createMockActiveQuest({ verificationType: 'discord_role' })
        );
        mockQuestService.checkRateLimit.mockReturnValue({ allowed: true });
        mockQuestService.verifyQuestCompletion.mockResolvedValue({
          success: true,
          message: 'Quest completed!',
          xpAwarded: 100,
        });

        await execute(interaction);

        expect(interaction.deferReply).toHaveBeenCalled();
        expect(mockQuestService.verifyQuestCompletion).toHaveBeenCalledWith(
          'user-123',
          'guild-123',
          'discord'
        );
      });

      it('should not require identifier for discord_message_count verification', async () => {
        const interaction = createMockInteraction({ identifier: null });
        mockDb.getUserActiveQuest.mockResolvedValue(
          createMockActiveQuest({ verificationType: 'discord_message_count' })
        );
        mockQuestService.checkRateLimit.mockReturnValue({ allowed: true });
        mockQuestService.verifyQuestCompletion.mockResolvedValue({
          success: true,
          message: 'Quest completed!',
        });

        await execute(interaction);

        expect(interaction.deferReply).toHaveBeenCalled();
        expect(mockQuestService.verifyQuestCompletion).toHaveBeenCalled();
      });

      it('should not require identifier for discord_reaction_count verification', async () => {
        const interaction = createMockInteraction({ identifier: null });
        mockDb.getUserActiveQuest.mockResolvedValue(
          createMockActiveQuest({ verificationType: 'discord_reaction_count' })
        );
        mockQuestService.checkRateLimit.mockReturnValue({ allowed: true });
        mockQuestService.verifyQuestCompletion.mockResolvedValue({
          success: true,
          message: 'Quest completed!',
        });

        await execute(interaction);

        expect(mockQuestService.verifyQuestCompletion).toHaveBeenCalledWith(
          'user-123',
          'guild-123',
          'discord'
        );
      });

      it('should not require identifier for discord_poll_count verification', async () => {
        const interaction = createMockInteraction({ identifier: null });
        mockDb.getUserActiveQuest.mockResolvedValue(
          createMockActiveQuest({ verificationType: 'discord_poll_count' })
        );
        mockQuestService.checkRateLimit.mockReturnValue({ allowed: true });
        mockQuestService.verifyQuestCompletion.mockResolvedValue({
          success: true,
          message: 'Quest completed!',
        });

        await execute(interaction);

        expect(mockQuestService.verifyQuestCompletion).toHaveBeenCalledWith(
          'user-123',
          'guild-123',
          'discord'
        );
      });

      it('should use provided identifier even for Discord-native quests', async () => {
        const interaction = createMockInteraction({ identifier: 'custom-id' });
        mockDb.getUserActiveQuest.mockResolvedValue(
          createMockActiveQuest({ verificationType: 'discord_role' })
        );
        mockQuestService.checkRateLimit.mockReturnValue({ allowed: true });
        mockQuestService.verifyQuestCompletion.mockResolvedValue({
          success: true,
          message: 'Quest completed!',
        });

        await execute(interaction);

        expect(mockQuestService.verifyQuestCompletion).toHaveBeenCalledWith(
          'user-123',
          'guild-123',
          'custom-id'
        );
      });
    });

    describe('rate limiting', () => {
      it('should check rate limit before processing', async () => {
        const interaction = createMockInteraction({ identifier: 'test@email.com' });
        mockDb.getUserActiveQuest.mockResolvedValue(
          createMockActiveQuest({ verificationType: 'email' })
        );
        mockQuestService.checkRateLimit.mockReturnValue({
          allowed: false,
          retryAfter: 120000,
        });
        mockQuestService.getRateLimitMessage.mockReturnValue('Rate limited!');

        await execute(interaction);

        expect(mockQuestService.checkRateLimit).toHaveBeenCalledWith('user-123', 'confirm');
        expect(interaction.reply).toHaveBeenCalledWith({
          content: 'Rate limited!',
          ephemeral: true,
        });
        expect(interaction.deferReply).not.toHaveBeenCalled();
      });
    });

    describe('verification results', () => {
      beforeEach(() => {
        mockQuestService.checkRateLimit.mockReturnValue({ allowed: true });
      });

      it('should display success message when quest completed', async () => {
        const interaction = createMockInteraction({ identifier: '0x123' });
        mockDb.getUserActiveQuest.mockResolvedValue(
          createMockActiveQuest({ verificationType: 'wallet_address' })
        );
        mockQuestService.verifyQuestCompletion.mockResolvedValue({
          success: true,
          message: '🎉 Quest Complete! You earned 100 XP!',
          xpAwarded: 100,
        });

        await execute(interaction);

        expect(interaction.editReply).toHaveBeenCalledWith({
          content: expect.stringContaining('Quest Complete'),
        });
      });

      it('should display failure message when verification fails', async () => {
        const interaction = createMockInteraction({ identifier: '0x123' });
        mockDb.getUserActiveQuest.mockResolvedValue(
          createMockActiveQuest({ verificationType: 'wallet_address' })
        );
        mockQuestService.verifyQuestCompletion.mockResolvedValue({
          success: false,
          message: 'Verification failed. Try again.',
        });

        await execute(interaction);

        expect(interaction.editReply).toHaveBeenCalledWith({
          content: expect.stringContaining('Verification failed'),
        });
      });

      it('should display message when user has no active quest', async () => {
        const interaction = createMockInteraction({ identifier: '0x123' });
        mockDb.getUserActiveQuest.mockResolvedValue(null);

        await execute(interaction);

        // Note: when no active quest, reply is called directly (not deferred)
        expect(interaction.reply).toHaveBeenCalledWith({
          content: expect.stringContaining("don't have an active quest"),
          ephemeral: true,
        });
      });
    });

    describe('error handling', () => {
      it('should handle errors gracefully', async () => {
        const interaction = createMockInteraction({ identifier: '0x123' });
        mockDb.getUserActiveQuest.mockResolvedValue(
          createMockActiveQuest({ verificationType: 'wallet_address' })
        );
        mockQuestService.checkRateLimit.mockReturnValue({ allowed: true });
        mockQuestService.verifyQuestCompletion.mockRejectedValue(
          new Error('API error')
        );

        await execute(interaction);

        expect(interaction.editReply).toHaveBeenCalledWith({
          content: expect.stringContaining('error occurred'),
        });
      });
    });
  });
});
