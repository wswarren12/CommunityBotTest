import { describe, it, expect } from '@jest/globals';
import {
  QUEST_ASSIGNMENT_TEMPLATE,
  QUEST_COMPLETION_SUCCESS_TEMPLATE,
  QUEST_COMPLETION_FAILURE_TEMPLATE,
  XP_PROGRESS_TEMPLATE,
  NO_QUESTS_AVAILABLE_TEMPLATE,
  ACTIVE_QUEST_EXISTS_TEMPLATE,
  ALL_QUESTS_COMPLETED_TEMPLATE,
  RATE_LIMIT_TEMPLATE,
  QUEST_CREATION_PERMISSION_DENIED,
  DOCUMENTATION_READER_SKILL,
  QUEST_BUILDER_SYSTEM_PROMPT,
} from '../../src/utils/prompts';

describe('Quest Prompt Templates', () => {
  describe('QUEST_ASSIGNMENT_TEMPLATE', () => {
    it('should include quest name', () => {
      const result = QUEST_ASSIGNMENT_TEMPLATE({
        name: 'Test Quest',
        description: 'Complete a test action',
        xpReward: 100,
        verificationType: 'wallet_address',
      });

      expect(result).toContain('Test Quest');
    });

    it('should include quest description', () => {
      const result = QUEST_ASSIGNMENT_TEMPLATE({
        name: 'Test Quest',
        description: 'Complete a test action',
        xpReward: 100,
        verificationType: 'wallet_address',
      });

      expect(result).toContain('Complete a test action');
    });

    it('should include XP reward', () => {
      const result = QUEST_ASSIGNMENT_TEMPLATE({
        name: 'Test Quest',
        description: 'Description',
        xpReward: 250,
        verificationType: 'wallet_address',
      });

      expect(result).toContain('250 XP');
    });

    it('should format wallet_address verification type', () => {
      const result = QUEST_ASSIGNMENT_TEMPLATE({
        name: 'Test Quest',
        description: 'Description',
        xpReward: 100,
        verificationType: 'wallet_address',
      });

      expect(result).toContain('wallet address');
    });

    it('should format email verification type', () => {
      const result = QUEST_ASSIGNMENT_TEMPLATE({
        name: 'Test Quest',
        description: 'Description',
        xpReward: 100,
        verificationType: 'email',
      });

      expect(result).toContain('email address');
    });

    it('should format twitter_handle verification type', () => {
      const result = QUEST_ASSIGNMENT_TEMPLATE({
        name: 'Test Quest',
        description: 'Description',
        xpReward: 100,
        verificationType: 'twitter_handle',
      });

      expect(result).toContain('Twitter/X handle');
    });

    it('should format discord_id verification type', () => {
      const result = QUEST_ASSIGNMENT_TEMPLATE({
        name: 'Test Quest',
        description: 'Description',
        xpReward: 100,
        verificationType: 'discord_id',
      });

      expect(result).toContain('Discord ID');
    });

    it('should include instructions to run /confirm', () => {
      const result = QUEST_ASSIGNMENT_TEMPLATE({
        name: 'Test Quest',
        description: 'Description',
        xpReward: 100,
        verificationType: 'email',
      });

      expect(result).toContain('/confirm');
    });
  });

  describe('QUEST_COMPLETION_SUCCESS_TEMPLATE', () => {
    it('should include quest name', () => {
      const result = QUEST_COMPLETION_SUCCESS_TEMPLATE({
        questName: 'Completed Quest',
        xpEarned: 150,
        totalXp: 500,
      });

      expect(result).toContain('Completed Quest');
    });

    it('should include XP earned', () => {
      const result = QUEST_COMPLETION_SUCCESS_TEMPLATE({
        questName: 'Quest',
        xpEarned: 150,
        totalXp: 500,
      });

      expect(result).toContain('+150 XP');
    });

    it('should include total XP with formatting', () => {
      const result = QUEST_COMPLETION_SUCCESS_TEMPLATE({
        questName: 'Quest',
        xpEarned: 150,
        totalXp: 1000,
      });

      expect(result).toContain('1,000 XP');
    });

    it('should include success indicator', () => {
      const result = QUEST_COMPLETION_SUCCESS_TEMPLATE({
        questName: 'Quest',
        xpEarned: 100,
        totalXp: 100,
      });

      expect(result).toContain('Quest Complete');
      expect(result).toContain('Congratulations');
    });
  });

  describe('QUEST_COMPLETION_FAILURE_TEMPLATE', () => {
    it('should include quest name', () => {
      const result = QUEST_COMPLETION_FAILURE_TEMPLATE({
        questName: 'Failed Quest',
        verificationType: 'wallet_address',
      });

      expect(result).toContain('Failed Quest');
    });

    it('should include formatted verification type', () => {
      const result = QUEST_COMPLETION_FAILURE_TEMPLATE({
        questName: 'Quest',
        verificationType: 'wallet_address',
      });

      expect(result).toContain('wallet address');
    });

    it('should include reason when provided', () => {
      const result = QUEST_COMPLETION_FAILURE_TEMPLATE({
        questName: 'Quest',
        verificationType: 'email',
        reason: 'Balance too low',
      });

      expect(result).toContain('Balance too low');
    });

    it('should not include reason section when not provided', () => {
      const result = QUEST_COMPLETION_FAILURE_TEMPLATE({
        questName: 'Quest',
        verificationType: 'email',
      });

      expect(result).not.toContain('Reason:');
    });

    it('should include failure indicator', () => {
      const result = QUEST_COMPLETION_FAILURE_TEMPLATE({
        questName: 'Quest',
        verificationType: 'email',
      });

      expect(result).toContain('Verification Failed');
    });
  });

  describe('XP_PROGRESS_TEMPLATE', () => {
    it('should display total XP', () => {
      const result = XP_PROGRESS_TEMPLATE({
        totalXp: 1500,
        completedQuests: [],
      });

      expect(result).toContain('1,500');
    });

    it('should list completed quests', () => {
      const result = XP_PROGRESS_TEMPLATE({
        totalXp: 300,
        completedQuests: [
          { name: 'Quest 1', xp: 100, completedAt: new Date('2026-01-10') },
          { name: 'Quest 2', xp: 200, completedAt: new Date('2026-01-11') },
        ],
      });

      expect(result).toContain('Quest 1');
      expect(result).toContain('Quest 2');
      expect(result).toContain('+100 XP');
      expect(result).toContain('+200 XP');
    });

    it('should show no quests message when empty', () => {
      const result = XP_PROGRESS_TEMPLATE({
        totalXp: 0,
        completedQuests: [],
      });

      expect(result).toContain('No quests completed yet');
    });

    it('should include current quest when active', () => {
      const result = XP_PROGRESS_TEMPLATE({
        totalXp: 100,
        completedQuests: [],
        currentQuest: {
          name: 'Active Quest',
          xp: 50,
          assignedAt: new Date('2026-01-15'),
        },
      });

      expect(result).toContain('Current Quest');
      expect(result).toContain('Active Quest');
    });

    it('should suggest running /quest when no active quest', () => {
      const result = XP_PROGRESS_TEMPLATE({
        totalXp: 100,
        completedQuests: [],
      });

      expect(result).toContain('/quest');
    });

    it('should limit displayed quests to 10', () => {
      const manyQuests = Array.from({ length: 15 }, (_, i) => ({
        name: `Quest ${i + 1}`,
        xp: 100,
        completedAt: new Date(),
      }));

      const result = XP_PROGRESS_TEMPLATE({
        totalXp: 1500,
        completedQuests: manyQuests,
      });

      // Should show first 10 quests
      expect(result).toContain('Quest 1');
      expect(result).toContain('Quest 10');
      // Should not show quest 11+
      expect(result).not.toContain('Quest 11');
    });
  });

  describe('NO_QUESTS_AVAILABLE_TEMPLATE', () => {
    it('should be a string', () => {
      expect(typeof NO_QUESTS_AVAILABLE_TEMPLATE).toBe('string');
    });

    it('should contain appropriate message', () => {
      expect(NO_QUESTS_AVAILABLE_TEMPLATE).toContain('No Quests Available');
    });
  });

  describe('ACTIVE_QUEST_EXISTS_TEMPLATE', () => {
    it('should include quest name', () => {
      const result = ACTIVE_QUEST_EXISTS_TEMPLATE({
        name: 'Current Quest',
        description: 'Do something',
        xpReward: 100,
        verificationType: 'email',
        assignedAt: new Date('2026-01-10'),
      });

      expect(result).toContain('Current Quest');
    });

    it('should include assignment date', () => {
      const result = ACTIVE_QUEST_EXISTS_TEMPLATE({
        name: 'Quest',
        description: 'Description',
        xpReward: 100,
        verificationType: 'email',
        assignedAt: new Date('2026-01-10'),
      });

      expect(result).toContain('Jan');
      expect(result).toContain('10');
    });

    it('should include XP reward', () => {
      const result = ACTIVE_QUEST_EXISTS_TEMPLATE({
        name: 'Quest',
        description: 'Description',
        xpReward: 200,
        verificationType: 'wallet_address',
        assignedAt: new Date(),
      });

      expect(result).toContain('200 XP');
    });

    it('should indicate user has active quest', () => {
      const result = ACTIVE_QUEST_EXISTS_TEMPLATE({
        name: 'Quest',
        description: 'Description',
        xpReward: 100,
        verificationType: 'email',
        assignedAt: new Date(),
      });

      expect(result).toContain('Already Have an Active Quest');
    });
  });

  describe('ALL_QUESTS_COMPLETED_TEMPLATE', () => {
    it('should include total XP', () => {
      const result = ALL_QUESTS_COMPLETED_TEMPLATE(2500, 10);

      expect(result).toContain('2,500');
    });

    it('should include quest count', () => {
      const result = ALL_QUESTS_COMPLETED_TEMPLATE(1000, 5);

      expect(result).toContain('5');
    });

    it('should congratulate user', () => {
      const result = ALL_QUESTS_COMPLETED_TEMPLATE(500, 3);

      expect(result).toContain('Congratulations');
      expect(result).toContain('Champion');
    });
  });

  describe('RATE_LIMIT_TEMPLATE', () => {
    it('should include command name', () => {
      // The template expects retryAfter in seconds and divides by 60 for minutes
      const result = RATE_LIMIT_TEMPLATE('quest', 60);

      expect(result).toContain('quest');
    });

    it('should calculate minutes correctly', () => {
      // 120 seconds / 60 = 2 minutes
      const result = RATE_LIMIT_TEMPLATE('confirm', 120);

      expect(result).toContain('2');
    });

    it('should round up partial minutes', () => {
      // 90 seconds / 60 = 1.5 minutes, ceil = 2
      const result = RATE_LIMIT_TEMPLATE('xp', 90);

      expect(result).toContain('2');
    });

    it('should include slow down message', () => {
      const result = RATE_LIMIT_TEMPLATE('quest', 60);

      expect(result).toContain('Slow Down');
    });
  });

  describe('QUEST_CREATION_PERMISSION_DENIED', () => {
    it('should be a string', () => {
      expect(typeof QUEST_CREATION_PERMISSION_DENIED).toBe('string');
    });

    it('should contain permission denied message', () => {
      expect(QUEST_CREATION_PERMISSION_DENIED).toContain('Permission Denied');
    });

    it('should mention administrators', () => {
      expect(QUEST_CREATION_PERMISSION_DENIED).toContain('administrators');
    });
  });
});

describe('System Prompts', () => {
  describe('DOCUMENTATION_READER_SKILL', () => {
    it('should be a string', () => {
      expect(typeof DOCUMENTATION_READER_SKILL).toBe('string');
    });

    it('should include curl command building instructions', () => {
      expect(DOCUMENTATION_READER_SKILL).toContain('curl');
      expect(DOCUMENTATION_READER_SKILL).toContain('Curl Command Builder');
    });

    it('should mention GET requests only', () => {
      expect(DOCUMENTATION_READER_SKILL).toContain('GET requests only');
    });

    it('should include placeholder format instructions', () => {
      expect(DOCUMENTATION_READER_SKILL).toContain('[API_KEY]');
      expect(DOCUMENTATION_READER_SKILL).toContain('[WALLET_ADDRESS]');
    });
  });

  describe('QUEST_BUILDER_SYSTEM_PROMPT', () => {
    it('should be a string', () => {
      expect(typeof QUEST_BUILDER_SYSTEM_PROMPT).toBe('string');
    });

    it('should include quest creation guidance', () => {
      expect(QUEST_BUILDER_SYSTEM_PROMPT).toContain('Quest Builder');
      expect(QUEST_BUILDER_SYSTEM_PROMPT).toContain('create quests');
    });

    it('should mention verification types', () => {
      expect(QUEST_BUILDER_SYSTEM_PROMPT).toContain('wallet_address');
      expect(QUEST_BUILDER_SYSTEM_PROMPT).toContain('email');
      expect(QUEST_BUILDER_SYSTEM_PROMPT).toContain('twitter_handle');
      expect(QUEST_BUILDER_SYSTEM_PROMPT).toContain('discord_id');
    });

    it('should include connector definition format', () => {
      expect(QUEST_BUILDER_SYSTEM_PROMPT).toContain('Connector Definition');
      expect(QUEST_BUILDER_SYSTEM_PROMPT).toContain('validationFn');
    });

    it('should include validation DSL documentation', () => {
      expect(QUEST_BUILDER_SYSTEM_PROMPT).toContain('count');
      expect(QUEST_BUILDER_SYSTEM_PROMPT).toContain('sum');
      expect(QUEST_BUILDER_SYSTEM_PROMPT).toContain('compare');
      expect(QUEST_BUILDER_SYSTEM_PROMPT).toContain('exists');
    });

    it('should warn about not storing API keys', () => {
      expect(QUEST_BUILDER_SYSTEM_PROMPT).toContain('Never store actual API keys');
    });
  });
});
