import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Message, Guild } from 'discord.js';
import { handleMessageCreate } from '../../src/bot/events/messageCreate';
import * as messageService from '../../src/services/messageService';
import * as logger from '../../src/utils/logger';

// Mock dependencies
jest.mock('../../src/services/messageService');
jest.mock('../../src/utils/logger');

describe('messageCreate event handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handleMessageCreate', () => {
    let mockMessage: Partial<Message>;
    let mockGuild: Partial<Guild>;

    beforeEach(() => {
      mockGuild = {
        id: 'guild123',
        name: 'Test Guild',
      };

      mockMessage = {
        id: 'message123',
        content: 'Test message',
        guild: mockGuild as Guild,
        author: {
          id: 'user123',
          bot: false,
          username: 'testuser',
        } as any,
        channel: {
          id: 'channel123',
        } as any,
      };

      (messageService.ingestMessage as jest.Mock).mockResolvedValue(undefined);
    });

    it('should ingest valid guild messages', async () => {
      await handleMessageCreate(mockMessage as Message);

      expect(messageService.ingestMessage).toHaveBeenCalledWith(mockMessage);
      expect(logger.logger.debug).toHaveBeenCalledWith(
        'Message ingested',
        expect.objectContaining({
          messageId: 'message123',
          channelId: 'channel123',
          userId: 'user123',
          guildId: 'guild123',
        })
      );
    });

    it('should ignore bot messages', async () => {
      mockMessage.author = {
        id: 'bot123',
        bot: true,
        username: 'botuser',
      } as any;

      await handleMessageCreate(mockMessage as Message);

      expect(messageService.ingestMessage).not.toHaveBeenCalled();
      expect(logger.logger.debug).not.toHaveBeenCalled();
    });

    it('should ignore DM messages (no guild)', async () => {
      mockMessage.guild = null as any;

      await handleMessageCreate(mockMessage as Message);

      expect(messageService.ingestMessage).not.toHaveBeenCalled();
      expect(logger.logger.debug).not.toHaveBeenCalled();
    });

    it('should handle ingestion errors gracefully', async () => {
      const error = new Error('Database connection failed');
      (messageService.ingestMessage as jest.Mock).mockRejectedValue(error);

      await handleMessageCreate(mockMessage as Message);

      expect(logger.logger.error).toHaveBeenCalledWith(
        'Failed to ingest message',
        expect.objectContaining({
          messageId: 'message123',
          error: 'Database connection failed',
        })
      );
    });

    it('should handle non-Error objects in catch block', async () => {
      (messageService.ingestMessage as jest.Mock).mockRejectedValue('string error');

      await handleMessageCreate(mockMessage as Message);

      expect(logger.logger.error).toHaveBeenCalledWith(
        'Failed to ingest message',
        expect.objectContaining({
          messageId: 'message123',
          error: 'Unknown error',
        })
      );
    });

    it('should process messages from system users', async () => {
      mockMessage.author = {
        id: 'system',
        bot: false,
        username: 'System',
        system: true,
      } as any;

      await handleMessageCreate(mockMessage as Message);

      expect(messageService.ingestMessage).toHaveBeenCalledWith(mockMessage);
    });

    it('should handle messages with empty content', async () => {
      mockMessage.content = '';

      await handleMessageCreate(mockMessage as Message);

      expect(messageService.ingestMessage).toHaveBeenCalledWith(mockMessage);
    });

    it('should handle messages with very long content', async () => {
      mockMessage.content = 'a'.repeat(5000);

      await handleMessageCreate(mockMessage as Message);

      expect(messageService.ingestMessage).toHaveBeenCalledWith(mockMessage);
    });

    it('should not throw if logger fails', async () => {
      (logger.logger.debug as jest.Mock).mockImplementation(() => {
        throw new Error('Logger error');
      });

      // Should not throw
      await expect(handleMessageCreate(mockMessage as Message)).resolves.toBeUndefined();
    });
  });
});
