/**
 * /confirm command - Verify quest/task completion
 * Supports:
 * - Task-based quests with multiple tasks
 * - External API quests (requiring identifier)
 * - Discord-native quests (no identifier needed)
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from 'discord.js';
import { logger } from '../utils/logger';
import * as questService from '../services/questService';
import * as db from '../db/queries';
import { isDiscordNativeVerification } from '../types/database';

export const data = new SlashCommandBuilder()
  .setName('confirm')
  .setDescription('Confirm your quest/task completion')
  .setDMPermission(false)
  .addStringOption(option =>
    option
      .setName('identifier')
      .setDescription('Your email, wallet address, Twitter handle, etc. (not needed for Discord activity tasks)')
      .setRequired(false)
      .setMaxLength(200)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const guildId = interaction.guildId;
  const identifierInput = interaction.options.getString('identifier')?.trim();

  if (!guildId) {
    await interaction.reply({
      content: 'This command can only be used in a server.',
      ephemeral: true,
    });
    return;
  }

  // Check if user has an active quest
  const activeQuest = await db.getUserActiveQuest(userId, guildId);

  if (!activeQuest) {
    await interaction.reply({
      content: "You don't have an active quest. Run `/quest` to get one!",
      ephemeral: true,
    });
    return;
  }

  // Check if this quest has tasks
  const tasks = await db.getQuestTasks(activeQuest.quest_id);
  let isDiscordNative: boolean;

  if (tasks.length > 0) {
    // Get user's task completions to find the next incomplete task
    const completions = await db.getUserQuestTaskCompletions(userId, activeQuest.quest_id);
    const completedTaskIds = new Set(completions.map(c => c.task_id));

    // Find the first incomplete task
    const nextTask = tasks.find(t => !completedTaskIds.has(t.id));

    if (!nextTask) {
      await interaction.reply({
        content: 'You have already completed all tasks for this quest!',
        ephemeral: true,
      });
      return;
    }

    // Check if the NEXT TASK requires Discord-native verification
    isDiscordNative = nextTask.verification_type ?
      isDiscordNativeVerification(nextTask.verification_type) : false;
  } else {
    // Legacy quest without tasks - check the quest's verification type
    isDiscordNative = activeQuest.verification_type ?
      isDiscordNativeVerification(activeQuest.verification_type) : false;
  }

  // For Discord-native verification, use 'discord' as placeholder; otherwise require identifier
  let identifier: string;
  if (isDiscordNative) {
    identifier = identifierInput || 'discord';
  } else {
    if (!identifierInput || identifierInput.length < 3) {
      await interaction.reply({
        content: 'Please provide a valid identifier (minimum 3 characters). Example: `/confirm identifier:your_email@example.com`',
        ephemeral: true,
      });
      return;
    }
    identifier = identifierInput;
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
