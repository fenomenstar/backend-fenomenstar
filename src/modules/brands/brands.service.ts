import { query } from '../../config/database';

const fallbackBrands = [
  {
    id: 'demo-thy',
    name: 'THY',
    logo: '',
    website: 'https://www.turkishairlines.com',
    description: 'Sponsorluk ve yarışma destek markası',
    competitions: 4,
    participants: 1200,
  },
  {
    id: 'demo-pepsi',
    name: 'Pepsi',
    logo: '',
    website: 'https://www.pepsi.com',
    description: 'Kampanya ve karaoke sponsorluğu',
    competitions: 2,
    participants: 640,
  },
];

export async function listBrands(limit: number = 20) {
  const result = await query(
    `SELECT
        u.id,
        u.name,
        u.avatar AS logo,
        u.bio AS description,
        COUNT(c.id)::int AS competitions,
        COALESCE(SUM(c.participants), 0)::int AS participants
     FROM users u
     LEFT JOIN competitions c ON c.brand_id = u.id
     WHERE u.role = 'brand' AND u.is_active = true
     GROUP BY u.id
     ORDER BY competitions DESC, participants DESC, u.name ASC
     LIMIT $1`,
    [limit]
  );

  return result.rows.length > 0 ? result.rows : fallbackBrands;
}
