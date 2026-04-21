import jwt, { SignOptions, JwtPayload } from 'jsonwebtoken';
import { env } from '../../config/env';
import { AuthPayload } from '../../types';
import { generateId } from '../../utils/crypto';

export function generateAccessToken(userId: string, role: string): { token: string; jti: string } {
  const jti = generateId();
  const options: SignOptions = { expiresIn: env.JWT_ACCESS_EXPIRY as any };
  const token = jwt.sign(
    { userId, role, jti },
    env.JWT_SECRET,
    options
  );
  return { token, jti };
}

export function generateRefreshToken(userId: string): { token: string; jti: string } {
  const jti = generateId();
  const options: SignOptions = { expiresIn: env.JWT_REFRESH_EXPIRY as any };
  const token = jwt.sign(
    { userId, jti, type: 'refresh' },
    env.JWT_REFRESH_SECRET,
    options
  );
  return { token, jti };
}

export function verifyAccessToken(token: string): AuthPayload {
  return jwt.verify(token, env.JWT_SECRET) as AuthPayload;
}

export function verifyRefreshToken(token: string): { userId: string; jti: string } {
  const payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as { userId: string; jti: string };
  return payload;
}

export function decodeToken(token: string): AuthPayload | null {
  try {
    return jwt.decode(token) as AuthPayload;
  } catch {
    return null;
  }
}

/**
 * Get token expiry information for blacklisting
 */
export function getTokenExpiry(token: string): { jti: string; expiresIn: number } | null {
  try {
    const decoded = jwt.decode(token) as JwtPayload;
    if (!decoded || !decoded.exp || !decoded.jti) return null;
    
    const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);
    return {
      jti: decoded.jti as string,
      expiresIn: Math.max(0, expiresIn),
    };
  } catch {
    return null;
  }
}
