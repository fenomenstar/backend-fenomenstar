import { query } from '../../config/database';
import { generateId } from '../../utils/crypto';
import { NotFoundError, BadRequestError, ConflictError } from '../../utils/errors';

export async function listCompetitions(status?: string, limit: number = 20, offset: number = 0) {
  let whereClause = '';
  const values: unknown[] = [];
  let paramIndex = 1;

  if (status) {
    whereClause = `WHERE status = $${paramIndex++}`;
    values.push(status);
  }

  const result = await query(
    `SELECT * FROM competitions ${whereClause}
     ORDER BY CASE status WHEN 'active' THEN 1 WHEN 'upcoming' THEN 2 ELSE 3 END, start_date DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    [...values, limit, offset]
  );

  return result.rows;
}

export async function getCompetitionById(id: string) {
  const result = await query('SELECT * FROM competitions WHERE id = $1', [id]);
  if (result.rows.length === 0) {
    throw new NotFoundError('Yarışma bulunamadı');
  }
  return result.rows[0];
}

export async function createCompetition(data: {
  title: string;
  description: string;
  category: string;
  image?: string;
  start_date: string;
  end_date: string;
  prize?: string;
  brand_id?: string;
  brand_name?: string;
  thematic?: string;
}) {
  const id = generateId();
  const now = new Date();
  const startDate = new Date(data.start_date);
  const status = startDate > now ? 'upcoming' : 'active';

  const result = await query(
    `INSERT INTO competitions (id, title, description, category, image, status, start_date, end_date, prize, brand_id, brand_name, thematic)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [id, data.title, data.description, data.category, data.image || '',
     status, data.start_date, data.end_date, data.prize || '', data.brand_id || null,
     data.brand_name || '', data.thematic || '']
  );

  return result.rows[0];
}

export async function joinCompetition(competitionId: string, userId: string) {
  const competition = await getCompetitionById(competitionId);

  if (competition.status === 'ended') {
    throw new BadRequestError('Bu yarisma sona ermis');
  }

  const existing = await query(
    'SELECT id FROM competition_participants WHERE competition_id = $1 AND user_id = $2',
    [competitionId, userId]
  );

  if (existing.rows.length > 0) {
    throw new ConflictError('Bu yarismaya zaten katildiniz');
  }

  await query(
    'INSERT INTO competition_participants (competition_id, user_id) VALUES ($1, $2)',
    [competitionId, userId]
  );

  await query(
    'UPDATE competitions SET participants = participants + 1 WHERE id = $1',
    [competitionId]
  );

  return { joined: true };
}

export async function getCompetitionVideos(competitionId: string, limit: number = 20, offset: number = 0) {
  const result = await query(
    `SELECT v.*, u.name as user_name, u.avatar as user_avatar
     FROM videos v
     JOIN users u ON v.user_id = u.id
     WHERE v.competition_id = $1 AND v.status = 'ready'
     ORDER BY v.votes DESC
     LIMIT $2 OFFSET $3`,
    [competitionId, limit, offset]
  );

  return result.rows;
}

export async function getCompetitionLeaderboard(competitionId: string) {
  const result = await query(
    `SELECT u.id, u.name, u.avatar, u.city,
            COALESCE(SUM(v.votes), 0)::int as total_votes,
            COUNT(v.id)::int as video_count
     FROM competition_participants cp
     JOIN users u ON cp.user_id = u.id
     LEFT JOIN videos v ON v.user_id = u.id AND v.competition_id = $1 AND v.status = 'ready'
     WHERE cp.competition_id = $1
     GROUP BY u.id
     ORDER BY total_votes DESC`,
    [competitionId]
  );

  return result.rows.map((row: Record<string, unknown>, index: number) => ({
    rank: index + 1,
    ...row,
  }));
}
