/**
 * Migration: Discord Native Verification Support
 * Adds support for Discord-native quest verification (roles, message counts, reactions, polls)
 */

import { Pool } from 'pg';

export const name = '005_discord_native_verification';

export async function up(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Add discord_verification_config column to quests table
    await client.query(`
      ALTER TABLE quests
      ADD COLUMN IF NOT EXISTS discord_verification_config JSONB DEFAULT NULL
    `);

    // Update the verification_type check constraint to include new Discord types
    // First drop the existing constraint
    await client.query(`
      ALTER TABLE quests
      DROP CONSTRAINT IF EXISTS quests_verification_type_check
    `);

    // Add the new constraint with Discord-native types
    await client.query(`
      ALTER TABLE quests
      ADD CONSTRAINT quests_verification_type_check
      CHECK (verification_type IN (
        'email',
        'discord_id',
        'wallet_address',
        'twitter_handle',
        'discord_role',
        'discord_message_count',
        'discord_reaction_count',
        'discord_poll_count'
      ))
    `);

    // Add comment explaining the discord_verification_config column
    await client.query(`
      COMMENT ON COLUMN quests.discord_verification_config IS
        'JSON config for Discord-native verification: roleId, roleName, threshold, operator, sinceDays, channelId'
    `);

    // Create a table to track message reactions (for discord_reaction_count verification)
    await client.query(`
      CREATE TABLE IF NOT EXISTS message_reactions (
        id SERIAL PRIMARY KEY,
        message_id VARCHAR(20) NOT NULL,
        channel_id VARCHAR(20) NOT NULL,
        guild_id VARCHAR(20) NOT NULL,
        author_id VARCHAR(20) NOT NULL,
        reactor_id VARCHAR(20) NOT NULL,
        emoji VARCHAR(100) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(message_id, reactor_id, emoji)
      )
    `);

    // Create indexes for message_reactions
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_message_reactions_author ON message_reactions(author_id, guild_id);
      CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON message_reactions(message_id);
      CREATE INDEX IF NOT EXISTS idx_message_reactions_guild ON message_reactions(guild_id, created_at DESC);
    `);

    // Create a table to track polls (for discord_poll_count verification)
    await client.query(`
      CREATE TABLE IF NOT EXISTS polls (
        id SERIAL PRIMARY KEY,
        message_id VARCHAR(20) NOT NULL UNIQUE,
        channel_id VARCHAR(20) NOT NULL,
        guild_id VARCHAR(20) NOT NULL,
        creator_id VARCHAR(20) NOT NULL,
        question TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Create indexes for polls
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_polls_creator ON polls(creator_id, guild_id);
      CREATE INDEX IF NOT EXISTS idx_polls_guild ON polls(guild_id, created_at DESC);
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

    // First, deactivate any quests with Discord-native verification types
    // This prevents data corruption when removing the verification types
    const deactivatedResult = await client.query(`
      UPDATE quests
      SET active = false,
          updated_at = NOW()
      WHERE verification_type IN (
        'discord_role', 'discord_message_count',
        'discord_reaction_count', 'discord_poll_count'
      )
      RETURNING id, name, verification_type
    `);

    // Log deactivated quests for manual review (console.log since logger may not be available)
    if (deactivatedResult.rowCount && deactivatedResult.rowCount > 0) {
      console.warn(
        `[Migration 005 Rollback] Deactivated ${deactivatedResult.rowCount} quests with Discord-native verification:`,
        deactivatedResult.rows.map(r => ({ id: r.id, name: r.name, type: r.verification_type }))
      );
    }

    // Now update these quests to use a fallback verification type
    // This is necessary because removing the constraint would fail otherwise
    await client.query(`
      UPDATE quests
      SET verification_type = 'email'
      WHERE verification_type IN (
        'discord_role', 'discord_message_count',
        'discord_reaction_count', 'discord_poll_count'
      )
    `);

    // Drop the new tables
    await client.query('DROP TABLE IF EXISTS polls');
    await client.query('DROP TABLE IF EXISTS message_reactions');

    // Remove the discord_verification_config column
    await client.query(`
      ALTER TABLE quests
      DROP COLUMN IF EXISTS discord_verification_config
    `);

    // Restore the original verification_type constraint
    await client.query(`
      ALTER TABLE quests
      DROP CONSTRAINT IF EXISTS quests_verification_type_check
    `);

    await client.query(`
      ALTER TABLE quests
      ADD CONSTRAINT quests_verification_type_check
      CHECK (verification_type IN ('email', 'discord_id', 'wallet_address', 'twitter_handle'))
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
