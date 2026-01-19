/**
 * Migration: MCP Connector Integration
 * Adds connector_id and related fields to quests table for MCP integration
 */

import { Pool } from 'pg';

export const name = '003_mcp_connector_integration';

export async function up(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Add connector-related columns to quests table
    await client.query(`
      ALTER TABLE quests
      ADD COLUMN IF NOT EXISTS connector_id INTEGER,
      ADD COLUMN IF NOT EXISTS connector_name VARCHAR(100),
      ADD COLUMN IF NOT EXISTS api_key_env_var VARCHAR(100),
      ADD COLUMN IF NOT EXISTS user_input_placeholder VARCHAR(50)
    `);

    // Make api_endpoint nullable since MCP-based quests won't need it
    await client.query(`
      ALTER TABLE quests
      ALTER COLUMN api_endpoint DROP NOT NULL
    `);

    // Add index for connector lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quests_connector_id ON quests(connector_id)
      WHERE connector_id IS NOT NULL
    `);

    // Add comment explaining the migration
    await client.query(`
      COMMENT ON COLUMN quests.connector_id IS 'MCP Quest Builder connector ID for validation';
    `);
    await client.query(`
      COMMENT ON COLUMN quests.connector_name IS 'Human-readable connector name from MCP';
    `);
    await client.query(`
      COMMENT ON COLUMN quests.api_key_env_var IS 'Environment variable name containing API key';
    `);
    await client.query(`
      COMMENT ON COLUMN quests.user_input_placeholder IS 'MCP placeholder for user input e.g. {{walletAddress}}';
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

    // Remove the index
    await client.query('DROP INDEX IF EXISTS idx_quests_connector_id');

    // Remove the columns
    await client.query(`
      ALTER TABLE quests
      DROP COLUMN IF EXISTS connector_id,
      DROP COLUMN IF EXISTS connector_name,
      DROP COLUMN IF EXISTS api_key_env_var,
      DROP COLUMN IF EXISTS user_input_placeholder
    `);

    // Make api_endpoint required again
    await client.query(`
      ALTER TABLE quests
      ALTER COLUMN api_endpoint SET NOT NULL
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
