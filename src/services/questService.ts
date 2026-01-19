/**
 * Quest Service
 * Handles quest assignment, verification, and XP management
 * Supports both MCP-based verification (via connector_id) and legacy direct API calls
 */

import { logger } from '../utils/logger';
import {
  Quest,
  UserQuestWithDetails,
  UserXp,
  SuccessCondition,
  CreateQuestParams,
} from '../types/database';
import * as db from '../db/queries';
import {
  QUEST_ASSIGNMENT_TEMPLATE,
  QUEST_COMPLETION_SUCCESS_TEMPLATE,
  QUEST_COMPLETION_FAILURE_TEMPLATE,
  XP_PROGRESS_TEMPLATE,
  NO_QUESTS_AVAILABLE_TEMPLATE,
  ACTIVE_QUEST_EXISTS_TEMPLATE,
  ALL_QUESTS_COMPLETED_TEMPLATE,
  RATE_LIMIT_TEMPLATE,
} from '../utils/prompts';
import { mcpClient } from './mcpClient';

// Rate limiting configuration
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_RATE_LIMIT_ENTRIES = 10000;
const RATE_LIMIT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const API_TIMEOUT_MS = parseInt(process.env.QUEST_API_TIMEOUT || '10000', 10);

const RATE_LIMITS = {
  quest: { maxAttempts: RATE_LIMIT_MAX_ATTEMPTS, windowMs: RATE_LIMIT_WINDOW_MS },
  confirm: { maxAttempts: RATE_LIMIT_MAX_ATTEMPTS, windowMs: RATE_LIMIT_WINDOW_MS },
  xp: { maxAttempts: RATE_LIMIT_MAX_ATTEMPTS, windowMs: RATE_LIMIT_WINDOW_MS },
};

const MAX_VERIFICATION_ATTEMPTS = 10;

// In-memory rate limit tracking (would use Redis in production)
const rateLimitCache = new Map<string, { count: number; resetAt: number }>();

// Cleanup interval management
let cleanupIntervalId: NodeJS.Timeout | null = null;

/**
 * Check if a user is rate limited for an action
 */
export function checkRateLimit(
  userId: string,
  action: keyof typeof RATE_LIMITS
): { allowed: boolean; retryAfter?: number } {
  const key = `${userId}:${action}`;
  const limit = RATE_LIMITS[action];
  const now = Date.now();

  // Prevent unbounded growth
  if (rateLimitCache.size > MAX_RATE_LIMIT_ENTRIES) {
    cleanupRateLimitCache();
  }

  const entry = rateLimitCache.get(key);

  if (!entry || entry.resetAt < now) {
    rateLimitCache.set(key, { count: 1, resetAt: now + limit.windowMs });
    return { allowed: true };
  }

  if (entry.count >= limit.maxAttempts) {
    return { allowed: false, retryAfter: entry.resetAt - now };
  }

  entry.count++;
  return { allowed: true };
}

/**
 * Get a formatted rate limit message
 */
export function getRateLimitMessage(command: string, retryAfter: number): string {
  return RATE_LIMIT_TEMPLATE(command, retryAfter);
}

/**
 * Assign a random quest to a user
 */
export async function assignQuest(
  userId: string,
  guildId: string
): Promise<{ success: boolean; message: string; quest?: Quest }> {
  try {
    // Check if user already has an active quest
    const activeQuest = await db.getUserActiveQuest(userId, guildId);
    if (activeQuest) {
      return {
        success: false,
        message: ACTIVE_QUEST_EXISTS_TEMPLATE({
          name: activeQuest.quest_name,
          description: activeQuest.quest_description,
          xpReward: activeQuest.xp_reward,
          verificationType: activeQuest.verification_type || 'email',
          assignedAt: new Date(activeQuest.assigned_at),
        }),
      };
    }

    // Get all active quests
    const allQuests = await db.getActiveQuests(guildId);
    if (allQuests.length === 0) {
      return {
        success: false,
        message: NO_QUESTS_AVAILABLE_TEMPLATE,
      };
    }

    // Get quests the user has already completed
    const completedQuestIds = await db.getUserCompletedQuestIds(userId, guildId);

    // Filter to quests user hasn't completed
    const availableQuests = allQuests.filter(q => !completedQuestIds.includes(q.id));

    if (availableQuests.length === 0) {
      const userXp = await db.getUserXp(userId, guildId);
      return {
        success: false,
        message: ALL_QUESTS_COMPLETED_TEMPLATE(
          userXp?.total_xp || 0,
          completedQuestIds.length
        ),
      };
    }

    // Randomly select a quest
    const randomIndex = Math.floor(Math.random() * availableQuests.length);
    const selectedQuest = availableQuests[randomIndex];

    // Assign the quest to the user
    await db.assignQuestToUser(userId, guildId, selectedQuest.id);

    logger.info('Quest assigned to user', {
      userId,
      guildId,
      questId: selectedQuest.id,
      questName: selectedQuest.name,
    });

    return {
      success: true,
      message: QUEST_ASSIGNMENT_TEMPLATE({
        name: selectedQuest.name,
        description: selectedQuest.description,
        xpReward: selectedQuest.xp_reward,
        verificationType: selectedQuest.verification_type,
      }),
      quest: selectedQuest,
    };
  } catch (error) {
    logger.error('Error assigning quest', { userId, guildId, error });
    throw error;
  }
}

/**
 * Verify quest completion using MCP or direct API call
 */
export async function verifyQuestCompletion(
  userId: string,
  guildId: string,
  identifier: string
): Promise<{ success: boolean; message: string; xpAwarded?: number }> {
  try {
    // Get user's active quest
    const activeQuest = await db.getUserActiveQuest(userId, guildId);
    if (!activeQuest) {
      return {
        success: false,
        message: "You don't have an active quest. Run `/quest` to get one!",
      };
    }

    // Check verification attempts
    const attempts = await db.incrementVerificationAttempts(activeQuest.id);
    if (attempts > MAX_VERIFICATION_ATTEMPTS) {
      await db.failUserQuest(activeQuest.id, 'Maximum verification attempts exceeded');
      return {
        success: false,
        message: `You've exceeded the maximum verification attempts (${MAX_VERIFICATION_ATTEMPTS}) for this quest. The quest has been marked as failed. Run \`/quest\` to try a different one.`,
      };
    }

    // Determine verification method: MCP (connector_id) or legacy (direct API)
    let verified: boolean;

    if (activeQuest.connector_id) {
      // Use MCP-based verification
      logger.info('Verifying quest via MCP', {
        userId,
        questId: activeQuest.quest_id,
        connectorId: activeQuest.connector_id,
      });

      const mcpResult = await mcpClient.validateQuestCompletion(
        activeQuest.connector_id,
        activeQuest.verification_type || 'wallet_address',
        identifier
      );

      verified = mcpResult.isValid;

      if (mcpResult.error) {
        logger.warn('MCP verification returned error', {
          connectorId: activeQuest.connector_id,
          error: mcpResult.error,
        });
      }
    } else {
      // Fall back to legacy direct API verification
      logger.info('Verifying quest via direct API (legacy)', {
        userId,
        questId: activeQuest.quest_id,
      });

      verified = await callVerificationApiLegacy(activeQuest, identifier);
    }

    if (verified) {
      // Complete quest in a single transaction (ensures consistency)
      const updatedXp = await db.completeQuestTransaction(
        activeQuest.id,
        activeQuest.quest_id,
        userId,
        guildId,
        activeQuest.xp_reward,
        identifier
      );

      logger.info('Quest completed', {
        userId,
        guildId,
        questId: activeQuest.quest_id,
        xpAwarded: activeQuest.xp_reward,
        totalXp: updatedXp.total_xp,
        verificationMethod: activeQuest.connector_id ? 'mcp' : 'legacy',
      });

      return {
        success: true,
        message: QUEST_COMPLETION_SUCCESS_TEMPLATE({
          questName: activeQuest.quest_name,
          xpEarned: activeQuest.xp_reward,
          totalXp: updatedXp.total_xp,
        }),
        xpAwarded: activeQuest.xp_reward,
      };
    } else {
      const remainingAttempts = MAX_VERIFICATION_ATTEMPTS - attempts;
      return {
        success: false,
        message: QUEST_COMPLETION_FAILURE_TEMPLATE({
          questName: activeQuest.quest_name,
          verificationType: activeQuest.verification_type || 'identifier',
          reason: `Verification failed. You have ${remainingAttempts} attempt${remainingAttempts !== 1 ? 's' : ''} remaining.`,
        }),
      };
    }
  } catch (error) {
    logger.error('Error verifying quest completion', { userId, guildId, error });
    return {
      success: false,
      message: 'An error occurred while verifying your quest. Please try again later.',
    };
  }
}

/**
 * Legacy: Call the external API directly to verify quest completion
 * Used for quests created before MCP integration
 */
async function callVerificationApiLegacy(
  quest: UserQuestWithDetails,
  identifier: string
): Promise<boolean> {
  try {
    // Build the API URL with placeholder replacement
    let url = quest.api_endpoint || '';
    const params = quest.api_params || {};

    // Replace placeholders in URL
    url = url.replace(/\[USER_IDENTIFIER\]/gi, encodeURIComponent(identifier));
    url = url.replace(/\[WALLET_ADDRESS\]/gi, encodeURIComponent(identifier));
    url = url.replace(/\[EMAIL\]/gi, encodeURIComponent(identifier));
    url = url.replace(/\[TWITTER_HANDLE\]/gi, encodeURIComponent(identifier));
    url = url.replace(/\[DISCORD_ID\]/gi, encodeURIComponent(identifier));

    // Replace placeholders in params
    const processedParams: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string') {
        processedParams[key] = value
          .replace(/\[USER_IDENTIFIER\]/gi, identifier)
          .replace(/\[WALLET_ADDRESS\]/gi, identifier)
          .replace(/\[EMAIL\]/gi, identifier)
          .replace(/\[TWITTER_HANDLE\]/gi, identifier)
          .replace(/\[DISCORD_ID\]/gi, identifier);
      } else {
        processedParams[key] = String(value);
      }
    }

    // Build query string for GET requests
    const queryString = Object.entries(processedParams)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

    if (queryString && quest.api_method === 'GET') {
      url += (url.includes('?') ? '&' : '?') + queryString;
    }

    // Prepare headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(quest.api_headers || {}),
    };

    // Log only hostname to avoid exposing sensitive user identifiers in URLs
    logger.info('Calling verification API', {
      host: new URL(url).hostname,
      method: quest.api_method,
    });

    // Make the API call
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    const response = await fetch(url, {
      method: quest.api_method || 'GET',
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      logger.warn('Verification API returned error', {
        status: response.status,
        statusText: response.statusText,
      });
      return false;
    }

    const data = await response.json() as Record<string, unknown>;

    // Evaluate success condition
    const successCondition = quest.success_condition || { field: 'balance', operator: '>', value: 0 };
    return evaluateSuccessCondition(data, successCondition);
  } catch (error) {
    logger.error('Error calling verification API', { error });
    return false;
  }
}

/**
 * Evaluate if the API response meets the success condition
 */
function evaluateSuccessCondition(
  data: Record<string, unknown>,
  condition: SuccessCondition
): boolean {
  // Navigate to the field (supports dot notation like "data.balance")
  const fieldPath = condition.field.split('.');
  let value: unknown = data;

  for (const key of fieldPath) {
    if (value && typeof value === 'object' && key in value) {
      value = (value as Record<string, unknown>)[key];
    } else {
      value = undefined;
      break;
    }
  }

  // Handle special operators
  if (condition.operator === 'exists') {
    return value !== undefined && value !== null;
  }

  if (condition.operator === 'not_empty') {
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'string') return value.length > 0;
    if (typeof value === 'object' && value !== null) return Object.keys(value).length > 0;
    return value !== undefined && value !== null;
  }

  // Numeric comparisons
  const numValue = Number(value);
  const numCondition = Number(condition.value);

  if (isNaN(numValue)) {
    // Fall back to string comparison for = and !=
    if (condition.operator === '=') return value === condition.value;
    if (condition.operator === '!=') return value !== condition.value;
    return false;
  }

  switch (condition.operator) {
    case '>':
      return numValue > numCondition;
    case '>=':
      return numValue >= numCondition;
    case '<':
      return numValue < numCondition;
    case '<=':
      return numValue <= numCondition;
    case '=':
      return numValue === numCondition;
    case '!=':
      return numValue !== numCondition;
    default:
      return false;
  }
}

/**
 * Get user's XP and quest progress
 */
export async function getUserProgress(
  userId: string,
  guildId: string
): Promise<{ message: string; xp: number; questsCompleted: number }> {
  try {
    const [userXp, completedQuests, activeQuest] = await Promise.all([
      db.getUserXp(userId, guildId),
      db.getUserCompletedQuests(userId, guildId, 10),
      db.getUserActiveQuest(userId, guildId),
    ]);

    const totalXp = userXp?.total_xp || 0;
    const formattedCompletedQuests = completedQuests.map(q => ({
      name: q.quest_name,
      xp: q.xp_reward,
      completedAt: new Date(q.completed_at!),
    }));

    const currentQuest = activeQuest
      ? {
          name: activeQuest.quest_name,
          xp: activeQuest.xp_reward,
          assignedAt: new Date(activeQuest.assigned_at),
        }
      : undefined;

    return {
      message: XP_PROGRESS_TEMPLATE({
        totalXp,
        completedQuests: formattedCompletedQuests,
        currentQuest,
      }),
      xp: totalXp,
      questsCompleted: completedQuests.length,
    };
  } catch (error) {
    logger.error('Error getting user progress', { userId, guildId, error });
    throw error;
  }
}

/**
 * Create a new quest (admin only)
 */
export async function createNewQuest(params: CreateQuestParams): Promise<Quest> {
  try {
    const quest = await db.createQuest(params);

    logger.info('Quest created', {
      questId: quest.id,
      guildId: params.guildId,
      name: params.name,
      createdBy: params.createdBy,
    });

    return quest;
  } catch (error) {
    logger.error('Error creating quest', { params, error });
    throw error;
  }
}

/**
 * Get all quests for a guild
 */
export async function getGuildQuests(
  guildId: string,
  includeInactive: boolean = false
): Promise<Quest[]> {
  return db.getGuildQuests(guildId, includeInactive);
}

/**
 * Toggle quest active status
 */
export async function toggleQuestStatus(questId: string, active: boolean): Promise<void> {
  await db.updateQuestStatus(questId, active);
  logger.info('Quest status updated', { questId, active });
}

/**
 * Delete a quest
 */
export async function deleteQuest(questId: string): Promise<void> {
  await db.deleteQuest(questId);
  logger.info('Quest deleted', { questId });
}

/**
 * Get guild leaderboard
 */
export async function getLeaderboard(guildId: string, limit: number = 10): Promise<UserXp[]> {
  return db.getGuildLeaderboard(guildId, limit);
}

/**
 * Clean up rate limit cache entries
 */
export function cleanupRateLimitCache(): void {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, entry] of rateLimitCache.entries()) {
    if (entry.resetAt < now) {
      rateLimitCache.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    logger.debug('Cleaned up expired quest rate limits', { count: cleaned });
  }
}

/**
 * Start the rate limit cleanup interval
 */
export function startQuestRateLimitCleanup(): void {
  if (cleanupIntervalId) {
    logger.warn('Quest rate limit cleanup already running');
    return;
  }
  cleanupIntervalId = setInterval(cleanupRateLimitCache, RATE_LIMIT_CLEANUP_INTERVAL_MS);
  logger.info('Quest rate limit cleanup started');
}

/**
 * Stop the rate limit cleanup interval
 */
export function stopQuestRateLimitCleanup(): void {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
    logger.info('Quest rate limit cleanup stopped');
  }
}
