#!/usr/bin/env node

// Load environment variables FIRST before any other imports
import * as dotenv from 'dotenv';
dotenv.config();

import { Client } from 'discord.js';
import { createClient, loginClient, shutdownClient } from './bot/client';
import { initializeDatabase, closeDatabase, runCleanup } from './db/connection';
import { logger } from './utils/logger';
import { handleReady } from './bot/events/ready';
import { handleMessageCreate } from './bot/events/messageCreate';
import { handleInteractionCreate } from './bot/events/interactionCreate';
import { syncDiscordEvents, detectEventsFromMessages } from './services/eventService';
import { testConnection } from './services/aiService';
import { startCacheCleanup, stopCacheCleanup } from './commands/catchup';
import { startRateLimitCleanup, stopRateLimitCleanup } from './utils/rateLimiter';
import { startQuestRateLimitCleanup, stopQuestRateLimitCleanup } from './services/questService';
import { mcpClient } from './services/mcpClient';

/**
 * Main application entry point
 */
async function main() {
  logger.info('Starting Discord Community Bot...');

  // Validate required environment variables
  validateEnvironment();

  try {
    // Initialize database
    const databaseUrl = process.env.DATABASE_URL!;
    await initializeDatabase(databaseUrl);
    logger.info('Database initialized');

    // Test Claude API connection
    const claudeConnected = await testConnection();
    if (!claudeConnected) {
      logger.warn('Claude API connection test failed - bot will start but AI features may not work');
    }

    // Create Discord client
    const client = createClient();

    // Register event handlers
    client.once('ready', async (c) => {
      await handleReady(c);

      // Sync Discord events for all guilds
      for (const [, guild] of c.guilds.cache) {
        await syncDiscordEvents(guild);
      }

      // Start background tasks
      startBackgroundTasks(c);
    });

    client.on('messageCreate', handleMessageCreate);
    client.on('interactionCreate', handleInteractionCreate);

    // Handle scheduled events
    client.on('guildScheduledEventCreate', async (event) => {
      logger.info('Discord event created', { eventId: event.id, eventName: event.name });
      if (event.guild) {
        await syncDiscordEvents(event.guild);
      }
    });

    client.on('guildScheduledEventUpdate', async (_oldEvent, newEvent) => {
      logger.info('Discord event updated', { eventId: newEvent.id, eventName: newEvent.name });
      if (newEvent.guild) {
        await syncDiscordEvents(newEvent.guild);
      }
    });

    // Handle errors
    client.on('error', (error) => {
      logger.error('Discord client error', {
        error: error.message,
        stack: error.stack,
      });
    });

    process.on('unhandledRejection', (reason) => {
      const errorMessage = reason instanceof Error ? reason.message : String(reason);
      const stack = reason instanceof Error ? reason.stack : undefined;
      logger.error('Unhandled promise rejection', { reason: errorMessage, stack });
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', { error: error.message, stack: error.stack });
      gracefulShutdown(client);
    });

    // Handle shutdown signals
    process.on('SIGINT', () => {
      logger.info('SIGINT received, shutting down gracefully...');
      gracefulShutdown(client);
    });

    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully...');
      gracefulShutdown(client);
    });

    // Login to Discord
    const token = process.env.DISCORD_TOKEN!;
    await loginClient(client, token);

    logger.info('Discord Community Bot started successfully');
  } catch (error) {
    logger.error('Failed to start bot', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

/**
 * Validate required environment variables
 */
function validateEnvironment(): void {
  const required = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'ANTHROPIC_API_KEY', 'DATABASE_URL'];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    logger.error('Missing required environment variables', { missing });
    console.error('\nMissing required environment variables:');
    missing.forEach((key) => console.error(`  - ${key}`));
    console.error('\nPlease check your .env file.');
    process.exit(1);
  }
}

// Background task interval IDs for cleanup
let cleanupIntervalId: NodeJS.Timeout | null = null;
let eventDetectionIntervalId: NodeJS.Timeout | null = null;

/**
 * Start background tasks
 */
function startBackgroundTasks(client: Client): void {
  const cleanupIntervalHours = parseInt(process.env.CLEANUP_INTERVAL_HOURS || '24', 10);
  const cleanupIntervalMs = cleanupIntervalHours * 60 * 60 * 1000;
  const eventDetectionIntervalMs = 6 * 60 * 60 * 1000;

  // Cleanup task wrapper
  const runCleanupTask = async () => {
    logger.info('Running scheduled database cleanup...');
    try {
      await runCleanup();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Scheduled cleanup failed', { error: errorMessage });
    }
  };

  // Event detection task wrapper
  const runEventDetectionTask = async () => {
    logger.info('Running scheduled event detection...');
    try {
      for (const [, guild] of client.guilds.cache) {
        await detectEventsFromMessages(guild.id, 24);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Scheduled event detection failed', { error: errorMessage });
    }
  };

  // Run tasks immediately, then schedule
  runCleanupTask();
  runEventDetectionTask();

  // Store interval IDs for cleanup
  cleanupIntervalId = setInterval(runCleanupTask, cleanupIntervalMs);
  eventDetectionIntervalId = setInterval(runEventDetectionTask, eventDetectionIntervalMs);

  // Start cache cleanup and rate limit cleanup
  startCacheCleanup();
  startRateLimitCleanup();
  startQuestRateLimitCleanup();

  logger.info('Background tasks started', {
    cleanupInterval: `${cleanupIntervalHours} hours`,
    eventDetectionInterval: '6 hours',
  });
}

/**
 * Stop background tasks
 */
async function stopBackgroundTasks(): Promise<void> {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }
  if (eventDetectionIntervalId) {
    clearInterval(eventDetectionIntervalId);
    eventDetectionIntervalId = null;
  }
  stopCacheCleanup();
  stopRateLimitCleanup();
  stopQuestRateLimitCleanup();

  // Disconnect MCP client
  await mcpClient.disconnect();

  logger.info('Background tasks stopped');
}

/**
 * Graceful shutdown
 */
async function gracefulShutdown(client: Client): Promise<void> {
  logger.info('Starting graceful shutdown...');

  try {
    // Stop background tasks first
    await stopBackgroundTasks();

    await shutdownClient(client);
    await closeDatabase();
    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error during shutdown', { error: errorMessage });
    process.exit(1);
  }
}

// Start the bot
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { main };
