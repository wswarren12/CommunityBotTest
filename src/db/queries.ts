/**
 * Database query functions for all tables
 */

import { query } from './connection';
import {
  User,
  Channel,
  Message,
  UserActivity,
  Event,
  Summary,
  MessageWithUser,
  GetMessagesParams,
  GetEventsParams,
  UpsertUserActivityParams,
  EventType,
  DetailLevel,
} from '../types/database';

// ==================== Users ====================

export async function upsertUser(
  userId: string,
  username: string,
  guildId: string,
  joinedAt: Date,
  discriminator?: string,
  globalName?: string
): Promise<User> {
  const result = await query<User>(
    `INSERT INTO users (user_id, username, discriminator, global_name, guild_id, joined_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id)
     DO UPDATE SET
       username = EXCLUDED.username,
       discriminator = EXCLUDED.discriminator,
       global_name = EXCLUDED.global_name,
       updated_at = NOW()
     RETURNING *`,
    [userId, username, discriminator, globalName, guildId, joinedAt]
  );
  return result.rows[0];
}

export async function updateUserLastMessage(userId: string, timestamp: Date): Promise<void> {
  await query(
    `UPDATE users SET last_message_at = $1, updated_at = NOW() WHERE user_id = $2`,
    [timestamp, userId]
  );
}

export async function getUser(userId: string): Promise<User | null> {
  const result = await query<User>(`SELECT * FROM users WHERE user_id = $1`, [userId]);
  return result.rows[0] || null;
}

// ==================== Channels ====================

export async function upsertChannel(
  channelId: string,
  guildId: string,
  channelName: string,
  channelType: string,
  parentId?: string,
  isThread: boolean = false
): Promise<Channel> {
  const result = await query<Channel>(
    `INSERT INTO channels (channel_id, guild_id, channel_name, channel_type, parent_id, is_thread)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (channel_id)
     DO UPDATE SET
       channel_name = EXCLUDED.channel_name,
       channel_type = EXCLUDED.channel_type,
       parent_id = EXCLUDED.parent_id,
       is_thread = EXCLUDED.is_thread,
       updated_at = NOW()
     RETURNING *`,
    [channelId, guildId, channelName, channelType, parentId, isThread]
  );
  return result.rows[0];
}

export async function getChannel(channelId: string): Promise<Channel | null> {
  const result = await query<Channel>(`SELECT * FROM channels WHERE channel_id = $1`, [channelId]);
  return result.rows[0] || null;
}

export async function getGuildChannels(guildId: string): Promise<Channel[]> {
  const result = await query<Channel>(
    `SELECT * FROM channels WHERE guild_id = $1 AND is_active = TRUE ORDER BY channel_name`,
    [guildId]
  );
  return result.rows;
}

// ==================== Messages ====================

export async function insertMessage(
  messageId: string,
  channelId: string,
  userId: string,
  guildId: string,
  content: string,
  postedAt: Date,
  mentionUsers?: string[],
  mentionRoles?: string[],
  attachmentCount: number = 0,
  replyToMessageId?: string,
  threadId?: string
): Promise<Message> {
  const hasMentions = (mentionUsers && mentionUsers.length > 0) || (mentionRoles && mentionRoles.length > 0);
  const hasAttachments = attachmentCount > 0;

  const result = await query<Message>(
    `INSERT INTO messages (
      message_id, channel_id, user_id, guild_id, content, posted_at,
      has_mentions, mention_users, mention_roles,
      has_attachments, attachment_count,
      reply_to_message_id, thread_id
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *`,
    [
      messageId,
      channelId,
      userId,
      guildId,
      content,
      postedAt,
      hasMentions,
      mentionUsers || [],
      mentionRoles || [],
      hasAttachments,
      attachmentCount,
      replyToMessageId,
      threadId,
    ]
  );
  return result.rows[0];
}

export async function getMessages(params: GetMessagesParams): Promise<MessageWithUser[]> {
  const conditions: string[] = ['m.guild_id = $1'];
  const values: any[] = [params.guildId];
  let paramIndex = 2;

  if (params.channelIds && params.channelIds.length > 0) {
    conditions.push(`m.channel_id = ANY($${paramIndex})`);
    values.push(params.channelIds);
    paramIndex++;
  }

  if (params.userId) {
    conditions.push(`m.user_id = $${paramIndex}`);
    values.push(params.userId);
    paramIndex++;
  }

  if (params.since) {
    conditions.push(`m.posted_at >= $${paramIndex}`);
    values.push(params.since);
    paramIndex++;
  }

  if (params.until) {
    conditions.push(`m.posted_at <= $${paramIndex}`);
    values.push(params.until);
    paramIndex++;
  }

  if (params.hasMentions !== undefined) {
    conditions.push(`m.has_mentions = $${paramIndex}`);
    values.push(params.hasMentions);
    paramIndex++;
  }

  if (params.mentionUserId) {
    conditions.push(`$${paramIndex} = ANY(m.mention_users)`);
    values.push(params.mentionUserId);
    paramIndex++;
  }

  const limit = params.limit || 100;
  const offset = params.offset || 0;

  const sql = `
    SELECT
      m.*,
      u.username as author_name,
      u.global_name as author_global_name,
      c.channel_name
    FROM messages m
    JOIN users u ON m.user_id = u.user_id
    JOIN channels c ON m.channel_id = c.channel_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY m.posted_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  values.push(limit, offset);

  const result = await query<MessageWithUser>(sql, values);
  return result.rows;
}

export async function deleteMessage(messageId: string): Promise<void> {
  await query(`DELETE FROM messages WHERE message_id = $1`, [messageId]);
}

// ==================== User Activity ====================

export async function upsertUserActivity(params: UpsertUserActivityParams): Promise<UserActivity> {
  const result = await query<UserActivity>(
    `INSERT INTO user_activity (user_id, guild_id, channel_id, last_activity_at, message_count)
     VALUES ($1, $2, $3, $4, 1)
     ON CONFLICT (user_id, guild_id, channel_id)
     DO UPDATE SET
       last_activity_at = EXCLUDED.last_activity_at,
       message_count = user_activity.message_count + 1,
       updated_at = NOW()
     RETURNING *`,
    [params.userId, params.guildId, params.channelId, params.timestamp]
  );
  return result.rows[0];
}

export async function getUserLastActivity(userId: string, guildId: string): Promise<Date | null> {
  const result = await query<{ last_activity_at: Date }>(
    `SELECT MAX(last_activity_at) as last_activity_at
     FROM user_activity
     WHERE user_id = $1 AND guild_id = $2`,
    [userId, guildId]
  );
  return result.rows[0]?.last_activity_at || null;
}

// ==================== Events ====================

export async function insertEvent(
  guildId: string,
  title: string,
  eventType: EventType,
  scheduledStart: Date,
  sourceType: 'discord' | 'detected',
  eventId?: string,
  description?: string,
  scheduledEnd?: Date,
  location?: string,
  channelId?: string,
  organizerUserId?: string,
  sourceMessageId?: string,
  confidenceScore?: number,
  isRecurring: boolean = false,
  recurrenceRule?: string,
  participantRoles?: string[]
): Promise<Event> {
  const result = await query<Event>(
    `INSERT INTO events (
      event_id, guild_id, title, description, event_type,
      scheduled_start, scheduled_end, location, channel_id,
      organizer_user_id, source_type, source_message_id,
      confidence_score, is_recurring, recurrence_rule, participant_roles
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    RETURNING *`,
    [
      eventId,
      guildId,
      title,
      description,
      eventType,
      scheduledStart,
      scheduledEnd,
      location,
      channelId,
      organizerUserId,
      sourceType,
      sourceMessageId,
      confidenceScore,
      isRecurring,
      recurrenceRule,
      participantRoles || [],
    ]
  );
  return result.rows[0];
}

export async function getEvents(params: GetEventsParams): Promise<Event[]> {
  const conditions: string[] = ['guild_id = $1'];
  const values: any[] = [params.guildId];
  let paramIndex = 2;

  if (params.channelId) {
    conditions.push(`channel_id = $${paramIndex}`);
    values.push(params.channelId);
    paramIndex++;
  }

  if (params.startAfter) {
    conditions.push(`scheduled_start >= $${paramIndex}`);
    values.push(params.startAfter);
    paramIndex++;
  }

  if (params.startBefore) {
    conditions.push(`scheduled_start <= $${paramIndex}`);
    values.push(params.startBefore);
    paramIndex++;
  }

  if (params.eventTypes && params.eventTypes.length > 0) {
    conditions.push(`event_type = ANY($${paramIndex})`);
    values.push(params.eventTypes);
    paramIndex++;
  }

  if (!params.includeCancel) {
    conditions.push('is_cancelled = FALSE');
  }

  if (params.minConfidence) {
    conditions.push(`(confidence_score IS NULL OR confidence_score >= $${paramIndex})`);
    values.push(params.minConfidence);
    paramIndex++;
  }

  const sql = `
    SELECT * FROM events
    WHERE ${conditions.join(' AND ')}
    ORDER BY scheduled_start ASC
  `;

  const result = await query<Event>(sql, values);
  return result.rows;
}

export async function cancelEvent(eventId: string): Promise<void> {
  await query(`UPDATE events SET is_cancelled = TRUE, updated_at = NOW() WHERE event_id = $1`, [
    eventId,
  ]);
}

// ==================== Summaries ====================

export async function insertSummary(
  userId: string,
  guildId: string,
  summaryContent: string,
  detailLevel: DetailLevel,
  messageCount: number,
  timeRangeStart: Date,
  timeRangeEnd: Date
): Promise<Summary> {
  const result = await query<Summary>(
    `INSERT INTO summaries (
      user_id, guild_id, summary_content, detail_level,
      message_count, time_range_start, time_range_end
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *`,
    [userId, guildId, summaryContent, detailLevel, messageCount, timeRangeStart, timeRangeEnd]
  );
  return result.rows[0];
}

export async function updateSummaryRating(summaryId: number, rating: number): Promise<void> {
  await query(`UPDATE summaries SET satisfaction_rating = $1 WHERE id = $2`, [rating, summaryId]);
}

export async function getUserSummaries(userId: string, limit: number = 10): Promise<Summary[]> {
  const result = await query<Summary>(
    `SELECT * FROM summaries
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
}
