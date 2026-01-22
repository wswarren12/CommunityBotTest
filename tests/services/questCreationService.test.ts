import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import {
  hasAdminPermissions,
  shouldTriggerQuestCreation,
  isCancelCommand,
  getQuestCreationIntro,
  getPermissionDeniedMessage,
} from '../../src/services/questCreationService';

// Mock dependencies
jest.mock('../../src/db/queries');
jest.mock('../../src/utils/logger');
jest.mock('@anthropic-ai/sdk');

/**
 * Creates a mock GuildMember with configurable permissions and owner status
 */
function createMockMember(options: {
  userId?: string;
  ownerId?: string;
  permissions?: bigint[];
} = {}) {
  const userId = options.userId ?? 'user-123';
  const ownerId = options.ownerId ?? 'owner-456';
  const permissions = options.permissions ?? [];

  const permissionsBitField = new PermissionsBitField(permissions);

  return {
    id: userId,
    guild: {
      ownerId,
    },
    permissions: permissionsBitField,
  } as any;
}

describe('QuestCreationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('hasAdminPermissions', () => {
    it('should return false for null member', async () => {
      const result = await hasAdminPermissions(null);
      expect(result).toBe(false);
    });

    it('should return true for server owner', async () => {
      const member = createMockMember({
        userId: 'owner-123',
        ownerId: 'owner-123',
        permissions: [], // No explicit permissions needed
      });

      const result = await hasAdminPermissions(member);
      expect(result).toBe(true);
    });

    it('should return true for server owner even without any permissions', async () => {
      // Server owner should always have access, regardless of role permissions
      const member = createMockMember({
        userId: 'owner-id',
        ownerId: 'owner-id',
        permissions: [],
      });

      const result = await hasAdminPermissions(member);
      expect(result).toBe(true);
    });

    it('should return true for user with Administrator permission', async () => {
      const member = createMockMember({
        userId: 'admin-user',
        ownerId: 'different-owner',
        permissions: [PermissionFlagsBits.Administrator],
      });

      const result = await hasAdminPermissions(member);
      expect(result).toBe(true);
    });

    it('should return true for user with ManageGuild permission', async () => {
      const member = createMockMember({
        userId: 'manager-user',
        ownerId: 'different-owner',
        permissions: [PermissionFlagsBits.ManageGuild],
      });

      const result = await hasAdminPermissions(member);
      expect(result).toBe(true);
    });

    it('should return true for user with ManageChannels permission', async () => {
      const member = createMockMember({
        userId: 'moderator-user',
        ownerId: 'different-owner',
        permissions: [PermissionFlagsBits.ManageChannels],
      });

      const result = await hasAdminPermissions(member);
      expect(result).toBe(true);
    });

    it('should return false for regular user without admin permissions', async () => {
      const member = createMockMember({
        userId: 'regular-user',
        ownerId: 'different-owner',
        permissions: [
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ViewChannel,
        ],
      });

      const result = await hasAdminPermissions(member);
      expect(result).toBe(false);
    });

    it('should return false for user with no permissions', async () => {
      const member = createMockMember({
        userId: 'no-perms-user',
        ownerId: 'different-owner',
        permissions: [],
      });

      const result = await hasAdminPermissions(member);
      expect(result).toBe(false);
    });

    it('should prioritize owner check (owner without admin perms)', async () => {
      // Simulate a scenario where owner doesn't have explicit Administrator bit
      // (unusual but possible with custom permission setups)
      const member = createMockMember({
        userId: 'owner-123',
        ownerId: 'owner-123',
        permissions: [PermissionFlagsBits.SendMessages], // Only basic permission
      });

      const result = await hasAdminPermissions(member);
      expect(result).toBe(true);
    });

    it('should return true with multiple qualifying permissions', async () => {
      const member = createMockMember({
        userId: 'super-admin',
        ownerId: 'different-owner',
        permissions: [
          PermissionFlagsBits.Administrator,
          PermissionFlagsBits.ManageGuild,
          PermissionFlagsBits.ManageChannels,
        ],
      });

      const result = await hasAdminPermissions(member);
      expect(result).toBe(true);
    });

    it('should return false for user with ManageMessages only (not admin level)', async () => {
      const member = createMockMember({
        userId: 'message-mod',
        ownerId: 'different-owner',
        permissions: [PermissionFlagsBits.ManageMessages],
      });

      const result = await hasAdminPermissions(member);
      expect(result).toBe(false);
    });

    it('should return false for user with KickMembers only (not admin level)', async () => {
      const member = createMockMember({
        userId: 'kick-mod',
        ownerId: 'different-owner',
        permissions: [PermissionFlagsBits.KickMembers],
      });

      const result = await hasAdminPermissions(member);
      expect(result).toBe(false);
    });
  });

  describe('shouldTriggerQuestCreation', () => {
    describe('should match trigger phrases', () => {
      const triggerPhrases = [
        'create a quest',
        'new quest',
        'make a quest',
        'add a quest',
        'quest builder',
        'build a quest',
        'setup quest',
        'set up quest',
      ];

      triggerPhrases.forEach(phrase => {
        it(`should return true for "${phrase}"`, () => {
          expect(shouldTriggerQuestCreation(phrase)).toBe(true);
        });
      });
    });

    it('should match trigger phrases within longer messages', () => {
      expect(shouldTriggerQuestCreation('I want to create a quest for my server')).toBe(true);
      expect(shouldTriggerQuestCreation('Hey, can you help me make a quest?')).toBe(true);
      expect(shouldTriggerQuestCreation('Please add a quest for new members')).toBe(true);
    });

    it('should be case insensitive', () => {
      expect(shouldTriggerQuestCreation('CREATE A QUEST')).toBe(true);
      expect(shouldTriggerQuestCreation('New Quest')).toBe(true);
      expect(shouldTriggerQuestCreation('MAKE A QUEST')).toBe(true);
      expect(shouldTriggerQuestCreation('Quest Builder')).toBe(true);
    });

    it('should return false for unrelated messages', () => {
      expect(shouldTriggerQuestCreation('hello world')).toBe(false);
      expect(shouldTriggerQuestCreation('how do I complete a quest')).toBe(false);
      expect(shouldTriggerQuestCreation('what quests are available')).toBe(false);
      expect(shouldTriggerQuestCreation('tell me about the quest system')).toBe(false);
    });

    it('should return false for partial matches', () => {
      expect(shouldTriggerQuestCreation('quest')).toBe(false);
      expect(shouldTriggerQuestCreation('create something')).toBe(false);
      expect(shouldTriggerQuestCreation('builder')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(shouldTriggerQuestCreation('')).toBe(false);
    });
  });

  describe('isCancelCommand', () => {
    describe('should match cancel keywords', () => {
      const cancelKeywords = ['cancel', 'stop', 'nevermind', 'never mind', 'quit', 'exit'];

      cancelKeywords.forEach(keyword => {
        it(`should return true for "${keyword}"`, () => {
          expect(isCancelCommand(keyword)).toBe(true);
        });
      });
    });

    it('should be case insensitive', () => {
      expect(isCancelCommand('CANCEL')).toBe(true);
      expect(isCancelCommand('Stop')).toBe(true);
      expect(isCancelCommand('QUIT')).toBe(true);
      expect(isCancelCommand('Exit')).toBe(true);
      expect(isCancelCommand('NeverMind')).toBe(true);
    });

    it('should handle leading/trailing whitespace', () => {
      expect(isCancelCommand('  cancel  ')).toBe(true);
      expect(isCancelCommand('\tstop\t')).toBe(true);
      expect(isCancelCommand('  quit  ')).toBe(true);
    });

    it('should return false for partial matches (embedded in sentences)', () => {
      expect(isCancelCommand('please cancel this')).toBe(false);
      expect(isCancelCommand('cancel it now')).toBe(false);
      expect(isCancelCommand('I want to stop')).toBe(false);
      expect(isCancelCommand('stop the bot')).toBe(false);
    });

    it('should return false for unrelated messages', () => {
      expect(isCancelCommand('hello')).toBe(false);
      expect(isCancelCommand('continue')).toBe(false);
      expect(isCancelCommand('yes')).toBe(false);
      expect(isCancelCommand('no')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isCancelCommand('')).toBe(false);
    });

    it('should return false for whitespace only', () => {
      expect(isCancelCommand('   ')).toBe(false);
      expect(isCancelCommand('\t\n')).toBe(false);
    });
  });

  describe('getQuestCreationIntro', () => {
    it('should return a string containing "Quest Builder"', () => {
      const intro = getQuestCreationIntro();
      expect(intro).toContain('Quest Builder');
    });

    it('should mention the cancel option', () => {
      const intro = getQuestCreationIntro();
      expect(intro.toLowerCase()).toContain('cancel');
    });

    it('should be a non-empty string', () => {
      const intro = getQuestCreationIntro();
      expect(typeof intro).toBe('string');
      expect(intro.length).toBeGreaterThan(0);
    });

    it('should include quest naming prompt', () => {
      const intro = getQuestCreationIntro();
      expect(intro.toLowerCase()).toContain('quest');
    });
  });

  describe('getPermissionDeniedMessage', () => {
    it('should return a non-empty string', () => {
      const message = getPermissionDeniedMessage();
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
    });
  });
});
