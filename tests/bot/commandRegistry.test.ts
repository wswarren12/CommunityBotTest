import { Client, REST, Routes } from 'discord.js';
import { registerCommands, unregisterCommands } from '../../src/bot/commandRegistry';
import { logger } from '../../src/utils/logger';

// Mock dependencies
jest.mock('discord.js', () => {
  const actualDiscord = jest.requireActual('discord.js');
  return {
    ...actualDiscord,
    REST: jest.fn().mockImplementation(() => ({
      setToken: jest.fn().mockReturnThis(),
      put: jest.fn().mockResolvedValue(undefined),
    })),
  };
});
jest.mock('../../src/utils/logger');

describe('commandRegistry', () => {
  const originalEnv = process.env;
  let mockClient: jest.Mocked<Client>;
  let mockRest: any;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.DISCORD_TOKEN = 'test_token';
    process.env.DISCORD_CLIENT_ID = 'test_client_id';

    mockClient = {
      user: {
        id: 'bot123',
        tag: 'TestBot#1234',
      },
    } as any;

    mockRest = {
      setToken: jest.fn().mockReturnThis(),
      put: jest.fn().mockResolvedValue(undefined),
    };

    (REST as jest.MockedClass<typeof REST>).mockImplementation(() => mockRest);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('registerCommands', () => {
    it('should successfully register commands', async () => {
      await registerCommands(mockClient);

      expect(REST).toHaveBeenCalledWith({ version: '10' });
      expect(mockRest.setToken).toHaveBeenCalledWith('test_token');
      expect(mockRest.put).toHaveBeenCalledWith(
        Routes.applicationCommands('test_client_id'),
        { body: expect.any(Array) }
      );
      expect(logger.info).toHaveBeenCalledWith('Started refreshing application (/) commands');
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringMatching(/Successfully registered \d+ application \(\/\) commands/)
      );
    });

    it('should register catchup command with correct structure', async () => {
      await registerCommands(mockClient);

      const putCall = mockRest.put.mock.calls[0];
      const commands = putCall[1].body;

      // Find the catchup command among all registered commands
      const catchupCommand = commands.find((cmd: any) => cmd.name === 'catchup');
      expect(catchupCommand).toBeDefined();
      expect(catchupCommand.description).toBe(
        'Get a personalized summary of activity since your last message'
      );
    });

    it('should include timeframe option in catchup command', async () => {
      await registerCommands(mockClient);

      const putCall = mockRest.put.mock.calls[0];
      const commands = putCall[1].body;
      const catchupCommand = commands[0];

      expect(catchupCommand.options).toHaveLength(1);
      expect(catchupCommand.options[0].name).toBe('timeframe');
      expect(catchupCommand.options[0].description).toContain('Custom timeframe');
      expect(catchupCommand.options[0].required).toBe(false);
    });

    it('should throw error if client.user is null', async () => {
      mockClient.user = null as any;

      await expect(registerCommands(mockClient)).rejects.toThrow('Client user is null');
    });

    it('should throw error if client.user is undefined', async () => {
      mockClient.user = undefined as any;

      await expect(registerCommands(mockClient)).rejects.toThrow('Client user is null');
    });

    it('should throw error if DISCORD_TOKEN is missing', async () => {
      delete process.env.DISCORD_TOKEN;

      await expect(registerCommands(mockClient)).rejects.toThrow(
        'Missing DISCORD_TOKEN or DISCORD_CLIENT_ID environment variables'
      );
    });

    it('should throw error if DISCORD_CLIENT_ID is missing', async () => {
      delete process.env.DISCORD_CLIENT_ID;

      await expect(registerCommands(mockClient)).rejects.toThrow(
        'Missing DISCORD_TOKEN or DISCORD_CLIENT_ID environment variables'
      );
    });

    it('should throw error if both env vars are missing', async () => {
      delete process.env.DISCORD_TOKEN;
      delete process.env.DISCORD_CLIENT_ID;

      await expect(registerCommands(mockClient)).rejects.toThrow(
        'Missing DISCORD_TOKEN or DISCORD_CLIENT_ID environment variables'
      );
    });

    it('should log and throw error when Discord API fails', async () => {
      const error = new Error('Discord API error');
      mockRest.put.mockRejectedValue(error);

      await expect(registerCommands(mockClient)).rejects.toThrow('Discord API error');

      expect(logger.error).toHaveBeenCalledWith('Failed to register commands', {
        error: 'Discord API error',
      });
    });

    it('should handle non-Error objects in API failure', async () => {
      mockRest.put.mockRejectedValue('String error');

      // When a non-Error is thrown, Jest's toThrow() doesn't work - use toBe instead
      await expect(registerCommands(mockClient)).rejects.toBe('String error');

      expect(logger.error).toHaveBeenCalledWith('Failed to register commands', {
        error: 'Unknown error',
      });
    });

    it('should use correct REST API version', async () => {
      await registerCommands(mockClient);

      expect(REST).toHaveBeenCalledWith({ version: '10' });
    });

    it('should use correct Routes for application commands', async () => {
      await registerCommands(mockClient);

      expect(mockRest.put).toHaveBeenCalledWith(
        Routes.applicationCommands('test_client_id'),
        expect.any(Object)
      );
    });
  });

  describe('unregisterCommands', () => {
    it('should successfully unregister all commands', async () => {
      await unregisterCommands();

      expect(REST).toHaveBeenCalledWith({ version: '10' });
      expect(mockRest.setToken).toHaveBeenCalledWith('test_token');
      expect(mockRest.put).toHaveBeenCalledWith(
        Routes.applicationCommands('test_client_id'),
        { body: [] }
      );
      expect(logger.info).toHaveBeenCalledWith('Unregistering all application (/) commands');
      expect(logger.info).toHaveBeenCalledWith('Successfully unregistered all commands');
    });

    it('should throw error if DISCORD_TOKEN is missing', async () => {
      delete process.env.DISCORD_TOKEN;

      await expect(unregisterCommands()).rejects.toThrow(
        'Missing DISCORD_TOKEN or DISCORD_CLIENT_ID environment variables'
      );
    });

    it('should throw error if DISCORD_CLIENT_ID is missing', async () => {
      delete process.env.DISCORD_CLIENT_ID;

      await expect(unregisterCommands()).rejects.toThrow(
        'Missing DISCORD_TOKEN or DISCORD_CLIENT_ID environment variables'
      );
    });

    it('should log and throw error when Discord API fails', async () => {
      const error = new Error('Discord API error');
      mockRest.put.mockRejectedValue(error);

      await expect(unregisterCommands()).rejects.toThrow('Discord API error');

      expect(logger.error).toHaveBeenCalledWith('Failed to unregister commands', {
        error: 'Discord API error',
      });
    });

    it('should handle non-Error objects in API failure', async () => {
      mockRest.put.mockRejectedValue('String error');

      // When a non-Error is thrown, Jest's toThrow() doesn't work - use toBe instead
      await expect(unregisterCommands()).rejects.toBe('String error');

      expect(logger.error).toHaveBeenCalledWith('Failed to unregister commands', {
        error: 'Unknown error',
      });
    });

    it('should send empty array to remove all commands', async () => {
      await unregisterCommands();

      const putCall = mockRest.put.mock.calls[0];
      expect(putCall[1].body).toEqual([]);
    });

    it('should use correct REST API version', async () => {
      await unregisterCommands();

      expect(REST).toHaveBeenCalledWith({ version: '10' });
    });
  });

  describe('edge cases', () => {
    it('should handle empty DISCORD_TOKEN string', async () => {
      process.env.DISCORD_TOKEN = '';

      await expect(registerCommands(mockClient)).rejects.toThrow(
        'Missing DISCORD_TOKEN or DISCORD_CLIENT_ID environment variables'
      );
    });

    it('should handle empty DISCORD_CLIENT_ID string', async () => {
      process.env.DISCORD_CLIENT_ID = '';

      await expect(registerCommands(mockClient)).rejects.toThrow(
        'Missing DISCORD_TOKEN or DISCORD_CLIENT_ID environment variables'
      );
    });

    it('should handle whitespace-only token', async () => {
      process.env.DISCORD_TOKEN = '   ';
      mockRest.put.mockRejectedValue(new Error('Invalid token'));

      await expect(registerCommands(mockClient)).rejects.toThrow();
    });

    it('should handle rate limit errors from Discord', async () => {
      const rateLimitError = new Error('Rate limited');
      (rateLimitError as any).httpStatus = 429;
      mockRest.put.mockRejectedValue(rateLimitError);

      await expect(registerCommands(mockClient)).rejects.toThrow('Rate limited');
      expect(logger.error).toHaveBeenCalledWith('Failed to register commands', {
        error: 'Rate limited',
      });
    });

    it('should handle network errors', async () => {
      const networkError = new Error('ECONNREFUSED');
      mockRest.put.mockRejectedValue(networkError);

      await expect(registerCommands(mockClient)).rejects.toThrow('ECONNREFUSED');
      expect(logger.error).toHaveBeenCalledWith('Failed to register commands', {
        error: 'ECONNREFUSED',
      });
    });
  });
});
