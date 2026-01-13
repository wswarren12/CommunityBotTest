import { Message } from 'discord.js';
import { handleMessageCreate } from '../../src/bot/events/messageCreate';
import * as messageService from '../../src/services/messageService';
import * as dbQueries from '../../src/db/queries';
import { logger } from '../../src/utils/logger';

// Mock dependencies
jest.mock('../../src/services/messageService');
jest.mock('../../src/db/queries');
jest.mock('../../src/utils/logger');

describe('Integration: Message Ingestion Flow', () => {
  let mockMessage: jest.Mocked<Message>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockMessage = {
      author: {
        bot: false,
        id: 'user123',
        username: 'testuser',
      },
      guild: {
        id: 'guild123',
      },
      channel: {
        id: 'channel123',
        type: 0, // GUILD_TEXT
      },
      id: 'message123',
      content: 'Hello, this is a test message!',
      createdTimestamp: Date.now(),
      mentions: {
        users: new Map(),
        roles: new Map(),
      },
      attachments: new Map(),
      embeds: [],
    } as any;
  });

  describe('successful message ingestion', () => {
    it('should ingest a standard text message', async () => {
      (messageService.ingestMessage as jest.Mock).mockResolvedValue(undefined);
      (dbQueries.upsertUser as jest.Mock).mockResolvedValue(undefined);
      (dbQueries.updateUserActivity as jest.Mock).mockResolvedValue(undefined);

      await handleMessageCreate(mockMessage);

      expect(messageService.ingestMessage).toHaveBeenCalledWith(mockMessage);
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should track user mentions in message', async () => {
      const mentionedUser = {
        id: 'user456',
        username: 'mentioneduser',
      };
      mockMessage.mentions.users.set('user456', mentionedUser as any);
      mockMessage.content = 'Hey <@user456>, check this out!';

      (messageService.ingestMessage as jest.Mock).mockResolvedValue(undefined);

      await handleMessageCreate(mockMessage);

      expect(messageService.ingestMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Hey <@user456>, check this out!',
          mentions: expect.objectContaining({
            users: expect.any(Map),
          }),
        })
      );
    });

    it('should track role mentions in message', async () => {
      const mentionedRole = {
        id: 'role123',
        name: 'Moderator',
      };
      mockMessage.mentions.roles.set('role123', mentionedRole as any);
      mockMessage.content = 'Attention <@&role123>!';

      (messageService.ingestMessage as jest.Mock).mockResolvedValue(undefined);

      await handleMessageCreate(mockMessage);

      expect(messageService.ingestMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Attention <@&role123>!',
          mentions: expect.objectContaining({
            roles: expect.any(Map),
          }),
        })
      );
    });

    it('should ingest message with attachments', async () => {
      const attachment = {
        id: 'attach123',
        url: 'https://cdn.discord.com/attachments/123/456/image.png',
        name: 'image.png',
      };
      mockMessage.attachments.set('attach123', attachment as any);

      (messageService.ingestMessage as jest.Mock).mockResolvedValue(undefined);

      await handleMessageCreate(mockMessage);

      expect(messageService.ingestMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: expect.any(Map),
        })
      );
    });

    it('should ingest message with embeds', async () => {
      mockMessage.embeds = [
        {
          title: 'Embed Title',
          description: 'Embed description',
        } as any,
      ];

      (messageService.ingestMessage as jest.Mock).mockResolvedValue(undefined);

      await handleMessageCreate(mockMessage);

      expect(messageService.ingestMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              title: 'Embed Title',
            }),
          ]),
        })
      );
    });

    it('should handle long messages', async () => {
      mockMessage.content = 'a'.repeat(2000); // Max Discord message length

      (messageService.ingestMessage as jest.Mock).mockResolvedValue(undefined);

      await handleMessageCreate(mockMessage);

      expect(messageService.ingestMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'a'.repeat(2000),
        })
      );
    });
  });

  describe('message filtering', () => {
    it('should ignore bot messages', async () => {
      mockMessage.author.bot = true;

      await handleMessageCreate(mockMessage);

      expect(messageService.ingestMessage).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should ignore DM messages', async () => {
      mockMessage.guild = null as any;

      await handleMessageCreate(mockMessage);

      expect(messageService.ingestMessage).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should process webhook messages', async () => {
      mockMessage.author.bot = false;
      mockMessage.webhookId = 'webhook123' as any;

      (messageService.ingestMessage as jest.Mock).mockResolvedValue(undefined);

      await handleMessageCreate(mockMessage);

      // Webhooks are not bots, so they should be ingested
      expect(messageService.ingestMessage).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should log error when message ingestion fails', async () => {
      (messageService.ingestMessage as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      await handleMessageCreate(mockMessage);

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to handle message',
        expect.objectContaining({
          error: 'Database error',
        })
      );
    });

    it('should handle non-Error objects in ingestion failure', async () => {
      (messageService.ingestMessage as jest.Mock).mockRejectedValue('String error');

      await handleMessageCreate(mockMessage);

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to handle message',
        expect.objectContaining({
          error: 'Unknown error',
        })
      );
    });

    it('should continue processing even if ingestion fails', async () => {
      (messageService.ingestMessage as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      await expect(handleMessageCreate(mockMessage)).resolves.not.toThrow();
    });

    it('should handle database connection timeouts', async () => {
      (messageService.ingestMessage as jest.Mock).mockRejectedValue(
        new Error('Connection timeout')
      );

      await handleMessageCreate(mockMessage);

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to handle message',
        expect.objectContaining({
          error: 'Connection timeout',
        })
      );
    });

    it('should handle malformed message objects', async () => {
      const malformedMessage = {
        author: null,
        guild: { id: 'guild123' },
      } as any;

      (messageService.ingestMessage as jest.Mock).mockRejectedValue(
        new Error('Invalid message format')
      );

      await handleMessageCreate(malformedMessage);

      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('concurrent message handling', () => {
    it('should handle multiple messages concurrently', async () => {
      const messages = Array.from({ length: 10 }, (_, i) => ({
        ...mockMessage,
        id: `message${i}`,
        content: `Message ${i}`,
      }));

      (messageService.ingestMessage as jest.Mock).mockResolvedValue(undefined);

      await Promise.all(messages.map(msg => handleMessageCreate(msg as any)));

      expect(messageService.ingestMessage).toHaveBeenCalledTimes(10);
    });

    it('should handle one failure without affecting others', async () => {
      const messages = [
        { ...mockMessage, id: 'msg1', content: 'Message 1' },
        { ...mockMessage, id: 'msg2', content: 'Message 2' },
        { ...mockMessage, id: 'msg3', content: 'Message 3' },
      ];

      (messageService.ingestMessage as jest.Mock)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Database error'))
        .mockResolvedValueOnce(undefined);

      const results = await Promise.allSettled(
        messages.map(msg => handleMessageCreate(msg as any))
      );

      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('fulfilled'); // Error is caught and logged
      expect(results[2].status).toBe('fulfilled');
    });
  });

  describe('edge cases', () => {
    it('should handle empty message content', async () => {
      mockMessage.content = '';

      (messageService.ingestMessage as jest.Mock).mockResolvedValue(undefined);

      await handleMessageCreate(mockMessage);

      expect(messageService.ingestMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          content: '',
        })
      );
    });

    it('should handle message with only whitespace', async () => {
      mockMessage.content = '   \n\t  ';

      (messageService.ingestMessage as jest.Mock).mockResolvedValue(undefined);

      await handleMessageCreate(mockMessage);

      expect(messageService.ingestMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          content: '   \n\t  ',
        })
      );
    });

    it('should handle message with special characters', async () => {
      mockMessage.content = '!@#$%^&*()_+{}[]|\\:";\'<>?,./';

      (messageService.ingestMessage as jest.Mock).mockResolvedValue(undefined);

      await handleMessageCreate(mockMessage);

      expect(messageService.ingestMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          content: '!@#$%^&*()_+{}[]|\\:";\'<>?,./',
        })
      );
    });

    it('should handle message with unicode characters', async () => {
      mockMessage.content = '👋 Hello 世界 🌍 مرحبا';

      (messageService.ingestMessage as jest.Mock).mockResolvedValue(undefined);

      await handleMessageCreate(mockMessage);

      expect(messageService.ingestMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          content: '👋 Hello 世界 🌍 مرحبا',
        })
      );
    });

    it('should handle message from system user', async () => {
      mockMessage.author.id = '0'; // System user

      (messageService.ingestMessage as jest.Mock).mockResolvedValue(undefined);

      await handleMessageCreate(mockMessage);

      expect(messageService.ingestMessage).toHaveBeenCalled();
    });

    it('should handle thread messages', async () => {
      mockMessage.channel.type = 11 as any; // GUILD_PUBLIC_THREAD

      (messageService.ingestMessage as jest.Mock).mockResolvedValue(undefined);

      await handleMessageCreate(mockMessage);

      expect(messageService.ingestMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: expect.objectContaining({
            type: 11,
          }),
        })
      );
    });

    it('should handle messages with multiple mentions', async () => {
      mockMessage.mentions.users.set('user456', { id: 'user456' } as any);
      mockMessage.mentions.users.set('user789', { id: 'user789' } as any);
      mockMessage.mentions.users.set('user101', { id: 'user101' } as any);
      mockMessage.content = '<@user456> <@user789> <@user101> hello!';

      (messageService.ingestMessage as jest.Mock).mockResolvedValue(undefined);

      await handleMessageCreate(mockMessage);

      expect(messageService.ingestMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          mentions: expect.objectContaining({
            users: expect.any(Map),
          }),
        })
      );
    });
  });
});
