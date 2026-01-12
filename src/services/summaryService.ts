import { GuildMember } from 'discord.js';
import { generateSummary, SummaryRequest } from './aiService';
import { getUserLastActivity, getMessages, insertSummary } from '../db/queries';
import { getUserAccessibleChannels } from './messageService';
import { logger } from '../utils/logger';
import { DetailLevel, MessageWithUser } from '../types/database';

export interface GenerateSummaryOptions {
  guildMember: GuildMember;
  detailLevel?: DetailLevel;
  customTimeframe?: string; // e.g., "1h", "6h", "1d"
}

export interface SummaryResult {
  summary: string;
  messageCount: number;
  mentionCount: number;
  timeRangeStart: Date;
  timeRangeEnd: Date;
  summaryId?: number;
}

/**
 * Generate a catchup summary for a user
 */
export async function generateCatchupSummary(
  options: GenerateSummaryOptions
): Promise<SummaryResult> {
  const { guildMember, detailLevel = 'brief', customTimeframe } = options;

  const userId = guildMember.id;
  const guildId = guildMember.guild.id;
  const guildName = guildMember.guild.name;
  const username = guildMember.user.username;

  try {
    // Determine time range
    const timeRangeEnd = new Date();
    let timeRangeStart: Date;

    if (customTimeframe) {
      timeRangeStart = parseTimeframe(customTimeframe);
    } else {
      // Use last activity time, or default to 24 hours
      const lastActivity = await getUserLastActivity(userId, guildId);
      timeRangeStart = lastActivity || new Date(Date.now() - 24 * 60 * 60 * 1000);
    }

    logger.info('Generating catchup summary', {
      userId,
      guildId,
      timeRangeStart,
      timeRangeEnd,
      detailLevel,
    });

    // Get user's accessible channels
    const accessibleChannels = await getUserAccessibleChannels(guildMember);

    if (accessibleChannels.length === 0) {
      logger.warn('User has no accessible channels', { userId, guildId });
      return {
        summary: "You don't have access to any channels in this server.",
        messageCount: 0,
        mentionCount: 0,
        timeRangeStart,
        timeRangeEnd,
      };
    }

    // Fetch messages
    const messages = await getMessages({
      guildId,
      channelIds: accessibleChannels,
      since: timeRangeStart,
      until: timeRangeEnd,
      limit: 500, // Limit to avoid overwhelming Claude
    });

    if (messages.length === 0) {
      logger.info('No messages found for summary', { userId, guildId });
      return {
        summary: `All caught up! No new activity since ${formatTimeAgo(timeRangeStart)}.`,
        messageCount: 0,
        mentionCount: 0,
        timeRangeStart,
        timeRangeEnd,
      };
    }

    // Count mentions
    const mentionCount = messages.filter((m) =>
      m.mention_users?.includes(userId)
    ).length;

    // Get user roles
    const userRoles = guildMember.roles.cache.map((r) => r.name);

    // Build AI request
    const summaryRequest: SummaryRequest = {
      userId,
      username,
      guildId,
      guildName,
      sinceTimestamp: timeRangeStart,
      messages,
      userRoles,
      mentionCount,
    };

    // Generate summary with AI
    const aiResponse = await generateSummary(summaryRequest, detailLevel);

    // Store summary in database
    const summaryRecord = await insertSummary(
      userId,
      guildId,
      aiResponse.summary,
      detailLevel,
      messages.length,
      timeRangeStart,
      timeRangeEnd
    );

    logger.info('Catchup summary generated successfully', {
      userId,
      guildId,
      messageCount: messages.length,
      mentionCount,
      summaryId: summaryRecord.id,
    });

    return {
      summary: aiResponse.summary,
      messageCount: messages.length,
      mentionCount,
      timeRangeStart,
      timeRangeEnd,
      summaryId: summaryRecord.id,
    };
  } catch (error) {
    logger.error('Failed to generate catchup summary', {
      userId,
      guildId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new Error('Failed to generate summary. Please try again later.');
  }
}

/**
 * Get recommended conversations for a user
 */
export async function getConversationRecommendations(
  guildMember: GuildMember,
  limit: number = 5
): Promise<Array<{ channelId: string; channelName: string; topic: string; messageCount: number }>> {
  const userId = guildMember.id;
  const guildId = guildMember.guild.id;

  try {
    // Get accessible channels
    const accessibleChannels = await getUserAccessibleChannels(guildMember);

    // Get recent messages
    const messages = await getMessages({
      guildId,
      channelIds: accessibleChannels,
      since: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
      limit: 200,
    });

    // Group by channel and count
    const channelActivity = new Map<string, { name: string; count: number; latestMessage: MessageWithUser }>();

    for (const message of messages) {
      const existing = channelActivity.get(message.channel_id);
      if (!existing || message.posted_at > existing.latestMessage.posted_at) {
        channelActivity.set(message.channel_id, {
          name: message.channel_name,
          count: (existing?.count || 0) + 1,
          latestMessage: message,
        });
      }
    }

    // Sort by activity and take top N
    const sorted = Array.from(channelActivity.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, limit);

    return sorted.map(([channelId, data]) => ({
      channelId,
      channelName: data.name,
      topic: extractTopic(data.latestMessage.content),
      messageCount: data.count,
    }));
  } catch (error) {
    logger.error('Failed to get conversation recommendations', {
      userId,
      guildId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return [];
  }
}

/**
 * Parse a timeframe string like "1h", "6h", "1d" into a Date
 */
function parseTimeframe(timeframe: string): Date {
  const match = timeframe.match(/^(\d+)([hdwm])$/);
  if (!match) {
    throw new Error('Invalid timeframe format. Use format like "1h", "6h", "1d", "1w"');
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const now = Date.now();
  let milliseconds = 0;

  switch (unit) {
    case 'h':
      milliseconds = value * 60 * 60 * 1000;
      break;
    case 'd':
      milliseconds = value * 24 * 60 * 60 * 1000;
      break;
    case 'w':
      milliseconds = value * 7 * 24 * 60 * 60 * 1000;
      break;
    case 'm':
      milliseconds = value * 30 * 24 * 60 * 60 * 1000;
      break;
    default:
      throw new Error('Invalid timeframe unit');
  }

  return new Date(now - milliseconds);
}

/**
 * Format a date as "X hours ago", "X days ago", etc.
 */
function formatTimeAgo(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();

  const minutes = Math.floor(diff / (60 * 1000));
  const hours = Math.floor(diff / (60 * 60 * 1000));
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));

  if (minutes < 60) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  } else if (hours < 24) {
    return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  } else {
    return `${days} day${days !== 1 ? 's' : ''} ago`;
  }
}

/**
 * Extract a brief topic from message content
 */
function extractTopic(content: string): string {
  // Take first sentence or first 100 chars
  const firstSentence = content.split(/[.!?]/)[0];
  return firstSentence.length > 100
    ? firstSentence.substring(0, 97) + '...'
    : firstSentence;
}
