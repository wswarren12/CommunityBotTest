import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { logger } from '../utils/logger';

let pool: Pool | null = null;

/**
 * Initialize the PostgreSQL connection pool
 */
export function initializeDatabase(connectionString: string): Pool {
  if (pool) {
    logger.warn('Database pool already initialized');
    return pool;
  }

  pool = new Pool({
    connectionString,
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 10000, // Return error after 10 seconds if cannot connect
  });

  // Handle pool errors
  pool.on('error', (err) => {
    logger.error('Unexpected error on idle PostgreSQL client', err);
  });

  // Test the connection
  pool.query('SELECT NOW()', (err, result) => {
    if (err) {
      logger.error('Failed to connect to database', err);
      throw err;
    }
    logger.info('Database connection established', { timestamp: result.rows[0].now });
  });

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
  params?: any[]
): Promise<QueryResult<T>> {
  const pool = getPool();
  const start = Date.now();

  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;

    logger.debug('Executed query', {
      query: text.substring(0, 100),
      duration: `${duration}ms`,
      rows: result.rowCount,
    });

    return result;
  } catch (error) {
    logger.error('Query error', {
      query: text.substring(0, 100),
      error: error instanceof Error ? error.message : 'Unknown error',
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
 * Execute a transaction
 */
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getClient();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Transaction rolled back', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  } finally {
    client.release();
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
    const deletedCount = result.rows[0]?.deleted_count || 0;
    logger.info('Database cleanup completed', { deletedMessages: deletedCount });
    return deletedCount;
  } catch (error) {
    logger.error('Database cleanup failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
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
    logger.error('Database health check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}
