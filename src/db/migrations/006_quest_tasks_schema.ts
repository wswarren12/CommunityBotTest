/**
 * Migration: Quest Tasks Schema
 * Adds support for quests with multiple tasks, matching Summon MCP data model
 */

import { Pool } from 'pg';

export const name = '006_quest_tasks_schema';

export async function up(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Add summon_quest_id to quests table to reference Summon MCP quest
    await client.query(`
      ALTER TABLE quests
      ADD COLUMN IF NOT EXISTS summon_quest_id INTEGER,
      ADD COLUMN IF NOT EXISTS summon_status VARCHAR(20) DEFAULT 'DRAFT'
        CHECK (summon_status IN ('LIVE', 'DRAFT', 'READY', 'ARCHIVED', 'SCHEDULED', 'ENDED', 'PAUSED'))
    `);

    // Create quest_tasks table
    await client.query(`
      CREATE TABLE IF NOT EXISTS quest_tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
        summon_task_id INTEGER,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        points INTEGER DEFAULT 0 CHECK (points >= 0),
        connector_id INTEGER,
        connector_name VARCHAR(100),
        verification_type VARCHAR(30) CHECK (verification_type IN (
          'email', 'discord_id', 'wallet_address', 'twitter_handle',
          'discord_role', 'discord_message_count', 'discord_reaction_count', 'discord_poll_count'
        )),
        user_input_placeholder VARCHAR(50),
        user_input_description VARCHAR(200),
        discord_verification_config JSONB,
        max_completions INTEGER,
        max_completions_per_day INTEGER,
        position INTEGER NOT NULL DEFAULT 0,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Create user_task_completions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_task_completions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(20) NOT NULL,
        guild_id VARCHAR(20) NOT NULL,
        task_id UUID NOT NULL REFERENCES quest_tasks(id) ON DELETE CASCADE,
        quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
        completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        xp_awarded INTEGER DEFAULT 0,
        verification_identifier TEXT,
        UNIQUE(user_id, task_id)
      )
    `);

    // Indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quests_summon_quest_id ON quests(summon_quest_id) WHERE summon_quest_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_quest_tasks_quest_id ON quest_tasks(quest_id);
      CREATE INDEX IF NOT EXISTS idx_quest_tasks_connector_id ON quest_tasks(connector_id) WHERE connector_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_quest_tasks_position ON quest_tasks(quest_id, position);
      CREATE INDEX IF NOT EXISTS idx_user_task_completions_user ON user_task_completions(user_id, guild_id);
      CREATE INDEX IF NOT EXISTS idx_user_task_completions_task ON user_task_completions(task_id);
      CREATE INDEX IF NOT EXISTS idx_user_task_completions_quest ON user_task_completions(quest_id);
    `);

    // Trigger for quest_tasks updated_at
    await client.query(`DROP TRIGGER IF EXISTS update_quest_tasks_updated_at ON quest_tasks`);
    await client.query(`
      CREATE TRIGGER update_quest_tasks_updated_at BEFORE UPDATE ON quest_tasks
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);

    // Comments for documentation
    await client.query(`
      COMMENT ON TABLE quest_tasks IS 'Individual tasks within a quest - each task can have its own connector and points';
    `);
    await client.query(`
      COMMENT ON COLUMN quests.summon_quest_id IS 'Quest ID from Summon MCP - links local quest to Summon system';
    `);
    await client.query(`
      COMMENT ON COLUMN quests.summon_status IS 'Quest status in Summon MCP (LIVE, DRAFT, READY, etc.)';
    `);
    await client.query(`
      COMMENT ON COLUMN quest_tasks.summon_task_id IS 'Task ID from Summon MCP';
    `);
    await client.query(`
      COMMENT ON COLUMN quest_tasks.connector_id IS 'MCP connector ID for validating task completion';
    `);
    await client.query(`
      COMMENT ON COLUMN quest_tasks.position IS 'Order of task within the quest (0-indexed)';
    `);
    await client.query(`
      COMMENT ON TABLE user_task_completions IS 'Tracks which users have completed which tasks';
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

    // Drop trigger
    await client.query('DROP TRIGGER IF EXISTS update_quest_tasks_updated_at ON quest_tasks');

    // Drop tables (order matters due to foreign keys)
    await client.query('DROP TABLE IF EXISTS user_task_completions');
    await client.query('DROP TABLE IF EXISTS quest_tasks');

    // Remove columns from quests
    await client.query(`
      ALTER TABLE quests
      DROP COLUMN IF EXISTS summon_quest_id,
      DROP COLUMN IF EXISTS summon_status
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
