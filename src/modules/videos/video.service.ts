import { query } from '../../config/database';
import { generateUploadUrl, generateSignedViewUrl, deleteFile } from '../../config/storage';
import { generateId } from '../../utils/crypto';
import { NotFoundError, BadRequestError, ForbiddenError } from '../../utils/errors';
import { CreateVideoInput, ListVideosInput } from './video.schema';
import { VIDEO_LIMITS } from '../../config/constants';
import { createNotification } from '../../services/notifications.service';
import { generateTextEmbedding, formatVectorLiteral } from '../../services/embeddings.service';

export async function getUploadUrl(userId: string, contentType: string, fileExtension: string, type: 'video' | 'thumbnail') {
  // Validate content type before generating presigned URL
  if (type === 'video' && !VIDEO_LIMITS.ALLOWED_MIME_TYPES.includes(contentType)) {
    throw new BadRequestError(`Desteklenmeyen video tipi: ${contentType}`);
  }
  
  return generateUploadUrl(userId, type, contentType, fileExtension);
}

export async function createVideo(userId: string, input: CreateVideoInput) {
  const id = generateId();

  // Server-side validation of limits
  if (input.file_size > VIDEO_LIMITS.MAX_FILE_SIZE) {
    throw new BadRequestError(`Dosya boyutu limiti asildi: ${VIDEO_LIMITS.MAX_FILE_SIZE / (1024 * 1024)}MB`);
  }
  
  if (input.duration > VIDEO_LIMITS.MAX_DURATION) {
    throw new BadRequestError(`Video suresi limiti asildi: ${VIDEO_LIMITS.MAX_DURATION} saniye`);
  }

  const result = await query(
    `INSERT INTO videos (id, title, description, category, user_id, competition_id, duration, width, height, file_size, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')
     RETURNING *`,
    [id, input.title, input.description, input.category, userId,
     input.competition_id || null, input.duration, input.width, input.height, input.file_size]
  );

  const embeddingText = buildVideoEmbeddingText(result.rows[0]);
  const embedding = await generateTextEmbedding(embeddingText);
  if (embedding) {
    await query(
      `UPDATE videos
       SET search_embedding = $1::vector
       WHERE id = $2`,
      [formatVectorLiteral(embedding), id]
    );
    result.rows[0].search_embedding = embedding;
  }

  return result.rows[0];
}

export async function updateVideoAfterUpload(
  videoId: string,
  userId: string,
  data: { video_url: string; video_key: string; thumbnail?: string; thumbnail_key?: string }
) {
  // Status remains 'pending' - will be set to 'processing' by queue, then 'ready' after validation
  const result = await query(
    `UPDATE videos SET video_url = $1, video_key = $2, thumbnail = COALESCE($3, thumbnail),
     thumbnail_key = COALESCE($4, thumbnail_key), status = 'pending', updated_at = NOW()
     WHERE id = $5 AND user_id = $6
     RETURNING *`,
    [data.video_url, data.video_key, data.thumbnail || null, data.thumbnail_key || null, videoId, userId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Video bulunamadi');
  }

  const source = await query(
    `SELECT title, description, category
     FROM videos
     WHERE id = $1`,
    [videoId]
  );
  const embeddingText = buildVideoEmbeddingText(source.rows[0] || {});
  const embedding = await generateTextEmbedding(embeddingText);
  if (embedding) {
    await query(
      `UPDATE videos
       SET search_embedding = $1::vector
       WHERE id = $2`,
      [formatVectorLiteral(embedding), videoId]
    );
    result.rows[0].search_embedding = embedding;
  }

  return result.rows[0];
}

export async function markVideoReadyWithoutProcessing(videoId: string, userId: string) {
  const result = await query(
    `UPDATE videos
     SET status = 'ready', updated_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [videoId, userId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Video bulunamadi');
  }

  return result.rows[0];
}

export async function listVideos(params: ListVideosInput, viewerId?: string | null) {
  let whereClause = 'WHERE v.status = \'ready\'';
  const values: unknown[] = [];
  let paramIndex = 1;

  if (params.category) {
    whereClause += ` AND v.category = $${paramIndex++}`;
    values.push(params.category);
  }

  if (params.competition_id) {
    whereClause += ` AND v.competition_id = $${paramIndex++}`;
    values.push(params.competition_id);
  }

  if (params.user_id) {
    whereClause += ` AND v.user_id = $${paramIndex++}`;
    values.push(params.user_id);
  }

  if (params.search) {
    whereClause += ` AND (v.title ILIKE $${paramIndex} OR v.description ILIKE $${paramIndex})`;
    values.push(`%${params.search}%`);
    paramIndex++;
  }

  if (viewerId) {
    whereClause += ` AND NOT EXISTS (
      SELECT 1
      FROM blocks b
      WHERE (b.blocker_id = $${paramIndex} AND b.blocked_id = v.user_id)
         OR (b.blocker_id = v.user_id AND b.blocked_id = $${paramIndex})
    )`;
    values.push(viewerId);
    paramIndex++;
  }

  let orderBy = 'v.created_at DESC';
  if (params.sort === 'most_voted') orderBy = 'v.votes DESC, v.created_at DESC';
  if (params.sort === 'most_viewed') orderBy = 'v.views DESC, v.created_at DESC';

  const result = await query(
    `SELECT v.*, u.name as user_name, u.avatar as user_avatar
     FROM videos v
     JOIN users u ON v.user_id = u.id
     ${whereClause}
     ORDER BY ${orderBy}
     LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    [...values, params.limit, params.offset]
  );

  return result.rows;
}

export async function listMyVideos(userId: string, limit: number = 50, offset: number = 0) {
  const result = await query(
    `SELECT v.*, u.name as user_name, u.avatar as user_avatar
     FROM videos v
     JOIN users u ON v.user_id = u.id
     WHERE v.user_id = $1 AND v.status != 'deleted'
     ORDER BY v.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  return result.rows;
}

export async function getVideoById(videoId: string, viewerId?: string | null) {
  const result = await query(
    `SELECT v.*, u.name as user_name, u.avatar as user_avatar
     FROM videos v
     JOIN users u ON v.user_id = u.id
     WHERE v.id = $1 AND v.status != 'deleted'
       AND (
         $2::uuid IS NULL
         OR NOT EXISTS (
           SELECT 1
           FROM blocks b
           WHERE (b.blocker_id = $2 AND b.blocked_id = v.user_id)
              OR (b.blocker_id = v.user_id AND b.blocked_id = $2)
         )
       )`,
    [videoId, viewerId ?? null]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Video bulunamadi');
  }

  // Increment view count on both video and owner's aggregate stats
  await query('UPDATE videos SET views = views + 1 WHERE id = $1', [videoId]);
  await query('UPDATE users SET total_views = total_views + 1 WHERE id = $1', [result.rows[0].user_id]);

  return result.rows[0];
}

export async function getSignedVideoUrl(videoKey: string) {
  if (!videoKey) return null;
  return generateSignedViewUrl(videoKey, 3600);
}

export async function voteVideo(userId: string, videoId: string) {
  // Check if already voted
  const existing = await query(
    'SELECT id FROM votes WHERE user_id = $1 AND video_id = $2',
    [userId, videoId]
  );

  if (existing.rows.length > 0) {
    // Remove vote
    await query('DELETE FROM votes WHERE user_id = $1 AND video_id = $2', [userId, videoId]);
    await query('UPDATE videos SET votes = votes - 1 WHERE id = $1', [videoId]);

    // Update user total_votes
    const video = await query('SELECT user_id FROM videos WHERE id = $1', [videoId]);
    if (video.rows.length > 0) {
      await query('UPDATE users SET total_votes = total_votes - 1 WHERE id = $1', [video.rows[0].user_id]);
    }

    return { voted: false };
  }

  // Add vote
  await query(
    'INSERT INTO votes (user_id, video_id) VALUES ($1, $2)',
    [userId, videoId]
  );
  await query('UPDATE videos SET votes = votes + 1 WHERE id = $1', [videoId]);

  // Update user total_votes
  const video = await query(
    `SELECT v.user_id, v.title, u.name AS actor_name
     FROM videos v
     LEFT JOIN users u ON u.id = $2
     WHERE v.id = $1`,
    [videoId, userId]
  );
  if (video.rows.length > 0) {
    await query('UPDATE users SET total_votes = total_votes + 1 WHERE id = $1', [video.rows[0].user_id]);

    if (video.rows[0].user_id !== userId) {
      await createNotification({
        userId: video.rows[0].user_id,
        actorId: userId,
        videoId,
        type: 'like',
        title: 'Videon begenildi',
        body: `${video.rows[0].actor_name || 'Bir kullanici'} "${video.rows[0].title}" videosunu begendi.`,
      }).catch(() => {});
    }
  }

  return { voted: true };
}

export async function addComment(userId: string, videoId: string, text: string) {
  const id = generateId();

  // Verify video exists
  const video = await query(
    `SELECT v.id, v.user_id, v.title, u.name AS actor_name
     FROM videos v
     LEFT JOIN users u ON u.id = $2
     WHERE v.id = $1 AND v.status != 'deleted'`,
    [videoId, userId]
  );
  if (video.rows.length === 0) {
    throw new NotFoundError('Video bulunamadi');
  }

  const result = await query(
    `INSERT INTO comments (id, user_id, video_id, text)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [id, userId, videoId, text]
  );

  await query('UPDATE videos SET comments_count = comments_count + 1 WHERE id = $1', [videoId]);

  // Get user info for response
  const user = await query('SELECT name, avatar FROM users WHERE id = $1', [userId]);

  if (video.rows[0].user_id !== userId) {
    await createNotification({
      userId: video.rows[0].user_id,
      actorId: userId,
      videoId,
      type: 'comment',
      title: 'Videona yorum yapildi',
      body: `${user.rows[0]?.name || video.rows[0].actor_name || 'Bir kullanici'} "${video.rows[0].title}" videosuna yorum yapti.`,
    }).catch(() => {});
  }

  return {
    ...result.rows[0],
    user_name: user.rows[0]?.name,
    user_avatar: user.rows[0]?.avatar,
  };
}

export async function getComments(videoId: string, limit: number = 20, offset: number = 0) {
  const result = await query(
    `SELECT c.*, u.name as user_name, u.avatar as user_avatar
     FROM comments c
     JOIN users u ON c.user_id = u.id
     WHERE c.video_id = $1
     ORDER BY c.created_at DESC
     LIMIT $2 OFFSET $3`,
    [videoId, limit, offset]
  );

  return result.rows;
}

export async function deleteVideo(videoId: string, userId: string, userRole: string) {
  const video = await query('SELECT * FROM videos WHERE id = $1', [videoId]);
  if (video.rows.length === 0) {
    throw new NotFoundError('Video bulunamadi');
  }

  if (video.rows[0].user_id !== userId && userRole !== 'admin') {
    throw new ForbiddenError('Bu videoyu silme yetkiniz yok');
  }

  // Delete files from storage
  if (video.rows[0].video_key) {
    await deleteFile(video.rows[0].video_key).catch(() => {});
  }
  if (video.rows[0].thumbnail_key) {
    await deleteFile(video.rows[0].thumbnail_key).catch(() => {});
  }

  await query('UPDATE videos SET status = \'deleted\' WHERE id = $1', [videoId]);
  return { deleted: true };
}

export async function getFeaturedVideos(limit: number = 10) {
  const result = await query(
    `SELECT v.*, u.name as user_name, u.avatar as user_avatar
     FROM videos v
     JOIN users u ON v.user_id = u.id
     WHERE v.featured = true AND v.status = 'ready'
     ORDER BY v.created_at DESC
     LIMIT $1`,
    [limit]
  );

  return result.rows;
}

export function buildVideoEmbeddingText(video: {
  title?: string;
  description?: string;
  category?: string;
}) {
  return [video.title, video.description, video.category].filter(Boolean).join(' ').trim();
}
