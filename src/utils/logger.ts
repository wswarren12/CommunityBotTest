import winston from 'winston';

const logLevel = process.env.LOG_LEVEL || 'info';

/**
 * Logger configuration using Winston
 */
export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'discord-bot' },
  transports: [
    // Write all logs to console
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, ...metadata }) => {
          let msg = `${timestamp} [${level}]: ${message}`;

          // Add metadata if present
          if (Object.keys(metadata).length > 0) {
            msg += ` ${JSON.stringify(metadata)}`;
          }

          return msg;
        })
      ),
    }),

    // Write error logs to error.log file
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),

    // Write all logs to combined.log file
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

/**
 * Create a child logger with additional context
 */
export function createChildLogger(context: Record<string, any>): winston.Logger {
  return logger.child(context);
}

/**
 * Log an error with context
 */
export function logError(error: Error, context?: Record<string, any>): void {
  logger.error(error.message, {
    stack: error.stack,
    ...context,
  });
}

/**
 * Log info with structured data
 */
export function logInfo(message: string, data?: Record<string, any>): void {
  logger.info(message, data);
}

/**
 * Log debug information
 */
export function logDebug(message: string, data?: Record<string, any>): void {
  logger.debug(message, data);
}

/**
 * Log warning
 */
export function logWarn(message: string, data?: Record<string, any>): void {
  logger.warn(message, data);
}
