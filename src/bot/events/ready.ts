import { Client } from 'discord.js';
import { logger } from '../../utils/logger';
import { registerCommands } from '../commandRegistry';

/**
 * Handle the 'ready' event when bot starts up
 */
export async function handleReady(client: Client): Promise<void> {
  if (!client.user) {
    logger.error('Client user is null in ready handler');
    return;
  }

  logger.info('Bot is ready', {
    username: client.user.tag,
    userId: client.user.id,
    guilds: client.guilds.cache.size,
  });

  // Register slash commands
  try {
    await registerCommands(client);
    logger.info('Slash commands registered successfully');
  } catch (error) {
    logger.error('Failed to register slash commands', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
