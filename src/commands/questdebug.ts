/**
 * /questdebug command - Debug command for admins to check quest status
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import { logger } from '../utils/logger';
import * as questService from '../services/questService';

export const data = new SlashCommandBuilder()
  .setName('questdebug')
  .setDescription('Debug: Check quest status in this server (admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;

  if (!guildId) {
    await interaction.reply({
      content: 'This command can only be used in a server.',
      ephemeral: true,
    });
    return;
  }

  // Server-side permission check (setDefaultMemberPermissions only hides UI, doesn't enforce)
  const member = interaction.member;
  if (!member || typeof member.permissions === 'string') {
    await interaction.reply({
      content: 'Unable to verify your permissions. Please try again.',
      ephemeral: true,
    });
    return;
  }

  if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
    logger.warn('Unauthorized questdebug attempt', {
      userId: interaction.user.id,
      guildId,
    });
    await interaction.reply({
      content: 'You need Administrator permission to use this command.',
      ephemeral: true,
    });
    return;
  }

  // Defer reply since this might take a moment
  await interaction.deferReply({ ephemeral: true });

  try {
    logger.info('Processing /questdebug command', {
      userId: interaction.user.id,
      guildId,
    });

    const status = await questService.debugGetQuestStatus(guildId);

    let response = `**Quest Debug Info for this server:**\n\n`;
    response += `**Summary:**\n`;
    response += `- Total quests: ${status.total}\n`;
    response += `- Active quests: ${status.active}\n`;
    response += `- Inactive quests: ${status.inactive}\n`;
    response += `- Maxed out quests: ${status.maxedOut}\n\n`;

    if (status.quests.length === 0) {
      response += `**No quests found in database.**\n\n`;
      response += `This means either:\n`;
      response += `1. No quests have been created yet\n`;
      response += `2. Quest creation failed (check logs for errors)\n`;
      response += `3. The database migration may not have been run\n\n`;
      response += `**Troubleshooting:**\n`;
      response += `- Run \`npm run migrate\` to ensure database is up to date\n`;
      response += `- Check application logs for errors during quest creation\n`;
      response += `- Try creating a quest again and watch for error messages\n`;
    } else {
      response += `**Quest Details:**\n`;
      for (const quest of status.quests) {
        const statusEmoji = quest.active ? '✅' : '❌';
        const maxStr = quest.maxCompletions ? `/${quest.maxCompletions}` : '';
        response += `${statusEmoji} **${quest.name}**\n`;
        response += `   ID: \`${quest.id.slice(0, 8)}...\`\n`;
        response += `   Active: ${quest.active}\n`;
        response += `   Completions: ${quest.totalCompletions}${maxStr}\n\n`;
      }
    }

    await interaction.editReply({
      content: response,
    });
  } catch (error) {
    logger.error('Error in /questdebug command', {
      userId: interaction.user.id,
      guildId,
      error,
    });

    await interaction.editReply({
      content: 'An error occurred while checking quest status. Please check the logs.',
    });
  }
}
