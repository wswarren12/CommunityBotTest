import { Interaction } from 'discord.js';
import { logger } from '../../utils/logger';
import { handleCatchupCommand } from '../../commands/catchup';

/**
 * Handle all interactions (slash commands, buttons, etc.)
 */
export async function handleInteractionCreate(interaction: Interaction): Promise<void> {
  try {
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
      logger.info('Slash command received', {
        command: interaction.commandName,
        userId: interaction.user.id,
        guildId: interaction.guildId,
      });

      switch (interaction.commandName) {
        case 'catchup':
          await handleCatchupCommand(interaction);
          break;
        default:
          logger.warn('Unknown command', { command: interaction.commandName });
          await interaction.reply({
            content: 'Unknown command',
            ephemeral: true,
          });
      }
    }

    // Handle button interactions
    else if (interaction.isButton()) {
      logger.info('Button interaction received', {
        customId: interaction.customId,
        userId: interaction.user.id,
      });

      // Button handlers will be implemented in the commands that use them
      // For now, just acknowledge
      if (interaction.customId.startsWith('expand_')) {
        const { handleExpandButton } = await import('../../commands/catchup');
        await handleExpandButton(interaction);
      }
    }
  } catch (error) {
    logger.error('Failed to handle interaction', {
      interactionId: interaction.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    // Try to respond with error message
    try {
      const errorMessage = 'An error occurred while processing your request.';

      if (interaction.isRepliable()) {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: errorMessage,
            ephemeral: true,
          });
        } else {
          await interaction.reply({
            content: errorMessage,
            ephemeral: true,
          });
        }
      }
    } catch (replyError) {
      logger.error('Failed to send error message to user', {
        error: replyError instanceof Error ? replyError.message : 'Unknown error',
      });
    }
  }
}
