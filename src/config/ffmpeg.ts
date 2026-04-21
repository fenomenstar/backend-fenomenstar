import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { logger } from '../utils/logger';

let configured = false;

export function configureFfmpeg(): void {
  if (configured) return;

  const ffmpegPath = typeof ffmpegStatic === 'string' ? ffmpegStatic : null;
  const ffprobePath = ffprobeStatic?.path || null;

  if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
  }
  if (ffprobePath) {
    ffmpeg.setFfprobePath(ffprobePath);
  }

  configured = true;

  logger.info('FFmpeg configured', {
    ffmpeg: ffmpegPath ? 'static-binary' : 'system-path',
    ffprobe: ffprobePath ? 'static-binary' : 'system-path',
  });
}

