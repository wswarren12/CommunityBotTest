/**
 * TypeScript type definitions for database models
 */

export interface User {
  user_id: string;
  username: string;
  discriminator?: string;
  global_name?: string;
  guild_id: string;
  joined_at: Date;
  last_message_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface Channel {
  channel_id: string;
  guild_id: string;
  channel_name: string;
  channel_type: string;
  parent_id?: string;
  is_thread: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Message {
  message_id: string;
  channel_id: string;
  user_id: string;
  guild_id: string;
  content: string;
  has_mentions: boolean;
  mention_users?: string[];
  mention_roles?: string[];
  has_attachments: boolean;
  attachment_count: number;
  reply_to_message_id?: string;
  thread_id?: string;
  posted_at: Date;
  created_at: Date;
}

export interface UserActivity {
  id: number;
  user_id: string;
  guild_id: string;
  channel_id: string;
  last_activity_at: Date;
  message_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface Event {
  id: number;
  event_id?: string;
  guild_id: string;
  title: string;
  description?: string;
  event_type: EventType;
  scheduled_start: Date;
  scheduled_end?: Date;
  location?: string;
  channel_id?: string;
  organizer_user_id?: string;
  source_type: 'discord' | 'detected';
  source_message_id?: string;
  confidence_score?: number;
  is_cancelled: boolean;
  is_recurring: boolean;
  recurrence_rule?: string;
  participant_roles?: string[];
  created_at: Date;
  updated_at: Date;
}

export type EventType = 'meeting' | 'gaming' | 'stream' | 'social' | 'tournament' | 'other';

export interface Summary {
  id: number;
  user_id: string;
  guild_id: string;
  summary_content: string;
  detail_level: DetailLevel;
  message_count: number;
  time_range_start: Date;
  time_range_end: Date;
  satisfaction_rating?: number;
  created_at: Date;
}

export type DetailLevel = 'brief' | 'detailed' | 'full';

export interface UserStats {
  user_id: string;
  username: string;
  guild_id: string;
  total_messages: number;
  active_channels: number;
  last_message_at?: Date;
  active_days: number;
}

export interface ChannelActivity {
  channel_id: string;
  channel_name: string;
  guild_id: string;
  message_count: number;
  unique_users: number;
  last_activity_at?: Date;
  first_activity_at?: Date;
}

// Extended types with joined data for application use

export interface MessageWithUser extends Message {
  author_name: string;
  author_global_name?: string;
  channel_name: string;
}

export interface EventWithOrganizer extends Event {
  organizer_name?: string;
  channel_name?: string;
}

// Query parameter types

export interface GetMessagesParams {
  guildId: string;
  channelIds?: string[];
  userId?: string;
  since?: Date;
  until?: Date;
  hasMentions?: boolean;
  mentionUserId?: string;
  limit?: number;
  offset?: number;
}

export interface GetEventsParams {
  guildId: string;
  channelId?: string;
  startAfter?: Date;
  startBefore?: Date;
  eventTypes?: EventType[];
  includeCancel?: boolean;
  minConfidence?: number;
}

export interface UpsertUserActivityParams {
  userId: string;
  guildId: string;
  channelId: string;
  timestamp: Date;
}
