import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { generateCatchupSummary } from '../services/summaryService';
import { logger } from '../utils/logger';
import { DetailLevel } from '../types/database';

// Store summary data temporarily for expansion (in production, use Redis or similar)
const summaryCache = new Map<
  string,
  {
    userId: string;
    guildId: string;
    summaryId?: number;
    timeRangeStart: Date;
    timeRangeEnd: Date;
    messageCount: number;
    mentionCount: number;
  }
>();

/**
 * Handle the /catchup slash command
 */
export async function handleCatchupCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  try {
    // Defer reply since summary generation may take time
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const timeframe = interaction.options.getString('timeframe') || undefined;
    const guildMember = interaction.member;

    if (!guildMember || typeof guildMember === 'string') {
      await interaction.editReply({
        content: 'Could not find your server membership. Please try again.',
      });
      return;
    }

    logger.info('Processing /catchup command', {
      userId: interaction.user.id,
      guildId: interaction.guildId,
      timeframe,
    });

    // Generate summary
    const result = await generateCatchupSummary({
      guildMember: guildMember as any,
      detailLevel: 'brief',
      customTimeframe: timeframe,
    });

    // Store in cache for expansion
    const cacheKey = `${interaction.user.id}-${interaction.guildId}-${Date.now()}`;
    summaryCache.set(cacheKey, {
      userId: interaction.user.id,
      guildId: interaction.guildId!,
      summaryId: result.summaryId,
      timeRangeStart: result.timeRangeStart,
      timeRangeEnd: result.timeRangeEnd,
      messageCount: result.messageCount,
      mentionCount: result.mentionCount,
    });

    // Create embed
    const embed = createSummaryEmbed(result, 'brief');

    // Create action buttons for expanding detail
    const buttons = createDetailButtons(cacheKey, 'brief', result.messageCount);

    await interaction.editReply({
      embeds: [embed],
      components: buttons,
    });

    logger.info('/catchup command completed', {
      userId: interaction.user.id,
      guildId: interaction.guildId,
      messageCount: result.messageCount,
    });
  } catch (error) {
    logger.error('Error handling /catchup command', {
      userId: interaction.user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    const errorMessage =
      error instanceof Error ? error.message : 'An unexpected error occurred.';

    try {
      await interaction.editReply({
        content: `❌ ${errorMessage}`,
      });
    } catch (replyError) {
      logger.error('Failed to send error message', {
        error: replyError instanceof Error ? replyError.message : 'Unknown error',
      });
    }
  }
}

/**
 * Handle expand detail button clicks
 */
export async function handleExpandButton(interaction: ButtonInteraction): Promise<void> {
  try {
    await interaction.deferUpdate();

    const customId = interaction.customId;
    const [, cacheKey, targetLevel] = customId.split('_');

    const cached = summaryCache.get(cacheKey);

    if (!cached) {
      await interaction.followUp({
        content: 'This summary has expired. Please run `/catchup` again.',
        ephemeral: true,
      });
      return;
    }

    if (cached.userId !== interaction.user.id) {
      await interaction.followUp({
        content: 'This is not your summary.',
        ephemeral: true,
      });
      return;
    }

    const guildMember = interaction.guild?.members.cache.get(interaction.user.id);

    if (!guildMember) {
      await interaction.followUp({
        content: 'Could not find your server membership.',
        ephemeral: true,
      });
      return;
    }

    logger.info('Expanding summary detail', {
      userId: interaction.user.id,
      guildId: interaction.guildId,
      targetLevel,
    });

    // Generate new summary with expanded detail
    const result = await generateCatchupSummary({
      guildMember,
      detailLevel: targetLevel as DetailLevel,
    });

    // Create new embed
    const embed = createSummaryEmbed(result, targetLevel as DetailLevel);

    // Update buttons
    const buttons = createDetailButtons(cacheKey, targetLevel as DetailLevel, result.messageCount);

    await interaction.editReply({
      embeds: [embed],
      components: buttons,
    });

    logger.info('Summary detail expanded', {
      userId: interaction.user.id,
      targetLevel,
    });
  } catch (error) {
    logger.error('Error handling expand button', {
      userId: interaction.user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    try {
      await interaction.followUp({
        content: 'Failed to expand summary. Please try again.',
        ephemeral: true,
      });
    } catch (replyError) {
      logger.error('Failed to send error message', {
        error: replyError instanceof Error ? replyError.message : 'Unknown error',
      });
    }
  }
}

/**
 * Create an embed for the summary
 */
function createSummaryEmbed(
  result: {
    summary: string;
    messageCount: number;
    mentionCount: number;
    timeRangeStart: Date;
    timeRangeEnd: Date;
  },
  detailLevel: string
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('📋 Catchup Summary')
    .setDescription(result.summary)
    .setFooter({
      text: `${result.messageCount} messages • ${result.mentionCount} mentions • ${detailLevel} view`,
    })
    .setTimestamp();

  return embed;
}

/**
 * Create action row with detail level buttons
 */
function createDetailButtons(
  cacheKey: string,
  currentLevel: string,
  messageCount: number
): ActionRowBuilder<ButtonBuilder>[] {
  // Don't show buttons if there are very few messages
  if (messageCount < 5) {
    return [];
  }

  const briefButton = new ButtonBuilder()
    .setCustomId(`expand_${cacheKey}_brief`)
    .setLabel('Brief')
    .setStyle(currentLevel === 'brief' ? ButtonStyle.Primary : ButtonStyle.Secondary)
    .setDisabled(currentLevel === 'brief');

  const detailedButton = new ButtonBuilder()
    .setCustomId(`expand_${cacheKey}_detailed`)
    .setLabel('Detailed')
    .setStyle(currentLevel === 'detailed' ? ButtonStyle.Primary : ButtonStyle.Secondary)
    .setDisabled(currentLevel === 'detailed');

  const fullButton = new ButtonBuilder()
    .setCustomId(`expand_${cacheKey}_full`)
    .setLabel('Full')
    .setStyle(currentLevel === 'full' ? ButtonStyle.Primary : ButtonStyle.Secondary)
    .setDisabled(currentLevel === 'full');

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    briefButton,
    detailedButton,
    fullButton
  );

  return [row];
}

// Clean up old cache entries every 30 minutes
setInterval(() => {
  const now = Date.now();
  const thirtyMinutes = 30 * 60 * 1000;

  for (const [key, _value] of summaryCache.entries()) {
    // Extract timestamp from cache key
    const timestamp = parseInt(key.split('-').pop() || '0', 10);
    if (now - timestamp > thirtyMinutes) {
      summaryCache.delete(key);
    }
  }

  logger.debug('Summary cache cleaned', { remainingEntries: summaryCache.size });
}, 30 * 60 * 1000);
