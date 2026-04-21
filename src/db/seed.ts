import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { pool, query } from '../config/database';
import { generateId, hashPassword } from '../utils/crypto';
import { logger } from '../utils/logger';

type ReviewRole = 'talent' | 'viewer' | 'brand' | 'admin';

const seedUsers: Array<{
  email: string;
  name: string;
  role: 'talent' | 'brand';
  city: string;
  bio: string;
  talents: string[];
  followers: number;
  totalVotes: number;
  totalViews: number;
  password: string;
  wallet: { fenomen: number; star: number; spent: number };
}> = [
  {
    email: 'ceren.stage@fenomenstar.com',
    name: 'Ceren Sahne',
    role: 'talent',
    city: 'İstanbul',
    bio: 'Pop ve akustik performanslar üreten canlı yayın içerik üreticisi.',
    talents: ['Vokal', 'Karaoke', 'Canlı Yayın'],
    followers: 12400,
    totalVotes: 4620,
    totalViews: 84500,
    password: 'FenomenStar_Seed_2026!',
    wallet: { fenomen: 220, star: 18, spent: 245 },
  },
  {
    email: 'kaan.rhyme@fenomenstar.com',
    name: 'Kaan Rhyme',
    role: 'talent',
    city: 'Ankara',
    bio: 'Rap, sahne akışı ve challenge videolarında öne çıkan yetenek.',
    talents: ['Rap', 'Söz Yazımı', 'Freestyle'],
    followers: 9800,
    totalVotes: 3810,
    totalViews: 66300,
    password: 'FenomenStar_Seed_2026!',
    wallet: { fenomen: 160, star: 9, spent: 180 },
  },
  {
    email: 'mila.vision@fenomenstar.com',
    name: 'Mila Vision',
    role: 'talent',
    city: 'İzmir',
    bio: 'Dans, kısa video koreografi ve düet akışlarına odaklı üretici.',
    talents: ['Dans', 'Koreografi', 'Kısa Video'],
    followers: 15600,
    totalVotes: 5120,
    totalViews: 93200,
    password: 'FenomenStar_Seed_2026!',
    wallet: { fenomen: 340, star: 24, spent: 310 },
  },
  {
    email: 'pulse.media@fenomenstar.com',
    name: 'Pulse Media',
    role: 'brand',
    city: 'İstanbul',
    bio: 'Gençlik odaklı yarışma, canlı yayın ve marka ortaklığı partneri.',
    talents: ['Marka İş Birliği', 'Challenge', 'Sponsorluk'],
    followers: 4200,
    totalVotes: 0,
    totalViews: 0,
    password: 'FenomenStar_Seed_2026!',
    wallet: { fenomen: 0, star: 0, spent: 0 },
  },
  {
    email: 'soundwave.lab@fenomenstar.com',
    name: 'SoundWave Lab',
    role: 'brand',
    city: 'Bursa',
    bio: 'Karaoke geceleri ve ses odaklı influencer kampanyaları üretir.',
    talents: ['Ses Teknolojisi', 'Karaoke Partnerliği', 'Etkinlik'],
    followers: 3100,
    totalVotes: 0,
    totalViews: 0,
    password: 'FenomenStar_Seed_2026!',
    wallet: { fenomen: 0, star: 0, spent: 0 },
  },
];

const karaokeSongs = [
  {
    title: 'Yalan',
    artist: 'Sezen Aksu',
    cover: 'https://picsum.photos/seed/yalan/400/400',
    duration: '3:42',
    bpm: 98,
    difficulty: 'Orta',
    category: 'Pop',
  },
  {
    title: 'Bir Derdim Var',
    artist: 'Mor ve Ötesi',
    cover: 'https://picsum.photos/seed/derdimvar/400/400',
    duration: '4:05',
    bpm: 110,
    difficulty: 'Zor',
    category: 'Rock',
  },
  {
    title: 'Benimle Oynar mısın',
    artist: 'Tarkan',
    cover: 'https://picsum.photos/seed/tarkan/400/400',
    duration: '3:28',
    bpm: 102,
    difficulty: 'Kolay',
    category: 'Pop',
  },
  {
    title: 'Seni Dert Etmeler',
    artist: 'Madrigal',
    cover: 'https://picsum.photos/seed/madrigal/400/400',
    duration: '4:12',
    bpm: 95,
    difficulty: 'Orta',
    category: 'Alternatif',
  },
  {
    title: 'Fırtınam',
    artist: 'Hadise',
    cover: 'https://picsum.photos/seed/hadise/400/400',
    duration: '3:11',
    bpm: 120,
    difficulty: 'Kolay',
    category: 'Pop',
  },
];

async function findSupabaseUserByEmail(email: string) {
  if (!env.USE_SUPABASE_AUTH || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (error) {
    throw error;
  }

  return data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

async function ensureSupabaseUser(email: string, password: string, name: string, role: ReviewRole) {
  if (!env.USE_SUPABASE_AUTH || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const existing = await findSupabaseUserByEmail(email);
  if (existing) {
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: {
        ...(existing.user_metadata ?? {}),
        name,
        role,
      },
    });

    if (error) {
      throw error;
    }

    return data.user;
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role },
  });

  if (error) {
    throw error;
  }

  return data.user;
}

async function ensureLocalUser(
  userId: string,
  email: string,
  password: string,
  name: string,
  role: ReviewRole,
  city: string,
  bio: string,
  talents: string[],
  followers: number,
  totalVotes: number,
  totalViews: number
) {
  const passwordHash = env.USE_SUPABASE_AUTH ? 'SUPABASE_AUTH' : await hashPassword(password);

  await query(
    `INSERT INTO users
      (id, name, email, password_hash, role, city, bio, talents, followers, total_votes, total_views, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true)
     ON CONFLICT (email)
     DO UPDATE SET
       name = EXCLUDED.name,
       password_hash = EXCLUDED.password_hash,
       role = EXCLUDED.role,
       city = EXCLUDED.city,
       bio = EXCLUDED.bio,
       talents = EXCLUDED.talents,
       followers = EXCLUDED.followers,
       total_votes = EXCLUDED.total_votes,
       total_views = EXCLUDED.total_views,
       is_active = true,
       updated_at = NOW()`,
    [userId, name, email, passwordHash, role, city, bio, talents, followers, totalVotes, totalViews]
  );
}

async function ensureSeedUsers() {
  for (const user of seedUsers) {
    const supabaseUser = await ensureSupabaseUser(user.email, user.password, user.name, user.role);
    const existing = await query(
      `SELECT id
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [user.email]
    );

    const userId = supabaseUser?.id ?? existing.rows[0]?.id ?? generateId();

    await ensureLocalUser(
      userId,
      user.email,
      user.password,
      user.name,
      user.role,
      user.city,
      user.bio,
      user.talents,
      user.followers,
      user.totalVotes,
      user.totalViews
    );

    await query(
      `INSERT INTO wallets (user_id, fenomen_coins, star_coins, spent_try)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id)
       DO UPDATE SET
         fenomen_coins = EXCLUDED.fenomen_coins,
         star_coins = EXCLUDED.star_coins,
         spent_try = EXCLUDED.spent_try,
         updated_at = NOW()`,
      [userId, user.wallet.fenomen, user.wallet.star, user.wallet.spent]
    );
  }
}

async function ensureKaraokeSongs() {
  for (const song of karaokeSongs) {
    const exists = await query(
      `SELECT id
       FROM karaoke_songs
       WHERE title = $1 AND artist = $2
       LIMIT 1`,
      [song.title, song.artist]
    );

    if (exists.rows.length > 0) {
      await query(
        `UPDATE karaoke_songs
         SET cover = $2,
             duration = $3,
             bpm = $4,
             difficulty = $5,
             category = $6
         WHERE id = $1`,
        [exists.rows[0].id, song.cover, song.duration, song.bpm, song.difficulty, song.category]
      );
      continue;
    }

    await query(
      `INSERT INTO karaoke_songs (title, artist, cover, duration, bpm, difficulty, category)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [song.title, song.artist, song.cover, song.duration, song.bpm, song.difficulty, song.category]
    );
  }
}

async function main() {
  const email = env.PLAY_REVIEW_TEST_EMAIL;
  const password = env.PLAY_REVIEW_TEST_PASSWORD;
  const name = env.PLAY_REVIEW_TEST_NAME;
  const role = env.PLAY_REVIEW_TEST_ROLE;

  if (!password) {
    throw new Error('PLAY_REVIEW_TEST_PASSWORD must be set before running npm run seed');
  }

  logger.info('Seeding Play review account', { email, role, supabase: env.USE_SUPABASE_AUTH });

  const reviewSupabaseUser = await ensureSupabaseUser(email, password, name, role);
  const localReview = await query(
    `SELECT id
     FROM users
     WHERE email = $1
     LIMIT 1`,
    [email]
  );
  const userId = reviewSupabaseUser?.id ?? localReview.rows[0]?.id ?? generateId();

  await ensureLocalUser(
    userId,
    email,
    password,
    name,
    role,
    'Play Review',
    'Google Play inceleme hesabı',
    ['İnceleme'],
    0,
    0,
    0
  );

  await ensureSeedUsers();
  await ensureKaraokeSongs();

  console.log('\nPlay review account is ready:');
  console.log(`  Email: ${email}`);
  console.log(`  Role: ${role}`);
  console.log(`  Auth provider: ${env.USE_SUPABASE_AUTH ? 'Supabase + local mirror' : 'Local JWT auth'}`);
  console.log('  Extra seed data: talents, brands, wallets, karaoke songs');
}

main()
  .catch((error) => {
    logger.error('Seed failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
