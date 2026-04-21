import { query } from '../../config/database';

export async function getDashboard() {
  const [users, videos, competitions, streams] = await Promise.all([
    query('SELECT COUNT(*)::int as total, COUNT(CASE WHEN role = \'talent\' THEN 1 END)::int as talents, COUNT(CASE WHEN role = \'viewer\' THEN 1 END)::int as viewers, COUNT(CASE WHEN role = \'brand\' THEN 1 END)::int as brands FROM users WHERE is_active = true'),
    query('SELECT COUNT(*)::int as total, COUNT(CASE WHEN status = \'ready\' THEN 1 END)::int as ready, COUNT(CASE WHEN status = \'processing\' THEN 1 END)::int as processing, COALESCE(SUM(views), 0)::int as total_views, COALESCE(SUM(votes), 0)::int as total_votes FROM videos'),
    query('SELECT COUNT(*)::int as total, COUNT(CASE WHEN status = \'active\' THEN 1 END)::int as active FROM competitions'),
    query('SELECT COUNT(CASE WHEN status = \'live\' THEN 1 END)::int as live FROM live_streams'),
  ]);

  return {
    users: users.rows[0],
    videos: videos.rows[0],
    competitions: competitions.rows[0],
    streams: streams.rows[0],
  };
}

export async function listUsers(limit: number = 50, offset: number = 0, role?: string) {
  let whereClause = 'WHERE is_active = true';
  const values: unknown[] = [];
  let paramIndex = 1;

  if (role) {
    whereClause += ` AND role = $${paramIndex++}`;
    values.push(role);
  }

  const result = await query(
    `SELECT id, name, email, role, avatar, city, followers, total_votes, total_views, created_at
     FROM users ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    [...values, limit, offset]
  );

  return result.rows;
}

export async function toggleFeatured(videoId: string) {
  const result = await query(
    'UPDATE videos SET featured = NOT featured WHERE id = $1 RETURNING id, featured',
    [videoId]
  );
  return result.rows[0];
}

export async function deactivateUser(userId: string) {
  await query('UPDATE users SET is_active = false WHERE id = $1', [userId]);
  return { deactivated: true };
}

export async function listVideosForModeration(
  statuses: Array<'pending' | 'processing' | 'failed'> = ['pending', 'failed'],
  limit: number = 50,
  offset: number = 0
) {
  const result = await query(
    `SELECT v.id, v.title, v.description, v.status, v.video_url, v.thumbnail, v.created_at,
            u.id as user_id, u.name as user_name, u.email as user_email
     FROM videos v
     JOIN users u ON v.user_id = u.id
     WHERE v.status = ANY($1::text[])
     ORDER BY v.created_at DESC
     LIMIT $2 OFFSET $3`,
    [statuses, limit, offset]
  );
  return result.rows;
}

export async function setVideoModerationStatus(
  videoId: string,
  action: 'approve' | 'reject'
) {
  const nextStatus = action === 'approve' ? 'ready' : 'failed';
  const result = await query(
    `UPDATE videos
     SET status = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, status, updated_at`,
    [nextStatus, videoId]
  );

  return result.rows[0] || null;
}

export async function listReports(
  statuses: Array<'open' | 'reviewing' | 'resolved' | 'dismissed'> = ['open', 'reviewing'],
  limit: number = 50,
  offset: number = 0
) {
  const result = await query(
    `SELECT r.id, r.target_type, r.target_id, r.reason, r.details, r.status, r.created_at,
            u.id AS reporter_id, u.name AS reporter_name, u.email AS reporter_email
     FROM reports r
     JOIN users u ON u.id = r.reporter_id
     WHERE r.status = ANY($1::text[])
     ORDER BY r.created_at DESC
     LIMIT $2 OFFSET $3`,
    [statuses, limit, offset]
  );
  return result.rows;
}

export async function setReportStatus(
  reportId: string,
  status: 'reviewing' | 'resolved' | 'dismissed'
) {
  const result = await query(
    `UPDATE reports
     SET status = $1
     WHERE id = $2
     RETURNING id, status, created_at`,
    [status, reportId]
  );
  return result.rows[0] || null;
}

export async function listBlocks(limit: number = 50, offset: number = 0) {
  const result = await query(
    `SELECT b.id, b.created_at,
            blocker.id AS blocker_id, blocker.name AS blocker_name, blocker.email AS blocker_email,
            blocked.id AS blocked_id, blocked.name AS blocked_name, blocked.email AS blocked_email
     FROM blocks b
     JOIN users blocker ON blocker.id = b.blocker_id
     JOIN users blocked ON blocked.id = b.blocked_id
     ORDER BY b.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return result.rows;
}
