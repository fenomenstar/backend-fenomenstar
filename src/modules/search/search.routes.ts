import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import { query as dbQuery } from '../../config/database';
import { rateLimitMiddleware } from '../../middleware/rate-limit.middleware';
import { formatVectorLiteral, generateTextEmbedding } from '../../services/embeddings.service';

const router = Router();

// GET /api/search?q=...&type=all|videos|users
router.get('/', rateLimitMiddleware(30, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = req.query.q as string;
    const type = (req.query.type as string) || 'all';
    const mode = (req.query.mode as string) || 'fts';
    const limit = parseInt(req.query.limit as string) || 20;

    if (!q || q.length < 2) {
      res.json({ videos: [], users: [] });
      return;
    }

    const lowered = q.toLowerCase();
    const searchPattern = `%${q}%`;
    const prefixPattern = `${q}%`;
    const results: { videos?: unknown[]; users?: unknown[] } = {};
    const queryEmbedding = mode === 'semantic' || mode === 'hybrid'
      ? await generateTextEmbedding(q)
      : null;
    const vectorLiteral = queryEmbedding ? formatVectorLiteral(queryEmbedding) : null;

    if (type === 'all' || type === 'videos') {
      const videos =
        mode === 'semantic' && vectorLiteral
          ? await dbQuery(
              `SELECT v.id, v.title, v.thumbnail, v.votes, v.views, v.category,
                      u.name as user_name, u.avatar as user_avatar,
                      ROUND((1 - (v.search_embedding <=> $1::vector))::numeric, 4) AS semantic_score
               FROM videos v
               JOIN users u ON v.user_id = u.id
               WHERE v.status = 'ready'
                 AND v.search_embedding IS NOT NULL
               ORDER BY v.search_embedding <=> $1::vector, v.votes DESC
               LIMIT $2`,
              [vectorLiteral, limit]
            )
          : mode === 'hybrid' && vectorLiteral
            ? await dbQuery(
                `SELECT *
                 FROM (
                   SELECT v.id, v.title, v.thumbnail, v.votes, v.views, v.category,
                          u.name as user_name, u.avatar as user_avatar,
                          CASE
                            WHEN lower(v.title) = lower($1) THEN 1
                            WHEN lower(u.name) = lower($1) THEN 0.96
                            WHEN lower(v.title) LIKE lower($3) THEN 0.93
                            WHEN lower(u.name) LIKE lower($3) THEN 0.9
                            WHEN lower(v.title) LIKE lower($4) THEN 0.86
                            WHEN lower(u.name) LIKE lower($4) THEN 0.82
                            WHEN lower(v.description) LIKE lower($4) THEN 0.76
                            ELSE 0
                          END AS lexical_boost,
                          ts_rank(
                            to_tsvector('simple', coalesce(v.title, '') || ' ' || coalesce(v.description, '') || ' ' || coalesce(u.name, '')),
                            plainto_tsquery('simple', $1)
                          ) AS text_score,
                          (1 - (v.search_embedding <=> $2::vector)) AS semantic_score
                   FROM videos v
                   JOIN users u ON v.user_id = u.id
                   WHERE v.status = 'ready'
                     AND (
                       to_tsvector('simple', coalesce(v.title, '') || ' ' || coalesce(v.description, '') || ' ' || coalesce(u.name, ''))
                         @@ plainto_tsquery('simple', $1)
                       OR v.search_embedding IS NOT NULL
                     )
                 ) ranked
                 ORDER BY (COALESCE(lexical_boost, 0) * 0.45 + COALESCE(text_score, 0) * 0.25 + COALESCE(semantic_score, 0) * 0.30) DESC,
                          votes DESC
                 LIMIT $5`,
                [q, vectorLiteral, prefixPattern, searchPattern, limit]
              )
            : await dbQuery(
                `SELECT v.id, v.title, v.thumbnail, v.votes, v.views, v.category, u.name as user_name, u.avatar as user_avatar
                 FROM videos v JOIN users u ON v.user_id = u.id
                 WHERE v.status = 'ready' AND (v.title ILIKE $1 OR v.description ILIKE $1 OR u.name ILIKE $1)
                 ORDER BY
                   CASE
                     WHEN lower(v.title) = lower($2) THEN 1
                     WHEN lower(u.name) = lower($2) THEN 2
                     WHEN lower(v.title) LIKE lower($3) THEN 3
                     WHEN lower(u.name) LIKE lower($3) THEN 4
                     WHEN lower(v.title) LIKE lower($1) THEN 5
                     WHEN lower(u.name) LIKE lower($1) THEN 6
                     ELSE 7
                   END,
                   v.votes DESC
                 LIMIT $4`,
                [searchPattern, q, prefixPattern, limit]
              );
      results.videos = videos.rows;
    }

    if (type === 'all' || type === 'users') {
      const users =
        mode === 'semantic' && vectorLiteral
          ? await dbQuery(
              `SELECT id, name, avatar, city, role, badges, followers, total_votes,
                      ROUND((1 - (search_embedding <=> $1::vector))::numeric, 4) AS semantic_score
               FROM users
               WHERE is_active = true
                 AND search_embedding IS NOT NULL
               ORDER BY search_embedding <=> $1::vector, followers DESC
               LIMIT $2`,
              [vectorLiteral, limit]
            )
          : mode === 'hybrid' && vectorLiteral
            ? await dbQuery(
                `SELECT *
                 FROM (
                   SELECT id, name, avatar, city, role, badges, followers, total_votes,
                          CASE
                            WHEN lower(name) = lower($1) THEN 1
                            WHEN lower(name) LIKE lower($3) THEN 0.95
                            WHEN lower(name) LIKE lower($4) THEN 0.88
                            WHEN lower(city) LIKE lower($4) THEN 0.72
                            WHEN lower(bio) LIKE lower($4) THEN 0.68
                            ELSE 0
                          END AS lexical_boost,
                          ts_rank(
                            to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(city, '') || ' ' || coalesce(bio, '')),
                            plainto_tsquery('simple', $1)
                          ) AS text_score,
                          (1 - (search_embedding <=> $2::vector)) AS semantic_score
                   FROM users
                   WHERE is_active = true
                     AND (
                       to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(city, '') || ' ' || coalesce(bio, ''))
                         @@ plainto_tsquery('simple', $1)
                       OR search_embedding IS NOT NULL
                     )
                 ) ranked
                 ORDER BY (COALESCE(lexical_boost, 0) * 0.45 + COALESCE(text_score, 0) * 0.25 + COALESCE(semantic_score, 0) * 0.30) DESC,
                          followers DESC
                 LIMIT $5`,
                [q, vectorLiteral, prefixPattern, searchPattern, limit]
              )
            : await dbQuery(
                `SELECT id, name, avatar, city, role, badges, followers, total_votes
                 FROM users
                 WHERE is_active = true AND (name ILIKE $1 OR city ILIKE $1)
                 ORDER BY
                   CASE
                     WHEN lower(name) = lower($2) THEN 1
                     WHEN lower(name) LIKE lower($3) THEN 2
                     WHEN lower(name) LIKE lower($1) THEN 3
                     WHEN lower(city) LIKE lower($1) THEN 4
                     ELSE 5
                   END,
                   followers DESC
                 LIMIT $4`,
                [searchPattern, q, prefixPattern, limit]
              );
      results.users = users.rows;
    }

    res.json(results);
  } catch (err) {
    next(err);
  }
});

// GET /api/search/autocomplete?q=...
router.get('/autocomplete', rateLimitMiddleware(60, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = req.query.q as string;
    if (!q || q.length < 1) {
      res.json([]);
      return;
    }

    const searchPattern = `%${q}%`;

    const videos = await dbQuery(
      `SELECT title as label, 'video' as type FROM videos WHERE status = 'ready' AND title ILIKE $1 LIMIT 5`,
      [searchPattern]
    );

    const users = await dbQuery(
      `SELECT name as label, 'user' as type FROM users WHERE is_active = true AND name ILIKE $1 LIMIT 5`,
      [searchPattern]
    );

    res.json([...videos.rows, ...users.rows]);
  } catch (err) {
    next(err);
  }
});

export default router;
