/**
 * Handle poll creation for quest tracking
 * Note: Discord.js v14 handles polls via messages with poll data
 */

import { Message } from 'discord.js';
import { logger } from '../../utils/logger';
import * as db from '../../db/queries';

/**
 * Check if a message contains a poll and track it
 * Called from messageCreate handler
 */
export async function trackPollIfPresent(message: Message): Promise<void> {
  // Check if the message has a poll
  // Discord.js v14.14+ has poll support
  const poll = (message as { poll?: { question?: { text?: string } } }).poll;

  if (!poll) {
    return;
  }

  // Ensure we have a guild message
  if (!message.guild) {
    return;
  }

  // Ignore bot-created polls for quest tracking
  if (message.author.bot) {
    return;
  }

  try {
    // Extract the poll question if available
    const question = poll.question?.text || 'Poll';

    // Track the poll
    await db.trackPoll(
      message.id,
      message.channel.id,
      message.guild.id,
      message.author.id,
      question
    );

    logger.info('Poll tracked', {
      messageId: message.id,
      creatorId: message.author.id,
      guildId: message.guild.id,
      question: question.substring(0, 50),
    });
  } catch (error) {
    logger.error('Error tracking poll', {
      messageId: message.id,
      userId: message.author.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
