import { Message, GuildMember, ChannelType } from 'discord.js';
import {
  upsertUser,
  upsertChannel,
  insertMessage,
  upsertUserActivity,
  updateUserLastMessage,
} from '../db/queries';
import { logger } from '../utils/logger';

/**
 * Ingest a Discord message into the database
 */
export async function ingestMessage(message: Message): Promise<void> {
  if (!message.guild) {
    throw new Error('Message must be from a guild');
  }

  const guildId = message.guild.id;
  const channelId = message.channel.id;
  const userId = message.author.id;
  const messageId = message.id;

  try {
    // Upsert user
    await upsertUser(
      userId,
      message.author.username,
      guildId,
      message.author.createdAt,
      message.author.discriminator || undefined,
      message.author.globalName || undefined
    );

    // Upsert channel
    const channelType = message.channel.type === ChannelType.GuildText ? 'text' : 'other';
    const isThread = message.channel.isThread();
    const parentId = 'parentId' in message.channel ? message.channel.parentId : undefined;

    await upsertChannel(
      channelId,
      guildId,
      'name' in message.channel ? (message.channel.name || 'unknown') : 'unknown',
      channelType,
      parentId || undefined,
      isThread
    );

    // Extract mentions
    const mentionUsers = message.mentions.users.map((u) => u.id);
    const mentionRoles = message.mentions.roles.map((r) => r.id);

    // Get thread ID if message is in a thread
    const threadId = isThread ? channelId : undefined;

    // Insert message
    await insertMessage(
      messageId,
      channelId,
      userId,
      guildId,
      message.content,
      message.createdAt,
      mentionUsers,
      mentionRoles,
      message.attachments.size,
      message.reference?.messageId,
      threadId
    );

    // Update user activity
    await upsertUserActivity({
      userId,
      guildId,
      channelId,
      timestamp: message.createdAt,
    });

    // Update user's last message timestamp
    await updateUserLastMessage(userId, message.createdAt);

    logger.debug('Message ingested successfully', {
      messageId,
      userId,
      channelId,
      guildId,
    });
  } catch (error) {
    logger.error('Failed to ingest message', {
      messageId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

/**
 * Get permission-filtered channels for a user
 * Returns list of channel IDs the user can access
 */
export async function getUserAccessibleChannels(
  guildMember: GuildMember
): Promise<string[]> {
  const guild = guildMember.guild;
  const accessibleChannels: string[] = [];

  for (const [channelId, channel] of guild.channels.cache) {
    if (
      channel.isTextBased() &&
      channel.permissionsFor(guildMember)?.has('ViewChannel')
    ) {
      accessibleChannels.push(channelId);
    }
  }

  return accessibleChannels;
}

/**
 * Check if user can access a specific channel
 */
export async function canUserAccessChannel(
  guildMember: GuildMember,
  channelId: string
): Promise<boolean> {
  const channel = guildMember.guild.channels.cache.get(channelId);

  if (!channel) {
    return false;
  }

  return channel.permissionsFor(guildMember)?.has('ViewChannel') ?? false;
}
