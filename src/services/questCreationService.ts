/**
 * Quest Creation Service
 * Handles conversational quest creation with admins using AI
 * Supports Discord-native quests, MCP connectors, and legacy API quests
 */

import Anthropic from '@anthropic-ai/sdk';
import { Message, Guild, GuildMember, PermissionFlagsBits } from 'discord.js';
import { logger } from '../utils/logger';
import { QUEST_BUILDER_SYSTEM_PROMPT, QUEST_CREATION_PERMISSION_DENIED } from '../utils/prompts';
import * as db from '../db/queries';
import { VerificationType, SuccessCondition, DiscordVerificationConfig, isDiscordNativeVerification } from '../types/database';
import {
  mcpClient,
  ConnectorDefinition,
  getPlaceholderForVerificationType,
  QuestTaskDefinition,
} from './mcpClient';
import { CreateTaskParams } from '../types/database';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022';

// Maximum number of messages to keep in conversation history to prevent unbounded growth
const MAX_CONVERSATION_MESSAGES = 50;

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
 * Also grants access to the server owner automatically
 */
export async function hasAdminPermissions(
  member: GuildMember | null
): Promise<boolean> {
  if (!member) return false;

  // Check if user is the server owner (always has permission)
  if (member.id === member.guild.ownerId) {
    return true;
  }

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

    // Build conversation messages - always work with a copy to avoid mutations
    let conversationMessages: Array<{ role: string; content: string }>;

    if (!conversation) {
      // Start new conversation
      conversationMessages = [{ role: 'user', content }];
      conversation = await db.upsertQuestConversation(
        userId,
        guildId,
        message.channelId,
        { phase: 'gathering_details' },
        conversationMessages
      );
    } else {
      // Add to existing conversation - create a new array, don't mutate the original
      conversationMessages = Array.isArray(conversation.messages)
        ? [...conversation.messages, { role: 'user', content }]
        : [{ role: 'user', content }];

      // Apply limit BEFORE saving to DB to prevent unbounded database growth
      if (conversationMessages.length > MAX_CONVERSATION_MESSAGES) {
        conversationMessages = conversationMessages.slice(-MAX_CONVERSATION_MESSAGES);
        logger.debug('Trimmed conversation history before save', {
          userId,
          guildId,
          trimmedTo: MAX_CONVERSATION_MESSAGES,
        });
      }

      conversation = await db.upsertQuestConversation(
        userId,
        guildId,
        message.channelId,
        conversation.conversation_state,
        conversationMessages
      );
    }

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

    // Handle multi-task quest creation
    if (questData && questData.isComplete && questData.tasks && questData.tasks.length > 0) {
      try {
        logger.info('Creating multi-task quest via MCP', {
          questName: questData.name,
          taskCount: questData.tasks.length,
          guildId,
        });

        // Step 1: Create connectors for each task that needs one
        const tasksWithConnectors: CreateTaskParams[] = [];
        const mcpTasks: QuestTaskDefinition[] = [];

        for (let i = 0; i < questData.tasks.length; i++) {
          const task = questData.tasks[i];
          let connectorId: number | undefined;
          let connectorName: string | undefined;

          // Create connector if task has a connector definition
          if (task.connectorDefinition) {
            logger.info('Creating connector for task', {
              taskTitle: task.title,
              connectorName: task.connectorDefinition.name,
            });

            const connectorResult = await mcpClient.createOrUpdateConnector(task.connectorDefinition);

            if (!connectorResult.success) {
              logger.error('Failed to create connector for task', {
                taskTitle: task.title,
                error: connectorResult.error,
              });
              return `${assistantResponse}\n\n❌ Failed to create connector for task "${task.title}": ${connectorResult.error}. Please try again.`;
            }

            connectorId = connectorResult.id;
            connectorName = connectorResult.name;

            logger.info('Connector created for task', {
              taskTitle: task.title,
              connectorId,
              connectorName,
            });
          }

          // Build task params for local database
          tasksWithConnectors.push({
            title: task.title,
            description: task.description,
            points: task.points,
            connectorId,
            connectorName,
            verificationType: task.verificationType,
            discordVerificationConfig: task.discordVerificationConfig,
            position: i,
          });

          // Build MCP task definition
          mcpTasks.push({
            title: task.title,
            description: task.description,
            points: task.points,
            mcpConnectorId: connectorId,
          });
        }

        // Step 2: Create the quest in Summon MCP
        const mcpQuestResult = await mcpClient.createOrUpdateQuest({
          title: questData.name!,
          description: questData.description,
          points: questData.xpReward,
          tasks: mcpTasks,
        });

        if (!mcpQuestResult.success) {
          logger.error('Failed to create quest in Summon MCP', {
            questName: questData.name,
            error: mcpQuestResult.error,
          });
          return `${assistantResponse}\n\n❌ Failed to create quest in Summon: ${mcpQuestResult.error}. Please try again.`;
        }

        logger.info('Quest created in Summon MCP', {
          summonQuestId: mcpQuestResult.id,
          questName: mcpQuestResult.title,
        });

        // Step 3: Create quest with tasks in local database
        const quest = await db.createQuestWithTasks({
          guildId,
          name: questData.name!,
          description: questData.description!,
          xpReward: questData.xpReward!,
          verificationType: tasksWithConnectors[0]?.verificationType || 'wallet_address',
          summonQuestId: mcpQuestResult.id,
          summonStatus: 'DRAFT',
          tasks: tasksWithConnectors,
          active: true,
          createdBy: userId,
        });

        // Clean up conversation
        await db.deleteQuestConversation(userId, guildId);

        logger.info('Multi-task quest created successfully', {
          questId: quest.id,
          questName: quest.name,
          summonQuestId: mcpQuestResult.id,
          taskCount: quest.tasks.length,
          guildId,
          createdBy: userId,
        });

        // Build task summary for response
        const taskSummary = quest.tasks
          .map((t, i) => `${i + 1}. **${t.title}** - ${t.points} XP`)
          .join('\n');

        return `${assistantResponse}\n\n✅ **Quest "${quest.name}" has been created and is now active!**\n\n` +
          `**Summon Quest ID:** ${mcpQuestResult.id}\n` +
          `**Total XP:** ${quest.xp_reward} XP\n\n` +
          `**Tasks:**\n${taskSummary}\n\n` +
          `Users can receive this quest via the \`/quest\` command and complete tasks with \`/confirm\`.`;
      } catch (createError) {
        const errorMessage = createError instanceof Error ? createError.message : 'Unknown error';
        logger.error('Failed to create multi-task quest', {
          createError,
          questData,
          errorMessage,
          guildId,
          userId,
        });

        return `${assistantResponse}\n\n❌ There was an error creating the quest: ${errorMessage}. Please try again or contact support.`;
      }
    } else if (questData && questData.isComplete && questData.discordVerificationConfig && isDiscordNativeVerification(questData.verificationType!)) {
      // Create Discord-native quest (no external API needed)
      try {
        logger.info('Creating Discord-native quest', {
          questName: questData.name,
          verificationType: questData.verificationType,
          guildId,
        });

        const quest = await db.createQuest({
          guildId,
          name: questData.name!,
          description: questData.description!,
          xpReward: questData.xpReward!,
          verificationType: questData.verificationType!,
          discordVerificationConfig: questData.discordVerificationConfig,
          active: true,
          createdBy: userId,
        });

        // Clean up conversation
        await db.deleteQuestConversation(userId, guildId);

        logger.info('Discord-native quest created via conversation', {
          questId: quest.id,
          questName: quest.name,
          verificationType: questData.verificationType,
          guildId,
          createdBy: userId,
        });

        return `${assistantResponse}\n\n✅ **Quest "${quest.name}" has been created and is now active!**\n\n` +
          `**Verification Type:** ${questData.verificationType}\n` +
          `**XP Reward:** ${quest.xp_reward} XP\n` +
          `Users can receive this quest via the \`/quest\` command and complete it with \`/confirm\`.`;
      } catch (createError) {
        const errorMessage = createError instanceof Error ? createError.message : 'Unknown error';
        logger.error('Failed to create Discord-native quest', {
          createError,
          questData,
          errorMessage,
          guildId,
          userId,
        });

        let userErrorMessage = '❌ There was an error creating the quest.';
        if (errorMessage.includes('violates check constraint')) {
          // Don't expose database constraint details to users - security risk
          userErrorMessage = '❌ Invalid quest configuration. Please check your quest parameters and try again.';
        }

        return `${assistantResponse}\n\n${userErrorMessage} Please try again or contact support.`;
      }
    } else if (questData && questData.isComplete && questData.connectorDefinition) {
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
        const errorMessage = createError instanceof Error ? createError.message : 'Unknown error';
        logger.error('Failed to create quest from conversation (MCP)', {
          createError,
          questData,
          errorMessage,
          guildId,
          userId,
        });

        // Provide more specific error feedback without exposing internal details
        let userErrorMessage = '❌ There was an error creating the quest.';
        if (errorMessage.includes('null value') && errorMessage.includes('api_endpoint')) {
          userErrorMessage = '❌ Database schema issue: Please run `npm run migrate` to update the database schema, then try again.';
        } else if (errorMessage.includes('violates check constraint')) {
          // Don't expose database constraint details to users - security risk
          userErrorMessage = '❌ Invalid quest configuration. Please check your quest parameters and try again.';
        }

        return `${assistantResponse}\n\n${userErrorMessage} Please try again or contact support.`;
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
        const errorMessage = createError instanceof Error ? createError.message : 'Unknown error';
        logger.error('Failed to create quest from conversation (legacy)', {
          createError,
          questData,
          errorMessage,
          guildId,
          userId,
        });

        // Provide more specific error feedback without exposing internal details
        let userErrorMessage = '❌ There was an error creating the quest.';
        if (errorMessage.includes('null value')) {
          userErrorMessage = '❌ Database schema issue: Please run `npm run migrate` to update the database schema, then try again.';
        } else if (errorMessage.includes('violates check constraint')) {
          // Don't expose database constraint details to users - security risk
          userErrorMessage = '❌ Invalid quest configuration. Please check your quest parameters and try again.';
        }

        return `${assistantResponse}\n\n${userErrorMessage} Please try again or contact support.`;
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
 * Supports quest_definition format with tasks, Discord-native configs, MCP connector definitions, and legacy API configurations
 */
function extractQuestDataFromResponse(
  response: string,
  currentState: Record<string, unknown>
): Partial<QuestDataExtraction> | null {
  const result: Partial<QuestDataExtraction> = { ...currentState };

  // Try to extract complete quest definition with tasks (marked with ```quest_definition)
  const questDefinitionMatch = response.match(/```quest_definition\s*([\s\S]*?)\s*```/);
  if (questDefinitionMatch) {
    try {
      const questDef = JSON.parse(questDefinitionMatch[1]);
      if (questDef.name) result.name = questDef.name;
      if (questDef.description) result.description = questDef.description;

      // Extract tasks if present
      if (questDef.tasks && Array.isArray(questDef.tasks) && questDef.tasks.length > 0) {
        result.tasks = [];
        let totalXp = 0;

        for (const task of questDef.tasks) {
          if (!task.title || typeof task.points !== 'number') continue;

          const extractedTask: TaskDataExtraction = {
            title: task.title,
            description: task.description,
            points: task.points,
            verificationType: task.verificationType,
          };

          // Handle connector definition for external API tasks
          if (task.connectorDefinition && isValidConnectorDefinition(task.connectorDefinition)) {
            extractedTask.connectorDefinition = task.connectorDefinition;
          }

          // Handle Discord verification config
          if (task.discordVerificationConfig && isValidDiscordConfig(task.discordVerificationConfig)) {
            extractedTask.discordVerificationConfig = task.discordVerificationConfig;
          }

          result.tasks.push(extractedTask);
          totalXp += task.points;
        }

        // Set total XP from sum of task points
        if (!result.xpReward && totalXp > 0) {
          result.xpReward = totalXp;
        }

        logger.debug('Extracted quest definition with tasks', {
          name: result.name,
          taskCount: result.tasks.length,
          totalXp,
        });
      }
    } catch (err) {
      logger.debug('Failed to parse quest definition', {
        match: questDefinitionMatch[1].substring(0, 200),
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  // Try to extract Discord-native config (marked with ```discord_config) - legacy single-task format
  const discordConfigMatch = response.match(/```discord_config\s*([\s\S]*?)\s*```/);
  if (discordConfigMatch && !result.tasks) {
    try {
      const discordConfig = JSON.parse(discordConfigMatch[1]);
      if (isValidDiscordConfig(discordConfig)) {
        result.discordVerificationConfig = discordConfig as DiscordVerificationConfig;
        // Set verification type from config
        if (discordConfig.verificationType) {
          result.verificationType = discordConfig.verificationType as VerificationType;
        }
        logger.debug('Extracted Discord verification config', { config: discordConfig });
      }
    } catch {
      logger.debug('Failed to parse Discord config', { match: discordConfigMatch[1].substring(0, 100) });
    }
  }

  // Try to extract MCP connector definition (marked with ```connector) - legacy single-task format
  const connectorMatch = response.match(/```connector\s*([\s\S]*?)\s*```/);
  if (connectorMatch && !result.tasks) {
    try {
      const connectorDef = JSON.parse(connectorMatch[1]) as ConnectorDefinition;
      if (isValidConnectorDefinition(connectorDef)) {
        result.connectorDefinition = connectorDef;
        // Extract name from connector if not already set
        if (!result.name && connectorDef.name) {
          result.name = connectorDef.name;
        }
        // Extract description from connector if not already set
        if (!result.description && connectorDef.description) {
          result.description = connectorDef.description;
        }
      }
    } catch {
      logger.debug('Failed to parse connector definition', { match: connectorMatch[1].substring(0, 100) });
    }
  }

  // Try to extract JSON configuration (could be Discord config, connector, or legacy format)
  const jsonMatches = response.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/g);
  for (const jsonMatch of jsonMatches) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);

      // Check if this looks like a Discord verification config
      if (parsed.verificationType && isDiscordNativeVerification(parsed.verificationType)) {
        if (isValidDiscordConfig(parsed)) {
          result.discordVerificationConfig = parsed as DiscordVerificationConfig;
          result.verificationType = parsed.verificationType as VerificationType;
        }
      }
      // Check if this looks like an MCP connector definition
      else if (parsed.endpoint && parsed.method && (parsed.validationFn || parsed.validationPrompt)) {
        if (isValidConnectorDefinition(parsed)) {
          result.connectorDefinition = parsed as ConnectorDefinition;
          // Extract description from connector
          if (!result.description && parsed.description) {
            result.description = parsed.description;
          }
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

      // Discord verification config fields
      if (parsed.roleId) result.discordVerificationConfig = { ...result.discordVerificationConfig, roleId: parsed.roleId };
      if (parsed.roleName) result.discordVerificationConfig = { ...result.discordVerificationConfig, roleName: parsed.roleName };
      if (parsed.threshold !== undefined) result.discordVerificationConfig = { ...result.discordVerificationConfig, threshold: parsed.threshold };
      if (parsed.operator) result.discordVerificationConfig = { ...result.discordVerificationConfig, operator: parsed.operator };
      if (parsed.sinceDays !== undefined) result.discordVerificationConfig = { ...result.discordVerificationConfig, sinceDays: parsed.sinceDays };
      if (parsed.channelId) result.discordVerificationConfig = { ...result.discordVerificationConfig, channelId: parsed.channelId };

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

  // Check if we have all required fields for multi-task quest
  if (
    result.tasks &&
    result.tasks.length > 0 &&
    result.name &&
    result.description &&
    result.xpReward
  ) {
    // Verify each task has required fields
    const allTasksValid = result.tasks.every(task =>
      task.title &&
      typeof task.points === 'number' &&
      (task.connectorDefinition || task.discordVerificationConfig || task.verificationType)
    );

    if (allTasksValid) {
      result.isComplete = true;
      logger.debug('Quest data complete (Multi-task)', {
        name: result.name,
        taskCount: result.tasks.length,
        totalXp: result.xpReward,
      });
    }
  }
  // Check if we have all required fields for Discord-native quest (legacy single-task)
  else if (
    result.discordVerificationConfig &&
    result.name &&
    result.description &&
    result.xpReward &&
    result.verificationType &&
    isDiscordNativeVerification(result.verificationType)
  ) {
    result.isComplete = true;
    logger.debug('Quest data complete (Discord-native)', { name: result.name, verificationType: result.verificationType });
  }
  // Check if we have all required fields for MCP-based quest (legacy single-task)
  else if (
    result.connectorDefinition &&
    result.name &&
    result.description &&
    result.xpReward &&
    result.verificationType
  ) {
    result.isComplete = true;
    logger.debug('Quest data complete (MCP)', { name: result.name, verificationType: result.verificationType });
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
    logger.debug('Quest data complete (Legacy)', { name: result.name, verificationType: result.verificationType });
  }

  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Validate that an object is a valid Discord verification config
 * Note: The parsed JSON may include verificationType which gets extracted separately
 */
function isValidDiscordConfig(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') return false;
  const config = obj as Record<string, unknown>;

  // Check if it has a valid Discord verification type (may be in the config or extracted separately)
  const verificationType = config.verificationType as string | undefined;
  if (verificationType) {
    // Verify it's a valid Discord-native type
    const validTypes = ['discord_role', 'discord_message_count', 'discord_reaction_count', 'discord_poll_count'];
    if (!validTypes.includes(verificationType)) {
      return false;
    }

    // For role verification, need roleId
    if (verificationType === 'discord_role' && !config.roleId) {
      return false;
    }
  }

  // Check for valid config fields
  const hasRoleConfig = config.roleId !== undefined;
  const hasCountConfig = config.threshold !== undefined || config.sinceDays !== undefined;

  // Must have at least some Discord config
  return hasRoleConfig || hasCountConfig || verificationType !== undefined;
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

/**
 * Task data extracted from AI response
 */
interface TaskDataExtraction {
  title: string;
  description?: string;
  points: number;
  verificationType?: VerificationType;
  connectorDefinition?: ConnectorDefinition;
  discordVerificationConfig?: DiscordVerificationConfig;
}

interface QuestDataExtraction {
  name?: string;
  description?: string;
  xpReward?: number;
  verificationType?: VerificationType;
  // Tasks array for multi-task quests
  tasks?: TaskDataExtraction[];
  // Legacy direct API fields (for backwards compatibility)
  apiEndpoint?: string;
  apiMethod?: string;
  apiHeaders?: Record<string, string>;
  apiParams?: Record<string, unknown>;
  successCondition?: SuccessCondition;
  // MCP Connector fields (legacy - single connector)
  connectorDefinition?: ConnectorDefinition;
  apiKeyEnvVar?: string;
  userInputDescription?: string;
  // Discord-native verification fields (legacy - single config)
  discordVerificationConfig?: DiscordVerificationConfig;
  isComplete?: boolean;
}
