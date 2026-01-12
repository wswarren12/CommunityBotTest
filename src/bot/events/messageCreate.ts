import { Message } from 'discord.js';
import { logger } from '../../utils/logger';
import { ingestMessage } from '../../services/messageService';

/**
 * Handle new messages for ingestion into database
 */
export async function handleMessageCreate(message: Message): Promise<void> {
  // Ignore bot messages
  if (message.author.bot) {
    return;
  }

  // Only process messages from guilds (not DMs)
  if (!message.guild) {
    return;
  }

  try {
    await ingestMessage(message);

    logger.debug('Message ingested', {
      messageId: message.id,
      channelId: message.channel.id,
      userId: message.author.id,
      guildId: message.guild.id,
    });
  } catch (error) {
    logger.error('Failed to ingest message', {
      messageId: message.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
