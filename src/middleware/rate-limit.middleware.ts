/**
 * Redis-backed rate limiting middleware
 * Replaces in-memory rate limiting for production use
 */
import { Request, Response, NextFunction } from 'express';
import { getRedis } from '../config/redis';
import { logger } from '../utils/logger';
import { TooManyRequestsError } from '../utils/errors';
import { REDIS_KEYS } from '../config/constants';

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetIn: number;
  total: number;
}

/**
 * Check rate limit using Redis sliding window
 */
async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const redis = getRedis();
  const now = Date.now();
  const windowStart = now - (windowSeconds * 1000);
  const redisKey = `${REDIS_KEYS.RATE_LIMIT_PREFIX}${key}`;

  try {
    // Use Redis transaction for atomic operations
    const multi = redis.multi();
    
    // Remove old entries outside the window
    multi.zremrangebyscore(redisKey, 0, windowStart);
    
    // Add current request
    multi.zadd(redisKey, now, `${now}-${Math.random()}`);
    
    // Count requests in window
    multi.zcard(redisKey);
    
    // Set expiry on the key
    multi.expire(redisKey, windowSeconds);
    
    const results = await multi.exec();
    
    if (!results) {
      // Redis transaction failed, allow request but log
      logger.warn('Rate limit Redis transaction failed, allowing request');
      return { allowed: true, remaining: maxRequests - 1, resetIn: windowSeconds, total: maxRequests };
    }

    const currentCount = results[2][1] as number;
    const allowed = currentCount <= maxRequests;
    const remaining = Math.max(0, maxRequests - currentCount);

    return {
      allowed,
      remaining,
      resetIn: windowSeconds,
      total: maxRequests,
    };
  } catch (err) {
    // If Redis fails, fall back to allowing the request
    logger.error('Rate limit check failed:', err);
    return { allowed: true, remaining: maxRequests - 1, resetIn: windowSeconds, total: maxRequests };
  }
}

/**
 * Redis-backed rate limiting middleware factory
 */
export function rateLimitMiddleware(maxRequests: number = 100, windowSeconds: number = 60) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Get client identifier (IP or user ID if authenticated)
    const clientId = getClientIdentifier(req);
    const endpoint = req.path.replace(/\/[a-f0-9-]{36}/gi, '/:id'); // Normalize UUIDs
    const key = `${clientId}:${req.method}:${endpoint}`;

    try {
      const result = await checkRateLimit(key, maxRequests, windowSeconds);

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', result.total);
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      res.setHeader('X-RateLimit-Reset', Math.ceil(Date.now() / 1000) + result.resetIn);

      if (!result.allowed) {
        logger.warn('Rate limit exceeded', { clientId, endpoint, limit: maxRequests });
        throw new TooManyRequestsError(
          `Çok fazla istek. ${result.resetIn} saniye sonra tekrar deneyin.`
        );
      }

      next();
    } catch (err) {
      if (err instanceof TooManyRequestsError) {
        next(err);
      } else {
        // On Redis error, allow request but log
        logger.error('Rate limit middleware error:', err);
        next();
      }
    }
  };
}

/**
 * Get client identifier for rate limiting
 */
function getClientIdentifier(req: Request): string {
  // Check for authenticated user
  const authReq = req as any;
  if (authReq.user?.userId) {
    return `user:${authReq.user.userId}`;
  }

  // Fall back to IP address
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded
    ? (Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0])
    : req.ip || req.socket.remoteAddress || 'unknown';

  return `ip:${ip}`;
}

// Pre-configured rate limiters for different endpoints
export const authLimiter = rateLimitMiddleware(5, 60);      // 5 req/min for auth
export const uploadLimiter = rateLimitMiddleware(10, 60);   // 10 uploads/min
export const voteLimiter = rateLimitMiddleware(30, 60);     // 30 votes/min
export const commentLimiter = rateLimitMiddleware(20, 60);  // 20 comments/min
export const searchLimiter = rateLimitMiddleware(30, 60);   // 30 searches/min
export const generalLimiter = rateLimitMiddleware(100, 60); // 100 req/min general
