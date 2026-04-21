-- FenomenStar Supabase preparation
-- Run this in Supabase SQL Editor when the project DB is moved to Supabase.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS search_embedding vector(1536);

ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS search_embedding vector(1536);

CREATE INDEX IF NOT EXISTS idx_users_search_embedding
  ON public.users
  USING ivfflat (search_embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_videos_search_embedding
  ON public.videos
  USING ivfflat (search_embedding vector_cosine_ops)
  WITH (lists = 100);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_select_public ON public.users;
CREATE POLICY users_select_public ON public.users
  FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS users_update_own ON public.users;
CREATE POLICY users_update_own ON public.users
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS videos_select_ready_or_owner ON public.videos;
CREATE POLICY videos_select_ready_or_owner ON public.videos
  FOR SELECT
  USING (status = 'ready' OR auth.uid() = user_id);

DROP POLICY IF EXISTS videos_insert_own ON public.videos;
CREATE POLICY videos_insert_own ON public.videos
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS videos_update_own ON public.videos;
CREATE POLICY videos_update_own ON public.videos
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS comments_select_public ON public.comments;
CREATE POLICY comments_select_public ON public.comments
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS comments_insert_own ON public.comments;
CREATE POLICY comments_insert_own ON public.comments
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS votes_select_own ON public.votes;
CREATE POLICY votes_select_own ON public.votes
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS votes_insert_own ON public.votes;
CREATE POLICY votes_insert_own ON public.votes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS votes_delete_own ON public.votes;
CREATE POLICY votes_delete_own ON public.votes
  FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
