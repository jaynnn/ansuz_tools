import winston from 'winston';
import path from 'path';

// Determine log level based on environment
const logLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

// Define custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Define console log format for development
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    // If message is an object, stringify it
    const messageStr = typeof message === 'object' ? JSON.stringify(message) : message;
    let metaStr = '';
    // Only show additional meta if there are fields beyond timestamp
    const { timestamp: _ts, ...restMeta } = meta;
    if (Object.keys(restMeta).length > 0) {
      metaStr = '\n' + JSON.stringify(restMeta, null, 2);
    }
    return `${timestamp} [${level}]: ${messageStr}${metaStr}`;
  })
);

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');

// Create logger instance
const logger = winston.createLogger({
  level: logLevel,
  format: logFormat,
  transports: [
    // Write all logs to combined.log
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    }),
    // Write error logs to error.log
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    }),
  ],
});

// Add console transport in non-production environments
if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: consoleFormat,
    })
  );
} else {
  // In production, still log to console but with JSON format
  logger.add(
    new winston.transports.Console({
      format: logFormat,
    })
  );
}

// Helper functions for structured logging
export const logInfo = (action: string, details: Record<string, any> = {}) => {
  logger.info({
    action,
    timestamp: new Date().toISOString(),
    ...details,
  });
};

export const logError = (action: string, error: Error, details: Record<string, any> = {}) => {
  logger.error({
    action,
    error: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
    ...details,
  });
};

export const logWarn = (action: string, details: Record<string, any> = {}) => {
  logger.warn({
    action,
    timestamp: new Date().toISOString(),
    ...details,
  });
};

export const logDebug = (action: string, details: Record<string, any> = {}) => {
  logger.debug({
    action,
    timestamp: new Date().toISOString(),
    ...details,
  });
};

export default logger;
