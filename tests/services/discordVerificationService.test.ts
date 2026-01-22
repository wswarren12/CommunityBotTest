import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  verifyDiscordRequirement,
  isDiscordNativeVerificationType,
  getDiscordVerificationDescription,
  setDiscordClient,
  getDiscordClient,
} from '../../src/services/discordVerificationService';
import * as db from '../../src/db/queries';
import { VerificationType } from '../../src/types/database';

// Mock dependencies
jest.mock('../../src/db/queries');
jest.mock('../../src/utils/logger');

const mockDb = jest.mocked(db);

/**
 * Creates a mock Discord client with configurable guild and member data
 */
function createMockClient(options: {
  guildExists?: boolean;
  memberExists?: boolean;
  memberRoles?: string[];
} = {}) {
  const { guildExists = true, memberExists = true, memberRoles = [] } = options;

  const mockMember = memberExists ? {
    roles: {
      cache: {
        has: jest.fn((roleId: string) => memberRoles.includes(roleId)),
      },
    },
  } : null;

  const mockGuild = guildExists ? {
    members: {
      fetch: jest.fn().mockImplementation(() => {
        if (!memberExists) {
          return Promise.reject(new Error('Member not found'));
        }
        return Promise.resolve(mockMember);
      }),
    },
  } : null;

  return {
    guilds: {
      cache: {
        get: jest.fn().mockReturnValue(mockGuild),
      },
    },
  } as any;
}

describe('DiscordVerificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset client between tests
    setDiscordClient(null as any);
  });

  describe('setDiscordClient / getDiscordClient', () => {
    it('should set and get the Discord client', () => {
      const mockClient = createMockClient();
      setDiscordClient(mockClient);
      expect(getDiscordClient()).toBe(mockClient);
    });

    it('should return null when no client is set', () => {
      expect(getDiscordClient()).toBeNull();
    });
  });

  describe('isDiscordNativeVerificationType', () => {
    it('should return true for discord_role', () => {
      expect(isDiscordNativeVerificationType('discord_role')).toBe(true);
    });

    it('should return true for discord_message_count', () => {
      expect(isDiscordNativeVerificationType('discord_message_count')).toBe(true);
    });

    it('should return true for discord_reaction_count', () => {
      expect(isDiscordNativeVerificationType('discord_reaction_count')).toBe(true);
    });

    it('should return true for discord_poll_count', () => {
      expect(isDiscordNativeVerificationType('discord_poll_count')).toBe(true);
    });

    it('should return false for wallet_address', () => {
      expect(isDiscordNativeVerificationType('wallet_address')).toBe(false);
    });

    it('should return false for email', () => {
      expect(isDiscordNativeVerificationType('email')).toBe(false);
    });

    it('should return false for twitter_handle', () => {
      expect(isDiscordNativeVerificationType('twitter_handle')).toBe(false);
    });

    it('should return false for discord_id', () => {
      expect(isDiscordNativeVerificationType('discord_id')).toBe(false);
    });
  });

  describe('verifyDiscordRequirement', () => {
    describe('without Discord client', () => {
      it('should return error when client not initialized', async () => {
        const result = await verifyDiscordRequirement(
          'user-123',
          'guild-123',
          'discord_role',
          { roleId: 'role-123' }
        );

        expect(result.verified).toBe(false);
        expect(result.message).toContain('Discord client not initialized');
      });
    });

    describe('discord_role verification', () => {
      it('should return true when user has the required role', async () => {
        const mockClient = createMockClient({
          guildExists: true,
          memberExists: true,
          memberRoles: ['role-123'],
        });
        setDiscordClient(mockClient);

        const result = await verifyDiscordRequirement(
          'user-123',
          'guild-123',
          'discord_role',
          { roleId: 'role-123', roleName: 'VIP' }
        );

        expect(result.verified).toBe(true);
        expect(result.message).toContain('VIP');
      });

      it('should return false when user lacks the required role', async () => {
        const mockClient = createMockClient({
          guildExists: true,
          memberExists: true,
          memberRoles: ['other-role'],
        });
        setDiscordClient(mockClient);

        const result = await verifyDiscordRequirement(
          'user-123',
          'guild-123',
          'discord_role',
          { roleId: 'role-123', roleName: 'VIP' }
        );

        expect(result.verified).toBe(false);
        expect(result.message).toContain('need the "VIP" role');
      });

      it('should return error when role ID not configured', async () => {
        const mockClient = createMockClient();
        setDiscordClient(mockClient);

        const result = await verifyDiscordRequirement(
          'user-123',
          'guild-123',
          'discord_role',
          {} // No roleId
        );

        expect(result.verified).toBe(false);
        expect(result.message).toContain('Role ID not configured');
      });

      it('should return error when guild not found', async () => {
        const mockClient = createMockClient({ guildExists: false });
        setDiscordClient(mockClient);

        const result = await verifyDiscordRequirement(
          'user-123',
          'guild-123',
          'discord_role',
          { roleId: 'role-123' }
        );

        expect(result.verified).toBe(false);
        expect(result.message).toContain('Could not access the server');
      });

      it('should return error when member not found', async () => {
        const mockClient = createMockClient({
          guildExists: true,
          memberExists: false,
        });
        setDiscordClient(mockClient);

        const result = await verifyDiscordRequirement(
          'user-123',
          'guild-123',
          'discord_role',
          { roleId: 'role-123' }
        );

        expect(result.verified).toBe(false);
        expect(result.message).toContain('Could not find you');
      });
    });

    describe('discord_message_count verification', () => {
      beforeEach(() => {
        const mockClient = createMockClient();
        setDiscordClient(mockClient);
      });

      it('should return true when message count meets threshold', async () => {
        mockDb.getUserMessageCount.mockResolvedValue(10);

        const result = await verifyDiscordRequirement(
          'user-123',
          'guild-123',
          'discord_message_count',
          { threshold: 5, operator: '>=' }
        );

        expect(result.verified).toBe(true);
        expect(result.currentValue).toBe(10);
        expect(result.requiredValue).toBe(5);
      });

      it('should return false when message count below threshold', async () => {
        mockDb.getUserMessageCount.mockResolvedValue(3);

        const result = await verifyDiscordRequirement(
          'user-123',
          'guild-123',
          'discord_message_count',
          { threshold: 5, operator: '>=' }
        );

        expect(result.verified).toBe(false);
        expect(result.message).toContain('3 messages');
        expect(result.message).toContain('>= 5');
      });

      it('should use default threshold of 1 if not specified', async () => {
        mockDb.getUserMessageCount.mockResolvedValue(1);

        const result = await verifyDiscordRequirement(
          'user-123',
          'guild-123',
          'discord_message_count',
          {}
        );

        expect(result.verified).toBe(true);
      });

      it('should pass channel filter to database query', async () => {
        mockDb.getUserMessageCount.mockResolvedValue(5);

        await verifyDiscordRequirement(
          'user-123',
          'guild-123',
          'discord_message_count',
          { threshold: 5, channelId: 'channel-123' }
        );

        expect(mockDb.getUserMessageCount).toHaveBeenCalledWith(
          'user-123',
          'guild-123',
          { channelId: 'channel-123', sinceDays: undefined }
        );
      });

      it('should pass time filter to database query', async () => {
        mockDb.getUserMessageCount.mockResolvedValue(5);

        await verifyDiscordRequirement(
          'user-123',
          'guild-123',
          'discord_message_count',
          { threshold: 5, sinceDays: 7 }
        );

        expect(mockDb.getUserMessageCount).toHaveBeenCalledWith(
          'user-123',
          'guild-123',
          { channelId: undefined, sinceDays: 7 }
        );
      });

      it('should include time context in message', async () => {
        mockDb.getUserMessageCount.mockResolvedValue(5);

        const result = await verifyDiscordRequirement(
          'user-123',
          'guild-123',
          'discord_message_count',
          { threshold: 5, sinceDays: 30 }
        );

        expect(result.message).toContain('in the last 30 days');
      });
    });

    describe('discord_reaction_count verification', () => {
      beforeEach(() => {
        const mockClient = createMockClient();
        setDiscordClient(mockClient);
      });

      it('should return true when reaction count meets threshold', async () => {
        mockDb.getUserReactionCount.mockResolvedValue(20);

        const result = await verifyDiscordRequirement(
          'user-123',
          'guild-123',
          'discord_reaction_count',
          { threshold: 10, operator: '>=' }
        );

        expect(result.verified).toBe(true);
        expect(result.message).toContain('20 reactions');
      });

      it('should return false when reaction count below threshold', async () => {
        mockDb.getUserReactionCount.mockResolvedValue(5);

        const result = await verifyDiscordRequirement(
          'user-123',
          'guild-123',
          'discord_reaction_count',
          { threshold: 10, operator: '>=' }
        );

        expect(result.verified).toBe(false);
        expect(result.message).toContain('5 reactions');
      });

      it('should support greater than operator', async () => {
        mockDb.getUserReactionCount.mockResolvedValue(10);

        const result = await verifyDiscordRequirement(
          'user-123',
          'guild-123',
          'discord_reaction_count',
          { threshold: 10, operator: '>' }
        );

        expect(result.verified).toBe(false); // 10 is not > 10
      });
    });

    describe('discord_poll_count verification', () => {
      beforeEach(() => {
        const mockClient = createMockClient();
        setDiscordClient(mockClient);
      });

      it('should return true when poll count meets threshold', async () => {
        mockDb.getUserPollCount.mockResolvedValue(3);

        const result = await verifyDiscordRequirement(
          'user-123',
          'guild-123',
          'discord_poll_count',
          { threshold: 2, operator: '>=' }
        );

        expect(result.verified).toBe(true);
        expect(result.message).toContain('3 polls');
      });

      it('should return false when poll count below threshold', async () => {
        mockDb.getUserPollCount.mockResolvedValue(1);

        const result = await verifyDiscordRequirement(
          'user-123',
          'guild-123',
          'discord_poll_count',
          { threshold: 5, operator: '>=' }
        );

        expect(result.verified).toBe(false);
      });
    });

    describe('unsupported verification types', () => {
      it('should return error for unsupported type', async () => {
        const mockClient = createMockClient();
        setDiscordClient(mockClient);

        const result = await verifyDiscordRequirement(
          'user-123',
          'guild-123',
          'wallet_address' as VerificationType,
          {}
        );

        expect(result.verified).toBe(false);
        expect(result.message).toContain('Unsupported Discord verification type');
      });
    });

    describe('comparison operators', () => {
      beforeEach(() => {
        const mockClient = createMockClient();
        setDiscordClient(mockClient);
      });

      it('should handle > operator', async () => {
        mockDb.getUserMessageCount.mockResolvedValue(6);

        const result = await verifyDiscordRequirement(
          'user-123',
          'guild-123',
          'discord_message_count',
          { threshold: 5, operator: '>' }
        );

        expect(result.verified).toBe(true);
      });

      it('should handle >= operator', async () => {
        mockDb.getUserMessageCount.mockResolvedValue(5);

        const result = await verifyDiscordRequirement(
          'user-123',
          'guild-123',
          'discord_message_count',
          { threshold: 5, operator: '>=' }
        );

        expect(result.verified).toBe(true);
      });

      it('should handle = operator', async () => {
        mockDb.getUserMessageCount.mockResolvedValue(5);

        const result = await verifyDiscordRequirement(
          'user-123',
          'guild-123',
          'discord_message_count',
          { threshold: 5, operator: '=' }
        );

        expect(result.verified).toBe(true);
      });

      it('should handle < operator', async () => {
        mockDb.getUserMessageCount.mockResolvedValue(3);

        const result = await verifyDiscordRequirement(
          'user-123',
          'guild-123',
          'discord_message_count',
          { threshold: 5, operator: '<' }
        );

        expect(result.verified).toBe(true);
      });

      it('should handle <= operator', async () => {
        mockDb.getUserMessageCount.mockResolvedValue(5);

        const result = await verifyDiscordRequirement(
          'user-123',
          'guild-123',
          'discord_message_count',
          { threshold: 5, operator: '<=' }
        );

        expect(result.verified).toBe(true);
      });
    });
  });

  describe('getDiscordVerificationDescription', () => {
    it('should describe discord_role requirement', () => {
      const description = getDiscordVerificationDescription(
        'discord_role',
        { roleName: 'VIP Member' }
      );

      expect(description).toContain('VIP Member');
      expect(description.toLowerCase()).toContain('role');
    });

    it('should describe discord_message_count requirement', () => {
      const description = getDiscordVerificationDescription(
        'discord_message_count',
        { threshold: 10, operator: '>=' }
      );

      expect(description).toContain('>= 10');
      expect(description.toLowerCase()).toContain('message');
    });

    it('should describe discord_reaction_count requirement', () => {
      const description = getDiscordVerificationDescription(
        'discord_reaction_count',
        { threshold: 5, operator: '>=' }
      );

      expect(description).toContain('>= 5');
      expect(description.toLowerCase()).toContain('reaction');
    });

    it('should describe discord_poll_count requirement', () => {
      const description = getDiscordVerificationDescription(
        'discord_poll_count',
        { threshold: 2, operator: '>=' }
      );

      expect(description).toContain('>= 2');
      expect(description.toLowerCase()).toContain('poll');
    });

    it('should include time context when sinceDays specified', () => {
      const description = getDiscordVerificationDescription(
        'discord_message_count',
        { threshold: 10, sinceDays: 7 }
      );

      expect(description).toContain('in the last 7 days');
    });

    it('should use default threshold of 1', () => {
      const description = getDiscordVerificationDescription(
        'discord_message_count',
        {}
      );

      expect(description).toContain('1');
    });

    it('should use default operator of >=', () => {
      const description = getDiscordVerificationDescription(
        'discord_message_count',
        { threshold: 5 }
      );

      expect(description).toContain('>=');
    });

    it('should return generic description for unknown type', () => {
      const description = getDiscordVerificationDescription(
        'wallet_address' as VerificationType,
        {}
      );

      expect(description.toLowerCase()).toContain('discord');
    });
  });
});
