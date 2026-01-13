import { ChatInputCommandInteraction, ButtonInteraction } from 'discord.js';
import { handleInteractionCreate } from '../../../src/bot/events/interactionCreate';
import { handleCatchupCommand } from '../../../src/commands/catchup';
import { logger } from '../../../src/utils/logger';

// Mock dependencies
jest.mock('../../../src/commands/catchup');
jest.mock('../../../src/utils/logger');

describe('handleInteractionCreate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('slash commands', () => {
    let mockInteraction: jest.Mocked<ChatInputCommandInteraction>;

    beforeEach(() => {
      mockInteraction = {
        isChatInputCommand: jest.fn().mockReturnValue(true),
        isButton: jest.fn().mockReturnValue(false),
        isRepliable: jest.fn().mockReturnValue(true),
        commandName: 'catchup',
        user: {
          id: 'user123',
        },
        guildId: 'guild123',
        id: 'interaction123',
        replied: false,
        deferred: false,
        reply: jest.fn().mockResolvedValue(undefined),
        followUp: jest.fn().mockResolvedValue(undefined),
      } as any;
    });

    it('should handle /catchup command', async () => {
      (handleCatchupCommand as jest.Mock).mockResolvedValue(undefined);

      await handleInteractionCreate(mockInteraction);

      expect(logger.info).toHaveBeenCalledWith('Slash command received', {
        command: 'catchup',
        userId: 'user123',
        guildId: 'guild123',
      });
      expect(handleCatchupCommand).toHaveBeenCalledWith(mockInteraction);
    });

    it('should handle unknown command', async () => {
      mockInteraction.commandName = 'unknown';

      await handleInteractionCreate(mockInteraction);

      expect(logger.warn).toHaveBeenCalledWith('Unknown command', { command: 'unknown' });
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Unknown command',
        ephemeral: true,
      });
    });

    it('should log command with guild context', async () => {
      (handleCatchupCommand as jest.Mock).mockResolvedValue(undefined);
      mockInteraction.guildId = 'guild456';

      await handleInteractionCreate(mockInteraction);

      expect(logger.info).toHaveBeenCalledWith('Slash command received', {
        command: 'catchup',
        userId: 'user123',
        guildId: 'guild456',
      });
    });

    it('should handle command without guildId (DM)', async () => {
      mockInteraction.guildId = null;
      (handleCatchupCommand as jest.Mock).mockResolvedValue(undefined);

      await handleInteractionCreate(mockInteraction);

      expect(logger.info).toHaveBeenCalledWith('Slash command received', {
        command: 'catchup',
        userId: 'user123',
        guildId: null,
      });
    });
  });

  describe('button interactions', () => {
    let mockInteraction: jest.Mocked<ButtonInteraction>;

    beforeEach(() => {
      mockInteraction = {
        isChatInputCommand: jest.fn().mockReturnValue(false),
        isButton: jest.fn().mockReturnValue(true),
        isRepliable: jest.fn().mockReturnValue(true),
        customId: 'expand_detailed',
        user: {
          id: 'user123',
        },
        id: 'interaction123',
        replied: false,
        deferred: false,
        reply: jest.fn().mockResolvedValue(undefined),
        followUp: jest.fn().mockResolvedValue(undefined),
      } as any;
    });

    it('should handle expand button', async () => {
      const mockHandleExpandButton = jest.fn().mockResolvedValue(undefined);
      jest.doMock('../../../src/commands/catchup', () => ({
        handleExpandButton: mockHandleExpandButton,
      }));

      await handleInteractionCreate(mockInteraction);

      expect(logger.info).toHaveBeenCalledWith('Button interaction received', {
        customId: 'expand_detailed',
        userId: 'user123',
      });
    });

    it('should log button interaction details', async () => {
      mockInteraction.customId = 'expand_full';

      await handleInteractionCreate(mockInteraction);

      expect(logger.info).toHaveBeenCalledWith('Button interaction received', {
        customId: 'expand_full',
        userId: 'user123',
      });
    });

    it('should handle button with different custom IDs', async () => {
      mockInteraction.customId = 'other_button';

      await handleInteractionCreate(mockInteraction);

      expect(logger.info).toHaveBeenCalledWith('Button interaction received', {
        customId: 'other_button',
        userId: 'user123',
      });
    });
  });

  describe('error handling', () => {
    let mockInteraction: jest.Mocked<ChatInputCommandInteraction>;

    beforeEach(() => {
      mockInteraction = {
        isChatInputCommand: jest.fn().mockReturnValue(true),
        isButton: jest.fn().mockReturnValue(false),
        isRepliable: jest.fn().mockReturnValue(true),
        commandName: 'catchup',
        user: {
          id: 'user123',
        },
        guildId: 'guild123',
        id: 'interaction123',
        replied: false,
        deferred: false,
        reply: jest.fn().mockResolvedValue(undefined),
        followUp: jest.fn().mockResolvedValue(undefined),
      } as any;
    });

    it('should log error and send error message when command handler fails', async () => {
      const error = new Error('Command failed');
      (handleCatchupCommand as jest.Mock).mockRejectedValue(error);

      await handleInteractionCreate(mockInteraction);

      expect(logger.error).toHaveBeenCalledWith('Failed to handle interaction', {
        interactionId: 'interaction123',
        error: 'Command failed',
      });
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'An error occurred while processing your request.',
        ephemeral: true,
      });
    });

    it('should handle non-Error objects', async () => {
      (handleCatchupCommand as jest.Mock).mockRejectedValue('String error');

      await handleInteractionCreate(mockInteraction);

      expect(logger.error).toHaveBeenCalledWith('Failed to handle interaction', {
        interactionId: 'interaction123',
        error: 'Unknown error',
      });
    });

    it('should use followUp if interaction already replied', async () => {
      mockInteraction.replied = true;
      (handleCatchupCommand as jest.Mock).mockRejectedValue(new Error('Test error'));

      await handleInteractionCreate(mockInteraction);

      expect(mockInteraction.followUp).toHaveBeenCalledWith({
        content: 'An error occurred while processing your request.',
        ephemeral: true,
      });
      expect(mockInteraction.reply).not.toHaveBeenCalled();
    });

    it('should use followUp if interaction already deferred', async () => {
      mockInteraction.deferred = true;
      (handleCatchupCommand as jest.Mock).mockRejectedValue(new Error('Test error'));

      await handleInteractionCreate(mockInteraction);

      expect(mockInteraction.followUp).toHaveBeenCalledWith({
        content: 'An error occurred while processing your request.',
        ephemeral: true,
      });
      expect(mockInteraction.reply).not.toHaveBeenCalled();
    });

    it('should handle error when sending error message fails', async () => {
      (handleCatchupCommand as jest.Mock).mockRejectedValue(new Error('Command error'));
      mockInteraction.reply.mockRejectedValue(new Error('Reply failed'));

      await handleInteractionCreate(mockInteraction);

      expect(logger.error).toHaveBeenCalledWith('Failed to send error message to user', {
        error: 'Reply failed',
      });
    });

    it('should handle non-repliable interactions', async () => {
      mockInteraction.isRepliable.mockReturnValue(false);
      (handleCatchupCommand as jest.Mock).mockRejectedValue(new Error('Test error'));

      await handleInteractionCreate(mockInteraction);

      expect(mockInteraction.reply).not.toHaveBeenCalled();
      expect(mockInteraction.followUp).not.toHaveBeenCalled();
    });

    it('should log when error message send fails with non-Error object', async () => {
      (handleCatchupCommand as jest.Mock).mockRejectedValue(new Error('Command error'));
      mockInteraction.reply.mockRejectedValue('String error');

      await handleInteractionCreate(mockInteraction);

      expect(logger.error).toHaveBeenCalledWith('Failed to send error message to user', {
        error: 'Unknown error',
      });
    });
  });

  describe('other interaction types', () => {
    it('should ignore interactions that are not commands or buttons', async () => {
      const mockInteraction = {
        isChatInputCommand: jest.fn().mockReturnValue(false),
        isButton: jest.fn().mockReturnValue(false),
        isRepliable: jest.fn().mockReturnValue(true),
        id: 'interaction123',
      } as any;

      await handleInteractionCreate(mockInteraction);

      expect(logger.info).not.toHaveBeenCalled();
      expect(handleCatchupCommand).not.toHaveBeenCalled();
    });

    it('should not throw error for unknown interaction types', async () => {
      const mockInteraction = {
        isChatInputCommand: jest.fn().mockReturnValue(false),
        isButton: jest.fn().mockReturnValue(false),
        isRepliable: jest.fn().mockReturnValue(true),
        id: 'interaction123',
      } as any;

      await expect(handleInteractionCreate(mockInteraction)).resolves.not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle button customId that does not start with expand_', async () => {
      const mockInteraction = {
        isChatInputCommand: jest.fn().mockReturnValue(false),
        isButton: jest.fn().mockReturnValue(true),
        isRepliable: jest.fn().mockReturnValue(true),
        customId: 'other_action',
        user: {
          id: 'user123',
        },
        id: 'interaction123',
      } as any;

      await handleInteractionCreate(mockInteraction);

      expect(logger.info).toHaveBeenCalledWith('Button interaction received', {
        customId: 'other_action',
        userId: 'user123',
      });
    });

    it('should handle very long interaction IDs', async () => {
      const mockInteraction = {
        isChatInputCommand: jest.fn().mockReturnValue(true),
        isButton: jest.fn().mockReturnValue(false),
        isRepliable: jest.fn().mockReturnValue(true),
        commandName: 'catchup',
        user: {
          id: 'user123',
        },
        guildId: 'guild123',
        id: '1'.repeat(100),
        replied: false,
        deferred: false,
        reply: jest.fn().mockResolvedValue(undefined),
      } as any;

      (handleCatchupCommand as jest.Mock).mockResolvedValue(undefined);

      await handleInteractionCreate(mockInteraction);

      expect(logger.info).toHaveBeenCalled();
    });
  });
});
