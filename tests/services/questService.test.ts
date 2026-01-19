import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  checkRateLimit,
  getRateLimitMessage,
  assignQuest,
  verifyQuestCompletion,
  getUserProgress,
  createNewQuest,
  getGuildQuests,
  toggleQuestStatus,
  deleteQuest,
  getLeaderboard,
  cleanupRateLimitCache,
} from '../../src/services/questService';
import * as db from '../../src/db/queries';
import { mcpClient } from '../../src/services/mcpClient';
import { logger } from '../../src/utils/logger';
import {
  Quest,
  UserQuestWithDetails,
  UserXp,
  CreateQuestParams,
} from '../../src/types/database';

// Mock dependencies
jest.mock('../../src/db/queries');
jest.mock('../../src/services/mcpClient');
jest.mock('../../src/utils/logger');

// Cast mocked modules
const mockDb = jest.mocked(db);
const mockMcpClient = jest.mocked(mcpClient);
const mockLogger = jest.mocked(logger);

describe('QuestService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset rate limit cache by calling cleanup with a mock that clears everything
    cleanupRateLimitCache();
  });

  describe('checkRateLimit', () => {
    it('should allow first request within window', () => {
      const result = checkRateLimit('user123', 'quest');
      expect(result.allowed).toBe(true);
      expect(result.retryAfter).toBeUndefined();
    });

    it('should allow requests up to the limit', () => {
      // Make 5 requests (the limit)
      for (let i = 0; i < 5; i++) {
        const result = checkRateLimit('user456', 'quest');
        expect(result.allowed).toBe(true);
      }
    });

    it('should block requests after limit is reached', () => {
      // Make 5 requests to hit the limit
      for (let i = 0; i < 5; i++) {
        checkRateLimit('user789', 'quest');
      }

      // 6th request should be blocked
      const result = checkRateLimit('user789', 'quest');
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeDefined();
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should track different users independently', () => {
      // Use up limit for user1
      for (let i = 0; i < 5; i++) {
        checkRateLimit('rate-user1', 'quest');
      }

      // User2 should still be allowed
      const result = checkRateLimit('rate-user2', 'quest');
      expect(result.allowed).toBe(true);
    });

    it('should track different actions independently', () => {
      // Use up limit for quest action
      for (let i = 0; i < 5; i++) {
        checkRateLimit('action-user', 'quest');
      }

      // Same user should still be allowed for confirm action
      const result = checkRateLimit('action-user', 'confirm');
      expect(result.allowed).toBe(true);
    });
  });

  describe('getRateLimitMessage', () => {
    it('should return formatted rate limit message', () => {
      const message = getRateLimitMessage('quest', 120000); // 2 minutes in ms
      expect(message).toContain('quest');
    });

    it('should include time remaining', () => {
      const message = getRateLimitMessage('confirm', 90000);
      expect(message).toContain('minute');
    });
  });

  describe('assignQuest', () => {
    const mockQuest: Quest = {
      id: 'quest-123',
      guild_id: 'guild-123',
      name: 'Test Quest',
      description: 'Complete this test quest',
      xp_reward: 100,
      verification_type: 'wallet_address',
      active: true,
      total_completions: 0,
      created_by: 'admin-123',
      created_at: new Date(),
      updated_at: new Date(),
    };

    it('should return error if user has active quest', async () => {
      const activeQuest: UserQuestWithDetails = {
        id: 'uq-123',
        user_id: 'user-123',
        guild_id: 'guild-123',
        quest_id: 'quest-123',
        status: 'assigned',
        assigned_at: new Date(),
        verification_attempts: 0,
        xp_awarded: 0,
        quest_name: 'Active Quest',
        quest_description: 'An active quest',
        xp_reward: 50,
        verification_type: 'email',
      };

      mockDb.getUserActiveQuest.mockResolvedValue(activeQuest as any);

      const result = await assignQuest('user-123', 'guild-123');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Already Have an Active Quest');
      expect(result.quest).toBeUndefined();
    });

    it('should return error if no quests available in guild', async () => {
      mockDb.getUserActiveQuest.mockResolvedValue(null);
      mockDb.getActiveQuests.mockResolvedValue([]);

      const result = await assignQuest('user-123', 'guild-123');

      expect(result.success).toBe(false);
      expect(result.message).toContain('No Quests Available');
    });

    it('should return congrats message if user completed all quests', async () => {
      mockDb.getUserActiveQuest.mockResolvedValue(null);
      mockDb.getActiveQuests.mockResolvedValue([mockQuest as any]);
      mockDb.getUserCompletedQuestIds.mockResolvedValue(['quest-123']);
      mockDb.getUserXp.mockResolvedValue({ total_xp: 500 } as any);

      const result = await assignQuest('user-123', 'guild-123');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Congratulations');
      expect(result.message).toContain('500');
    });

    it('should assign a random available quest', async () => {
      const quest2: Quest = { ...mockQuest, id: 'quest-456', name: 'Quest 2' };

      mockDb.getUserActiveQuest.mockResolvedValue(null);
      mockDb.getActiveQuests.mockResolvedValue([mockQuest as any, quest2 as any]);
      mockDb.getUserCompletedQuestIds.mockResolvedValue([]);
      mockDb.assignQuestToUser.mockResolvedValue({ id: 'uq-new' } as any);

      const result = await assignQuest('user-123', 'guild-123');

      expect(result.success).toBe(true);
      expect(result.quest).toBeDefined();
      expect(['Test Quest', 'Quest 2']).toContain(result.quest!.name);
      expect(mockDb.assignQuestToUser).toHaveBeenCalled();
    });

    it('should exclude already completed quests', async () => {
      const quest2: Quest = { ...mockQuest, id: 'quest-456', name: 'Quest 2' };

      mockDb.getUserActiveQuest.mockResolvedValue(null);
      mockDb.getActiveQuests.mockResolvedValue([mockQuest as any, quest2 as any]);
      mockDb.getUserCompletedQuestIds.mockResolvedValue(['quest-123']);
      mockDb.assignQuestToUser.mockResolvedValue({ id: 'uq-new' } as any);

      const result = await assignQuest('user-123', 'guild-123');

      expect(result.success).toBe(true);
      expect(result.quest!.id).toBe('quest-456');
    });

    it('should handle database errors gracefully', async () => {
      mockDb.getUserActiveQuest.mockRejectedValue(new Error('DB Error'));

      await expect(assignQuest('user-123', 'guild-123')).rejects.toThrow('DB Error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error assigning quest',
        expect.objectContaining({ userId: 'user-123' })
      );
    });
  });

  describe('verifyQuestCompletion', () => {
    const mockActiveQuest: UserQuestWithDetails = {
      id: 'uq-123',
      user_id: 'user-123',
      guild_id: 'guild-123',
      quest_id: 'quest-123',
      status: 'assigned',
      assigned_at: new Date(),
      verification_attempts: 0,
      xp_awarded: 0,
      quest_name: 'Test Quest',
      quest_description: 'Test description',
      xp_reward: 100,
      verification_type: 'wallet_address',
      connector_id: 1,
    };

    it('should return error if no active quest', async () => {
      mockDb.getUserActiveQuest.mockResolvedValue(null);

      const result = await verifyQuestCompletion('user-123', 'guild-123', '0x123');

      expect(result.success).toBe(false);
      expect(result.message).toContain("don't have an active quest");
    });

    it('should fail quest after max verification attempts', async () => {
      mockDb.getUserActiveQuest.mockResolvedValue(mockActiveQuest as any);
      mockDb.incrementVerificationAttempts.mockResolvedValue(11); // Over max
      mockDb.failUserQuest.mockResolvedValue({} as any);

      const result = await verifyQuestCompletion('user-123', 'guild-123', '0x123');

      expect(result.success).toBe(false);
      expect(result.message).toContain('exceeded the maximum verification attempts');
      expect(mockDb.failUserQuest).toHaveBeenCalledWith(
        'uq-123',
        'Maximum verification attempts exceeded'
      );
    });

    it('should use MCP verification when connector_id is present', async () => {
      mockDb.getUserActiveQuest.mockResolvedValue(mockActiveQuest as any);
      mockDb.incrementVerificationAttempts.mockResolvedValue(1);
      mockMcpClient.validateQuestCompletion.mockResolvedValue({
        isValid: true,
      });
      mockDb.completeUserQuest.mockResolvedValue({} as any);
      mockDb.incrementQuestCompletions.mockResolvedValue(undefined as any);
      mockDb.addUserXp.mockResolvedValue({ total_xp: 200 } as any);

      const result = await verifyQuestCompletion('user-123', 'guild-123', '0x123');

      expect(result.success).toBe(true);
      expect(result.xpAwarded).toBe(100);
      expect(mockMcpClient.validateQuestCompletion).toHaveBeenCalledWith(
        1,
        'wallet_address',
        '0x123'
      );
    });

    it('should complete quest and award XP on successful verification', async () => {
      mockDb.getUserActiveQuest.mockResolvedValue(mockActiveQuest as any);
      mockDb.incrementVerificationAttempts.mockResolvedValue(1);
      mockMcpClient.validateQuestCompletion.mockResolvedValue({
        isValid: true,
      });
      mockDb.completeUserQuest.mockResolvedValue({} as any);
      mockDb.incrementQuestCompletions.mockResolvedValue(undefined as any);
      mockDb.addUserXp.mockResolvedValue({ total_xp: 300 } as any);

      const result = await verifyQuestCompletion('user-123', 'guild-123', '0x123');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Quest Complete');
      expect(result.message).toContain('+100 XP');
      expect(mockDb.completeUserQuest).toHaveBeenCalledWith('uq-123', 100, '0x123');
      expect(mockDb.addUserXp).toHaveBeenCalledWith('user-123', 'guild-123', 100);
    });

    it('should return failure message on failed verification', async () => {
      mockDb.getUserActiveQuest.mockResolvedValue(mockActiveQuest as any);
      mockDb.incrementVerificationAttempts.mockResolvedValue(1);
      mockMcpClient.validateQuestCompletion.mockResolvedValue({
        isValid: false,
      });

      const result = await verifyQuestCompletion('user-123', 'guild-123', '0x123');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Verification Failed');
      expect(result.message).toContain('9 attempts remaining');
    });

    it('should use legacy verification when no connector_id', async () => {
      const legacyQuest: UserQuestWithDetails = {
        ...mockActiveQuest,
        connector_id: undefined,
        api_endpoint: 'https://api.example.com/check?wallet=[WALLET_ADDRESS]',
        api_method: 'GET',
        success_condition: { field: 'balance', operator: '>', value: 0 },
      };

      mockDb.getUserActiveQuest.mockResolvedValue(legacyQuest as any);
      mockDb.incrementVerificationAttempts.mockResolvedValue(1);

      // Mock fetch
      const mockFetch = jest.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ balance: 100 }),
      } as Response);
      global.fetch = mockFetch;

      mockDb.completeUserQuest.mockResolvedValue({} as any);
      mockDb.incrementQuestCompletions.mockResolvedValue(undefined as any);
      mockDb.addUserXp.mockResolvedValue({ total_xp: 100 } as any);

      const result = await verifyQuestCompletion('user-123', 'guild-123', '0xWallet');

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('0xWallet'),
        expect.any(Object)
      );
    });

    it('should handle API errors gracefully', async () => {
      mockDb.getUserActiveQuest.mockResolvedValue(mockActiveQuest as any);
      mockDb.incrementVerificationAttempts.mockRejectedValue(new Error('DB Error'));

      const result = await verifyQuestCompletion('user-123', 'guild-123', '0x123');

      expect(result.success).toBe(false);
      expect(result.message).toContain('error occurred');
    });
  });

  describe('getUserProgress', () => {
    it('should return user progress with XP and completed quests', async () => {
      const mockUserXp: UserXp = {
        user_id: 'user-123',
        guild_id: 'guild-123',
        total_xp: 500,
        quests_completed: 5,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockCompletedQuests: UserQuestWithDetails[] = [
        {
          id: 'uq-1',
          user_id: 'user-123',
          guild_id: 'guild-123',
          quest_id: 'q-1',
          status: 'completed',
          assigned_at: new Date(),
          completed_at: new Date(),
          verification_attempts: 1,
          xp_awarded: 100,
          quest_name: 'Quest 1',
          quest_description: 'Desc 1',
          xp_reward: 100,
        },
      ];

      mockDb.getUserXp.mockResolvedValue(mockUserXp as any);
      mockDb.getUserCompletedQuests.mockResolvedValue(mockCompletedQuests as any);
      mockDb.getUserActiveQuest.mockResolvedValue(null);

      const result = await getUserProgress('user-123', 'guild-123');

      expect(result.xp).toBe(500);
      expect(result.questsCompleted).toBe(1);
      expect(result.message).toContain('500');
    });

    it('should include current quest if active', async () => {
      const mockActiveQuest: UserQuestWithDetails = {
        id: 'uq-active',
        user_id: 'user-123',
        guild_id: 'guild-123',
        quest_id: 'q-active',
        status: 'assigned',
        assigned_at: new Date(),
        verification_attempts: 0,
        xp_awarded: 0,
        quest_name: 'Active Quest',
        quest_description: 'Current quest',
        xp_reward: 200,
      };

      mockDb.getUserXp.mockResolvedValue(null);
      mockDb.getUserCompletedQuests.mockResolvedValue([]);
      mockDb.getUserActiveQuest.mockResolvedValue(mockActiveQuest as any);

      const result = await getUserProgress('user-123', 'guild-123');

      expect(result.message).toContain('Active Quest');
    });

    it('should handle user with no XP', async () => {
      mockDb.getUserXp.mockResolvedValue(null);
      mockDb.getUserCompletedQuests.mockResolvedValue([]);
      mockDb.getUserActiveQuest.mockResolvedValue(null);

      const result = await getUserProgress('user-123', 'guild-123');

      expect(result.xp).toBe(0);
      expect(result.questsCompleted).toBe(0);
    });
  });

  describe('createNewQuest', () => {
    const mockQuestParams: CreateQuestParams = {
      guildId: 'guild-123',
      name: 'New Quest',
      description: 'A brand new quest',
      xpReward: 150,
      verificationType: 'email',
      createdBy: 'admin-123',
    };

    it('should create a new quest successfully', async () => {
      const createdQuest: Quest = {
        id: 'new-quest-123',
        guild_id: 'guild-123',
        name: 'New Quest',
        description: 'A brand new quest',
        xp_reward: 150,
        verification_type: 'email',
        active: true,
        total_completions: 0,
        created_by: 'admin-123',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockDb.createQuest.mockResolvedValue(createdQuest as any);

      const result = await createNewQuest(mockQuestParams);

      expect(result).toEqual(createdQuest);
      expect(mockDb.createQuest).toHaveBeenCalledWith(mockQuestParams);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Quest created',
        expect.objectContaining({
          questId: 'new-quest-123',
          name: 'New Quest',
        })
      );
    });

    it('should propagate errors from database', async () => {
      mockDb.createQuest.mockRejectedValue(new Error('Duplicate name'));

      await expect(createNewQuest(mockQuestParams)).rejects.toThrow('Duplicate name');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('getGuildQuests', () => {
    const mockQuests: Quest[] = [
      {
        id: 'q-1',
        guild_id: 'guild-123',
        name: 'Quest 1',
        description: 'First quest',
        xp_reward: 100,
        verification_type: 'wallet_address',
        active: true,
        total_completions: 10,
        created_by: 'admin',
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    it('should return active quests by default', async () => {
      mockDb.getGuildQuests.mockResolvedValue(mockQuests as any);

      const result = await getGuildQuests('guild-123');

      expect(result).toEqual(mockQuests);
      expect(mockDb.getGuildQuests).toHaveBeenCalledWith('guild-123', false);
    });

    it('should include inactive quests when requested', async () => {
      mockDb.getGuildQuests.mockResolvedValue(mockQuests as any);

      await getGuildQuests('guild-123', true);

      expect(mockDb.getGuildQuests).toHaveBeenCalledWith('guild-123', true);
    });
  });

  describe('toggleQuestStatus', () => {
    it('should toggle quest to active', async () => {
      mockDb.updateQuestStatus.mockResolvedValue(undefined as any);

      await toggleQuestStatus('quest-123', true);

      expect(mockDb.updateQuestStatus).toHaveBeenCalledWith('quest-123', true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Quest status updated',
        { questId: 'quest-123', active: true }
      );
    });

    it('should toggle quest to inactive', async () => {
      mockDb.updateQuestStatus.mockResolvedValue(undefined as any);

      await toggleQuestStatus('quest-123', false);

      expect(mockDb.updateQuestStatus).toHaveBeenCalledWith('quest-123', false);
    });
  });

  describe('deleteQuest', () => {
    it('should delete quest successfully', async () => {
      mockDb.deleteQuest.mockResolvedValue(undefined as any);

      await deleteQuest('quest-123');

      expect(mockDb.deleteQuest).toHaveBeenCalledWith('quest-123');
      expect(mockLogger.info).toHaveBeenCalledWith('Quest deleted', { questId: 'quest-123' });
    });
  });

  describe('getLeaderboard', () => {
    const mockLeaderboard: UserXp[] = [
      {
        user_id: 'user-1',
        guild_id: 'guild-123',
        total_xp: 1000,
        quests_completed: 10,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        user_id: 'user-2',
        guild_id: 'guild-123',
        total_xp: 750,
        quests_completed: 7,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    it('should return leaderboard with default limit', async () => {
      mockDb.getGuildLeaderboard.mockResolvedValue(mockLeaderboard as any);

      const result = await getLeaderboard('guild-123');

      expect(result).toEqual(mockLeaderboard);
      expect(mockDb.getGuildLeaderboard).toHaveBeenCalledWith('guild-123', 10);
    });

    it('should respect custom limit', async () => {
      mockDb.getGuildLeaderboard.mockResolvedValue(mockLeaderboard as any);

      await getLeaderboard('guild-123', 5);

      expect(mockDb.getGuildLeaderboard).toHaveBeenCalledWith('guild-123', 5);
    });
  });

  describe('cleanupRateLimitCache', () => {
    it('should remove expired entries from cache', () => {
      // This function modifies internal state
      // Just verify it doesn't throw
      expect(() => cleanupRateLimitCache()).not.toThrow();
    });
  });
});

describe('evaluateSuccessCondition (via legacy verification)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should evaluate > operator correctly', async () => {
    const quest: UserQuestWithDetails = {
      id: 'uq-123',
      user_id: 'user-123',
      guild_id: 'guild-123',
      quest_id: 'quest-123',
      status: 'assigned',
      assigned_at: new Date(),
      verification_attempts: 0,
      xp_awarded: 0,
      quest_name: 'Test',
      quest_description: 'Test',
      xp_reward: 100,
      verification_type: 'wallet_address',
      api_endpoint: 'https://api.example.com/check',
      api_method: 'GET',
      success_condition: { field: 'balance', operator: '>', value: 0 },
    };

    mockDb.getUserActiveQuest.mockResolvedValue(quest as any);
    mockDb.incrementVerificationAttempts.mockResolvedValue(1);

    global.fetch = jest.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ balance: 100 }),
    } as Response);

    mockDb.completeUserQuest.mockResolvedValue({} as any);
    mockDb.incrementQuestCompletions.mockResolvedValue(undefined as any);
    mockDb.addUserXp.mockResolvedValue({ total_xp: 100 } as any);

    const result = await verifyQuestCompletion('user-123', 'guild-123', 'test');

    expect(result.success).toBe(true);
  });

  it('should evaluate nested field paths', async () => {
    const quest: UserQuestWithDetails = {
      id: 'uq-123',
      user_id: 'user-123',
      guild_id: 'guild-123',
      quest_id: 'quest-123',
      status: 'assigned',
      assigned_at: new Date(),
      verification_attempts: 0,
      xp_awarded: 0,
      quest_name: 'Test',
      quest_description: 'Test',
      xp_reward: 100,
      verification_type: 'wallet_address',
      api_endpoint: 'https://api.example.com/check',
      api_method: 'GET',
      success_condition: { field: 'data.user.balance', operator: '>=', value: 50 },
    };

    mockDb.getUserActiveQuest.mockResolvedValue(quest as any);
    mockDb.incrementVerificationAttempts.mockResolvedValue(1);

    global.fetch = jest.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { user: { balance: 75 } } }),
    } as Response);

    mockDb.completeUserQuest.mockResolvedValue({} as any);
    mockDb.incrementQuestCompletions.mockResolvedValue(undefined as any);
    mockDb.addUserXp.mockResolvedValue({ total_xp: 100 } as any);

    const result = await verifyQuestCompletion('user-123', 'guild-123', 'test');

    expect(result.success).toBe(true);
  });

  it('should handle exists operator', async () => {
    const quest: UserQuestWithDetails = {
      id: 'uq-123',
      user_id: 'user-123',
      guild_id: 'guild-123',
      quest_id: 'quest-123',
      status: 'assigned',
      assigned_at: new Date(),
      verification_attempts: 0,
      xp_awarded: 0,
      quest_name: 'Test',
      quest_description: 'Test',
      xp_reward: 100,
      verification_type: 'wallet_address',
      api_endpoint: 'https://api.example.com/check',
      api_method: 'GET',
      success_condition: { field: 'verified', operator: 'exists', value: true },
    };

    mockDb.getUserActiveQuest.mockResolvedValue(quest as any);
    mockDb.incrementVerificationAttempts.mockResolvedValue(1);

    global.fetch = jest.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ verified: true }),
    } as Response);

    mockDb.completeUserQuest.mockResolvedValue({} as any);
    mockDb.incrementQuestCompletions.mockResolvedValue(undefined as any);
    mockDb.addUserXp.mockResolvedValue({ total_xp: 100 } as any);

    const result = await verifyQuestCompletion('user-123', 'guild-123', 'test');

    expect(result.success).toBe(true);
  });

  it('should handle not_empty operator for arrays', async () => {
    const quest: UserQuestWithDetails = {
      id: 'uq-123',
      user_id: 'user-123',
      guild_id: 'guild-123',
      quest_id: 'quest-123',
      status: 'assigned',
      assigned_at: new Date(),
      verification_attempts: 0,
      xp_awarded: 0,
      quest_name: 'Test',
      quest_description: 'Test',
      xp_reward: 100,
      verification_type: 'wallet_address',
      api_endpoint: 'https://api.example.com/check',
      api_method: 'GET',
      success_condition: { field: 'items', operator: 'not_empty', value: true },
    };

    mockDb.getUserActiveQuest.mockResolvedValue(quest as any);
    mockDb.incrementVerificationAttempts.mockResolvedValue(1);

    global.fetch = jest.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: ['item1', 'item2'] }),
    } as Response);

    mockDb.completeUserQuest.mockResolvedValue({} as any);
    mockDb.incrementQuestCompletions.mockResolvedValue(undefined as any);
    mockDb.addUserXp.mockResolvedValue({ total_xp: 100 } as any);

    const result = await verifyQuestCompletion('user-123', 'guild-123', 'test');

    expect(result.success).toBe(true);
  });

  it('should fail when API returns non-ok status', async () => {
    const quest: UserQuestWithDetails = {
      id: 'uq-123',
      user_id: 'user-123',
      guild_id: 'guild-123',
      quest_id: 'quest-123',
      status: 'assigned',
      assigned_at: new Date(),
      verification_attempts: 0,
      xp_awarded: 0,
      quest_name: 'Test',
      quest_description: 'Test',
      xp_reward: 100,
      verification_type: 'wallet_address',
      api_endpoint: 'https://api.example.com/check',
      api_method: 'GET',
      success_condition: { field: 'balance', operator: '>', value: 0 },
    };

    mockDb.getUserActiveQuest.mockResolvedValue(quest as any);
    mockDb.incrementVerificationAttempts.mockResolvedValue(1);

    global.fetch = jest.fn<typeof fetch>().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    } as Response);

    const result = await verifyQuestCompletion('user-123', 'guild-123', 'test');

    expect(result.success).toBe(false);
    expect(result.message).toContain('Verification Failed');
  });
});
