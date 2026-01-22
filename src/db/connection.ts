import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { logger } from '../utils/logger';
import { hashQueryForLogs } from '../utils/sanitization';

let pool: Pool | null = null;

/**
 * Initialize the PostgreSQL connection pool
 */
export async function initializeDatabase(connectionString: string): Promise<Pool> {
  if (pool) {
    logger.warn('Database pool already initialized');
    return pool;
  }

  pool = new Pool({
    connectionString,
    max: 20, // Maximum number of clients in the pool
    min: 2, // Maintain minimum 2 connections
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 10000, // Return error after 10 seconds if cannot connect
    allowExitOnIdle: true, // Allow process to exit if all connections idle
  });

  // Handle pool errors
  pool.on('error', (err) => {
    logger.error('Unexpected error on idle PostgreSQL client', err);
  });

  // Test the connection with async/await
  try {
    const result = await pool.query('SELECT NOW()');
    logger.info('Database connection established', { timestamp: result.rows[0].now });
  } catch (err) {
    logger.error('Failed to connect to database', err);
    throw err;
  }

  return pool;
}

/**
 * Get the database pool instance
 */
export function getPool(): Pool {
  if (!pool) {
    throw new Error('Database pool not initialized. Call initializeDatabase() first.');
  }
  return pool;
}

/**
 * Execute a query on the database
 */
export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const pool = getPool();
  const start = Date.now();

  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;

    logger.debug('Executed query', {
      queryHash: hashQueryForLogs(text),
      paramCount: params?.length ?? 0,
      duration: `${duration}ms`,
      rows: result.rowCount,
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Query error', {
      queryHash: hashQueryForLogs(text),
      paramCount: params?.length ?? 0,
      error: errorMessage,
    });
    throw error;
  }
}

/**
 * Get a client from the pool for transaction handling
 */
export async function getClient(): Promise<PoolClient> {
  const pool = getPool();
  return await pool.connect();
}

/**
 * Execute a transaction with proper rollback verification
 */
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getClient();
  let clientReleased = false;

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    // Attempt rollback with error handling
    try {
      await client.query('ROLLBACK');
      logger.error('Transaction rolled back successfully', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } catch (rollbackError) {
      // Rollback failed - connection may be dead
      // Log both errors for debugging
      logger.error('Transaction rollback failed - connection may be compromised', {
        originalError: error instanceof Error ? error.message : 'Unknown error',
        rollbackError: rollbackError instanceof Error ? rollbackError.message : 'Unknown rollback error',
      });
      // Force destroy the connection to prevent reuse of a potentially bad connection
      client.release(true); // true = destroy the client
      clientReleased = true;
      throw error; // Re-throw original error
    }
    throw error;
  } finally {
    // Release client back to pool only if not already destroyed
    if (!clientReleased) {
      client.release();
    }
  }
}

/**
 * Close the database pool
 */
export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database connection pool closed');
  }
}

/**
 * Run cleanup tasks (30-day message retention)
 */
export async function runCleanup(): Promise<number> {
  try {
    const result = await query<{ deleted_count: number }>(
      'SELECT cleanup_old_messages() as deleted_count'
    );
    const deletedCount = result.rows[0]?.deleted_count ?? 0;
    logger.info('Database cleanup completed', { deletedMessages: deletedCount });
    return deletedCount;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Database cleanup failed', { error: errorMessage });
    throw error;
  }
}

/**
 * Check database health
 */
export async function healthCheck(): Promise<boolean> {
  try {
    await query('SELECT 1');
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Database health check failed', { error: errorMessage });
    return false;
  }
}
