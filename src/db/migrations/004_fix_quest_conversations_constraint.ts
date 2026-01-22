/**
 * Migration: Fix quest_conversations unique constraint
 * Adds unique constraint on (user_id, guild_id) for proper upsert behavior
 */

import { Pool } from 'pg';

export const name = '004_fix_quest_conversations_constraint';

export async function up(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // First, clean up any duplicate conversations (keep the most recent one)
    await client.query(`
      DELETE FROM quest_conversations a
      USING quest_conversations b
      WHERE a.user_id = b.user_id
        AND a.guild_id = b.guild_id
        AND a.created_at < b.created_at
    `);

    // Add unique constraint on (user_id, guild_id) - drop first if exists
    await client.query(`
      ALTER TABLE quest_conversations
      DROP CONSTRAINT IF EXISTS quest_conversations_user_guild_unique
    `);
    await client.query(`
      ALTER TABLE quest_conversations
      ADD CONSTRAINT quest_conversations_user_guild_unique
      UNIQUE (user_id, guild_id)
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function down(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Drop the unique constraint
    await client.query(`
      ALTER TABLE quest_conversations
      DROP CONSTRAINT IF EXISTS quest_conversations_user_guild_unique
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
