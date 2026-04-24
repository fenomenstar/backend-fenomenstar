import { getClient, query } from '../../config/database';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import { createNotification } from '../../services/notifications.service';
import { generateTextEmbedding, formatVectorLiteral } from '../../services/embeddings.service';

export async function getUserById(userId: string, viewerId?: string | null) {
  const result = await query(
    `SELECT u.id, u.name, u.email, u.role, u.avatar, u.city, u.age, u.bio, u.talents, u.badges,
            COALESCE(f.followers_count, 0)::int AS followers,
            u.total_votes, u.total_views, u.package, u.created_at,
            EXISTS(
              SELECT 1
              FROM follows viewer_follow
              WHERE viewer_follow.follower_id = $2 AND viewer_follow.following_id = u.id
            ) AS is_following
     FROM users u
     LEFT JOIN (
       SELECT following_id, COUNT(*)::int AS followers_count
       FROM follows
       GROUP BY following_id
     ) f ON f.following_id = u.id
     WHERE u.id = $1 AND u.is_active = true`,
    [userId, viewerId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Kullanıcı bulunamadı');
  }

  const isBlocked = viewerId
    ? await query(
        `SELECT 1
         FROM blocks
         WHERE (blocker_id = $1 AND blocked_id = $2)
            OR (blocker_id = $2 AND blocked_id = $1)
         LIMIT 1`,
        [viewerId, userId]
      )
    : { rows: [] as unknown[] };

  return {
    ...result.rows[0],
    blocked_relationship: isBlocked.rows.length > 0,
  };
}

async function syncFollowerCount(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  userId: string
) {
  const result = await client.query(
    `WITH follower_total AS (
       SELECT COUNT(*)::int AS followers
       FROM follows
       WHERE following_id = $1
     )
     UPDATE users
     SET followers = follower_total.followers
     FROM follower_total
     WHERE id = $1
     RETURNING users.followers`,
    [userId]
  );

  return (result.rows[0]?.followers as number | undefined) ?? 0;
}

export async function updateUser(userId: string, data: {
  name?: string;
  avatar?: string;
  city?: string;
  age?: number;
  bio?: string;
  talents?: string[];
}) {
  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (data.name !== undefined) { fields.push(`name = $${paramIndex++}`); values.push(data.name); }
  if (data.avatar !== undefined) { fields.push(`avatar = $${paramIndex++}`); values.push(data.avatar); }
  if (data.city !== undefined) { fields.push(`city = $${paramIndex++}`); values.push(data.city); }
  if (data.age !== undefined) { fields.push(`age = $${paramIndex++}`); values.push(data.age); }
  if (data.bio !== undefined) { fields.push(`bio = $${paramIndex++}`); values.push(data.bio); }
  if (data.talents !== undefined) { fields.push(`talents = $${paramIndex++}`); values.push(data.talents); }

  if (fields.length === 0) {
    return getUserById(userId);
  }

  fields.push('updated_at = NOW()');

  const result = await query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramIndex} AND is_active = true
     RETURNING id, name, email, role, avatar, city, age, bio, talents, badges, followers, total_votes, total_views, package, created_at`,
    [...values, userId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Kullanıcı bulunamadı');
  }

  const embeddingText = buildUserEmbeddingText(result.rows[0]);
  const embedding = await generateTextEmbedding(embeddingText);
  if (embedding) {
    await query(
      `UPDATE users
       SET search_embedding = $1::vector
       WHERE id = $2`,
      [formatVectorLiteral(embedding), userId]
    );
  }

  return result.rows[0];
}

export async function followUser(followerId: string, followingId: string) {
  if (followerId === followingId) {
    return { following: false, message: 'Kendinizi takip edemezsiniz' };
  }

  const blocked = await query(
    `SELECT 1
     FROM blocks
     WHERE (blocker_id = $1 AND blocked_id = $2)
        OR (blocker_id = $2 AND blocked_id = $1)
     LIMIT 1`,
    [followerId, followingId]
  );

  if (blocked.rows.length > 0) {
    throw new BadRequestError('Bu kullanici ile etkilesim sinirlandirildi');
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT id FROM follows WHERE follower_id = $1 AND following_id = $2',
      [followerId, followingId]
    );

    if (existing.rows.length > 0) {
      await client.query('DELETE FROM follows WHERE follower_id = $1 AND following_id = $2', [followerId, followingId]);
      const followers = await syncFollowerCount(client, followingId);
      await client.query('COMMIT');
      return { following: false, followers };
    }

    await client.query('INSERT INTO follows (follower_id, following_id) VALUES ($1, $2)', [followerId, followingId]);
    const followers = await syncFollowerCount(client, followingId);
    await client.query('COMMIT');

    const actor = await query('SELECT name FROM users WHERE id = $1', [followerId]);
    await createNotification({
      userId: followingId,
      actorId: followerId,
      type: 'follow',
      title: 'Yeni takipci',
      body: `${actor.rows[0]?.name || 'Bir kullanici'} seni takip etmeye basladi.`,
    }).catch(() => {});

    return { following: true, followers };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getLeaderboard(period: string = 'all', limit: number = 50) {
  let dateFilter = '';
  if (period === 'weekly') {
    dateFilter = "AND v.created_at > NOW() - INTERVAL '7 days'";
  } else if (period === 'monthly') {
    dateFilter = "AND v.created_at > NOW() - INTERVAL '30 days'";
  }

  const result = await query(
    `SELECT u.id, u.name, u.avatar, u.city, u.badges,
            COALESCE(SUM(v.votes), 0)::int as total_votes,
            COALESCE(SUM(v.views), 0)::int as total_views,
            COUNT(v.id)::int as video_count
     FROM users u
     LEFT JOIN videos v ON u.id = v.user_id AND v.status = 'ready' ${dateFilter}
     WHERE u.role = 'talent' AND u.is_active = true
     GROUP BY u.id
     ORDER BY total_votes DESC, total_views DESC
     LIMIT $1`,
    [limit]
  );

  return result.rows.map((row: Record<string, unknown>, index: number) => ({
    rank: index + 1,
    ...row,
  }));
}

export async function searchUsers(searchQuery: string, limit: number = 20) {
  const result = await query(
    `SELECT id, name, avatar, city, role, badges, followers, total_votes
     FROM users
     WHERE is_active = true AND (name ILIKE $1 OR city ILIKE $1)
     ORDER BY followers DESC
     LIMIT $2`,
    [`%${searchQuery}%`, limit]
  );

  return result.rows;
}

export async function listTalents(limit: number = 20) {
  const result = await query(
    `SELECT id, name, avatar, city, badges, total_votes, total_views
     FROM users
     WHERE role = 'talent' AND is_active = true
     ORDER BY total_votes DESC, total_views DESC
     LIMIT $1`,
    [limit]
  );

  return result.rows.map((row: Record<string, unknown>, index: number) => ({
    rank: index + 1,
    ...row,
  }));
}

export async function blockUser(blockerId: string, blockedId: string) {
  if (blockerId === blockedId) {
    throw new BadRequestError('Kendinizi engelleyemezsiniz');
  }

  const target = await query('SELECT id FROM users WHERE id = $1 AND is_active = true', [blockedId]);
  if (target.rows.length === 0) {
    throw new NotFoundError('Kullanıcı bulunamadı');
  }

  const existing = await query(
    'SELECT id FROM blocks WHERE blocker_id = $1 AND blocked_id = $2',
    [blockerId, blockedId]
  );

  if (existing.rows.length > 0) {
    return { blocked: true };
  }

  await query(
    'INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)',
    [blockerId, blockedId]
  );

  const client = await getClient();

  try {
    await client.query('BEGIN');
    await client.query(
      'DELETE FROM follows WHERE (follower_id = $1 AND following_id = $2) OR (follower_id = $2 AND following_id = $1)',
      [blockerId, blockedId]
    );
    await syncFollowerCount(client, blockerId);
    await syncFollowerCount(client, blockedId);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return { blocked: true };
}

export async function unblockUser(blockerId: string, blockedId: string) {
  await query(
    'DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2',
    [blockerId, blockedId]
  );

  return { blocked: false };
}

export async function listBlockedUsers(blockerId: string) {
  const result = await query(
    `SELECT u.id, u.name, u.avatar, u.city, u.role
     FROM blocks b
     JOIN users u ON u.id = b.blocked_id
     WHERE b.blocker_id = $1
     ORDER BY b.created_at DESC`,
    [blockerId]
  );

  return result.rows;
}

export function buildUserEmbeddingText(user: {
  name?: string;
  bio?: string;
  city?: string;
  talents?: string[];
  role?: string;
}) {
  return [
    user.name,
    user.bio,
    user.city,
    Array.isArray(user.talents) ? user.talents.join(' ') : '',
    user.role,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();
}
