/**
 * Handle message reaction additions for quest tracking
 */

import { MessageReaction, User, PartialMessageReaction, PartialUser } from 'discord.js';
import { logger } from '../../utils/logger';
import * as db from '../../db/queries';

/**
 * Handle when a reaction is added to a message
 * Tracks reactions for discord_reaction_count quest verification
 */
export async function handleMessageReactionAdd(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser
): Promise<void> {
  // Ignore bot reactions
  if (user.bot) {
    return;
  }

  try {
    // Fetch the full reaction if partial
    if (reaction.partial) {
      try {
        reaction = await reaction.fetch();
      } catch (error) {
        // Log more context about the failure to help debug issues
        logger.warn('Could not fetch partial reaction - reaction will not be tracked for quests', {
          messageId: reaction.message.id,
          userId: user.id,
          channelId: reaction.message.channel.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        return;
      }
    }

    // Ensure we have a guild message
    const message = reaction.message;
    if (!message.guild) {
      return;
    }

    // Get the message author (the person who will get credit for receiving the reaction)
    const authorId = message.author?.id;
    if (!authorId) {
      return;
    }

    // Don't count self-reactions
    if (authorId === user.id) {
      return;
    }

    // Track the reaction
    await db.trackReaction(
      message.id,
      message.channel.id,
      message.guild.id,
      authorId,
      user.id,
      reaction.emoji.toString()
    );

    logger.debug('Reaction tracked', {
      messageId: message.id,
      authorId,
      reactorId: user.id,
      emoji: reaction.emoji.toString(),
      guildId: message.guild.id,
    });
  } catch (error) {
    logger.error('Error tracking reaction', {
      messageId: reaction.message.id,
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
