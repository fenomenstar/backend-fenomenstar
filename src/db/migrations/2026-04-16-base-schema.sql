-- FenomenStar base schema for Supabase SQL Editor
-- Run this first.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.users (
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

CREATE TABLE IF NOT EXISTS public.refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  revoked BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON public.refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON public.refresh_tokens(token_hash);

CREATE TABLE IF NOT EXISTS public.videos (
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
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_videos_user ON public.videos(user_id);
CREATE INDEX IF NOT EXISTS idx_videos_competition ON public.videos(competition_id);
CREATE INDEX IF NOT EXISTS idx_videos_status ON public.videos(status);
CREATE INDEX IF NOT EXISTS idx_videos_category ON public.videos(category);
CREATE INDEX IF NOT EXISTS idx_videos_created ON public.videos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_votes ON public.videos(votes DESC);

CREATE TABLE IF NOT EXISTS public.votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_votes_video ON public.votes(video_id);
CREATE INDEX IF NOT EXISTS idx_votes_user ON public.votes(user_id);

CREATE TABLE IF NOT EXISTS public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_video ON public.comments(video_id);

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  actor_id UUID DEFAULT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  video_id UUID DEFAULT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL CHECK (type IN ('like', 'comment', 'follow', 'system', 'moderation')),
  title VARCHAR(160) NOT NULL,
  body TEXT DEFAULT '',
  read_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON public.notifications(user_id, read_at);

CREATE TABLE IF NOT EXISTS public.competitions (
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
  brand_id UUID DEFAULT NULL REFERENCES public.users(id),
  brand_name VARCHAR(100) DEFAULT '',
  thematic VARCHAR(100) DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competitions_status ON public.competitions(status);

CREATE TABLE IF NOT EXISTS public.competition_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  video_id UUID DEFAULT NULL REFERENCES public.videos(id),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(competition_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.live_streams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_streams_status ON public.live_streams(status);

CREATE TABLE IF NOT EXISTS public.follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(follower_id, following_id)
);

CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) UNIQUE NOT NULL,
  color VARCHAR(7) DEFAULT '#7c3aed',
  icon VARCHAR(50) DEFAULT 'star',
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.karaoke_songs (
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

CREATE INDEX IF NOT EXISTS idx_videos_search
  ON public.videos
  USING gin(to_tsvector('simple', title || ' ' || description));

CREATE INDEX IF NOT EXISTS idx_users_search
  ON public.users
  USING gin(to_tsvector('simple', name || ' ' || COALESCE(bio, '')));
