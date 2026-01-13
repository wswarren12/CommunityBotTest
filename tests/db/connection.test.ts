import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { Pool } from 'pg';
import {
  initializeDatabase,
  getPool,
  query,
  getClient,
  transaction,
  closeDatabase,
  runCleanup,
  healthCheck,
} from '../../src/db/connection';
import * as logger from '../../src/utils/logger';

// Mock dependencies
jest.mock('pg');
jest.mock('../../src/utils/logger');

describe('database connection', () => {
  let mockPool: any;
  let mockPoolQuery: any;
  let mockPoolOn: any;
  let mockPoolEnd: any;
  let mockPoolConnect: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockPoolQuery = jest.fn();
    mockPoolOn = jest.fn();
    mockPoolEnd = jest.fn();
    mockPoolConnect = jest.fn();

    mockPool = {
      query: mockPoolQuery,
      on: mockPoolOn,
      end: mockPoolEnd,
      connect: mockPoolConnect,
    };

    (Pool as any).mockImplementation(() => mockPool);
  });

  afterEach(() => {
    // Reset the pool singleton
    jest.resetModules();
  });

  describe('initializeDatabase', () => {
    it('should initialize database pool successfully', async () => {
      const connectionString = 'postgresql://localhost:5432/testdb';

      mockPoolQuery.mockResolvedValue({ rows: [{ now: new Date() }], rowCount: 1 });

      const result = await initializeDatabase(connectionString);

      expect(Pool).toHaveBeenCalledWith({
        connectionString,
        max: 20,
        min: 2,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        allowExitOnIdle: true,
      });

      expect(mockPoolOn).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockPoolQuery).toHaveBeenCalledWith('SELECT NOW()');
      expect(logger.logger.info).toHaveBeenCalledWith(
        'Database connection established',
        expect.objectContaining({ timestamp: expect.any(Date) })
      );
      expect(result).toBe(mockPool);
    });

    it('should setup error handler for pool', async () => {
      const connectionString = 'postgresql://localhost:5432/testdb';

      mockPoolQuery.mockResolvedValue({ rows: [{ now: new Date() }], rowCount: 1 });

      await initializeDatabase(connectionString);

      expect(mockPoolOn).toHaveBeenCalledWith('error', expect.any(Function));

      // Test error handler
      const errorHandler = mockPoolOn.mock.calls[0][1];
      const testError = new Error('Connection lost');
      errorHandler(testError);

      expect(logger.logger.error).toHaveBeenCalledWith(
        'Unexpected error on idle PostgreSQL client',
        testError
      );
    });

    it('should throw error if connection test fails', async () => {
      const connectionString = 'postgresql://localhost:5432/testdb';
      const testError = new Error('Connection refused');

      mockPoolQuery.mockRejectedValue(testError);

      await expect(initializeDatabase(connectionString)).rejects.toThrow('Connection refused');
      expect(logger.logger.error).toHaveBeenCalledWith(
        'Failed to connect to database',
        testError
      );
    });

    it('should warn if pool already initialized', async () => {
      const connectionString = 'postgresql://localhost:5432/testdb';

      mockPoolQuery.mockResolvedValue({ rows: [{ now: new Date() }], rowCount: 1 });

      const pool1 = await initializeDatabase(connectionString);
      const pool2 = await initializeDatabase(connectionString);

      expect(pool1).toBe(pool2);
      expect(logger.logger.warn).toHaveBeenCalledWith('Database pool already initialized');
    });
  });

  describe('getPool', () => {
    it('should return initialized pool', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [{ now: new Date() }], rowCount: 1 });

      await initializeDatabase('postgresql://localhost:5432/testdb');
      const pool = getPool();

      expect(pool).toBe(mockPool);
    });

    it('should throw error if pool not initialized', () => {
      // Don't initialize pool
      expect(() => getPool()).toThrow(
        'Database pool not initialized. Call initializeDatabase() first.'
      );
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      mockPoolQuery.mockResolvedValue({ rows: [{ now: new Date() }], rowCount: 1 });
      await initializeDatabase('postgresql://localhost:5432/testdb');
    });

    it('should execute query successfully', async () => {
      const mockResult = {
        rows: [{ id: 1, name: 'Test' }],
        rowCount: 1,
      };

      mockPoolQuery.mockResolvedValue(mockResult);

      const result = await query('SELECT * FROM users WHERE id = $1', [1]);

      expect(mockPoolQuery).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', [1]);
      expect(result).toEqual(mockResult);
      expect(logger.logger.debug).toHaveBeenCalledWith(
        'Executed query',
        expect.objectContaining({
          query: expect.stringContaining('SELECT * FROM users'),
          duration: expect.stringContaining('ms'),
          rows: 1,
        })
      );
    });

    it('should handle query without parameters', async () => {
      const mockResult = { rows: [], rowCount: 0 };
      mockPoolQuery.mockResolvedValue(mockResult);

      await query('SELECT NOW()');

      expect(mockPoolQuery).toHaveBeenCalledWith('SELECT NOW()', undefined);
    });

    it('should truncate long queries in logs', async () => {
      const longQuery = 'SELECT * FROM users WHERE ' + 'a'.repeat(200);
      mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await query(longQuery);

      expect(logger.logger.debug).toHaveBeenCalledWith(
        'Executed query',
        expect.objectContaining({
          query: longQuery.substring(0, 100),
        })
      );
    });

    it('should log and throw error on query failure', async () => {
      const dbError = new Error('Syntax error in query');
      mockPoolQuery.mockRejectedValue(dbError);

      await expect(query('INVALID SQL')).rejects.toThrow('Syntax error in query');

      expect(logger.logger.error).toHaveBeenCalledWith(
        'Query error',
        expect.objectContaining({
          query: 'INVALID SQL',
          error: 'Syntax error in query',
        })
      );
    });
  });

  describe('getClient', () => {
    beforeEach(async () => {
      mockPoolQuery.mockResolvedValue({ rows: [{ now: new Date() }], rowCount: 1 });
      await initializeDatabase('postgresql://localhost:5432/testdb');
    });

    it('should get client from pool', async () => {
      const mockClient = { query: jest.fn(), release: jest.fn() };
      mockPoolConnect.mockResolvedValue(mockClient);

      const client = await getClient();

      expect(mockPoolConnect).toHaveBeenCalled();
      expect(client).toBe(mockClient);
    });

    it('should throw error if pool not initialized', async () => {
      // Reset pool by closing it
      mockPoolEnd.mockResolvedValue(undefined);
      await closeDatabase();

      await expect(getClient()).rejects.toThrow(
        'Database pool not initialized. Call initializeDatabase() first.'
      );
    });
  });

  describe('transaction', () => {
    let mockClient: any;

    beforeEach(async () => {
      mockPoolQuery.mockResolvedValue({ rows: [{ now: new Date() }], rowCount: 1 });
      await initializeDatabase('postgresql://localhost:5432/testdb');

      mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };
      mockPoolConnect.mockResolvedValue(mockClient);
    });

    it('should execute transaction successfully', async () => {
      mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const callback = jest.fn().mockResolvedValue('success');

      const result = await transaction(callback);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(callback).toHaveBeenCalledWith(mockClient);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
      expect(result).toBe('success');
    });

    it('should rollback transaction on error', async () => {
      mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const testError = new Error('Transaction failed');
      const callback = jest.fn().mockRejectedValue(testError);

      await expect(transaction(callback)).rejects.toThrow('Transaction failed');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
      expect(logger.logger.error).toHaveBeenCalledWith(
        'Transaction rolled back',
        expect.objectContaining({
          error: 'Transaction failed',
        })
      );
    });

    it('should release client even if commit fails', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockRejectedValueOnce(new Error('Commit failed')); // COMMIT

      const callback = jest.fn().mockResolvedValue('success');

      await expect(transaction(callback)).rejects.toThrow('Commit failed');

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should release client even if rollback fails', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockRejectedValueOnce(new Error('Rollback failed')); // ROLLBACK

      const callback = jest.fn().mockRejectedValue(new Error('Query failed'));

      await expect(transaction(callback)).rejects.toThrow('Rollback failed');

      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('closeDatabase', () => {
    it('should close pool successfully', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [{ now: new Date() }], rowCount: 1 });
      await initializeDatabase('postgresql://localhost:5432/testdb');

      mockPoolEnd.mockResolvedValue(undefined);

      await closeDatabase();

      expect(mockPoolEnd).toHaveBeenCalled();
      expect(logger.logger.info).toHaveBeenCalledWith('Database connection pool closed');
    });

    it('should handle closing when pool is not initialized', async () => {
      await closeDatabase();

      expect(mockPoolEnd).not.toHaveBeenCalled();
    });

    it('should handle pool end error', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [{ now: new Date() }], rowCount: 1 });
      await initializeDatabase('postgresql://localhost:5432/testdb');

      const endError = new Error('Failed to close pool');
      mockPoolEnd.mockRejectedValue(endError);

      await expect(closeDatabase()).rejects.toThrow('Failed to close pool');
    });
  });

  describe('runCleanup', () => {
    beforeEach(async () => {
      mockPoolQuery.mockResolvedValue({ rows: [{ now: new Date() }], rowCount: 1 });
      await initializeDatabase('postgresql://localhost:5432/testdb');
    });

    it('should run cleanup successfully', async () => {
      mockPoolQuery.mockResolvedValue({
        rows: [{ deleted_count: 150 }],
        rowCount: 1,
      });

      const result = await runCleanup();

      expect(mockPoolQuery).toHaveBeenCalledWith(
        'SELECT cleanup_old_messages() as deleted_count',
        undefined
      );
      expect(result).toBe(150);
      expect(logger.logger.info).toHaveBeenCalledWith('Database cleanup completed', {
        deletedMessages: 150,
      });
    });

    it('should return 0 if no deleted count', async () => {
      mockPoolQuery.mockResolvedValue({
        rows: [{}],
        rowCount: 1,
      });

      const result = await runCleanup();

      expect(result).toBe(0);
    });

    it('should return 0 if no rows returned', async () => {
      mockPoolQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await runCleanup();

      expect(result).toBe(0);
    });

    it('should log and throw error on cleanup failure', async () => {
      const cleanupError = new Error('Cleanup function not found');
      mockPoolQuery.mockRejectedValue(cleanupError);

      await expect(runCleanup()).rejects.toThrow('Cleanup function not found');

      expect(logger.logger.error).toHaveBeenCalledWith(
        'Database cleanup failed',
        expect.objectContaining({
          error: 'Cleanup function not found',
        })
      );
    });
  });

  describe('healthCheck', () => {
    beforeEach(async () => {
      mockPoolQuery.mockResolvedValue({ rows: [{ now: new Date() }], rowCount: 1 });
      await initializeDatabase('postgresql://localhost:5432/testdb');
    });

    it('should return true on successful health check', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [{ '?column?': 1 }], rowCount: 1 });

      const result = await healthCheck();

      expect(mockPoolQuery).toHaveBeenCalledWith('SELECT 1', undefined);
      expect(result).toBe(true);
    });

    it('should return false on health check failure', async () => {
      mockPoolQuery.mockRejectedValue(new Error('Connection lost'));

      const result = await healthCheck();

      expect(result).toBe(false);
      expect(logger.logger.error).toHaveBeenCalledWith(
        'Database health check failed',
        expect.objectContaining({
          error: 'Connection lost',
        })
      );
    });
  });
});
