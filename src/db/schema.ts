// PostgreSQL Schema - Run with: tsx src/db/migrate.ts

export const schema = `
-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'viewer' CHECK (role IN ('talent', 'viewer', 'brand', 'admin')),
  avatar VARCHAR(500) DEFAULT '',
  city VARCHAR(100) DEFAULT '',
  age INTEGER DEFAULT 0,
  bio TEXT DEFAULT '',
  talents TEXT[] DEFAULT '{}',
  badges TEXT[] DEFAULT '{}',
  followers INTEGER DEFAULT 0,
  total_votes INTEGER DEFAULT 0,
  total_views INTEGER DEFAULT 0,
  package VARCHAR(20) DEFAULT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Refresh Tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  revoked BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);

-- Videos
CREATE TABLE IF NOT EXISTS videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  description TEXT DEFAULT '',
  category VARCHAR(50) NOT NULL,
  video_url VARCHAR(500) DEFAULT '',
  video_key VARCHAR(500) DEFAULT '',
  thumbnail VARCHAR(500) DEFAULT '',
  thumbnail_key VARCHAR(500) DEFAULT '',
  duration INTEGER DEFAULT 0,
  width INTEGER DEFAULT 0,
  height INTEGER DEFAULT 0,
  file_size BIGINT DEFAULT 0,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  competition_id UUID DEFAULT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'failed', 'deleted')),
  featured BOOLEAN DEFAULT false,
  votes INTEGER DEFAULT 0,
  views INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  hls_url VARCHAR(500) DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_videos_user ON videos(user_id);
CREATE INDEX IF NOT EXISTS idx_videos_competition ON videos(competition_id);
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
CREATE INDEX IF NOT EXISTS idx_videos_category ON videos(category);
CREATE INDEX IF NOT EXISTS idx_videos_created ON videos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_votes ON videos(votes DESC);

-- Votes
CREATE TABLE IF NOT EXISTS votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_votes_video ON votes(video_id);
CREATE INDEX IF NOT EXISTS idx_votes_user ON votes(user_id);

-- Comments
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_video ON comments(video_id);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id UUID DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL,
  video_id UUID DEFAULT NULL REFERENCES videos(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL CHECK (type IN ('like', 'comment', 'follow', 'system', 'moderation')),
  title VARCHAR(160) NOT NULL,
  body TEXT DEFAULT '',
  read_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, read_at);

-- Blocks
CREATE TABLE IF NOT EXISTS blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_blocks_blocker ON blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_id);

-- Reports
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('user', 'video', 'comment', 'chat')),
  target_id UUID NOT NULL,
  reason VARCHAR(80) NOT NULL,
  details TEXT DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC);

-- Competitions
CREATE TABLE IF NOT EXISTS competitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  description TEXT DEFAULT '',
  category VARCHAR(50) NOT NULL,
  image VARCHAR(500) DEFAULT '',
  status VARCHAR(20) DEFAULT 'upcoming' CHECK (status IN ('active', 'upcoming', 'ended')),
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  prize VARCHAR(200) DEFAULT '',
  participants INTEGER DEFAULT 0,
  brand_id UUID DEFAULT NULL REFERENCES users(id),
  brand_name VARCHAR(100) DEFAULT '',
  thematic VARCHAR(100) DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competitions_status ON competitions(status);

-- Competition Participants
CREATE TABLE IF NOT EXISTS competition_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id UUID DEFAULT NULL REFERENCES videos(id),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(competition_id, user_id)
);

-- Live Streams
CREATE TABLE IF NOT EXISTS live_streams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT DEFAULT '',
  category VARCHAR(50) DEFAULT 'Genel',
  status VARCHAR(20) DEFAULT 'live' CHECK (status IN ('live', 'ended')),
  viewers INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  competition_id UUID DEFAULT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_streams_status ON live_streams(status);

-- Follows
CREATE TABLE IF NOT EXISTS follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(follower_id, following_id)
);

-- Categories
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) UNIQUE NOT NULL,
  color VARCHAR(7) DEFAULT '#7c3aed',
  icon VARCHAR(50) DEFAULT 'star',
  sort_order INTEGER DEFAULT 0
);

-- Karaoke Songs
CREATE TABLE IF NOT EXISTS karaoke_songs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  artist VARCHAR(200) NOT NULL,
  cover VARCHAR(500) DEFAULT '',
  audio_url VARCHAR(500) DEFAULT '',
  duration VARCHAR(10) DEFAULT '0:00',
  bpm INTEGER DEFAULT 120,
  difficulty VARCHAR(20) DEFAULT 'normal',
  category VARCHAR(20) DEFAULT 'pop',
  lyrics JSONB DEFAULT '[]'
);

-- Wallets
CREATE TABLE IF NOT EXISTS wallets (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  fenomen_coins INTEGER NOT NULL DEFAULT 0,
  star_coins INTEGER NOT NULL DEFAULT 0,
  spent_try NUMERIC(10,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payment Intents
CREATE TABLE IF NOT EXISTS payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  package_id VARCHAR(80) NOT NULL,
  provider VARCHAR(30) NOT NULL,
  platform VARCHAR(20) DEFAULT 'unknown',
  type VARCHAR(20) NOT NULL CHECK (type IN ('coin', 'subscription', 'manual_topup')),
  currency VARCHAR(20) NOT NULL CHECK (currency IN ('TRY', 'fenomen_coin', 'star_coin')),
  coin_currency VARCHAR(20) DEFAULT NULL CHECK (coin_currency IS NULL OR coin_currency IN ('fenomen_coin', 'star_coin')),
  coin_amount INTEGER NOT NULL DEFAULT 0,
  try_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  bonus_coin_amount INTEGER NOT NULL DEFAULT 0,
  provider_reference VARCHAR(160) DEFAULT NULL,
  checkout_url VARCHAR(500) DEFAULT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_intents_user_created ON payment_intents(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_intents_status ON payment_intents(status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_intents_provider_reference_unique
ON payment_intents(provider, provider_reference)
WHERE provider_reference IS NOT NULL;

-- Wallet Transactions
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payment_intent_id UUID DEFAULT NULL REFERENCES payment_intents(id) ON DELETE SET NULL,
  type VARCHAR(30) NOT NULL CHECK (type IN ('topup', 'purchase', 'gift_sent', 'gift_received', 'refund', 'adjustment')),
  status VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
  title VARCHAR(160) NOT NULL,
  description TEXT DEFAULT '',
  currency VARCHAR(20) NOT NULL CHECK (currency IN ('TRY', 'fenomen_coin', 'star_coin')),
  amount NUMERIC(10,2) NOT NULL,
  balance_after NUMERIC(10,2) DEFAULT NULL,
  provider VARCHAR(30) DEFAULT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_created ON wallet_transactions(user_id, created_at DESC);

-- Doping Purchases
CREATE TABLE IF NOT EXISTS doping_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id VARCHAR(80) NOT NULL,
  name VARCHAR(160) NOT NULL,
  currency VARCHAR(20) NOT NULL CHECK (currency IN ('fenomen_coin', 'star_coin')),
  price INTEGER NOT NULL,
  boost VARCHAR(160) DEFAULT '',
  duration_label VARCHAR(80) DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
  expires_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doping_purchases_user_created ON doping_purchases(user_id, created_at DESC);

-- Gift Transactions
CREATE TABLE IF NOT EXISTS gift_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stream_id UUID DEFAULT NULL REFERENCES live_streams(id) ON DELETE SET NULL,
  gift_id VARCHAR(80) NOT NULL,
  gift_name VARCHAR(120) NOT NULL,
  currency VARCHAR(20) NOT NULL CHECK (currency IN ('fenomen_coin', 'star_coin')),
  amount INTEGER NOT NULL,
  message VARCHAR(300) DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gift_transactions_sender_created ON gift_transactions(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gift_transactions_recipient_created ON gift_transactions(recipient_id, created_at DESC);

-- Payment Webhook Events
CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(30) NOT NULL,
  event_type VARCHAR(120) NOT NULL,
  external_id VARCHAR(160) DEFAULT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_videos_search ON videos USING gin(to_tsvector('simple', title || ' ' || description));
CREATE INDEX IF NOT EXISTS idx_users_search ON users USING gin(to_tsvector('simple', name || ' ' || COALESCE(bio, '')));

-- Supabase / RLS preparation.
-- Applied only when the database exposes auth.uid() (Supabase Postgres).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'uid'
      AND n.nspname = 'auth'
  ) THEN
    EXECUTE 'ALTER TABLE users ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE videos ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE comments ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE votes ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE live_streams ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE notifications ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE blocks ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE reports ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS users_select_public ON users';
    EXECUTE $policy$
      CREATE POLICY users_select_public ON users
      FOR SELECT
      USING (is_active = true)
    $policy$;

    EXECUTE 'DROP POLICY IF EXISTS users_update_own ON users';
    EXECUTE $policy$
      CREATE POLICY users_update_own ON users
      FOR UPDATE
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id)
    $policy$;

    EXECUTE 'DROP POLICY IF EXISTS videos_select_ready_or_owner ON videos';
    EXECUTE $policy$
      CREATE POLICY videos_select_ready_or_owner ON videos
      FOR SELECT
      USING (status = 'ready' OR auth.uid() = user_id)
    $policy$;

    EXECUTE 'DROP POLICY IF EXISTS videos_insert_own ON videos';
    EXECUTE $policy$
      CREATE POLICY videos_insert_own ON videos
      FOR INSERT
      WITH CHECK (auth.uid() = user_id)
    $policy$;

    EXECUTE 'DROP POLICY IF EXISTS videos_update_own ON videos';
    EXECUTE $policy$
      CREATE POLICY videos_update_own ON videos
      FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id)
    $policy$;

    EXECUTE 'DROP POLICY IF EXISTS comments_select_public ON comments';
    EXECUTE $policy$
      CREATE POLICY comments_select_public ON comments
      FOR SELECT
      USING (true)
    $policy$;

    EXECUTE 'DROP POLICY IF EXISTS comments_insert_own ON comments';
    EXECUTE $policy$
      CREATE POLICY comments_insert_own ON comments
      FOR INSERT
      WITH CHECK (auth.uid() = user_id)
    $policy$;

    EXECUTE 'DROP POLICY IF EXISTS votes_select_own ON votes';
    EXECUTE $policy$
      CREATE POLICY votes_select_own ON votes
      FOR SELECT
      USING (auth.uid() = user_id)
    $policy$;

    EXECUTE 'DROP POLICY IF EXISTS votes_insert_own ON votes';
    EXECUTE $policy$
      CREATE POLICY votes_insert_own ON votes
      FOR INSERT
      WITH CHECK (auth.uid() = user_id)
    $policy$;

    EXECUTE 'DROP POLICY IF EXISTS votes_delete_own ON votes';
    EXECUTE $policy$
      CREATE POLICY votes_delete_own ON votes
      FOR DELETE
      USING (auth.uid() = user_id)
    $policy$;

    EXECUTE 'DROP POLICY IF EXISTS notifications_select_own ON notifications';
    EXECUTE $policy$
      CREATE POLICY notifications_select_own ON notifications
      FOR SELECT
      USING (auth.uid() = user_id)
    $policy$;

    EXECUTE 'DROP POLICY IF EXISTS notifications_update_own ON notifications';
    EXECUTE $policy$
      CREATE POLICY notifications_update_own ON notifications
      FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id)
    $policy$;

    EXECUTE 'DROP POLICY IF EXISTS blocks_select_own ON blocks';
    EXECUTE $policy$
      CREATE POLICY blocks_select_own ON blocks
      FOR SELECT
      USING (auth.uid() = blocker_id)
    $policy$;

    EXECUTE 'DROP POLICY IF EXISTS blocks_insert_own ON blocks';
    EXECUTE $policy$
      CREATE POLICY blocks_insert_own ON blocks
      FOR INSERT
      WITH CHECK (auth.uid() = blocker_id)
    $policy$;

    EXECUTE 'DROP POLICY IF EXISTS blocks_delete_own ON blocks';
    EXECUTE $policy$
      CREATE POLICY blocks_delete_own ON blocks
      FOR DELETE
      USING (auth.uid() = blocker_id)
    $policy$;

    EXECUTE 'DROP POLICY IF EXISTS reports_select_own ON reports';
    EXECUTE $policy$
      CREATE POLICY reports_select_own ON reports
      FOR SELECT
      USING (auth.uid() = reporter_id)
    $policy$;

    EXECUTE 'DROP POLICY IF EXISTS reports_insert_own ON reports';
    EXECUTE $policy$
      CREATE POLICY reports_insert_own ON reports
      FOR INSERT
      WITH CHECK (auth.uid() = reporter_id)
    $policy$;
  END IF;
END $$;
`;
