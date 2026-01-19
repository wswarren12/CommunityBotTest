/**
 * Migration: Quest System Schema
 * Adds tables for quests, user quest assignments, and XP tracking
 */

import { Pool } from 'pg';

export const name = '002_quest_schema';

export async function up(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Quests table: Store quest definitions created by admins
    await client.query(`
      CREATE TABLE IF NOT EXISTS quests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        guild_id VARCHAR(20) NOT NULL,
        name VARCHAR(100) NOT NULL,
        description TEXT NOT NULL,
        xp_reward INTEGER NOT NULL CHECK (xp_reward > 0 AND xp_reward <= 10000),
        verification_type VARCHAR(30) NOT NULL CHECK (verification_type IN ('email', 'discord_id', 'wallet_address', 'twitter_handle')),
        api_endpoint TEXT NOT NULL,
        api_method VARCHAR(10) DEFAULT 'GET',
        api_headers JSONB DEFAULT '{}',
        api_params JSONB DEFAULT '{}',
        success_condition JSONB DEFAULT '{"field": "balance", "operator": ">", "value": 0}',
        user_input_description VARCHAR(200),
        active BOOLEAN DEFAULT true,
        max_completions INTEGER,
        total_completions INTEGER DEFAULT 0,
        created_by VARCHAR(20) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // User quests table: Track quest assignments and completions
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_quests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(20) NOT NULL,
        guild_id VARCHAR(20) NOT NULL,
        quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'completed', 'failed', 'expired')),
        assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        completed_at TIMESTAMP WITH TIME ZONE,
        verification_identifier TEXT,
        verification_attempts INTEGER DEFAULT 0,
        xp_awarded INTEGER DEFAULT 0,
        failure_reason TEXT
      )
    `);

    // User XP table: Aggregate XP tracking per user per guild
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_xp (
        user_id VARCHAR(20) NOT NULL,
        guild_id VARCHAR(20) NOT NULL,
        total_xp INTEGER DEFAULT 0,
        quests_completed INTEGER DEFAULT 0,
        last_quest_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        PRIMARY KEY (user_id, guild_id)
      )
    `);

    // Quest creation conversations: Track ongoing admin conversations for quest building
    await client.query(`
      CREATE TABLE IF NOT EXISTS quest_conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(20) NOT NULL,
        guild_id VARCHAR(20) NOT NULL,
        channel_id VARCHAR(20),
        conversation_state JSONB DEFAULT '{}',
        messages JSONB DEFAULT '[]',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '1 hour'
      )
    `);

    // Indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quests_guild_active ON quests(guild_id, active);
      CREATE INDEX IF NOT EXISTS idx_quests_created_by ON quests(created_by);
      CREATE INDEX IF NOT EXISTS idx_user_quests_user_status ON user_quests(user_id, guild_id, status);
      CREATE INDEX IF NOT EXISTS idx_user_quests_quest ON user_quests(quest_id);
      CREATE INDEX IF NOT EXISTS idx_user_quests_assigned ON user_quests(assigned_at DESC);
      CREATE INDEX IF NOT EXISTS idx_user_xp_leaderboard ON user_xp(guild_id, total_xp DESC);
      CREATE INDEX IF NOT EXISTS idx_quest_conversations_user ON quest_conversations(user_id, guild_id);
      CREATE INDEX IF NOT EXISTS idx_quest_conversations_expires ON quest_conversations(expires_at);
    `);

    // Triggers for updated_at
    await client.query(`
      CREATE TRIGGER update_quests_updated_at BEFORE UPDATE ON quests
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);

    await client.query(`
      CREATE TRIGGER update_user_xp_updated_at BEFORE UPDATE ON user_xp
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);

    await client.query(`
      CREATE TRIGGER update_quest_conversations_updated_at BEFORE UPDATE ON quest_conversations
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
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

    // Drop triggers first
    await client.query('DROP TRIGGER IF EXISTS update_quests_updated_at ON quests');
    await client.query('DROP TRIGGER IF EXISTS update_user_xp_updated_at ON user_xp');
    await client.query('DROP TRIGGER IF EXISTS update_quest_conversations_updated_at ON quest_conversations');

    // Drop tables (order matters due to foreign keys)
    await client.query('DROP TABLE IF EXISTS quest_conversations');
    await client.query('DROP TABLE IF EXISTS user_xp');
    await client.query('DROP TABLE IF EXISTS user_quests');
    await client.query('DROP TABLE IF EXISTS quests');

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
