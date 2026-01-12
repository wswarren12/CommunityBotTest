import { Client, GatewayIntentBits, Partials, ActivityType } from 'discord.js';
import { logger } from '../utils/logger';

/**
 * Create and configure the Discord client
 */
export function createClient(): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent, // Required for reading message content
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildScheduledEvents,
    ],
    partials: [Partials.Channel, Partials.Message],
  });

  // Log when client is ready
  client.once('ready', (c) => {
    logger.info(`Discord bot logged in as ${c.user.tag}`, {
      userId: c.user.id,
      guilds: c.guilds.cache.size,
    });

    // Set bot status
    c.user.setActivity('/catchup for summaries', { type: ActivityType.Listening });
  });

  return client;
}

/**
 * Login to Discord
 */
export async function loginClient(client: Client, token: string): Promise<void> {
  try {
    await client.login(token);
    logger.info('Discord client logged in successfully');
  } catch (error) {
    logger.error('Failed to login to Discord', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Gracefully shutdown the Discord client
 */
export async function shutdownClient(client: Client): Promise<void> {
  logger.info('Shutting down Discord client...');
  client.destroy();
  logger.info('Discord client shut down');
}
