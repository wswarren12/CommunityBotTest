/**
 * /quest command - Get assigned a random quest
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from 'discord.js';
import { logger } from '../utils/logger';
import * as questService from '../services/questService';

export const data = new SlashCommandBuilder()
  .setName('quest')
  .setDescription('Get a quest assigned to you and earn XP!')
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
  const rateCheck = questService.checkRateLimit(userId, 'quest');
  if (!rateCheck.allowed) {
    await interaction.reply({
      content: questService.getRateLimitMessage('quest', rateCheck.retryAfter!),
      ephemeral: true,
    });
    return;
  }

  // Defer reply since this might take a moment
  await interaction.deferReply({ ephemeral: true });

  try {
    logger.info('Processing /quest command', { userId, guildId });

    const result = await questService.assignQuest(userId, guildId);

    await interaction.editReply({
      content: result.message,
    });

    logger.info('/quest command completed', {
      userId,
      guildId,
      success: result.success,
      questAssigned: result.quest?.name,
    });
  } catch (error) {
    logger.error('Error in /quest command', { userId, guildId, error });

    await interaction.editReply({
      content: 'An error occurred while getting your quest. Please try again later.',
    });
  }
}
