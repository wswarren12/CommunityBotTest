import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Message, GuildMember, Guild, GuildChannel, TextChannel, ChannelType } from 'discord.js';
import { ingestMessage, getUserAccessibleChannels, canUserAccessChannel } from '../../src/services/messageService';
import * as queries from '../../src/db/queries';
import * as logger from '../../src/utils/logger';

// Mock dependencies
jest.mock('../../src/db/queries');
jest.mock('../../src/utils/logger');

describe('messageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ingestMessage', () => {
    let mockMessage: Partial<Message>;
    let mockGuild: Partial<Guild>;
    let mockChannel: Partial<TextChannel>;

    beforeEach(() => {
      mockGuild = {
        id: 'guild123',
      } as any;

      mockChannel = {
        id: 'channel123',
        type: ChannelType.GuildText,
        name: 'general',
        isThread: jest.fn().mockReturnValue(false),
      } as any;

      mockMessage = {
        id: 'message123',
        content: 'Hello world!',
        createdAt: new Date('2026-01-10T10:00:00Z'),
        guild: mockGuild as Guild,
        channel: mockChannel as TextChannel,
        author: {
          id: 'user123',
          username: 'testuser',
          discriminator: '1234',
          globalName: 'Test User',
          bot: false,
          createdAt: new Date('2025-01-01T00:00:00Z'),
        } as any,
        mentions: {
          users: new Map(),
          roles: new Map(),
        } as any,
        attachments: new Map() as any,
        reference: null,
      };

      // Setup mock implementations
      (queries.upsertUser as any).mockResolvedValue({ user_id: 'user123' });
      (queries.upsertChannel as any).mockResolvedValue({ channel_id: 'channel123' });
      (queries.insertMessage as any).mockResolvedValue({ id: 1 });
      (queries.upsertUserActivity as any).mockResolvedValue({ id: 1 });
      (queries.updateUserLastMessage as any).mockResolvedValue(undefined);
    });

    it('should successfully ingest a basic message', async () => {
      await ingestMessage(mockMessage as Message);

      expect(queries.upsertUser).toHaveBeenCalledWith(
        'user123',
        'testuser',
        'guild123',
        expect.any(Date),
        '1234',
        'Test User'
      );

      expect(queries.upsertChannel).toHaveBeenCalledWith(
        'channel123',
        'guild123',
        'general',
        'text',
        undefined,
        false
      );

      expect(queries.insertMessage).toHaveBeenCalledWith(
        'message123',
        'channel123',
        'user123',
        'guild123',
        'Hello world!',
        expect.any(Date),
        [],
        [],
        0,
        undefined,
        undefined
      );

      expect(queries.upsertUserActivity).toHaveBeenCalledWith({
        userId: 'user123',
        guildId: 'guild123',
        channelId: 'channel123',
        timestamp: expect.any(Date),
      });

      expect(queries.updateUserLastMessage).toHaveBeenCalledWith(
        'user123',
        expect.any(Date)
      );
    });

    it('should handle message with user mentions', async () => {
      const mentionedUser = { id: 'user456' };
      mockMessage.mentions = {
        users: new Map([['user456', mentionedUser]]) as any,
        roles: new Map(),
      } as any;

      await ingestMessage(mockMessage as Message);

      expect(queries.insertMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(Date),
        ['user456'],
        [],
        expect.any(Number),
        expect.anything(),
        expect.anything()
      );
    });

    it('should handle message with role mentions', async () => {
      const mentionedRole = { id: 'role789' };
      mockMessage.mentions = {
        users: new Map(),
        roles: new Map([['role789', mentionedRole]]) as any,
      } as any;

      await ingestMessage(mockMessage as Message);

      expect(queries.insertMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(Date),
        [],
        ['role789'],
        expect.any(Number),
        expect.anything(),
        expect.anything()
      );
    });

    it('should handle message with attachments', async () => {
      mockMessage.attachments = new Map([
        ['attach1', { id: 'attach1' } as any],
        ['attach2', { id: 'attach2' } as any],
      ]) as any;

      await ingestMessage(mockMessage as Message);

      expect(queries.insertMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(Date),
        expect.any(Array),
        expect.any(Array),
        2,
        expect.anything(),
        expect.anything()
      );
    });

    it('should handle message that is a reply', async () => {
      mockMessage.reference = { messageId: 'originalMsg123' } as any;

      await ingestMessage(mockMessage as Message);

      expect(queries.insertMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(Date),
        expect.any(Array),
        expect.any(Array),
        expect.any(Number),
        'originalMsg123',
        expect.anything()
      );
    });

    it('should handle thread messages', async () => {
      mockChannel = {
        id: 'thread456',
        type: ChannelType.PublicThread,
        name: 'thread-general',
        isThread: jest.fn().mockReturnValue(true),
        parentId: 'channel123',
      } as any;
      (mockMessage as any).channel = mockChannel as any;

      await ingestMessage(mockMessage as Message);

      expect(queries.upsertChannel).toHaveBeenCalledWith(
        'thread456',
        'guild123',
        'thread-general',
        'other',
        'channel123',
        true
      );

      expect(queries.insertMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(Date),
        expect.any(Array),
        expect.any(Array),
        expect.any(Number),
        expect.anything(),
        'thread456'
      );
    });

    it('should handle channel without name', async () => {
      mockChannel.name = undefined;
      (mockMessage as any).channel = mockChannel as any;

      await ingestMessage(mockMessage as Message);

      expect(queries.upsertChannel).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'unknown',
        expect.any(String),
        expect.anything(),
        expect.any(Boolean)
      );
    });

    it('should handle user without discriminator', async () => {
      mockMessage.author = {
        ...mockMessage.author,
        discriminator: null,
      } as any;

      await ingestMessage(mockMessage as Message);

      expect(queries.upsertUser).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(Date),
        undefined,
        expect.any(String)
      );
    });

    it('should handle user without global name', async () => {
      mockMessage.author = {
        ...mockMessage.author,
        globalName: null,
      } as any;

      await ingestMessage(mockMessage as Message);

      expect(queries.upsertUser).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(Date),
        expect.any(String),
        undefined
      );
    });

    it('should throw error when message has no guild', async () => {
      (mockMessage as any).guild = null;

      await expect(ingestMessage(mockMessage as Message)).rejects.toThrow(
        'Message must be from a guild'
      );

      expect(queries.upsertUser).not.toHaveBeenCalled();
    });

    it('should log error and rethrow when database operation fails', async () => {
      const dbError = new Error('Database connection failed');
      (queries.upsertUser as any).mockRejectedValue(dbError);

      await expect(ingestMessage(mockMessage as Message)).rejects.toThrow(
        'Database connection failed'
      );

      expect(logger.logger.error).toHaveBeenCalledWith(
        'Failed to ingest message',
        expect.objectContaining({
          messageId: 'message123',
          error: 'Database connection failed',
          stack: expect.any(String),
        })
      );
    });

    it('should log debug message on successful ingestion', async () => {
      await ingestMessage(mockMessage as Message);

      expect(logger.logger.debug).toHaveBeenCalledWith(
        'Message ingested successfully',
        {
          messageId: 'message123',
          userId: 'user123',
          channelId: 'channel123',
          guildId: 'guild123',
        }
      );
    });

    it('should handle multiple user and role mentions', async () => {
      mockMessage.mentions = {
        users: new Map([
          ['user1', { id: 'user1' }],
          ['user2', { id: 'user2' }],
          ['user3', { id: 'user3' }],
        ]) as any,
        roles: new Map([
          ['role1', { id: 'role1' }],
          ['role2', { id: 'role2' }],
        ]) as any,
      } as any;

      await ingestMessage(mockMessage as Message);

      expect(queries.insertMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(Date),
        ['user1', 'user2', 'user3'],
        ['role1', 'role2'],
        expect.any(Number),
        expect.anything(),
        expect.anything()
      );
    });
  });

  describe('getUserAccessibleChannels', () => {
    let mockGuildMember: Partial<GuildMember>;
    let mockGuild: Partial<Guild>;

    beforeEach(() => {
      mockGuild = {
        id: 'guild123',
        channels: {
          cache: new Map(),
        } as any,
      } as any;

      mockGuildMember = {
        id: 'user123',
        guild: mockGuild as Guild,
      } as any;
    });

    it('should return accessible text channels', async () => {
      const channel1: Partial<GuildChannel> = {
        id: 'channel1',
        isTextBased: jest.fn().mockReturnValue(true),
        permissionsFor: jest.fn().mockReturnValue({
          has: jest.fn().mockReturnValue(true),
        }),
      } as any;

      const channel2: Partial<GuildChannel> = {
        id: 'channel2',
        isTextBased: jest.fn().mockReturnValue(true),
        permissionsFor: jest.fn().mockReturnValue({
          has: jest.fn().mockReturnValue(true),
        }),
      } as any;

      (mockGuild.channels as any).cache = new Map([
        ['channel1', channel1],
        ['channel2', channel2],
      ]) as any;

      const result = await getUserAccessibleChannels(mockGuildMember as GuildMember);

      expect(result).toEqual(['channel1', 'channel2']);
    });

    it('should exclude channels without ViewChannel permission', async () => {
      const accessibleChannel: Partial<GuildChannel> = {
        id: 'channel1',
        isTextBased: jest.fn().mockReturnValue(true),
        permissionsFor: jest.fn().mockReturnValue({
          has: jest.fn().mockReturnValue(true),
        }),
      } as any;

      const restrictedChannel: Partial<GuildChannel> = {
        id: 'channel2',
        isTextBased: jest.fn().mockReturnValue(true),
        permissionsFor: jest.fn().mockReturnValue({
          has: jest.fn().mockReturnValue(false),
        }),
      } as any;

      (mockGuild.channels as any).cache = new Map([
        ['channel1', accessibleChannel],
        ['channel2', restrictedChannel],
      ]) as any;

      const result = await getUserAccessibleChannels(mockGuildMember as GuildMember);

      expect(result).toEqual(['channel1']);
    });

    it('should exclude non-text channels', async () => {
      const textChannel: Partial<GuildChannel> = {
        id: 'channel1',
        isTextBased: jest.fn().mockReturnValue(true),
        permissionsFor: jest.fn().mockReturnValue({
          has: jest.fn().mockReturnValue(true),
        }),
      } as any;

      const voiceChannel: Partial<GuildChannel> = {
        id: 'voice1',
        isTextBased: jest.fn().mockReturnValue(false),
        permissionsFor: jest.fn().mockReturnValue({
          has: jest.fn().mockReturnValue(true),
        }),
      } as any;

      (mockGuild.channels as any).cache = new Map([
        ['channel1', textChannel],
        ['voice1', voiceChannel],
      ]) as any;

      const result = await getUserAccessibleChannels(mockGuildMember as GuildMember);

      expect(result).toEqual(['channel1']);
    });

    it('should handle channels with null permissions', async () => {
      const channel: Partial<GuildChannel> = {
        id: 'channel1',
        isTextBased: jest.fn().mockReturnValue(true),
        permissionsFor: jest.fn().mockReturnValue(null),
      } as any;

      (mockGuild.channels as any).cache = new Map([['channel1', channel]]) as any;

      const result = await getUserAccessibleChannels(mockGuildMember as GuildMember);

      expect(result).toEqual([]);
    });

    it('should return empty array when no channels exist', async () => {
      mockGuild.channels!.cache = new Map();

      const result = await getUserAccessibleChannels(mockGuildMember as GuildMember);

      expect(result).toEqual([]);
    });

    it('should return empty array when no accessible channels', async () => {
      const restrictedChannel: Partial<GuildChannel> = {
        id: 'channel1',
        isTextBased: jest.fn().mockReturnValue(true),
        permissionsFor: jest.fn().mockReturnValue({
          has: jest.fn().mockReturnValue(false),
        }),
      };

      mockGuild.channels!.cache = new Map([['channel1', restrictedChannel]]) as any;

      const result = await getUserAccessibleChannels(mockGuildMember as GuildMember);

      expect(result).toEqual([]);
    });
  });

  describe('canUserAccessChannel', () => {
    let mockGuildMember: Partial<GuildMember>;
    let mockGuild: Partial<Guild>;

    beforeEach(() => {
      mockGuild = {
        id: 'guild123',
        channels: {
          cache: new Map(),
        } as any,
      } as any;

      mockGuildMember = {
        id: 'user123',
        guild: mockGuild as Guild,
      } as any;
    });

    it('should return true when user has ViewChannel permission', async () => {
      const channel: Partial<GuildChannel> = {
        id: 'channel1',
        permissionsFor: jest.fn().mockReturnValue({
          has: jest.fn().mockReturnValue(true),
        }),
      } as any;

      (mockGuild.channels as any).cache = new Map([['channel1', channel]]) as any;

      const result = await canUserAccessChannel(
        mockGuildMember as GuildMember,
        'channel1'
      );

      expect(result).toBe(true);
      expect(channel.permissionsFor).toHaveBeenCalledWith(mockGuildMember);
    });

    it('should return false when user lacks ViewChannel permission', async () => {
      const channel: Partial<GuildChannel> = {
        id: 'channel1',
        permissionsFor: jest.fn().mockReturnValue({
          has: jest.fn().mockReturnValue(false),
        }),
      } as any;

      (mockGuild.channels as any).cache = new Map([['channel1', channel]]) as any;

      const result = await canUserAccessChannel(
        mockGuildMember as GuildMember,
        'channel1'
      );

      expect(result).toBe(false);
    });

    it('should return false when channel does not exist', async () => {
      (mockGuild.channels as any).cache = new Map();

      const result = await canUserAccessChannel(
        mockGuildMember as GuildMember,
        'nonexistent'
      );

      expect(result).toBe(false);
    });

    it('should return false when permissions are null', async () => {
      const channel: Partial<GuildChannel> = {
        id: 'channel1',
        permissionsFor: jest.fn().mockReturnValue(null),
      } as any;

      (mockGuild.channels as any).cache = new Map([['channel1', channel]]) as any;

      const result = await canUserAccessChannel(
        mockGuildMember as GuildMember,
        'channel1'
      );

      expect(result).toBe(false);
    });

    it('should return false when has() returns undefined', async () => {
      const channel: Partial<GuildChannel> = {
        id: 'channel1',
        permissionsFor: jest.fn().mockReturnValue({
          has: jest.fn().mockReturnValue(undefined),
        }),
      } as any;

      (mockGuild.channels as any).cache = new Map([['channel1', channel]]) as any;

      const result = await canUserAccessChannel(
        mockGuildMember as GuildMember,
        'channel1'
      );

      expect(result).toBe(false);
    });
  });
});
