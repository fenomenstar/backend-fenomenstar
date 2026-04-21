import { query } from '../../config/database';
import { uploadLocalFile } from '../../config/storage';
import { NotFoundError, BadRequestError, ForbiddenError } from '../../utils/errors';
import ffmpeg from 'fluent-ffmpeg';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { generateId } from '../../utils/crypto';

const fallbackTracks = [
  {
    id: 'demo-1',
    title: 'Yalan',
    artist: 'Sezen Aksu',
    cover: '',
    audio_url: '',
    duration: '3:42',
    bpm: 98,
    difficulty: 'Orta',
    category: 'Pop',
    lyrics: ['Yalan, yalan söyledim sana', 'Kalbimi gizledim sonra', 'Şimdi sahne benimle konuşuyor'],
  },
  {
    id: 'demo-2',
    title: 'Bir Derdim Var',
    artist: 'Mor ve Ötesi',
    cover: '',
    audio_url: '',
    duration: '4:05',
    bpm: 110,
    difficulty: 'Zor',
    category: 'Rock',
    lyrics: ['Bir derdim var artık tutamam içimde', 'Gitsem nereye kadar kalsam neye yarar', 'Hiç anlatamadım kimseye'],
  },
  {
    id: 'demo-3',
    title: 'Benimle Oynar mısın',
    artist: 'Tarkan',
    cover: '',
    audio_url: '',
    duration: '3:28',
    bpm: 102,
    difficulty: 'Kolay',
    category: 'Pop',
    lyrics: ['Benimle oynar mısın', 'Bir daha yazar mısın', 'Aşkınla beni yeniden başlatır mısın'],
  },
];

function normalizeLyrics(rawLyrics: unknown): string[] {
  if (!Array.isArray(rawLyrics)) return [];
  return rawLyrics.map((line) => String(line)).filter(Boolean);
}

export async function listTracks(q?: string, limit: number = 20) {
  const hasQuery = Boolean(q?.trim());
  const result = await query(
    `SELECT id, title, artist, cover, audio_url, duration, bpm, difficulty, category, lyrics
     FROM karaoke_songs
     WHERE ($1::text IS NULL OR title ILIKE $2 OR artist ILIKE $2)
     ORDER BY title ASC
     LIMIT $3`,
    [hasQuery ? q?.trim() ?? null : null, `%${q?.trim() ?? ''}%`, limit]
  );

  if (result.rows.length === 0) return fallbackTracks;

  return result.rows.map((row) => ({
    ...row,
    lyrics: normalizeLyrics(row.lyrics),
  }));
}

export async function getTrackById(trackId: string) {
  const result = await query(
    `SELECT id, title, artist, cover, audio_url, duration, bpm, difficulty, category, lyrics
     FROM karaoke_songs
     WHERE id = $1
     LIMIT 1`,
    [trackId]
  );

  if (result.rows.length > 0) {
    return {
      ...result.rows[0],
      lyrics: normalizeLyrics(result.rows[0].lyrics),
    };
  }

  const fallback = fallbackTracks.find((track) => track.id === trackId);
  if (fallback) return fallback;

  throw new NotFoundError('Karaoke parçası bulunamadı');
}

export async function createCleanMix(params: {
  userId: string;
  videoId: string;
  trackId: string;
  vocalVolume?: number;
  backingVolume?: number;
  syncOffsetMs?: number;
  countInMs?: number;
}) {
  const track = await getTrackById(params.trackId);
  if (!track.audio_url) {
    throw new BadRequestError('Bu karaoke parçası için mix alınabilecek altyapı dosyası yok.');
  }

  const videoResult = await query(
    `SELECT id, user_id, video_url
     FROM videos
     WHERE id = $1 AND status != 'deleted'
     LIMIT 1`,
    [params.videoId]
  );

  if (videoResult.rows.length === 0) {
    throw new NotFoundError('Karaoke videosu bulunamadı');
  }

  const video = videoResult.rows[0];
  if (video.user_id !== params.userId) {
    throw new ForbiddenError('Bu karaoke videosu için miks oluşturma yetkiniz yok');
  }

  const vocalVolume = Number.isFinite(params.vocalVolume) ? Math.max(0.4, Math.min(2, params.vocalVolume!)) : 1.18;
  const backingVolume = Number.isFinite(params.backingVolume) ? Math.max(0.05, Math.min(1.2, params.backingVolume!)) : 0.42;
  const syncOffsetMs = Number.isFinite(params.syncOffsetMs) ? Math.max(-1500, Math.min(3000, params.syncOffsetMs!)) : 0;
  const countInMs = Number.isFinite(params.countInMs) ? Math.max(0, Math.min(5000, params.countInMs!)) : 600;

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fenomenstar-karaoke-'));
  const outputPath = path.join(tempDir, `${generateId()}.mp4`);

  try {
    await new Promise<void>((resolve, reject) => {
      const delayedBacking = Math.max(0, syncOffsetMs + countInMs);
      const audioFilter = delayedBacking > 0
        ? `[1:a]volume=${backingVolume},adelay=${delayedBacking}|${delayedBacking}[backing];` +
          `[0:a]highpass=f=120,acompressor=threshold=-16dB:ratio=2.4:attack=12:release=120,volume=${vocalVolume}[vocal];` +
          `[vocal][backing]amix=inputs=2:duration=first:dropout_transition=2,loudnorm=I=-16:LRA=11:TP=-1.5[mixed]`
        : `[1:a]volume=${backingVolume}[backing];` +
          `[0:a]highpass=f=120,acompressor=threshold=-16dB:ratio=2.4:attack=12:release=120,volume=${vocalVolume}[vocal];` +
          `[vocal][backing]amix=inputs=2:duration=first:dropout_transition=2,loudnorm=I=-16:LRA=11:TP=-1.5[mixed]`;

      ffmpeg()
        .input(video.video_url)
        .input(track.audio_url)
        .complexFilter(audioFilter, 'mixed')
        .outputOptions([
          '-map 0:v:0',
          '-map [mixed]',
          '-c:v copy',
          '-c:a aac',
          '-b:a 192k',
          '-shortest',
        ])
        .save(outputPath)
        .on('end', () => resolve())
        .on('error', (error) => reject(error));
    });

    const uploadKey = `videos/${params.userId}/karaoke-mix-${generateId()}.mp4`;
    const uploaded = await uploadLocalFile(outputPath, uploadKey, 'video/mp4');

    await query(
      `UPDATE videos
       SET video_url = $1,
           video_key = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [uploaded.publicUrl, uploaded.key, params.videoId]
    );

    return {
      videoId: params.videoId,
      mixed: true,
      video_url: uploaded.publicUrl,
      video_key: uploaded.key,
      trackId: params.trackId,
      mixProfile: {
        vocalVolume,
        backingVolume,
        syncOffsetMs,
        countInMs,
      },
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
