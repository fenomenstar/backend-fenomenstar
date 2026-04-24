import { query } from '../../config/database';
import { generateId, generateTurnCredentials } from '../../utils/crypto';
import { NotFoundError, BadRequestError } from '../../utils/errors';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

export async function createStream(
  userId: string,
  data: {
    title: string;
    description?: string;
    category?: string;
    competition_id?: string;
  }
) {
  if (!isLiveStreamingAvailable()) {
    logger.error('TURN server not configured - live streaming disabled');
    throw new BadRequestError(
      'Canli yayin su anda kullanilamaz. Sistem yapilandirmasi eksik.'
    );
  }

  const id = generateId();

  const result = await query(
    `INSERT INTO live_streams (id, user_id, title, description, category, competition_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [id, userId, data.title, data.description || '', data.category || 'Genel', data.competition_id || null]
  );

  logger.info('Live stream created', {
    streamId: id,
    userId,
    category: data.category || 'Genel',
  });

  return result.rows[0];
}

export async function endStream(streamId: string, userId: string) {
  const result = await query(
    `UPDATE live_streams SET status = 'ended', ended_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status = 'live'
     RETURNING *`,
    [streamId, userId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Canli yayin bulunamadi');
  }

  logger.info('Live stream ended', { streamId, userId });
  return result.rows[0];
}

export async function getActiveStreams(limit: number = 20) {
  const result = await query(
    `SELECT ls.*, u.name as user_name, u.avatar as user_avatar
     FROM live_streams ls
     JOIN users u ON ls.user_id = u.id
     WHERE ls.status = 'live'
     ORDER BY ls.viewers DESC, ls.started_at DESC
     LIMIT $1`,
    [limit]
  );

  return result.rows;
}

export async function getStreamById(streamId: string) {
  const result = await query(
    `SELECT ls.*, u.name as user_name, u.avatar as user_avatar
     FROM live_streams ls
     JOIN users u ON ls.user_id = u.id
     WHERE ls.id = $1`,
    [streamId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Yayin bulunamadi');
  }

  return result.rows[0];
}

export async function updateViewerCount(streamId: string, delta: number) {
  await query(
    'UPDATE live_streams SET viewers = GREATEST(0, viewers + $1) WHERE id = $2',
    [delta, streamId]
  );
}

export async function likeStream(streamId: string) {
  await query('UPDATE live_streams SET likes = likes + 1 WHERE id = $1', [streamId]);
}

async function getCloudflareTurnCredentials(): Promise<{
  urls: string[];
  username: string;
  credential: string;
  ttl: number;
}> {
  if (!env.CLOUDFLARE_TURN_KEY_ID || !env.CLOUDFLARE_TURN_API_TOKEN) {
    throw new BadRequestError('Cloudflare TURN anahtarlari eksik.');
  }

  const ttl = 86400;
  const response = await fetch(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${env.CLOUDFLARE_TURN_KEY_ID}/credentials/generate-ice-servers`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.CLOUDFLARE_TURN_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl }),
    }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new BadRequestError(
      `Cloudflare TURN bilgileri alinamadi (${response.status}). ${body}`.trim()
    );
  }

  const data = (await response.json()) as {
    iceServers?: Array<{ urls: string[]; username?: string; credential?: string }>;
  };

  const turnServer = data.iceServers?.find(
    (server) => Array.isArray(server.urls) && !!server.username && !!server.credential
  );

  if (!turnServer?.urls?.length || !turnServer.username || !turnServer.credential) {
    throw new BadRequestError('Cloudflare TURN yaniti gecersiz.');
  }

  const urls = turnServer.urls.filter((url) => !url.includes(':53?transport='));

  return {
    urls,
    username: turnServer.username,
    credential: turnServer.credential,
    ttl,
  };
}

export async function getTurnCredentials(userId: string): Promise<{
  urls: string[];
  username: string;
  credential: string;
  ttl: number;
}> {
  if (!isLiveStreamingAvailable()) {
    logger.error('TURN server not configured', { userId });
    throw new BadRequestError(
      'WebRTC yapilandirmasi eksik. Canli yayin kullanilamaz.'
    );
  }

  if (env.TURN_PROVIDER === 'cloudflare') {
    const credentials = await getCloudflareTurnCredentials();
    logger.debug('Cloudflare TURN credentials generated', {
      userId,
      ttl: credentials.ttl,
      urlCount: credentials.urls.length,
    });
    return credentials;
  }

  const turnSecret = env.TURN_SECRET;
  const turnServer = env.TURN_SERVER;

  if (!turnSecret || !turnServer) {
    throw new BadRequestError('TURN yapilandirmasi eksik.');
  }

  const ttl = 86400;
  const credentials = generateTurnCredentials(userId, turnSecret, ttl);

  const turnUrls: string[] = [];
  turnUrls.push(turnServer);

  if (!turnServer.includes('?transport=')) {
    turnUrls.push(`${turnServer}?transport=tcp`);
  }

  const turnsServer = turnServer.replace('turn:', 'turns:').replace(':3478', ':5349');
  turnUrls.push(turnsServer);

  logger.debug('TURN credentials generated', { userId, ttl, urlCount: turnUrls.length });

  return {
    urls: turnUrls,
    username: credentials.username,
    credential: credentials.credential,
    ttl,
  };
}

export function isLiveStreamingAvailable(): boolean {
  if (env.TURN_PROVIDER === 'cloudflare') {
    return !!(env.CLOUDFLARE_TURN_KEY_ID && env.CLOUDFLARE_TURN_API_TOKEN);
  }

  return !!(env.TURN_SECRET && env.TURN_SERVER);
}
