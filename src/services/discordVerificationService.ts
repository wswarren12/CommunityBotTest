/**
 * Discord Verification Service
 * Handles verification of Discord-native quest requirements:
 * - Role membership
 * - Message count
 * - Reaction count
 * - Poll count
 */

import { Client, GuildMember } from 'discord.js';
import { logger } from '../utils/logger';
import * as db from '../db/queries';
import { DiscordVerificationConfig, VerificationType } from '../types/database';

// Discord client reference (set during bot initialization)
let discordClient: Client | null = null;

/**
 * Set the Discord client for verification
 * Called during bot initialization
 */
export function setDiscordClient(client: Client): void {
  discordClient = client;
  logger.info('Discord client set for verification service');
}

/**
 * Get the Discord client
 */
export function getDiscordClient(): Client | null {
  return discordClient;
}

/**
 * Get the Discord client with null check (throws if not initialized)
 * Use this in functions where the client must exist
 */
function getRequiredClient(): Client {
  if (!discordClient) {
    throw new Error('Discord client not initialized');
  }
  return discordClient;
}

/**
 * Result of a Discord verification check
 */
export interface DiscordVerificationResult {
  verified: boolean;
  message: string;
  currentValue?: number | string;
  requiredValue?: number | string;
}

/**
 * Verify a Discord-native quest requirement
 */
export async function verifyDiscordRequirement(
  userId: string,
  guildId: string,
  verificationType: VerificationType,
  config: DiscordVerificationConfig
): Promise<DiscordVerificationResult> {
  if (!discordClient) {
    return {
      verified: false,
      message: 'Discord client not initialized. Please try again later.',
    };
  }

  try {
    switch (verificationType) {
      case 'discord_role':
        return await verifyRole(userId, guildId, config);

      case 'discord_message_count':
        return await verifyMessageCount(userId, guildId, config);

      case 'discord_reaction_count':
        return await verifyReactionCount(userId, guildId, config);

      case 'discord_poll_count':
        return await verifyPollCount(userId, guildId, config);

      default:
        return {
          verified: false,
          message: `Unsupported Discord verification type: ${verificationType}`,
        };
    }
  } catch (error) {
    logger.error('Discord verification error', {
      userId,
      guildId,
      verificationType,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return {
      verified: false,
      message: 'An error occurred during verification. Please try again.',
    };
  }
}

/**
 * Verify that a user has a specific role
 */
async function verifyRole(
  userId: string,
  guildId: string,
  config: DiscordVerificationConfig
): Promise<DiscordVerificationResult> {
  if (!config.roleId) {
    return {
      verified: false,
      message: 'Role ID not configured for this quest.',
    };
  }

  // Use safe accessor that throws if client is null (already checked in verifyDiscordRequirement)
  const client = getRequiredClient();
  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    return {
      verified: false,
      message: 'Could not access the server. Please try again.',
    };
  }

  let member: GuildMember | null = null;
  try {
    member = await guild.members.fetch(userId);
  } catch {
    return {
      verified: false,
      message: 'Could not find you in this server. Are you a member?',
    };
  }

  const hasRole = member.roles.cache.has(config.roleId);
  const roleName = config.roleName || config.roleId;

  if (hasRole) {
    return {
      verified: true,
      message: `You have the "${roleName}" role!`,
      currentValue: roleName,
      requiredValue: roleName,
    };
  } else {
    return {
      verified: false,
      message: `You need the "${roleName}" role to complete this quest.`,
      requiredValue: roleName,
    };
  }
}

/**
 * Verify that a user has sent enough messages
 */
async function verifyMessageCount(
  userId: string,
  guildId: string,
  config: DiscordVerificationConfig
): Promise<DiscordVerificationResult> {
  const threshold = config.threshold ?? 1;
  const operator = config.operator ?? '>=';

  const count = await db.getUserMessageCount(userId, guildId, {
    channelId: config.channelId,
    sinceDays: config.sinceDays,
  });

  const verified = evaluateComparison(count, operator, threshold);

  const timeContext = config.sinceDays
    ? ` in the last ${config.sinceDays} days`
    : '';
  const channelContext = config.channelId
    ? ' in the specified channel'
    : '';

  if (verified) {
    return {
      verified: true,
      message: `You've sent ${count} messages${timeContext}${channelContext}. Quest complete!`,
      currentValue: count,
      requiredValue: threshold,
    };
  } else {
    return {
      verified: false,
      message: `You've sent ${count} messages${timeContext}${channelContext}. You need ${operator} ${threshold} to complete this quest.`,
      currentValue: count,
      requiredValue: threshold,
    };
  }
}

/**
 * Verify that a user has received enough reactions
 */
async function verifyReactionCount(
  userId: string,
  guildId: string,
  config: DiscordVerificationConfig
): Promise<DiscordVerificationResult> {
  const threshold = config.threshold ?? 1;
  const operator = config.operator ?? '>=';

  const count = await db.getUserReactionCount(userId, guildId, {
    channelId: config.channelId,
    sinceDays: config.sinceDays,
  });

  const verified = evaluateComparison(count, operator, threshold);

  const timeContext = config.sinceDays
    ? ` in the last ${config.sinceDays} days`
    : '';

  if (verified) {
    return {
      verified: true,
      message: `Your messages have received ${count} reactions${timeContext}. Quest complete!`,
      currentValue: count,
      requiredValue: threshold,
    };
  } else {
    return {
      verified: false,
      message: `Your messages have received ${count} reactions${timeContext}. You need ${operator} ${threshold} to complete this quest.`,
      currentValue: count,
      requiredValue: threshold,
    };
  }
}

/**
 * Verify that a user has created enough polls
 */
async function verifyPollCount(
  userId: string,
  guildId: string,
  config: DiscordVerificationConfig
): Promise<DiscordVerificationResult> {
  const threshold = config.threshold ?? 1;
  const operator = config.operator ?? '>=';

  const count = await db.getUserPollCount(userId, guildId, {
    channelId: config.channelId,
    sinceDays: config.sinceDays,
  });

  const verified = evaluateComparison(count, operator, threshold);

  const timeContext = config.sinceDays
    ? ` in the last ${config.sinceDays} days`
    : '';

  if (verified) {
    return {
      verified: true,
      message: `You've created ${count} polls${timeContext}. Quest complete!`,
      currentValue: count,
      requiredValue: threshold,
    };
  } else {
    return {
      verified: false,
      message: `You've created ${count} polls${timeContext}. You need ${operator} ${threshold} to complete this quest.`,
      currentValue: count,
      requiredValue: threshold,
    };
  }
}

/**
 * Evaluate a comparison based on operator
 */
function evaluateComparison(
  current: number,
  operator: string,
  threshold: number
): boolean {
  switch (operator) {
    case '>':
      return current > threshold;
    case '>=':
      return current >= threshold;
    case '=':
      return current === threshold;
    case '<':
      return current < threshold;
    case '<=':
      return current <= threshold;
    default:
      return current >= threshold;
  }
}

/**
 * Check if a verification type is Discord-native
 */
export function isDiscordNativeVerificationType(type: VerificationType): boolean {
  return [
    'discord_role',
    'discord_message_count',
    'discord_reaction_count',
    'discord_poll_count',
  ].includes(type);
}

/**
 * Get a human-readable description of the Discord verification requirement
 */
export function getDiscordVerificationDescription(
  verificationType: VerificationType,
  config: DiscordVerificationConfig
): string {
  const operator = config.operator ?? '>=';
  const threshold = config.threshold ?? 1;
  const timeContext = config.sinceDays
    ? ` in the last ${config.sinceDays} days`
    : '';

  switch (verificationType) {
    case 'discord_role':
      return `Have the "${config.roleName || 'required'}" role`;

    case 'discord_message_count':
      return `Send ${operator} ${threshold} messages${timeContext}`;

    case 'discord_reaction_count':
      return `Receive ${operator} ${threshold} reactions on your messages${timeContext}`;

    case 'discord_poll_count':
      return `Create ${operator} ${threshold} polls${timeContext}`;

    default:
      return 'Complete the Discord requirement';
  }
}
