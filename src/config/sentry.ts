/**
 * Sentry Integration for Error Tracking
 */
import * as Sentry from '@sentry/node';
import { env } from './env';
import { Express, Request, Response, NextFunction } from 'express';

let isInitialized = false;

/**
 * Initialize Sentry - call before any other middleware
 */
export function initSentry(app: Express): void {
  if (!env.SENTRY_DSN) {
    console.warn('⚠️  Sentry DSN not configured - error tracking disabled');
    return;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT || env.NODE_ENV,
    release: env.SENTRY_RELEASE || `${env.APP_NAME}@${env.APP_VERSION}`,
    
    // Performance monitoring
    tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 1.0,
    integrations: [
      // HTTP request tracing
      new Sentry.Integrations.Http({ tracing: true }),
      // Express middleware tracing
      new Sentry.Integrations.Express({ app }),
    ],
    
    // Filter sensitive data
    beforeSend(event, hint) {
      // Remove sensitive headers
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
      }
      
      // Remove sensitive data from body
      if (event.request?.data) {
        let data: any = event.request.data;
        if (typeof event.request.data === 'string') {
          try {
            data = JSON.parse(event.request.data);
          } catch {
            data = event.request.data;
          }
        }
        if (data.password) data.password = '[REDACTED]';
        if (data.refreshToken) data.refreshToken = '[REDACTED]';
        event.request.data = typeof data === 'string' ? data : JSON.stringify(data);
      }
      
      return event;
    },
    
    // Ignore certain errors
    ignoreErrors: [
      'UnauthorizedError',
      'BadRequestError',
      'NotFoundError',
      'TooManyRequestsError',
    ],
  });

  isInitialized = true;
  console.log('✅ Sentry initialized');
}

/**
 * Sentry request handler - add before routes
 */
export function sentryRequestHandler() {
  if (!isInitialized) {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }
  return Sentry.Handlers.requestHandler({
    user: ['id', 'email', 'role'],
  }) as (req: Request, res: Response, next: NextFunction) => void;
}

/**
 * Sentry tracing handler - add before routes
 */
export function sentryTracingHandler() {
  if (!isInitialized) {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }
  return Sentry.Handlers.tracingHandler() as (req: Request, res: Response, next: NextFunction) => void;
}

/**
 * Sentry error handler - add after routes, before error handler
 */
export function sentryErrorHandler() {
  if (!isInitialized) {
    return (err: Error, _req: Request, _res: Response, next: NextFunction) => next(err);
  }
  return Sentry.Handlers.errorHandler({
    shouldHandleError(error: any) {
      // Only report 5xx errors and unhandled errors
      return !error.statusCode || error.statusCode >= 500;
    },
  }) as (err: Error, req: Request, res: Response, next: NextFunction) => void;
}

/**
 * Capture exception manually
 */
export function captureException(error: Error, context?: Record<string, any>): void {
  if (!isInitialized) {
    console.error('Sentry not initialized, error not captured:', error);
    return;
  }
  
  Sentry.withScope((scope) => {
    if (context) {
      scope.setExtras(context);
    }
    Sentry.captureException(error);
  });
}

/**
 * Capture message manually
 */
export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info'): void {
  if (!isInitialized) return;
  Sentry.captureMessage(message, level);
}

/**
 * Set user context for error tracking
 */
export function setUser(user: { id: string; email?: string; role?: string } | null): void {
  if (!isInitialized) return;
  Sentry.setUser(user);
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(breadcrumb: Sentry.Breadcrumb): void {
  if (!isInitialized) return;
  Sentry.addBreadcrumb(breadcrumb);
}

/**
 * Flush events before shutdown
 */
export async function flushSentry(): Promise<void> {
  if (!isInitialized) return;
  await Sentry.close(2000);
}
