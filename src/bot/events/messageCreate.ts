import { Message, ChannelType } from 'discord.js';
import { logger } from '../../utils/logger';
import { ingestMessage } from '../../services/messageService';
import * as questCreation from '../../services/questCreationService';
import { trackPollIfPresent } from './pollCreate';

/**
 * Handle new messages for ingestion into database and quest creation
 */
export async function handleMessageCreate(message: Message): Promise<void> {
  // Ignore bot messages
  if (message.author.bot) {
    return;
  }

  // Handle DMs for quest creation
  if (message.channel.type === ChannelType.DM) {
    await handleDMMessage(message);
    return;
  }

  // Handle guild messages
  if (!message.guild) {
    return;
  }

  // Check if bot was mentioned for quest creation
  const botUser = message.client.user;
  if (!botUser) {
    logger.warn('Bot user not initialized when checking mentions');
    return;
  }
  const botMentioned = message.mentions.has(botUser);
  if (botMentioned) {
    await handleBotMention(message);
    return;
  }

  // Normal message ingestion
  try {
    await ingestMessage(message);

    // Track polls for quest verification
    await trackPollIfPresent(message);

    logger.debug('Message ingested', {
      messageId: message.id,
      channelId: message.channel.id,
      userId: message.author.id,
      guildId: message.guild.id,
    });
  } catch (error) {
    logger.error('Failed to ingest message', {
      messageId: message.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Handle DM messages for quest creation
 */
async function handleDMMessage(message: Message): Promise<void> {
  const userId = message.author.id;

  try {
    // Collect all guilds where user has admin permissions
    const guilds = message.client.guilds.cache;
    const adminGuilds: Array<{ id: string; name: string }> = [];

    for (const [, guild] of guilds) {
      try {
        const member = await guild.members.fetch(userId);
        if (await questCreation.hasAdminPermissions(member)) {
          adminGuilds.push({ id: guild.id, name: guild.name });
        }
      } catch {
        // User not in this guild or can't fetch
        continue;
      }
    }

    if (adminGuilds.length === 0) {
      await message.reply(questCreation.getPermissionDeniedMessage());
      return;
    }

    // Check for existing active conversations first (any guild)
    let adminGuild: { id: string; name: string } | null = null;
    for (const guild of adminGuilds) {
      if (await questCreation.hasActiveConversation(userId, guild.id)) {
        adminGuild = guild;
        break;
      }
    }

    // If no active conversation and multiple guilds, prompt for selection
    const isTrigger = questCreation.shouldTriggerQuestCreation(message.content);
    if (!adminGuild && adminGuilds.length > 1 && isTrigger) {
      await message.reply(
        `You have admin access to multiple servers:\n` +
        adminGuilds.map((g, i) => `**${i + 1}.** ${g.name}`).join('\n') +
        `\n\nPlease reply with the number of the server where you want to create a quest.`
      );
      return;
    }

    // Handle server selection response (just a number)
    if (!adminGuild && adminGuilds.length > 1) {
      const selection = parseInt(message.content.trim(), 10);
      if (selection >= 1 && selection <= adminGuilds.length) {
        adminGuild = adminGuilds[selection - 1];
      }
    }

    // Default to first/only guild if still not selected
    if (!adminGuild) {
      adminGuild = adminGuilds[0];
    }

    // Check if this is a quest creation trigger or continuation
    const hasActiveConvo = await questCreation.hasActiveConversation(userId, adminGuild.id);

    if (!hasActiveConvo && !isTrigger) {
      // Not in quest creation mode and not triggering it
      await message.reply(
        `Hi! I can help you create quests for **${adminGuild.name}**.\n\n` +
        `To get started, say "create a quest" or "new quest".\n\n` +
        `For other commands, use slash commands in your server:\n` +
        `• \`/quest\` - Get assigned a quest\n` +
        `• \`/confirm\` - Verify quest completion\n` +
        `• \`/xp\` - View your XP progress`
      );
      return;
    }

    // Show typing indicator
    if ('sendTyping' in message.channel) {
      await message.channel.sendTyping();
    }

    // Handle quest creation
    let response: string | null;
    const guild = await message.client.guilds.fetch(adminGuild.id);
    if (!hasActiveConvo && isTrigger) {
      // Start new quest creation
      response = questCreation.getQuestCreationIntro();
      // Initialize conversation
      await questCreation.handleQuestCreationMessage(message, guild, 'start quest creation');
    } else {
      // Continue existing conversation
      response = await questCreation.handleQuestCreationMessage(message, guild);
    }

    if (response) {
      // Split long messages if needed (Discord limit is 2000 chars)
      if (response.length > 2000) {
        const chunks = splitMessage(response, 2000);
        for (const chunk of chunks) {
          await message.reply(chunk);
        }
      } else {
        await message.reply(response);
      }
    }

    logger.info('DM quest creation message handled', { userId, guildId: adminGuild.id });
  } catch (error) {
    logger.error('Error handling DM message', { userId, error });
    await message.reply('Sorry, something went wrong. Please try again.');
  }
}

/**
 * Handle when bot is mentioned in a guild channel
 */
async function handleBotMention(message: Message): Promise<void> {
  if (!message.guild) return;

  const userId = message.author.id;
  const guildId = message.guild.id;

  try {
    // Check admin permissions
    const member = message.member;
    if (!member || !(await questCreation.hasAdminPermissions(member))) {
      // Still ingest the message but don't respond to quest creation
      await ingestMessage(message);
      return;
    }

    // Remove the bot mention from the content
    const content = message.content
      .replace(/<@!?\d+>/g, '')
      .trim();

    // Check if this is quest-related
    const hasActiveConvo = await questCreation.hasActiveConversation(userId, guildId);
    const isTrigger = questCreation.shouldTriggerQuestCreation(content);

    if (!hasActiveConvo && !isTrigger) {
      // Just mentioned, not for quest creation
      await ingestMessage(message);
      await message.reply(
        `Hi! I can help you create quests. Say "create a quest" to get started, or DM me for a quieter experience.`
      );
      return;
    }

    // Show typing indicator
    if ('sendTyping' in message.channel) {
      await message.channel.sendTyping();
    }

    // Handle quest creation
    let response: string | null;

    if (!hasActiveConvo && isTrigger) {
      response = questCreation.getQuestCreationIntro();
      await questCreation.handleQuestCreationMessage(
        message,
        message.guild,
        'start quest creation'
      );
    } else {
      // Pass cleaned content (with bot mention removed)
      response = await questCreation.handleQuestCreationMessage(message, message.guild, content);
    }

    if (response) {
      if (response.length > 2000) {
        const chunks = splitMessage(response, 2000);
        for (const chunk of chunks) {
          await message.reply(chunk);
        }
      } else {
        await message.reply(response);
      }
    }

    // Also ingest the message
    await ingestMessage(message);

    logger.info('Bot mention quest creation handled', { userId, guildId });
  } catch (error) {
    logger.error('Error handling bot mention', { userId, guildId, error });
    await message.reply('Sorry, something went wrong. Please try again.');
  }
}

/**
 * Split a message into chunks respecting word boundaries
 */
function splitMessage(text: string, maxLength: number): string[] {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    let splitIndex = remaining.lastIndexOf('\n', maxLength);
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      splitIndex = remaining.lastIndexOf(' ', maxLength);
    }
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      splitIndex = maxLength;
    }

    chunks.push(remaining.substring(0, splitIndex));
    remaining = remaining.substring(splitIndex).trim();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}
