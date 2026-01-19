/**
 * Quest Creation Service
 * Handles conversational quest creation with admins using AI
 */

import Anthropic from '@anthropic-ai/sdk';
import { Message, Guild, GuildMember, PermissionFlagsBits } from 'discord.js';
import { logger } from '../utils/logger';
import { QUEST_BUILDER_SYSTEM_PROMPT, QUEST_CREATION_PERMISSION_DENIED } from '../utils/prompts';
import * as db from '../db/queries';
import { VerificationType, SuccessCondition } from '../types/database';
import {
  mcpClient,
  ConnectorDefinition,
  getPlaceholderForVerificationType,
} from './mcpClient';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022';

// Keywords that trigger quest creation mode
const QUEST_CREATION_TRIGGERS = [
  'create a quest',
  'new quest',
  'make a quest',
  'add a quest',
  'quest builder',
  'build a quest',
  'setup quest',
  'set up quest',
];

// Keywords that cancel quest creation
const CANCEL_KEYWORDS = ['cancel', 'stop', 'nevermind', 'never mind', 'quit', 'exit'];

/**
 * Check if a user has admin/moderator permissions in a guild
 * Uses Discord permission flags only (not role names) for security
 */
export async function hasAdminPermissions(
  member: GuildMember | null
): Promise<boolean> {
  if (!member) return false;

  // Check for administrator permission
  if (member.permissions.has(PermissionFlagsBits.Administrator)) {
    return true;
  }

  // Check for manage guild permission
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    return true;
  }

  // Check for manage channels (moderator-level permission)
  if (member.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return true;
  }

  return false;
}

/**
 * Check if a message should trigger quest creation
 */
export function shouldTriggerQuestCreation(content: string): boolean {
  const lowerContent = content.toLowerCase();
  return QUEST_CREATION_TRIGGERS.some(trigger => lowerContent.includes(trigger));
}

/**
 * Check if a message is a cancel command
 */
export function isCancelCommand(content: string): boolean {
  const lowerContent = content.toLowerCase().trim();
  return CANCEL_KEYWORDS.some(keyword => lowerContent === keyword);
}

/**
 * Handle a message in the context of quest creation
 * @param message - The Discord message
 * @param guild - The guild context
 * @param contentOverride - Optional content to use instead of message.content (for modified/cleaned content)
 */
export async function handleQuestCreationMessage(
  message: Message,
  guild: Guild,
  contentOverride?: string
): Promise<string | null> {
  const userId = message.author.id;
  const guildId = guild.id;
  const content = contentOverride ?? message.content;

  try {
    // Check for cancel command
    if (isCancelCommand(content)) {
      await db.deleteQuestConversation(userId, guildId);
      return "Quest creation cancelled. Feel free to start again anytime by saying 'create a quest'.";
    }

    // Get or create conversation
    let conversation = await db.getQuestConversation(userId, guildId);

    if (!conversation) {
      // Start new conversation
      conversation = await db.upsertQuestConversation(
        userId,
        guildId,
        message.channelId,
        { phase: 'gathering_details' },
        [{ role: 'user', content }]
      );
    } else {
      // Add to existing conversation
      const messages = Array.isArray(conversation.messages)
        ? conversation.messages
        : [];
      messages.push({ role: 'user', content });

      conversation = await db.upsertQuestConversation(
        userId,
        guildId,
        message.channelId,
        conversation.conversation_state,
        messages
      );
    }

    // Build conversation history for Claude
    const conversationMessages = Array.isArray(conversation.messages)
      ? conversation.messages
      : [];

    // Call Claude to continue the conversation
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      system: QUEST_BUILDER_SYSTEM_PROMPT,
      messages: conversationMessages.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
    });

    const assistantResponse = extractTextFromResponse(response);

    // Update conversation with assistant response
    conversationMessages.push({ role: 'assistant', content: assistantResponse });

    // Check if quest is ready to be created
    const questData = extractQuestDataFromResponse(assistantResponse, conversation.conversation_state);

    if (questData && questData.isComplete && questData.connectorDefinition) {
      // Create quest with MCP connector
      try {
        // First, create the connector via MCP
        logger.info('Creating connector via MCP', {
          connectorName: questData.connectorDefinition.name,
          guildId,
        });

        const connectorResult = await mcpClient.createOrUpdateConnector(questData.connectorDefinition);

        if (!connectorResult.success) {
          logger.error('Failed to create connector via MCP', {
            error: connectorResult.error,
            connectorName: questData.connectorDefinition.name,
          });
          return `${assistantResponse}\n\n❌ Failed to create the verification connector: ${connectorResult.error}. Please try again.`;
        }

        // Now create the quest with the connector ID
        const quest = await db.createQuest({
          guildId,
          name: questData.name!,
          description: questData.description!,
          xpReward: questData.xpReward!,
          verificationType: questData.verificationType!,
          // MCP connector fields
          connectorId: connectorResult.id,
          connectorName: connectorResult.name,
          apiKeyEnvVar: questData.apiKeyEnvVar,
          userInputPlaceholder: getPlaceholderForVerificationType(questData.verificationType!),
          userInputDescription: questData.userInputDescription,
          active: true,
          createdBy: userId,
        });

        // Clean up conversation
        await db.deleteQuestConversation(userId, guildId);

        logger.info('Quest created via conversation with MCP connector', {
          questId: quest.id,
          questName: quest.name,
          connectorId: connectorResult.id,
          guildId,
          createdBy: userId,
        });

        return `${assistantResponse}\n\n✅ **Quest "${quest.name}" has been created and is now active!**\n\n` +
          `**Connector ID:** ${connectorResult.id}\n` +
          `Users can receive this quest via the \`/quest\` command.`;
      } catch (createError) {
        logger.error('Failed to create quest from conversation', { createError, questData });
        return `${assistantResponse}\n\n❌ There was an error creating the quest. Please try again or contact support.`;
      }
    } else if (questData && questData.isComplete) {
      // Legacy: Create quest without MCP (direct API)
      try {
        const quest = await db.createQuest({
          guildId,
          name: questData.name!,
          description: questData.description!,
          xpReward: questData.xpReward!,
          verificationType: questData.verificationType!,
          apiEndpoint: questData.apiEndpoint,
          apiMethod: questData.apiMethod || 'GET',
          apiHeaders: questData.apiHeaders || {},
          apiParams: questData.apiParams || {},
          successCondition: questData.successCondition || { field: 'balance', operator: '>' as const, value: 0 },
          userInputDescription: questData.userInputDescription,
          active: true,
          createdBy: userId,
        });

        // Clean up conversation
        await db.deleteQuestConversation(userId, guildId);

        logger.info('Quest created via conversation (legacy mode)', {
          questId: quest.id,
          questName: quest.name,
          guildId,
          createdBy: userId,
        });

        return `${assistantResponse}\n\n✅ **Quest "${quest.name}" has been created and is now active!** Users can receive it via the \`/quest\` command.`;
      } catch (createError) {
        logger.error('Failed to create quest from conversation', { createError, questData });
        return `${assistantResponse}\n\n❌ There was an error creating the quest. Please try again or contact support.`;
      }
    } else {
      // Update conversation state with any partial quest data
      const updatedState = {
        ...conversation.conversation_state,
        ...questData,
      };

      await db.upsertQuestConversation(
        userId,
        guildId,
        message.channelId,
        updatedState,
        conversationMessages
      );
    }

    return assistantResponse;
  } catch (error) {
    logger.error('Error in quest creation conversation', { userId, guildId, error });
    return 'Sorry, I encountered an error while processing your request. Please try again.';
  }
}

/**
 * Check if user has an active quest creation conversation
 */
export async function hasActiveConversation(userId: string, guildId: string): Promise<boolean> {
  const conversation = await db.getQuestConversation(userId, guildId);
  return conversation !== null;
}

/**
 * Extract quest data from Claude's response
 * Supports both MCP connector definitions and legacy API configurations
 */
function extractQuestDataFromResponse(
  response: string,
  currentState: Record<string, unknown>
): Partial<QuestDataExtraction> | null {
  const result: Partial<QuestDataExtraction> = { ...currentState };

  // Try to extract MCP connector definition (marked with ```connector)
  const connectorMatch = response.match(/```connector\s*([\s\S]*?)\s*```/);
  if (connectorMatch) {
    try {
      const connectorDef = JSON.parse(connectorMatch[1]) as ConnectorDefinition;
      if (isValidConnectorDefinition(connectorDef)) {
        result.connectorDefinition = connectorDef;
        // Extract name from connector if not already set
        if (!result.name && connectorDef.name) {
          result.name = connectorDef.name;
        }
      }
    } catch {
      logger.debug('Failed to parse connector definition', { match: connectorMatch[1].substring(0, 100) });
    }
  }

  // Try to extract JSON configuration (could be connector or legacy format)
  const jsonMatches = response.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/g);
  for (const jsonMatch of jsonMatches) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);

      // Check if this looks like an MCP connector definition
      if (parsed.endpoint && parsed.method && (parsed.validationFn || parsed.validationPrompt)) {
        if (isValidConnectorDefinition(parsed)) {
          result.connectorDefinition = parsed as ConnectorDefinition;
        }
      }

      // Extract quest metadata
      if (parsed.name && !parsed.endpoint) result.name = parsed.name;
      if (parsed.description && !parsed.endpoint) result.description = parsed.description;
      if (parsed.xp_reward || parsed.xpReward) result.xpReward = parsed.xp_reward || parsed.xpReward;
      if (parsed.verification_type || parsed.verificationType) {
        result.verificationType = (parsed.verification_type || parsed.verificationType) as VerificationType;
      }
      if (parsed.api_key_env_var || parsed.apiKeyEnvVar) {
        result.apiKeyEnvVar = parsed.api_key_env_var || parsed.apiKeyEnvVar;
      }

      // Legacy API fields (for backwards compatibility)
      if (parsed.api_endpoint || parsed.apiEndpoint) result.apiEndpoint = parsed.api_endpoint || parsed.apiEndpoint;
      if (parsed.api_method || parsed.apiMethod) result.apiMethod = parsed.api_method || parsed.apiMethod;
      if (parsed.api_headers || parsed.apiHeaders) result.apiHeaders = parsed.api_headers || parsed.apiHeaders;
      if (parsed.api_params || parsed.apiParams) result.apiParams = parsed.api_params || parsed.apiParams;
      if (parsed.success_condition || parsed.successCondition) {
        result.successCondition = parsed.success_condition || parsed.successCondition;
      }
      if (parsed.user_input_description || parsed.userInputDescription) {
        result.userInputDescription = parsed.user_input_description || parsed.userInputDescription;
      }
    } catch {
      // JSON parsing failed, continue
    }
  }

  // Extract quest details from text if not found in JSON
  extractQuestDetailsFromText(response, result);

  // Check if we have all required fields for MCP-based quest
  if (
    result.connectorDefinition &&
    result.name &&
    result.description &&
    result.xpReward &&
    result.verificationType
  ) {
    result.isComplete = true;
  }
  // Check if we have all required fields for legacy quest
  else if (
    result.name &&
    result.description &&
    result.xpReward &&
    result.verificationType &&
    result.apiEndpoint
  ) {
    result.isComplete = true;
  }

  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Validate that an object is a valid MCP connector definition
 */
function isValidConnectorDefinition(obj: unknown): obj is ConnectorDefinition {
  if (!obj || typeof obj !== 'object') return false;
  const def = obj as Record<string, unknown>;
  return (
    typeof def.name === 'string' &&
    typeof def.endpoint === 'string' &&
    typeof def.method === 'string' &&
    ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(def.method) &&
    typeof def.headers === 'object' &&
    typeof def.body === 'object'
  );
}

/**
 * Extract quest details from text patterns
 */
function extractQuestDetailsFromText(response: string, result: Partial<QuestDataExtraction>): void {
  // Extract XP reward from text like "500 XP" or "XP Reward: 500"
  if (!result.xpReward) {
    const xpMatch = response.match(/(?:xp reward[:\s]*)?(\d{1,5})\s*xp/i);
    if (xpMatch) {
      result.xpReward = parseInt(xpMatch[1], 10);
    }
  }

  // Extract verification type from text
  if (!result.verificationType) {
    if (response.toLowerCase().includes('wallet address') || response.includes('{{walletAddress}}')) {
      result.verificationType = 'wallet_address';
    } else if (response.toLowerCase().includes('email') || response.includes('{{emailAddress}}')) {
      result.verificationType = 'email';
    } else if (response.toLowerCase().includes('twitter') || response.includes('{{twitterHandle}}')) {
      result.verificationType = 'twitter_handle';
    } else if (response.toLowerCase().includes('discord id') || response.includes('{{discordId}}')) {
      result.verificationType = 'discord_id';
    }
  }

  // Extract API key env var
  if (!result.apiKeyEnvVar) {
    const envVarMatch = response.match(/(?:env var|environment variable|api key)[:\s]*[`"']?([A-Z][A-Z0-9_]+)[`"']?/i);
    if (envVarMatch) {
      result.apiKeyEnvVar = envVarMatch[1];
    }
  }
}

/**
 * Extract text content from Claude response
 */
function extractTextFromResponse(response: Anthropic.Message): string {
  const textContent = response.content.find(block => block.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text content in Claude response');
  }
  return textContent.text;
}

/**
 * Get a friendly intro message for quest creation
 */
export function getQuestCreationIntro(): string {
  return `🎯 **Quest Builder Mode**

I'll help you create a new quest for your community! Let's get started.

**What would you like to call this quest?** (e.g., "First NFT Mint", "Join Our Discord Event", "Connect Your Wallet")

You can say "cancel" at any time to stop.`;
}

/**
 * Get permission denied message
 */
export function getPermissionDeniedMessage(): string {
  return QUEST_CREATION_PERMISSION_DENIED;
}

interface QuestDataExtraction {
  name?: string;
  description?: string;
  xpReward?: number;
  verificationType?: VerificationType;
  // Legacy direct API fields
  apiEndpoint?: string;
  apiMethod?: string;
  apiHeaders?: Record<string, string>;
  apiParams?: Record<string, unknown>;
  successCondition?: SuccessCondition;
  // MCP Connector fields
  connectorDefinition?: ConnectorDefinition;
  apiKeyEnvVar?: string;
  userInputDescription?: string;
  isComplete?: boolean;
}
