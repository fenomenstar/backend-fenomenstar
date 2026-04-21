import Redis from 'ioredis';
import { env } from './env';
import { logger } from '../utils/logger';
import { REDIS_KEYS } from './constants';

let redis: Redis | null = null;
let isConnected = false;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 200, 5000);
        return delay;
      },
      lazyConnect: true,
      enableReadyCheck: true,
    });

    redis.on('error', (err) => {
      logger.error('Redis connection error:', err);
      isConnected = false;
    });

    redis.on('connect', () => {
      logger.info('Redis connected');
      isConnected = true;
    });

    redis.on('ready', () => {
      logger.info('Redis ready');
      isConnected = true;
    });

    redis.on('close', () => {
      logger.warn('Redis connection closed');
      isConnected = false;
    });

    // Connect immediately
    redis.connect().catch((err) => {
      logger.error('Redis initial connection failed:', err);
    });
  }
  return redis;
}

export function isRedisConnected(): boolean {
  return isConnected;
}

// ===== TOKEN BLACKLIST =====

/**
 * Blacklist a JWT token (by jti) - used on logout
 * Token will be blacklisted until it naturally expires
 */
export async function blacklistToken(jti: string, expiresInSeconds: number): Promise<void> {
  const r = getRedis();
  const key = `${REDIS_KEYS.TOKEN_BLACKLIST_PREFIX}${jti}`;
  
  try {
    await r.setex(key, expiresInSeconds, '1');
    logger.debug('Token blacklisted', { jti, expiresIn: expiresInSeconds });
  } catch (err) {
    logger.error('Failed to blacklist token:', err);
    throw err;
  }
}

/**
 * Check if a token is blacklisted
 */
export async function isTokenBlacklisted(jti: string): Promise<boolean> {
  const r = getRedis();
  const key = `${REDIS_KEYS.TOKEN_BLACKLIST_PREFIX}${jti}`;
  
  try {
    const result = await r.get(key);
    return result === '1';
  } catch (err) {
    logger.error('Failed to check token blacklist:', err);
    // On error, assume not blacklisted to avoid blocking all requests
    return false;
  }
}

/**
 * Blacklist all tokens for a user (for password change, account compromise, etc.)
 */
export async function blacklistAllUserTokens(userId: string, expiresInSeconds: number = 86400): Promise<void> {
  const r = getRedis();
  const key = `${REDIS_KEYS.TOKEN_BLACKLIST_PREFIX}user:${userId}`;
  
  try {
    // Store the timestamp when all tokens should be invalidated
    await r.setex(key, expiresInSeconds, Date.now().toString());
    logger.info('All tokens blacklisted for user', { userId });
  } catch (err) {
    logger.error('Failed to blacklist user tokens:', err);
    throw err;
  }
}

/**
 * Check if user's tokens are globally blacklisted
 */
export async function isUserTokensBlacklisted(userId: string, tokenIssuedAt: number): Promise<boolean> {
  const r = getRedis();
  const key = `${REDIS_KEYS.TOKEN_BLACKLIST_PREFIX}user:${userId}`;
  
  try {
    const blacklistTime = await r.get(key);
    if (!blacklistTime) return false;
    
    // Token is blacklisted if it was issued before the blacklist timestamp
    return tokenIssuedAt < parseInt(blacklistTime, 10);
  } catch (err) {
    logger.error('Failed to check user token blacklist:', err);
    return false;
  }
}

// ===== CLEANUP =====

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
    isConnected = false;
    logger.info('Redis connection closed');
  }
}
