import { query } from '../config/database';

export type NotificationType = 'like' | 'comment' | 'follow' | 'system' | 'moderation';

export async function createNotification(input: {
  userId: string;
  actorId?: string | null;
  videoId?: string | null;
  type: NotificationType;
  title: string;
  body?: string;
}) {
  const result = await query(
    `INSERT INTO notifications (user_id, actor_id, video_id, type, title, body)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      input.userId,
      input.actorId ?? null,
      input.videoId ?? null,
      input.type,
      input.title,
      input.body ?? '',
    ]
  );

  return result.rows[0];
}

export async function listNotifications(userId: string, limit: number = 20, offset: number = 0) {
  const result = await query(
    `SELECT n.*, actor.name AS actor_name, actor.avatar AS actor_avatar
     FROM notifications n
     LEFT JOIN users actor ON actor.id = n.actor_id
     WHERE n.user_id = $1
     ORDER BY n.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  return result.rows;
}

export async function getUnreadNotificationCount(userId: string) {
  const result = await query(
    `SELECT COUNT(*)::int AS count
     FROM notifications
     WHERE user_id = $1 AND read_at IS NULL`,
    [userId]
  );

  return result.rows[0]?.count ?? 0;
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const result = await query(
    `UPDATE notifications
     SET read_at = COALESCE(read_at, NOW())
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [notificationId, userId]
  );

  return result.rows[0] ?? null;
}

export async function markAllNotificationsRead(userId: string) {
  const result = await query(
    `UPDATE notifications
     SET read_at = COALESCE(read_at, NOW())
     WHERE user_id = $1 AND read_at IS NULL
     RETURNING id`,
    [userId]
  );

  return { updated: result.rowCount ?? 0 };
}
