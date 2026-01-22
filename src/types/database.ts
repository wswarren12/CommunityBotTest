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

// ==================== Quest Types ====================

export interface Quest {
  id: string;
  guild_id: string;
  name: string;
  description: string;
  xp_reward: number;
  verification_type: VerificationType;
  // Legacy direct API fields (nullable for MCP-based quests)
  api_endpoint?: string;
  api_method?: string;
  api_headers?: Record<string, string>;
  api_params?: Record<string, unknown>;
  success_condition?: SuccessCondition;
  // MCP Connector fields (legacy - single connector per quest)
  connector_id?: number;
  connector_name?: string;
  api_key_env_var?: string;
  user_input_placeholder?: string;
  user_input_description?: string;
  // Discord-native verification fields
  discord_verification_config?: DiscordVerificationConfig;
  // Summon MCP integration fields
  summon_quest_id?: number;
  summon_status?: SummonQuestStatus;
  active: boolean;
  max_completions?: number;
  total_completions: number;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * Summon MCP quest status
 */
export type SummonQuestStatus = 'LIVE' | 'DRAFT' | 'READY' | 'ARCHIVED' | 'SCHEDULED' | 'ENDED' | 'PAUSED';

/**
 * Quest task - individual task within a quest
 */
export interface QuestTask {
  id: string;
  quest_id: string;
  summon_task_id?: number;
  title: string;
  description?: string;
  points: number;
  connector_id?: number;
  connector_name?: string;
  verification_type?: VerificationType;
  user_input_placeholder?: string;
  user_input_description?: string;
  discord_verification_config?: DiscordVerificationConfig;
  max_completions?: number;
  max_completions_per_day?: number;
  position: number;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * User task completion record
 */
export interface UserTaskCompletion {
  id: string;
  user_id: string;
  guild_id: string;
  task_id: string;
  quest_id: string;
  completed_at: Date;
  xp_awarded: number;
  verification_identifier?: string;
}

/**
 * Quest with its tasks
 */
export interface QuestWithTasks extends Quest {
  tasks: QuestTask[];
}

/**
 * Task with completion info
 */
export interface TaskWithCompletion extends QuestTask {
  is_completed?: boolean;
  completed_at?: Date;
}

export type VerificationType =
  | 'email'
  | 'discord_id'
  | 'wallet_address'
  | 'twitter_handle'
  // Discord-native verification types (no external API needed)
  | 'discord_role'           // Check if user has a specific role
  | 'discord_message_count'  // Check user's message count in the server
  | 'discord_reaction_count' // Check reactions received on user's messages
  | 'discord_poll_count';    // Check number of polls created by user

/**
 * Configuration for Discord-native verification
 * Stored in the discord_verification_config column
 */
export interface DiscordVerificationConfig {
  // For discord_role verification
  roleId?: string;           // The role ID to check for
  roleName?: string;         // Human-readable role name (for display)

  // For count-based verifications (message_count, reaction_count, poll_count)
  threshold?: number;        // Minimum count required
  operator?: '>' | '>=' | '=' | '<' | '<='; // Comparison operator (default: '>=')

  // Optional: time-based filters
  sinceDays?: number;        // Only count activity from the last N days
  channelId?: string;        // Only count activity in a specific channel
}

export interface SuccessCondition {
  field: string;
  operator: '>' | '>=' | '=' | '!=' | '<' | '<=' | 'exists' | 'not_empty';
  value: number | string | boolean;
}

export interface UserQuest {
  id: string;
  user_id: string;
  guild_id: string;
  quest_id: string;
  status: UserQuestStatus;
  assigned_at: Date;
  completed_at?: Date;
  verification_identifier?: string;
  verification_attempts: number;
  xp_awarded: number;
  failure_reason?: string;
}

export type UserQuestStatus = 'assigned' | 'completed' | 'failed' | 'expired';

export interface UserQuestWithDetails extends UserQuest {
  quest_name: string;
  quest_description: string;
  xp_reward: number;
  verification_type?: VerificationType;
  // Legacy direct API fields
  api_endpoint?: string;
  api_method?: string;
  api_headers?: Record<string, string>;
  api_params?: Record<string, unknown>;
  success_condition?: SuccessCondition;
  // MCP Connector fields
  connector_id?: number;
  connector_name?: string;
  api_key_env_var?: string;
  user_input_placeholder?: string;
  user_input_description?: string;
  // Discord-native verification fields
  discord_verification_config?: DiscordVerificationConfig;
}

export interface UserXp {
  user_id: string;
  guild_id: string;
  total_xp: number;
  quests_completed: number;
  last_quest_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface QuestConversation {
  id: string;
  user_id: string;
  guild_id: string;
  channel_id?: string;
  conversation_state: Record<string, unknown>;
  messages: Array<{ role: string; content: string }>;
  created_at: Date;
  updated_at: Date;
  expires_at: Date;
}

export interface CreateQuestParams {
  guildId: string;
  name: string;
  description: string;
  xpReward: number;
  verificationType: VerificationType;
  // Legacy direct API fields (optional for MCP-based quests)
  apiEndpoint?: string;
  apiMethod?: string;
  apiHeaders?: Record<string, string>;
  apiParams?: Record<string, unknown>;
  successCondition?: SuccessCondition;
  // MCP Connector fields (legacy - single connector per quest)
  connectorId?: number;
  connectorName?: string;
  apiKeyEnvVar?: string;
  userInputPlaceholder?: string;
  userInputDescription?: string;
  // Discord-native verification fields
  discordVerificationConfig?: DiscordVerificationConfig;
  // Summon MCP integration fields
  summonQuestId?: number;
  summonStatus?: SummonQuestStatus;
  // Tasks for the quest
  tasks?: CreateTaskParams[];
  active?: boolean;
  maxCompletions?: number;
  createdBy: string;
}

/**
 * Parameters for creating a quest task
 */
export interface CreateTaskParams {
  title: string;
  description?: string;
  points: number;
  connectorId?: number;
  connectorName?: string;
  verificationType?: VerificationType;
  userInputPlaceholder?: string;
  userInputDescription?: string;
  discordVerificationConfig?: DiscordVerificationConfig;
  maxCompletions?: number;
  maxCompletionsPerDay?: number;
  position?: number;
}

/**
 * Helper to check if a verification type is Discord-native
 */
export function isDiscordNativeVerification(type: VerificationType): boolean {
  return [
    'discord_role',
    'discord_message_count',
    'discord_reaction_count',
    'discord_poll_count',
  ].includes(type);
}
