import { createClient, User as SupabaseUser } from '@supabase/supabase-js';
import { env } from '../../config/env';
import { query } from '../../config/database';
import { AuthPayload } from '../../types';
import { UnauthorizedError } from '../../utils/errors';

const isConfigured =
  env.USE_SUPABASE_AUTH &&
  !!env.SUPABASE_URL &&
  !!env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = isConfigured
  ? createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

export function isSupabaseAuthEnabled(): boolean {
  return !!supabaseAdmin;
}

function normalizeRole(rawRole: unknown): 'talent' | 'viewer' | 'brand' | 'admin' {
  if (rawRole === 'talent' || rawRole === 'viewer' || rawRole === 'brand' || rawRole === 'admin') {
    return rawRole;
  }
  return 'viewer';
}

function deriveName(user: SupabaseUser): string {
  const name =
    user.user_metadata?.name ||
    user.user_metadata?.full_name ||
    (user.email ? user.email.split('@')[0] : null);
  return typeof name === 'string' && name.trim().length > 0 ? name.trim() : 'FenomenStar User';
}

function deriveCity(user: SupabaseUser): string {
  const city = user.user_metadata?.city;
  return typeof city === 'string' ? city.trim() : '';
}

export async function verifySupabaseTokenAndEnsureLocalUser(token: string): Promise<AuthPayload> {
  if (!supabaseAdmin) {
    throw new UnauthorizedError('Supabase auth is not configured');
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  // TEMP DEBUG - remove after diagnosing Supabase token verification
  console.log('=== SUPABASE AUTH DEBUG ===');
  console.log('token length:', token?.length);
  console.log('token prefix:', token?.substring(0, 20));
  console.log('error:', JSON.stringify(error));
  console.log('user id:', data?.user?.id);
  console.log('==========================');

  if (error || !data.user) {
    throw new UnauthorizedError('Geçersiz veya süresi dolmuş token');
  }

  const supaUser = data.user;
  if (!supaUser.email) {
    throw new UnauthorizedError('E-posta bilgisi bulunamadi');
  }

  const requestedRole = normalizeRole(
    supaUser.user_metadata?.role ?? supaUser.app_metadata?.role
  );

  const existing = await query(
    `SELECT id, role FROM users
     WHERE id = $1 OR email = $2
     LIMIT 1`,
    [supaUser.id, supaUser.email]
  );

  if (existing.rows.length === 0) {
    await query(
      `INSERT INTO users (id, name, email, password_hash, role, city, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)`,
      [supaUser.id, deriveName(supaUser), supaUser.email, 'SUPABASE_AUTH', requestedRole, deriveCity(supaUser)]
    );

    return {
      userId: supaUser.id,
      role: requestedRole,
    };
  }

  const localUser = existing.rows[0];
  await query(
    `UPDATE users
     SET name = $2,
         role = $3,
         city = $4,
         is_active = true,
         updated_at = NOW()
     WHERE id = $1 OR email = $5`,
    [localUser.id, deriveName(supaUser), requestedRole, deriveCity(supaUser), supaUser.email]
  );

  return {
    userId: localUser.id,
    role: requestedRole,
  };
}
