import { Client, REST, Routes, SlashCommandBuilder } from 'discord.js';
import { logger } from '../utils/logger';

/**
 * Define all slash commands
 */
const commands = [
  new SlashCommandBuilder()
    .setName('catchup')
    .setDescription('Get a personalized summary of activity since your last message')
    .addStringOption((option) =>
      option
        .setName('timeframe')
        .setDescription('Custom timeframe (e.g., "1h", "6h", "1d")')
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('quest')
    .setDescription('Get a quest assigned to you and earn XP!')
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName('confirm')
    .setDescription('Confirm your quest completion')
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName('identifier')
        .setDescription('Your email, wallet address, Twitter handle, or other verification info')
        .setRequired(true)
        .setMaxLength(200)
    ),
  new SlashCommandBuilder()
    .setName('xp')
    .setDescription('View your XP and completed quests')
    .setDMPermission(false),
].map((command) => command.toJSON());

/**
 * Register slash commands with Discord
 */
export async function registerCommands(client: Client): Promise<void> {
  if (!client.user) {
    throw new Error('Client user is null');
  }

  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;

  if (!token || !clientId) {
    throw new Error('Missing DISCORD_TOKEN or DISCORD_CLIENT_ID environment variables');
  }

  const rest = new REST({ version: '10' }).setToken(token);

  try {
    logger.info('Started refreshing application (/) commands');

    // Register commands globally
    await rest.put(Routes.applicationCommands(clientId), { body: commands });

    logger.info(`Successfully registered ${commands.length} application (/) commands`);
  } catch (error) {
    logger.error('Failed to register commands', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Unregister all commands (useful for cleanup)
 */
export async function unregisterCommands(): Promise<void> {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;

  if (!token || !clientId) {
    throw new Error('Missing DISCORD_TOKEN or DISCORD_CLIENT_ID environment variables');
  }

  const rest = new REST({ version: '10' }).setToken(token);

  try {
    logger.info('Unregistering all application (/) commands');

    await rest.put(Routes.applicationCommands(clientId), { body: [] });

    logger.info('Successfully unregistered all commands');
  } catch (error) {
    logger.error('Failed to unregister commands', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}
