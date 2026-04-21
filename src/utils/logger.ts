/**
 * Production-ready logging with Winston
 * 
 * Features:
 * - Structured JSON logging
 * - Request ID tracking
 * - Log levels based on environment
 * - File rotation in production
 * - Console colors in development
 */
import winston from 'winston';
import { env } from '../config/env';
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// ===== CUSTOM FORMATS =====

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
  winston.format.printf(({ timestamp, level, message, requestId, ...meta }) => {
    const reqId = requestId ? `[${requestId}]` : '';
    const metaStr = Object.keys(meta).length > 0 && meta.stack === undefined
      ? ` ${JSON.stringify(meta)}`
      : '';
    const stack = meta.stack ? `\n${meta.stack}` : '';
    return `${timestamp} ${level} ${reqId} ${message}${metaStr}${stack}`;
  })
);

// ===== LOGGER INSTANCE =====

export const logger = winston.createLogger({
  level: env.LOG_LEVEL || (env.NODE_ENV === 'production' ? 'info' : 'debug'),
  format: logFormat,
  defaultMeta: { 
    service: env.APP_NAME || 'fenomenstar-api',
    version: env.APP_VERSION || '1.0.0',
    env: env.NODE_ENV,
  },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: env.NODE_ENV === 'production' ? logFormat : consoleFormat,
    }),
    // File transports (production only)
    ...(env.NODE_ENV === 'production'
      ? [
          new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
            maxsize: 10 * 1024 * 1024, // 10MB
            maxFiles: 5,
            tailable: true,
          }),
          new winston.transports.File({
            filename: 'logs/combined.log',
            maxsize: 10 * 1024 * 1024,
            maxFiles: 10,
            tailable: true,
          }),
        ]
      : []),
  ],
  // Don't exit on error
  exitOnError: false,
});

// ===== REQUEST ID MIDDLEWARE =====

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Get from header or generate
  const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID().slice(0, 8);
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
}

// ===== REQUEST LOGGING MIDDLEWARE =====

export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  
  // Log request
  logger.http('Incoming request', {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    ip: req.ip || req.headers['x-forwarded-for'],
    userAgent: req.headers['user-agent'],
  });

  // Log response on finish
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logLevel = res.statusCode >= 500 ? 'error' 
      : res.statusCode >= 400 ? 'warn' 
      : 'http';

    logger.log(logLevel, 'Request completed', {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.getHeader('content-length'),
    });

    // Warn on slow requests
    if (duration > 3000) {
      logger.warn('Slow request detected', {
        requestId: req.requestId,
        path: req.path,
        duration: `${duration}ms`,
      });
    }
  });

  next();
}

// ===== CHILD LOGGER WITH CONTEXT =====

export function createChildLogger(context: Record<string, any>): winston.Logger {
  return logger.child(context);
}

// ===== LOG HELPER FUNCTIONS =====

export function logError(message: string, error: Error, context?: Record<string, any>): void {
  logger.error(message, {
    ...context,
    error: error.message,
    stack: error.stack,
  });
}

export function logDatabaseQuery(query: string, duration: number, requestId?: string): void {
  const level = duration > 1000 ? 'warn' : 'debug';
  logger.log(level, 'Database query', {
    requestId,
    query: query.substring(0, 200),
    duration: `${duration}ms`,
    slow: duration > 1000,
  });
}

export function logExternalCall(
  service: string,
  method: string,
  duration: number,
  success: boolean,
  requestId?: string
): void {
  logger.info('External service call', {
    requestId,
    service,
    method,
    duration: `${duration}ms`,
    success,
  });
}
