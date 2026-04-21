import { Request } from 'express';

export interface AuthPayload {
  userId: string;
  role: string;
  jti?: string;
  iat?: number;
  exp?: number;
}

export interface AuthRequest extends Request {
  user?: AuthPayload;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'talent' | 'viewer' | 'brand' | 'admin';
  avatar: string;
  city: string;
  age?: number;
  bio?: string;
  talents: string[];
  badges: string[];
  followers: number;
  total_votes: number;
  total_views: number;
  package?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Video {
  id: string;
  title: string;
  description: string;
  category: string;
  video_url: string;
  video_key: string;
  thumbnail: string;
  thumbnail_key: string;
  duration: number;
  width: number;
  height: number;
  file_size: number;
  user_id: string;
  competition_id?: string;
  status: 'pending' | 'processing' | 'ready' | 'failed' | 'deleted';
  featured: boolean;
  votes: number;
  views: number;
  comments_count: number;
  hls_url?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Competition {
  id: string;
  title: string;
  description: string;
  category: string;
  image: string;
  status: 'active' | 'upcoming' | 'ended';
  start_date: Date;
  end_date: Date;
  prize: string;
  participants: number;
  brand_id?: string;
  brand_name?: string;
  thematic?: string;
  created_at: Date;
  updated_at: Date;
}

export interface LiveStream {
  id: string;
  user_id: string;
  title: string;
  description: string;
  category: string;
  status: 'live' | 'ended';
  viewers: number;
  likes: number;
  competition_id?: string;
  started_at: Date;
  ended_at?: Date;
}

export interface Wallet {
  user_id: string;
  fenomen_coins: number;
  star_coins: number;
  spent_try: number;
  updated_at: Date;
}

export interface WalletTransaction {
  id: string;
  user_id: string;
  payment_intent_id?: string | null;
  type: 'topup' | 'purchase' | 'gift_sent' | 'gift_received' | 'refund' | 'adjustment';
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  title: string;
  description: string;
  currency: 'TRY' | 'fenomen_coin' | 'star_coin';
  amount: number;
  balance_after?: number | null;
  provider?: string | null;
  metadata?: Record<string, unknown>;
  created_at: Date;
}
