/**
 * /confirm command - Verify quest completion
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from 'discord.js';
import { logger } from '../utils/logger';
import * as questService from '../services/questService';

export const data = new SlashCommandBuilder()
  .setName('confirm')
  .setDescription('Confirm your quest completion')
  .setDMPermission(false)
  .addStringOption(option =>
    option
      .setName('identifier')
      .setDescription('Your email, wallet address, Twitter handle, or other verification info')
      .setRequired(true)
      .setMaxLength(200)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const guildId = interaction.guildId;
  const identifier = interaction.options.getString('identifier', true).trim();

  if (!guildId) {
    await interaction.reply({
      content: 'This command can only be used in a server.',
      ephemeral: true,
    });
    return;
  }

  // Validate identifier
  if (!identifier || identifier.length < 3) {
    await interaction.reply({
      content: 'Please provide a valid identifier (minimum 3 characters).',
      ephemeral: true,
    });
    return;
  }

  // Check rate limit
  const rateCheck = questService.checkRateLimit(userId, 'confirm');
  if (!rateCheck.allowed) {
    await interaction.reply({
      content: questService.getRateLimitMessage('confirm', rateCheck.retryAfter!),
      ephemeral: true,
    });
    return;
  }

  // Defer reply since API verification might take a moment
  await interaction.deferReply({ ephemeral: true });

  try {
    logger.info('Processing /confirm command', { userId, guildId });

    const result = await questService.verifyQuestCompletion(userId, guildId, identifier);

    await interaction.editReply({
      content: result.message,
    });

    logger.info('/confirm command completed', {
      userId,
      guildId,
      success: result.success,
      xpAwarded: result.xpAwarded,
    });
  } catch (error) {
    logger.error('Error in /confirm command', { userId, guildId, error });

    await interaction.editReply({
      content: 'An error occurred while verifying your quest. Please try again later.',
    });
  }
}
