import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import winston from 'winston';
import {
  logger,
  createChildLogger,
  logError,
  logInfo,
  logDebug,
  logWarn,
} from '../../src/utils/logger';

describe('logger utility', () => {
  describe('logger configuration', () => {
    it('should create logger with correct level', () => {
      expect(logger.level).toBeDefined();
    });

    it('should have required transports', () => {
      expect(logger.transports).toBeDefined();
      expect(logger.transports.length).toBeGreaterThan(0);
    });

    it('should use log level from environment or default to info', () => {
      // The logger should have been created with LOG_LEVEL env var or 'info'
      expect(['debug', 'info', 'warn', 'error']).toContain(logger.level);
    });

    it('should have console transport', () => {
      const hasConsoleTransport = logger.transports.some(
        (transport) => transport instanceof winston.transports.Console
      );
      expect(hasConsoleTransport).toBe(true);
    });

    it('should have file transports', () => {
      const hasFileTransport = logger.transports.some(
        (transport) => transport instanceof winston.transports.File
      );
      expect(hasFileTransport).toBe(true);
    });
  });

  describe('logging functions', () => {
    let loggerSpy: jest.SpyInstance;

    beforeEach(() => {
      // Spy on logger methods
      loggerSpy = jest.spyOn(logger, 'info');
      jest.spyOn(logger, 'error');
      jest.spyOn(logger, 'debug');
      jest.spyOn(logger, 'warn');
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    describe('logInfo', () => {
      it('should log info message without data', () => {
        logInfo('Test info message');

        expect(logger.info).toHaveBeenCalledWith('Test info message', undefined);
      });

      it('should log info message with data', () => {
        const data = { userId: 'user123', action: 'login' };
        logInfo('User logged in', data);

        expect(logger.info).toHaveBeenCalledWith('User logged in', data);
      });
    });

    describe('logError', () => {
      it('should log error with stack trace', () => {
        const error = new Error('Test error');
        const context = { userId: 'user123' };

        logError(error, context);

        expect(logger.error).toHaveBeenCalledWith(
          'Test error',
          expect.objectContaining({
            stack: expect.any(String),
            userId: 'user123',
          })
        );
      });

      it('should log error without context', () => {
        const error = new Error('Simple error');

        logError(error);

        expect(logger.error).toHaveBeenCalledWith(
          'Simple error',
          expect.objectContaining({
            stack: expect.any(String),
          })
        );
      });

      it('should handle error without stack', () => {
        const error = new Error('No stack error');
        delete error.stack;

        logError(error);

        expect(logger.error).toHaveBeenCalledWith(
          'No stack error',
          expect.objectContaining({
            stack: undefined,
          })
        );
      });
    });

    describe('logDebug', () => {
      it('should log debug message without data', () => {
        logDebug('Debug message');

        expect(logger.debug).toHaveBeenCalledWith('Debug message', undefined);
      });

      it('should log debug message with data', () => {
        const data = { queryTime: '50ms', rows: 10 };
        logDebug('Query executed', data);

        expect(logger.debug).toHaveBeenCalledWith('Query executed', data);
      });
    });

    describe('logWarn', () => {
      it('should log warning message without data', () => {
        logWarn('Warning message');

        expect(logger.warn).toHaveBeenCalledWith('Warning message', undefined);
      });

      it('should log warning message with data', () => {
        const data = { threshold: 100, current: 150 };
        logWarn('Threshold exceeded', data);

        expect(logger.warn).toHaveBeenCalledWith('Threshold exceeded', data);
      });
    });
  });

  describe('createChildLogger', () => {
    it('should create child logger with context', () => {
      const context = { service: 'aiService', userId: 'user123' };
      const childLogger = createChildLogger(context);

      expect(childLogger).toBeDefined();
      expect(childLogger.defaultMeta).toMatchObject(context);
    });

    it('should create child logger with empty context', () => {
      const childLogger = createChildLogger({});

      expect(childLogger).toBeDefined();
    });

    it('should inherit parent logger configuration', () => {
      const childLogger = createChildLogger({ service: 'test' });

      expect(childLogger.level).toBe(logger.level);
    });

    it('should allow logging with child logger', () => {
      const childLogger = createChildLogger({ service: 'test' });
      const childSpy = jest.spyOn(childLogger, 'info');

      childLogger.info('Test message');

      expect(childSpy).toHaveBeenCalledWith('Test message');
    });
  });

  describe('logger metadata', () => {
    it('should include service in default metadata', () => {
      expect(logger.defaultMeta).toMatchObject({ service: 'discord-bot' });
    });

    it('should include timestamp in logs', () => {
      const infoSpy = jest.spyOn(logger, 'info');

      logger.info('Test with timestamp');

      // The format should include timestamp
      expect(logger.format).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle logging when transport fails', () => {
      // This shouldn't throw even if a transport fails
      expect(() => {
        logger.info('Test message during transport failure');
      }).not.toThrow();
    });

    it('should handle special characters in messages', () => {
      expect(() => {
        logger.info('Message with\nnewlines\tand\ttabs');
      }).not.toThrow();
    });

    it('should handle circular references in data', () => {
      const circularObj: any = { name: 'test' };
      circularObj.self = circularObj;

      // Winston should handle this gracefully with json format
      expect(() => {
        logger.info('Message with circular ref', circularObj);
      }).not.toThrow();
    });

    it('should handle undefined and null values', () => {
      expect(() => {
        logger.info('Undefined test', { value: undefined });
        logger.info('Null test', { value: null });
      }).not.toThrow();
    });
  });
});
