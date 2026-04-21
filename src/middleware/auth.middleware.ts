import { Response, NextFunction } from 'express';
import { verifyAccessToken, decodeToken } from '../modules/auth/jwt.service';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';
import { AuthRequest } from '../types';
import { isTokenBlacklisted, isUserTokensBlacklisted } from '../config/redis';
import { logger } from '../utils/logger';
import {
  isSupabaseAuthEnabled,
  verifySupabaseTokenAndEnsureLocalUser,
} from '../modules/auth/supabase-auth.service';

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Token gerekli');
    }

    const token = authHeader.split(' ')[1];

    if (isSupabaseAuthEnabled()) {
      const payload = await verifySupabaseTokenAndEnsureLocalUser(token);
      req.user = payload;
      return next();
    }
    
    // Verify token signature and expiry
    const payload = verifyAccessToken(token);
    
    // Check if token is blacklisted (logout)
    if (payload.jti) {
      const isBlacklisted = await isTokenBlacklisted(payload.jti);
      if (isBlacklisted) {
        logger.warn('Blacklisted token used', { jti: payload.jti, userId: payload.userId });
        throw new UnauthorizedError('Token geçersiz kılınmış. Lütfen tekrar giriş yapın.');
      }
    }
    
    // Check if all user tokens are blacklisted (password change, etc.)
    if (payload.iat) {
      const userBlacklisted = await isUserTokensBlacklisted(payload.userId, payload.iat * 1000);
      if (userBlacklisted) {
        logger.warn('User tokens globally blacklisted', { userId: payload.userId });
        throw new UnauthorizedError('Oturumunuz sonlandırıldı. Lütfen tekrar giriş yapın.');
      }
    }

    req.user = payload;
    next();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      next(err);
    } else {
      next(new UnauthorizedError('Geçersiz veya süresi dolmuş token.'));
    }
  }
}

export async function optionalAuthMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];

      if (isSupabaseAuthEnabled()) {
        req.user = await verifySupabaseTokenAndEnsureLocalUser(token);
        return next();
      }

      const payload = verifyAccessToken(token);
      
      // Check blacklist for optional auth too
      if (payload.jti) {
        const isBlacklisted = await isTokenBlacklisted(payload.jti);
        if (!isBlacklisted) {
          req.user = payload;
        }
      } else {
        req.user = payload;
      }
    }
    next();
  } catch {
    // Token invalid but not required - continue without auth
    next();
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Oturum gerekli'));
    }
    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError('Bu işlemi yapmaya yetkiniz yok'));
    }
    next();
  };
}
