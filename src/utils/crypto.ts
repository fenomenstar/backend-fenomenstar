import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function generateToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

// TURN server credential generation (time-limited HMAC)
export function generateTurnCredentials(username: string, secret: string, ttl: number = 86400) {
  const timestamp = Math.floor(Date.now() / 1000) + ttl;
  const turnUsername = `${timestamp}:${username}`;
  const hmac = crypto.createHmac('sha1', secret);
  hmac.update(turnUsername);
  const turnPassword = hmac.digest('base64');
  return { username: turnUsername, credential: turnPassword };
}
