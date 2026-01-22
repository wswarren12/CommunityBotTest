/**
 * Handle message reaction removals for quest tracking
 */

import { MessageReaction, User, PartialMessageReaction, PartialUser } from 'discord.js';
import { logger } from '../../utils/logger';
import * as db from '../../db/queries';

/**
 * Handle when a reaction is removed from a message
 * Updates reaction tracking for discord_reaction_count quest verification
 */
export async function handleMessageReactionRemove(
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
        logger.debug('Could not fetch partial reaction', { error });
        return;
      }
    }

    // Ensure we have a guild message
    const message = reaction.message;
    if (!message.guild) {
      return;
    }

    // Remove the reaction from tracking
    await db.untrackReaction(
      message.id,
      user.id,
      reaction.emoji.toString()
    );

    logger.debug('Reaction untracked', {
      messageId: message.id,
      reactorId: user.id,
      emoji: reaction.emoji.toString(),
    });
  } catch (error) {
    logger.error('Error untracking reaction', {
      messageId: reaction.message.id,
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
