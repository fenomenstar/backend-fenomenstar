import { query } from '../../config/database';
import { generateId } from '../../utils/crypto';
import { NotFoundError, BadRequestError, ConflictError } from '../../utils/errors';

type CompetitionStatus = 'active' | 'upcoming' | 'ended';

type CompetitionRow = {
  id: string;
  title: string;
  description: string;
  category: string;
  image?: string;
  status: CompetitionStatus;
  start_date: string | Date;
  end_date: string | Date;
  prize?: string;
  brand_id?: string | null;
  brand_name?: string;
  thematic?: string;
  participants?: number;
};

function getEffectiveCompetitionStatus(
  startDateInput: string | Date,
  endDateInput: string | Date
): CompetitionStatus {
  const now = new Date();
  const startDate = new Date(startDateInput);
  const endDate = new Date(endDateInput);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return 'upcoming';
  }

  if (endDate <= now) {
    return 'ended';
  }

  if (startDate > now) {
    return 'upcoming';
  }

  return 'active';
}

function withEffectiveStatus<T extends CompetitionRow>(competition: T): T {
  return {
    ...competition,
    status: getEffectiveCompetitionStatus(competition.start_date, competition.end_date),
  };
}

export async function listCompetitions(status?: string, limit: number = 20, offset: number = 0) {
  const result = await query(
    `SELECT *
     FROM competitions
     ORDER BY start_date DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  const competitions = result.rows.map((row) => withEffectiveStatus(row as CompetitionRow));
  const filteredCompetitions = status
    ? competitions.filter((competition) => competition.status === status)
    : competitions;

  const statusOrder: Record<CompetitionStatus, number> = {
    active: 1,
    upcoming: 2,
    ended: 3,
  };

  return filteredCompetitions.sort((a, b) => {
    const statusDiff = statusOrder[a.status] - statusOrder[b.status];
    if (statusDiff !== 0) {
      return statusDiff;
    }

    return new Date(b.start_date).getTime() - new Date(a.start_date).getTime();
  });
}

export async function getCompetitionById(id: string) {
  const result = await query('SELECT * FROM competitions WHERE id = $1', [id]);
  if (result.rows.length === 0) {
    throw new NotFoundError('Yarisma bulunamadi');
  }

  return withEffectiveStatus(result.rows[0] as CompetitionRow);
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
  const status = getEffectiveCompetitionStatus(data.start_date, data.end_date);

  const result = await query(
    `INSERT INTO competitions (id, title, description, category, image, status, start_date, end_date, prize, brand_id, brand_name, thematic)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      id,
      data.title,
      data.description,
      data.category,
      data.image || '',
      status,
      data.start_date,
      data.end_date,
      data.prize || '',
      data.brand_id || null,
      data.brand_name || '',
      data.thematic || '',
    ]
  );

  return withEffectiveStatus(result.rows[0] as CompetitionRow);
}

export async function joinCompetition(competitionId: string, userId: string) {
  const competition = await getCompetitionById(competitionId);

  if (competition.status === 'ended') {
    throw new BadRequestError('Bu yarisma sona ermis');
  }

  if (competition.status === 'upcoming') {
    throw new BadRequestError('Bu yarisma henuz baslamadi');
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

export async function getCompetitionVideos(
  competitionId: string,
  limit: number = 20,
  offset: number = 0
) {
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
