import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../connection';
import { logger } from '../../utils/logger';

/**
 * Migration: Initial database schema
 * Creates all tables, indexes, triggers, and views
 */
export async function up(): Promise<void> {
  try {
    logger.info('Running migration: 001_initial_schema');

    // Read the schema SQL file
    const schemaPath = join(__dirname, '..', 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');

    // Execute the schema
    await query(schema);

    logger.info('Migration 001_initial_schema completed successfully');
  } catch (error) {
    logger.error('Migration 001_initial_schema failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Rollback: Drop all tables and related objects
 */
export async function down(): Promise<void> {
  try {
    logger.info('Rolling back migration: 001_initial_schema');

    await query(`
      -- Drop views
      DROP VIEW IF EXISTS channel_activity;
      DROP VIEW IF EXISTS user_stats;

      -- Drop function
      DROP FUNCTION IF EXISTS cleanup_old_messages();
      DROP FUNCTION IF EXISTS update_updated_at_column();

      -- Drop tables (in reverse order of dependencies)
      DROP TABLE IF EXISTS summaries;
      DROP TABLE IF EXISTS events;
      DROP TABLE IF EXISTS user_activity;
      DROP TABLE IF EXISTS messages;
      DROP TABLE IF EXISTS channels;
      DROP TABLE IF EXISTS users;
    `);

    logger.info('Migration 001_initial_schema rolled back successfully');
  } catch (error) {
    logger.error('Migration 001_initial_schema rollback failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}
