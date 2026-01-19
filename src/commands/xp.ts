/**
 * /xp command - View your XP and quest progress
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from 'discord.js';
import { logger } from '../utils/logger';
import * as questService from '../services/questService';

export const data = new SlashCommandBuilder()
  .setName('xp')
  .setDescription('View your XP and completed quests')
  .setDMPermission(false);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const guildId = interaction.guildId;

  if (!guildId) {
    await interaction.reply({
      content: 'This command can only be used in a server.',
      ephemeral: true,
    });
    return;
  }

  // Check rate limit
  const rateCheck = questService.checkRateLimit(userId, 'xp');
  if (!rateCheck.allowed) {
    await interaction.reply({
      content: questService.getRateLimitMessage('xp', rateCheck.retryAfter!),
      ephemeral: true,
    });
    return;
  }

  // Defer reply
  await interaction.deferReply({ ephemeral: true });

  try {
    logger.info('Processing /xp command', { userId, guildId });

    const result = await questService.getUserProgress(userId, guildId);

    await interaction.editReply({
      content: result.message,
    });

    logger.info('/xp command completed', {
      userId,
      guildId,
      xp: result.xp,
      questsCompleted: result.questsCompleted,
    });
  } catch (error) {
    logger.error('Error in /xp command', { userId, guildId, error });

    await interaction.editReply({
      content: 'An error occurred while fetching your progress. Please try again later.',
    });
  }
}
