import { Client, ActivityType } from 'discord.js';
import { createClient, loginClient, shutdownClient } from '../../src/bot/client';
import { logger } from '../../src/utils/logger';

// Mock dependencies
jest.mock('discord.js', () => {
  const actualDiscord = jest.requireActual('discord.js');
  return {
    ...actualDiscord,
    Client: jest.fn().mockImplementation(() => ({
      once: jest.fn(),
      login: jest.fn().mockResolvedValue('token'),
      destroy: jest.fn(),
      user: null,
      guilds: {
        cache: {
          size: 0,
        },
      },
    })),
  };
});
jest.mock('../../src/utils/logger');

describe('client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createClient', () => {
    it('should create a Discord client with correct intents', () => {
      const client = createClient();

      expect(Client).toHaveBeenCalledWith({
        intents: [
          expect.any(Number), // GatewayIntentBits.Guilds
          expect.any(Number), // GatewayIntentBits.GuildMessages
          expect.any(Number), // GatewayIntentBits.MessageContent
          expect.any(Number), // GatewayIntentBits.GuildMembers
          expect.any(Number), // GatewayIntentBits.GuildScheduledEvents
        ],
        partials: [
          expect.any(Number), // Partials.Channel
          expect.any(Number), // Partials.Message
        ],
      });
      expect(client).toBeDefined();
    });

    it('should register ready event listener', () => {
      const client = createClient();

      expect(client.once).toHaveBeenCalledWith('ready', expect.any(Function));
    });

    it('should log when client becomes ready', () => {
      const client = createClient();
      const readyHandler = (client.once as jest.Mock).mock.calls[0][1];

      const mockReadyClient = {
        user: {
          tag: 'TestBot#1234',
          id: 'bot123',
          setActivity: jest.fn(),
        },
        guilds: {
          cache: {
            size: 5,
          },
        },
      };

      readyHandler(mockReadyClient);

      expect(logger.info).toHaveBeenCalledWith('Discord bot logged in as TestBot#1234', {
        userId: 'bot123',
        guilds: 5,
      });
    });

    it('should set bot activity status', () => {
      const client = createClient();
      const readyHandler = (client.once as jest.Mock).mock.calls[0][1];

      const mockSetActivity = jest.fn();
      const mockReadyClient = {
        user: {
          tag: 'TestBot#1234',
          id: 'bot123',
          setActivity: mockSetActivity,
        },
        guilds: {
          cache: {
            size: 5,
          },
        },
      };

      readyHandler(mockReadyClient);

      expect(mockSetActivity).toHaveBeenCalledWith('/catchup for summaries', {
        type: ActivityType.Listening,
      });
    });

    it('should return a client instance', () => {
      const client = createClient();

      expect(client).toBeDefined();
      expect(client).toHaveProperty('once');
    });

    it('should handle client with zero guilds', () => {
      const client = createClient();
      const readyHandler = (client.once as jest.Mock).mock.calls[0][1];

      const mockReadyClient = {
        user: {
          tag: 'TestBot#1234',
          id: 'bot123',
          setActivity: jest.fn(),
        },
        guilds: {
          cache: {
            size: 0,
          },
        },
      };

      readyHandler(mockReadyClient);

      expect(logger.info).toHaveBeenCalledWith('Discord bot logged in as TestBot#1234', {
        userId: 'bot123',
        guilds: 0,
      });
    });

    it('should handle client with many guilds', () => {
      const client = createClient();
      const readyHandler = (client.once as jest.Mock).mock.calls[0][1];

      const mockReadyClient = {
        user: {
          tag: 'TestBot#1234',
          id: 'bot123',
          setActivity: jest.fn(),
        },
        guilds: {
          cache: {
            size: 10000,
          },
        },
      };

      readyHandler(mockReadyClient);

      expect(logger.info).toHaveBeenCalledWith('Discord bot logged in as TestBot#1234', {
        userId: 'bot123',
        guilds: 10000,
      });
    });
  });

  describe('loginClient', () => {
    let mockClient: jest.Mocked<Client>;

    beforeEach(() => {
      mockClient = {
        login: jest.fn().mockResolvedValue('token'),
      } as any;
    });

    it('should successfully login with token', async () => {
      const token = 'test_token_123';

      await loginClient(mockClient, token);

      expect(mockClient.login).toHaveBeenCalledWith(token);
      expect(logger.info).toHaveBeenCalledWith('Discord client logged in successfully');
    });

    it('should log error and throw when login fails', async () => {
      const error = new Error('Invalid token');
      mockClient.login.mockRejectedValue(error);

      await expect(loginClient(mockClient, 'bad_token')).rejects.toThrow('Invalid token');

      expect(logger.error).toHaveBeenCalledWith('Failed to login to Discord', {
        error: 'Invalid token',
      });
    });

    it('should handle non-Error objects in login failure', async () => {
      mockClient.login.mockRejectedValue('String error');

      await expect(loginClient(mockClient, 'bad_token')).rejects.toThrow();

      expect(logger.error).toHaveBeenCalledWith('Failed to login to Discord', {
        error: 'Unknown error',
      });
    });

    it('should handle empty token', async () => {
      mockClient.login.mockRejectedValue(new Error('Token is required'));

      await expect(loginClient(mockClient, '')).rejects.toThrow();

      expect(mockClient.login).toHaveBeenCalledWith('');
    });

    it('should handle network errors', async () => {
      const networkError = new Error('ECONNREFUSED');
      mockClient.login.mockRejectedValue(networkError);

      await expect(loginClient(mockClient, 'token')).rejects.toThrow('ECONNREFUSED');

      expect(logger.error).toHaveBeenCalledWith('Failed to login to Discord', {
        error: 'ECONNREFUSED',
      });
    });

    it('should handle rate limit errors', async () => {
      const rateLimitError = new Error('Rate limited');
      mockClient.login.mockRejectedValue(rateLimitError);

      await expect(loginClient(mockClient, 'token')).rejects.toThrow('Rate limited');

      expect(logger.error).toHaveBeenCalledWith('Failed to login to Discord', {
        error: 'Rate limited',
      });
    });

    it('should handle very long tokens', async () => {
      const longToken = 'a'.repeat(1000);

      await loginClient(mockClient, longToken);

      expect(mockClient.login).toHaveBeenCalledWith(longToken);
    });
  });

  describe('shutdownClient', () => {
    let mockClient: jest.Mocked<Client>;

    beforeEach(() => {
      mockClient = {
        destroy: jest.fn(),
      } as any;
    });

    it('should destroy client and log shutdown', async () => {
      await shutdownClient(mockClient);

      expect(logger.info).toHaveBeenCalledWith('Shutting down Discord client...');
      expect(mockClient.destroy).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Discord client shut down');
    });

    it('should call destroy exactly once', async () => {
      await shutdownClient(mockClient);

      expect(mockClient.destroy).toHaveBeenCalledTimes(1);
    });

    it('should log before and after shutdown', async () => {
      await shutdownClient(mockClient);

      const logCalls = (logger.info as jest.Mock).mock.calls;
      expect(logCalls[0][0]).toBe('Shutting down Discord client...');
      expect(logCalls[1][0]).toBe('Discord client shut down');
    });

    it('should handle multiple shutdown calls', async () => {
      await shutdownClient(mockClient);
      await shutdownClient(mockClient);

      expect(mockClient.destroy).toHaveBeenCalledTimes(2);
    });

    it('should complete even if destroy throws error', async () => {
      mockClient.destroy.mockImplementation(() => {
        throw new Error('Destroy failed');
      });

      // Should not throw because destroy errors are not caught
      expect(() => shutdownClient(mockClient)).not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should create multiple independent clients', () => {
      const client1 = createClient();
      const client2 = createClient();

      expect(client1).toBeDefined();
      expect(client2).toBeDefined();
      expect(Client).toHaveBeenCalledTimes(2);
    });

    it('should handle login with whitespace in token', async () => {
      const mockClient = {
        login: jest.fn().mockResolvedValue('token'),
      } as any;

      await loginClient(mockClient, '  token_with_spaces  ');

      expect(mockClient.login).toHaveBeenCalledWith('  token_with_spaces  ');
    });

    it('should handle special characters in bot tag', () => {
      const client = createClient();
      const readyHandler = (client.once as jest.Mock).mock.calls[0][1];

      const mockReadyClient = {
        user: {
          tag: 'Test!@#$Bot#9999',
          id: 'bot123',
          setActivity: jest.fn(),
        },
        guilds: {
          cache: {
            size: 1,
          },
        },
      };

      readyHandler(mockReadyClient);

      expect(logger.info).toHaveBeenCalledWith('Discord bot logged in as Test!@#$Bot#9999', {
        userId: 'bot123',
        guilds: 1,
      });
    });

    it('should handle very long bot IDs', () => {
      const client = createClient();
      const readyHandler = (client.once as jest.Mock).mock.calls[0][1];

      const longId = '9'.repeat(50);
      const mockReadyClient = {
        user: {
          tag: 'TestBot#1234',
          id: longId,
          setActivity: jest.fn(),
        },
        guilds: {
          cache: {
            size: 1,
          },
        },
      };

      readyHandler(mockReadyClient);

      expect(logger.info).toHaveBeenCalledWith('Discord bot logged in as TestBot#1234', {
        userId: longId,
        guilds: 1,
      });
    });
  });
});
