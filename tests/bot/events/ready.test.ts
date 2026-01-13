import { Client } from 'discord.js';
import { handleReady } from '../../../src/bot/events/ready';
import { registerCommands } from '../../../src/bot/commandRegistry';
import { logger } from '../../../src/utils/logger';

// Mock dependencies
jest.mock('../../../src/bot/commandRegistry');
jest.mock('../../../src/utils/logger');

describe('handleReady', () => {
  let mockClient: jest.Mocked<Client>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock client
    mockClient = {
      user: {
        tag: 'TestBot#1234',
        id: '123456789',
      },
      guilds: {
        cache: {
          size: 5,
        },
      },
    } as any;
  });

  describe('successful initialization', () => {
    it('should log bot ready with user info', async () => {
      (registerCommands as jest.Mock).mockResolvedValue(undefined);

      await handleReady(mockClient);

      expect(logger.info).toHaveBeenCalledWith('Bot is ready', {
        username: 'TestBot#1234',
        userId: '123456789',
        guilds: 5,
      });
    });

    it('should register slash commands', async () => {
      (registerCommands as jest.Mock).mockResolvedValue(undefined);

      await handleReady(mockClient);

      expect(registerCommands).toHaveBeenCalledWith(mockClient);
    });

    it('should log successful command registration', async () => {
      (registerCommands as jest.Mock).mockResolvedValue(undefined);

      await handleReady(mockClient);

      expect(logger.info).toHaveBeenCalledWith('Slash commands registered successfully');
    });

    it('should handle bot with no guilds', async () => {
      mockClient.guilds = {
        cache: {
          size: 0,
        },
      } as any;
      (registerCommands as jest.Mock).mockResolvedValue(undefined);

      await handleReady(mockClient);

      expect(logger.info).toHaveBeenCalledWith('Bot is ready', {
        username: 'TestBot#1234',
        userId: '123456789',
        guilds: 0,
      });
    });
  });

  describe('error handling', () => {
    it('should return early if client.user is null', async () => {
      mockClient.user = null as any;

      await handleReady(mockClient);

      expect(logger.error).toHaveBeenCalledWith('Client user is null in ready handler');
      expect(registerCommands).not.toHaveBeenCalled();
    });

    it('should return early if client.user is undefined', async () => {
      mockClient.user = undefined as any;

      await handleReady(mockClient);

      expect(logger.error).toHaveBeenCalledWith('Client user is null in ready handler');
      expect(registerCommands).not.toHaveBeenCalled();
    });

    it('should log error if command registration fails', async () => {
      const error = new Error('Failed to register commands');
      (registerCommands as jest.Mock).mockRejectedValue(error);

      await handleReady(mockClient);

      expect(logger.error).toHaveBeenCalledWith('Failed to register slash commands', {
        error: 'Failed to register commands',
      });
    });

    it('should handle non-Error objects in command registration failure', async () => {
      (registerCommands as jest.Mock).mockRejectedValue('String error');

      await handleReady(mockClient);

      expect(logger.error).toHaveBeenCalledWith('Failed to register slash commands', {
        error: 'Unknown error',
      });
    });

    it('should not throw error when command registration fails', async () => {
      (registerCommands as jest.Mock).mockRejectedValue(new Error('Test error'));

      await expect(handleReady(mockClient)).resolves.not.toThrow();
    });

    it('should still log bot ready even if command registration fails', async () => {
      (registerCommands as jest.Mock).mockRejectedValue(new Error('Test error'));

      await handleReady(mockClient);

      expect(logger.info).toHaveBeenCalledWith('Bot is ready', {
        username: 'TestBot#1234',
        userId: '123456789',
        guilds: 5,
      });
    });
  });

  describe('edge cases', () => {
    it('should handle client with large number of guilds', async () => {
      mockClient.guilds = {
        cache: {
          size: 10000,
        },
      } as any;
      (registerCommands as jest.Mock).mockResolvedValue(undefined);

      await handleReady(mockClient);

      expect(logger.info).toHaveBeenCalledWith('Bot is ready', {
        username: 'TestBot#1234',
        userId: '123456789',
        guilds: 10000,
      });
    });

    it('should handle user tag with special characters', async () => {
      mockClient.user = {
        tag: 'Test!@#$%Bot#9999',
        id: '123456789',
      } as any;
      (registerCommands as jest.Mock).mockResolvedValue(undefined);

      await handleReady(mockClient);

      expect(logger.info).toHaveBeenCalledWith('Bot is ready', {
        username: 'Test!@#$%Bot#9999',
        userId: '123456789',
        guilds: 5,
      });
    });

    it('should handle very long user IDs', async () => {
      mockClient.user = {
        tag: 'TestBot#1234',
        id: '9'.repeat(20),
      } as any;
      (registerCommands as jest.Mock).mockResolvedValue(undefined);

      await handleReady(mockClient);

      expect(logger.info).toHaveBeenCalledWith('Bot is ready', {
        username: 'TestBot#1234',
        userId: '9'.repeat(20),
        guilds: 5,
      });
    });
  });
});
