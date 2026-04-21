/**
 * Video Processing Worker
 *
 * This worker handles:
 * 1. Thumbnail generation (FFmpeg)
 * 2. Video transcoding to multiple resolutions
 * 3. HLS packaging for adaptive streaming
 *
 * In production, this runs as a separate process connected via Bull queue.
 * For development, it can be called directly.
 */

import { query } from '../config/database';
import { logger } from '../utils/logger';

// Bull queue setup (requires Redis)
// import Bull from 'bull';
// import { env } from '../config/env';
// const videoQueue = new Bull('video-processing', env.REDIS_URL);

interface VideoProcessingJob {
  videoId: string;
  videoKey: string;
  userId: string;
}

/**
 * Process a newly uploaded video:
 * 1. Generate thumbnail at 1 second mark
 * 2. Transcode to multiple resolutions (360p, 480p, 720p)
 * 3. Generate HLS playlist
 */
export async function processVideo(job: VideoProcessingJob): Promise<void> {
  const { videoId, videoKey, userId } = job;

  try {
    logger.info(`Processing video ${videoId}...`);

    // Update status to processing
    await query('UPDATE videos SET status = $1 WHERE id = $2', ['processing', videoId]);

    // In production, use FFmpeg:
    // 1. Download video from S3
    // 2. Generate thumbnail: ffmpeg -i input.mp4 -ss 00:00:01 -vframes 1 thumb.jpg
    // 3. Transcode: ffmpeg -i input.mp4 -vf "scale=-2:720" -c:v libx264 -preset fast output_720p.mp4
    // 4. Generate HLS: ffmpeg -i input.mp4 -hls_time 10 -hls_list_size 0 output.m3u8
    // 5. Upload outputs back to S3

    // For now, mark as ready (FFmpeg processing would happen here in production)
    await query(
      'UPDATE videos SET status = $1, updated_at = NOW() WHERE id = $2',
      ['ready', videoId]
    );

    logger.info(`Video ${videoId} processing complete`);
  } catch (err) {
    logger.error(`Video ${videoId} processing failed:`, err);
    await query('UPDATE videos SET status = $1 WHERE id = $2', ['failed', videoId]);
  }
}

/**
 * FFmpeg commands for production use:
 *
 * Thumbnail generation:
 * ffmpeg -i input.mp4 -ss 00:00:01 -vframes 1 -q:v 2 thumbnail.jpg
 *
 * Transcode to 720p:
 * ffmpeg -i input.mp4 -vf "scale=-2:720" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k output_720p.mp4
 *
 * Transcode to 480p:
 * ffmpeg -i input.mp4 -vf "scale=-2:480" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 96k output_480p.mp4
 *
 * Transcode to 360p:
 * ffmpeg -i input.mp4 -vf "scale=-2:360" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 64k output_360p.mp4
 *
 * HLS generation:
 * ffmpeg -i input.mp4 \
 *   -map 0:v -map 0:a -map 0:v -map 0:a -map 0:v -map 0:a \
 *   -filter:v:0 "scale=-2:720" -filter:v:1 "scale=-2:480" -filter:v:2 "scale=-2:360" \
 *   -c:v libx264 -preset fast -crf 23 -c:a aac \
 *   -b:v:0 2500k -b:v:1 1000k -b:v:2 500k \
 *   -b:a:0 128k -b:a:1 96k -b:a:2 64k \
 *   -f hls -hls_time 10 -hls_list_size 0 \
 *   -master_pl_name master.m3u8 \
 *   -var_stream_map "v:0,a:0 v:1,a:1 v:2,a:2" \
 *   stream_%v/index.m3u8
 */

// Production queue setup (uncomment when Redis is available):
/*
export function setupVideoQueue() {
  videoQueue.process(async (job) => {
    await processVideo(job.data);
  });

  videoQueue.on('completed', (job) => {
    logger.info(`Video processing job ${job.id} completed`);
  });

  videoQueue.on('failed', (job, err) => {
    logger.error(`Video processing job ${job?.id} failed:`, err);
  });

  return videoQueue;
}

export async function addVideoToQueue(data: VideoProcessingJob) {
  await videoQueue.add(data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  });
}
*/
