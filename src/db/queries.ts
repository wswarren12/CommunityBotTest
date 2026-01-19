/**
 * Database query functions for all tables
 */

import { query, transaction } from './connection';
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
  const values: (string | string[] | Date | boolean | number)[] = [params.guildId];
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
  const values: (string | string[] | Date | number)[] = [params.guildId];
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

// ==================== Quests ====================

import {
  Quest,
  UserQuest,
  UserQuestWithDetails,
  UserXp,
  QuestConversation,
  CreateQuestParams,
} from '../types/database';

export async function createQuest(params: CreateQuestParams): Promise<Quest> {
  const result = await query<Quest>(
    `INSERT INTO quests (
      guild_id, name, description, xp_reward, verification_type,
      api_endpoint, api_method, api_headers, api_params,
      success_condition, user_input_description,
      connector_id, connector_name, api_key_env_var, user_input_placeholder,
      active, max_completions, created_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    RETURNING *`,
    [
      params.guildId,
      params.name,
      params.description,
      params.xpReward,
      params.verificationType,
      params.apiEndpoint || null,
      params.apiMethod || 'GET',
      JSON.stringify(params.apiHeaders || {}),
      JSON.stringify(params.apiParams || {}),
      JSON.stringify(params.successCondition || { field: 'balance', operator: '>', value: 0 }),
      params.userInputDescription,
      params.connectorId || null,
      params.connectorName || null,
      params.apiKeyEnvVar || null,
      params.userInputPlaceholder || null,
      params.active ?? true,
      params.maxCompletions,
      params.createdBy,
    ]
  );
  return result.rows[0];
}

export async function getQuest(questId: string): Promise<Quest | null> {
  const result = await query<Quest>(`SELECT * FROM quests WHERE id = $1`, [questId]);
  return result.rows[0] || null;
}

export async function getActiveQuests(guildId: string): Promise<Quest[]> {
  const result = await query<Quest>(
    `SELECT * FROM quests
     WHERE guild_id = $1 AND active = TRUE
     AND (max_completions IS NULL OR total_completions < max_completions)
     ORDER BY created_at DESC`,
    [guildId]
  );
  return result.rows;
}

export async function getGuildQuests(guildId: string, includeInactive: boolean = false): Promise<Quest[]> {
  const activeFilter = includeInactive ? '' : 'AND active = TRUE';
  const result = await query<Quest>(
    `SELECT * FROM quests WHERE guild_id = $1 ${activeFilter} ORDER BY created_at DESC`,
    [guildId]
  );
  return result.rows;
}

export async function updateQuestStatus(questId: string, active: boolean): Promise<void> {
  await query(`UPDATE quests SET active = $1, updated_at = NOW() WHERE id = $2`, [active, questId]);
}

export async function incrementQuestCompletions(questId: string): Promise<void> {
  await query(
    `UPDATE quests SET total_completions = total_completions + 1, updated_at = NOW() WHERE id = $1`,
    [questId]
  );
}

export async function deleteQuest(questId: string): Promise<void> {
  await query(`DELETE FROM quests WHERE id = $1`, [questId]);
}

// ==================== User Quests ====================

export async function assignQuestToUser(
  userId: string,
  guildId: string,
  questId: string
): Promise<UserQuest> {
  const result = await query<UserQuest>(
    `INSERT INTO user_quests (user_id, guild_id, quest_id, status)
     VALUES ($1, $2, $3, 'assigned')
     RETURNING *`,
    [userId, guildId, questId]
  );
  return result.rows[0];
}

export async function getUserActiveQuest(userId: string, guildId: string): Promise<UserQuestWithDetails | null> {
  const result = await query<UserQuestWithDetails>(
    `SELECT uq.*, q.name as quest_name, q.description as quest_description,
            q.xp_reward, q.verification_type, q.api_endpoint, q.api_method,
            q.api_headers, q.api_params, q.success_condition, q.user_input_description,
            q.connector_id, q.connector_name, q.api_key_env_var, q.user_input_placeholder
     FROM user_quests uq
     JOIN quests q ON uq.quest_id = q.id
     WHERE uq.user_id = $1 AND uq.guild_id = $2 AND uq.status = 'assigned'
     ORDER BY uq.assigned_at DESC
     LIMIT 1`,
    [userId, guildId]
  );
  return result.rows[0] || null;
}

export async function getUserCompletedQuests(
  userId: string,
  guildId: string,
  limit: number = 50
): Promise<UserQuestWithDetails[]> {
  const result = await query<UserQuestWithDetails>(
    `SELECT uq.*, q.name as quest_name, q.description as quest_description, q.xp_reward
     FROM user_quests uq
     JOIN quests q ON uq.quest_id = q.id
     WHERE uq.user_id = $1 AND uq.guild_id = $2 AND uq.status = 'completed'
     ORDER BY uq.completed_at DESC
     LIMIT $3`,
    [userId, guildId, limit]
  );
  return result.rows;
}

export async function getUserCompletedQuestIds(userId: string, guildId: string): Promise<string[]> {
  const result = await query<{ quest_id: string }>(
    `SELECT DISTINCT quest_id FROM user_quests
     WHERE user_id = $1 AND guild_id = $2 AND status = 'completed'`,
    [userId, guildId]
  );
  return result.rows.map(r => r.quest_id);
}

export async function completeUserQuest(
  userQuestId: string,
  xpAwarded: number,
  verificationIdentifier?: string
): Promise<UserQuest> {
  const result = await query<UserQuest>(
    `UPDATE user_quests
     SET status = 'completed', completed_at = NOW(), xp_awarded = $1, verification_identifier = $2
     WHERE id = $3
     RETURNING *`,
    [xpAwarded, verificationIdentifier, userQuestId]
  );
  return result.rows[0];
}

export async function failUserQuest(userQuestId: string, reason: string): Promise<UserQuest> {
  const result = await query<UserQuest>(
    `UPDATE user_quests
     SET status = 'failed', failure_reason = $1
     WHERE id = $2
     RETURNING *`,
    [reason, userQuestId]
  );
  return result.rows[0];
}

export async function incrementVerificationAttempts(userQuestId: string): Promise<number> {
  const result = await query<{ verification_attempts: number }>(
    `UPDATE user_quests
     SET verification_attempts = verification_attempts + 1
     WHERE id = $1
     RETURNING verification_attempts`,
    [userQuestId]
  );
  return result.rows[0]?.verification_attempts || 0;
}

// ==================== User XP ====================

export async function getUserXp(userId: string, guildId: string): Promise<UserXp | null> {
  const result = await query<UserXp>(
    `SELECT * FROM user_xp WHERE user_id = $1 AND guild_id = $2`,
    [userId, guildId]
  );
  return result.rows[0] || null;
}

export async function addUserXp(
  userId: string,
  guildId: string,
  xpAmount: number
): Promise<UserXp> {
  const result = await query<UserXp>(
    `INSERT INTO user_xp (user_id, guild_id, total_xp, quests_completed, last_quest_at)
     VALUES ($1, $2, $3, 1, NOW())
     ON CONFLICT (user_id, guild_id)
     DO UPDATE SET
       total_xp = user_xp.total_xp + $3,
       quests_completed = user_xp.quests_completed + 1,
       last_quest_at = NOW(),
       updated_at = NOW()
     RETURNING *`,
    [userId, guildId, xpAmount]
  );
  return result.rows[0];
}

export async function getGuildLeaderboard(guildId: string, limit: number = 10): Promise<UserXp[]> {
  const result = await query<UserXp>(
    `SELECT * FROM user_xp
     WHERE guild_id = $1 AND total_xp > 0
     ORDER BY total_xp DESC
     LIMIT $2`,
    [guildId, limit]
  );
  return result.rows;
}

// ==================== Quest Conversations ====================

export async function getQuestConversation(
  userId: string,
  guildId: string
): Promise<QuestConversation | null> {
  const result = await query<QuestConversation>(
    `SELECT * FROM quest_conversations
     WHERE user_id = $1 AND guild_id = $2 AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, guildId]
  );
  return result.rows[0] || null;
}

export async function upsertQuestConversation(
  userId: string,
  guildId: string,
  channelId: string | null,
  conversationState: Record<string, unknown>,
  messages: Array<{ role: string; content: string }>
): Promise<QuestConversation> {
  const result = await query<QuestConversation>(
    `INSERT INTO quest_conversations (user_id, guild_id, channel_id, conversation_state, messages, expires_at)
     VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '1 hour')
     ON CONFLICT (user_id, guild_id)
     DO UPDATE SET
       channel_id = EXCLUDED.channel_id,
       conversation_state = EXCLUDED.conversation_state,
       messages = EXCLUDED.messages,
       expires_at = NOW() + INTERVAL '1 hour',
       updated_at = NOW()
     RETURNING *`,
    [userId, guildId, channelId, JSON.stringify(conversationState), JSON.stringify(messages)]
  );
  return result.rows[0];
}

export async function deleteQuestConversation(userId: string, guildId: string): Promise<void> {
  await query(`DELETE FROM quest_conversations WHERE user_id = $1 AND guild_id = $2`, [
    userId,
    guildId,
  ]);
}

export async function cleanupExpiredConversations(): Promise<number> {
  const result = await query(`DELETE FROM quest_conversations WHERE expires_at < NOW()`);
  return result.rowCount || 0;
}

// ==================== Transactional Operations ====================

/**
 * Complete a quest with all related updates in a single transaction
 * Ensures consistency between user_quests, quests, and user_xp tables
 */
export async function completeQuestTransaction(
  userQuestId: string,
  questId: string,
  userId: string,
  guildId: string,
  xpReward: number,
  verificationIdentifier?: string
): Promise<UserXp> {
  return transaction(async (client) => {
    // 1. Mark user quest as completed
    await client.query(
      `UPDATE user_quests
       SET status = 'completed', completed_at = NOW(), xp_awarded = $1, verification_identifier = $2
       WHERE id = $3`,
      [xpReward, verificationIdentifier, userQuestId]
    );

    // 2. Increment quest total completions
    await client.query(
      `UPDATE quests SET total_completions = total_completions + 1, updated_at = NOW() WHERE id = $1`,
      [questId]
    );

    // 3. Add XP to user and return updated XP
    const xpResult = await client.query<UserXp>(
      `INSERT INTO user_xp (user_id, guild_id, total_xp, quests_completed, last_quest_at)
       VALUES ($1, $2, $3, 1, NOW())
       ON CONFLICT (user_id, guild_id)
       DO UPDATE SET
         total_xp = user_xp.total_xp + $3,
         quests_completed = user_xp.quests_completed + 1,
         last_quest_at = NOW(),
         updated_at = NOW()
       RETURNING *`,
      [userId, guildId, xpReward]
    );

    return xpResult.rows[0];
  });
}
