import { query } from '../../config/database';
import { hashPassword, comparePassword, generateId } from '../../utils/crypto';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken, getTokenExpiry } from './jwt.service';
import { ConflictError, UnauthorizedError } from '../../utils/errors';
import { RegisterInput, LoginInput } from './auth.schema';
import { blacklistToken } from '../../config/redis';
import { logger } from '../../utils/logger';
import crypto from 'crypto';

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function register(input: RegisterInput) {
  const existing = await query('SELECT id FROM users WHERE email = $1', [input.email]);
  if (existing.rows.length > 0) {
    throw new ConflictError('Bu e-posta adresi zaten kullanılıyor');
  }

  const passwordHash = await hashPassword(input.password);
  const id = generateId();

  const result = await query(
    `INSERT INTO users (id, name, email, password_hash, role, city)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, email, role, avatar, city, badges, talents, followers, total_votes, total_views, created_at`,
    [id, input.name, input.email, passwordHash, input.role, input.city]
  );

  const user = result.rows[0];

  const { token: accessToken } = generateAccessToken(user.id, user.role);
  const { token: refreshToken } = generateRefreshToken(user.id);

  const refreshHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [user.id, refreshHash, expiresAt]
  );

  return {
    user,
    accessToken,
    refreshToken,
  };
}

export async function login(input: LoginInput) {
  const result = await query(
    `SELECT id, name, email, password_hash, role, avatar, city, badges, talents,
            followers, total_votes, total_views, created_at
     FROM users WHERE email = $1 AND is_active = true`,
    [input.email]
  );

  if (result.rows.length === 0) {
    throw new UnauthorizedError('Geçersiz e-posta veya şifre');
  }

  const user = result.rows[0];
  const valid = await comparePassword(input.password, user.password_hash);
  if (!valid) {
    throw new UnauthorizedError('Geçersiz e-posta veya şifre');
  }

  const { token: accessToken } = generateAccessToken(user.id, user.role);
  const { token: refreshToken } = generateRefreshToken(user.id);

  const refreshHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [user.id, refreshHash, expiresAt]
  );

  const { password_hash: _, ...userWithoutPassword } = user;

  return {
    user: userWithoutPassword,
    accessToken,
    refreshToken,
  };
}

export async function refreshTokens(oldRefreshToken: string) {
  let payload: { userId: string; jti: string };
  try {
    payload = verifyRefreshToken(oldRefreshToken);
  } catch {
    throw new UnauthorizedError('Geçersiz veya süresi dolmuş refresh token');
  }

  const tokenHash = hashToken(oldRefreshToken);
  const stored = await query(
    'SELECT id, user_id FROM refresh_tokens WHERE token_hash = $1 AND revoked = false AND expires_at > NOW()',
    [tokenHash]
  );

  if (stored.rows.length === 0) {
    throw new UnauthorizedError('Refresh token geçersiz veya iptal edilmiş');
  }

  await query('UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1', [tokenHash]);

  const userResult = await query(
    'SELECT id, name, email, role, avatar, city FROM users WHERE id = $1 AND is_active = true',
    [payload.userId]
  );

  if (userResult.rows.length === 0) {
    throw new UnauthorizedError('Kullanıcı bulunamadı');
  }

  const user = userResult.rows[0];

  const { token: newAccessToken } = generateAccessToken(user.id, user.role);
  const { token: newRefreshToken } = generateRefreshToken(user.id);

  const newHash = hashToken(newRefreshToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [user.id, newHash, expiresAt]
  );

  return {
    user,
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
}

export async function logout(accessToken: string, refreshToken?: string) {
  try {
    const expiry = getTokenExpiry(accessToken);
    if (expiry && expiry.jti && expiry.expiresIn > 0) {
      await blacklistToken(expiry.jti, expiry.expiresIn);
      logger.info('Access token blacklisted', { jti: expiry.jti });
    }
  } catch (err) {
    logger.error('Failed to blacklist access token:', err);
  }

  if (refreshToken) {
    const tokenHash = hashToken(refreshToken);
    await query('UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1', [tokenHash]);
  }
}

export async function getMe(userId: string) {
  const result = await query(
    `SELECT id, name, email, role, avatar, city, age, bio, talents, badges,
            followers, total_votes, total_views, package, created_at
     FROM users WHERE id = $1 AND is_active = true`,
    [userId]
  );

  if (result.rows.length === 0) {
    throw new UnauthorizedError('Kullanıcı bulunamadı');
  }

  return result.rows[0];
}

export async function cleanupExpiredTokens() {
  await query('DELETE FROM refresh_tokens WHERE expires_at < NOW() OR revoked = true');
}
