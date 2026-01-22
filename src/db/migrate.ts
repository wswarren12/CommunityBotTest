#!/usr/bin/env node

import * as dotenv from 'dotenv';
import { initializeDatabase, closeDatabase, getPool } from './connection';
import { logger } from '../utils/logger';
import * as migration001 from './migrations/001_initial_schema';
import * as migration002 from './migrations/002_quest_schema';
import * as migration003 from './migrations/003_mcp_connector_integration';
import * as migration004 from './migrations/004_fix_quest_conversations_constraint';
import * as migration005 from './migrations/005_discord_native_verification';
import * as migration006 from './migrations/006_quest_tasks_schema';

// Load environment variables
dotenv.config();

interface Migration {
  name: string;
  up: () => Promise<void>;
  down: () => Promise<void>;
}

// List of migrations in order
const migrations: Migration[] = [
  {
    name: '001_initial_schema',
    up: migration001.up,
    down: migration001.down,
  },
  {
    name: '002_quest_schema',
    up: async () => migration002.up(getPool()),
    down: async () => migration002.down(getPool()),
  },
  {
    name: '003_mcp_connector_integration',
    up: async () => migration003.up(getPool()),
    down: async () => migration003.down(getPool()),
  },
  {
    name: '004_fix_quest_conversations_constraint',
    up: async () => migration004.up(getPool()),
    down: async () => migration004.down(getPool()),
  },
  {
    name: '005_discord_native_verification',
    up: async () => migration005.up(getPool()),
    down: async () => migration005.down(getPool()),
  },
  {
    name: '006_quest_tasks_schema',
    up: async () => migration006.up(getPool()),
    down: async () => migration006.down(getPool()),
  },
];

/**
 * Run all pending migrations
 */
async function migrateUp(): Promise<void> {
  logger.info('Starting database migration...');

  for (const migration of migrations) {
    try {
      logger.info(`Running migration: ${migration.name}`);
      await migration.up();
      logger.info(`Migration ${migration.name} completed`);
    } catch (error) {
      logger.error(`Migration ${migration.name} failed`, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  logger.info('All migrations completed successfully');
}

/**
 * Rollback the last migration
 */
async function migrateDown(): Promise<void> {
  logger.info('Rolling back last migration...');

  const lastMigration = migrations[migrations.length - 1];

  if (!lastMigration) {
    logger.warn('No migrations to roll back');
    return;
  }

  try {
    logger.info(`Rolling back migration: ${lastMigration.name}`);
    await lastMigration.down();
    logger.info(`Migration ${lastMigration.name} rolled back successfully`);
  } catch (error) {
    logger.error(`Failed to roll back migration ${lastMigration.name}`, {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Main migration runner
 */
async function main(): Promise<void> {
  const command = process.argv[2] || 'up';

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  try {
    // Initialize database connection
    initializeDatabase(process.env.DATABASE_URL);

    // Run migration command
    switch (command) {
      case 'up':
        await migrateUp();
        break;
      case 'down':
        await migrateDown();
        break;
      default:
        logger.error(`Unknown migration command: ${command}`);
        logger.info('Usage: npm run migrate [up|down]');
        process.exit(1);
    }
  } catch (error) {
    logger.error('Migration failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    process.exit(1);
  } finally {
    await closeDatabase();
  }
}

// Run migrations if this file is executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { migrateUp, migrateDown };
