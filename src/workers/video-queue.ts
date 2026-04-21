/**
 * Video Processing Queue - Bull + Redis
 * 
 * Handles:
 * 1. Video validation
 * 2. Thumbnail generation
 * 3. Video transcoding (future)
 */
import Bull from 'bull';
import { env } from '../config/env';
import { QUEUE_NAMES } from '../config/constants';
import { logger } from '../utils/logger';
import { query } from '../config/database';
import { validateVideoFromS3, VideoMetadata } from '../utils/video-validator';
import { generateAndUploadThumbnail } from '../utils/thumbnail-generator';
import { moderateTextContent } from '../services/moderation.service';

// ===== QUEUE INITIALIZATION =====

let videoQueue: Bull.Queue | null = null;

export function getVideoQueue(): Bull.Queue {
  if (!videoQueue) {
    videoQueue = new Bull(QUEUE_NAMES.VIDEO_PROCESSING, env.REDIS_URL, {
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 50, // Keep last 50 failed jobs
      },
    });

    // Setup event handlers
    videoQueue.on('completed', (job, result) => {
      logger.info(`Video job ${job.id} completed`, { videoId: job.data.videoId });
    });

    videoQueue.on('failed', (job, err) => {
      logger.error(`Video job ${job?.id} failed:`, { error: err.message, videoId: job?.data?.videoId });
    });

    videoQueue.on('stalled', (job) => {
      logger.warn(`Video job ${job.id} stalled`, { videoId: job.data.videoId });
    });

    logger.info('Video processing queue initialized');
  }

  return videoQueue;
}

// ===== JOB TYPES =====

export interface VideoProcessingJob {
  videoId: string;
  videoKey: string;
  userId: string;
  skipValidation?: boolean;
}

export interface JobResult {
  videoId: string;
  status: 'ready' | 'failed';
  metadata?: VideoMetadata;
  thumbnailKey?: string;
  thumbnailUrl?: string;
  error?: string;
}

// ===== QUEUE PROCESSOR =====

export function setupVideoProcessor(): void {
  const queue = getVideoQueue();

  queue.process(async (job): Promise<JobResult> => {
    const { videoId, videoKey, userId, skipValidation } = job.data as VideoProcessingJob;

    logger.info(`Processing video ${videoId}`, { videoKey, userId });

    try {
      // Update status to processing
      await query('UPDATE videos SET status = $1, updated_at = NOW() WHERE id = $2', ['processing', videoId]);

      // Step 0: Text moderation
      const videoContent = await query(
        'SELECT title, description FROM videos WHERE id = $1 LIMIT 1',
        [videoId]
      );
      const title = videoContent.rows[0]?.title || '';
      const description = videoContent.rows[0]?.description || '';
      const moderationDecision = await moderateTextContent(title, description);
      if (!moderationDecision.allow) {
        await query('UPDATE videos SET status = $1, updated_at = NOW() WHERE id = $2', ['failed', videoId]);
        return {
          videoId,
          status: 'failed',
          error: `${moderationDecision.reason}. Terms: ${(moderationDecision.flaggedTerms || []).join(', ')}`,
        };
      }

      // Step 1: Validate video (unless skipped)
      let metadata: VideoMetadata | undefined;
      if (!skipValidation) {
        job.progress(10);
        logger.info(`Validating video ${videoId}...`);
        
        metadata = await validateVideoFromS3(videoKey);
        
        if (!metadata.isValid) {
          throw new Error(metadata.errors.join('. '));
        }

        // Update video with actual metadata
        await query(
          `UPDATE videos SET 
            duration = $1, width = $2, height = $3, file_size = $4, 
            updated_at = NOW() 
           WHERE id = $5`,
          [Math.round(metadata.duration), metadata.width, metadata.height, metadata.fileSize, videoId]
        );

        job.progress(40);
      }

      // Step 2: Generate thumbnail
      logger.info(`Generating thumbnail for video ${videoId}...`);
      
      const videoResult = await query('SELECT duration FROM videos WHERE id = $1', [videoId]);
      const duration = videoResult.rows[0]?.duration || metadata?.duration || 10;

      const thumbnail = await generateAndUploadThumbnail(videoKey, userId, duration);
      
      job.progress(80);

      // Update video with thumbnail
      await query(
        `UPDATE videos SET 
          thumbnail = $1, thumbnail_key = $2, 
          status = 'ready', updated_at = NOW() 
         WHERE id = $3`,
        [thumbnail.publicUrl, thumbnail.key, videoId]
      );

      job.progress(100);
      logger.info(`Video ${videoId} processing complete`);

      return {
        videoId,
        status: 'ready',
        metadata,
        thumbnailKey: thumbnail.key,
        thumbnailUrl: thumbnail.publicUrl,
      };

    } catch (err: any) {
      logger.error(`Video ${videoId} processing failed:`, err);

      // Processing failed -> keep item for manual moderation fallback.
      await query(
        'UPDATE videos SET status = $1, updated_at = NOW() WHERE id = $2',
        ['failed', videoId]
      );

      return {
        videoId,
        status: 'failed',
        error: err.message,
      };
    }
  });

  logger.info('Video processor registered');
}

// ===== QUEUE HELPERS =====

export async function addVideoToQueue(data: VideoProcessingJob): Promise<Bull.Job> {
  const queue = getVideoQueue();
  return queue.add(data, {
    priority: 1,
    delay: 0,
  });
}

export async function getJobStatus(jobId: string): Promise<{
  state: string;
  progress: number;
  result?: JobResult;
} | null> {
  const queue = getVideoQueue();
  const job = await queue.getJob(jobId);
  
  if (!job) return null;

  const state = await job.getState();
  const progress = job.progress();

  return {
    state,
    progress: typeof progress === 'number' ? progress : 0,
    result: job.returnvalue as JobResult | undefined,
  };
}

export async function getQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}> {
  const queue = getVideoQueue();
  const [waiting, active, completed, failed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
  ]);

  return { waiting, active, completed, failed };
}

// ===== CLEANUP =====

export async function closeQueue(): Promise<void> {
  if (videoQueue) {
    await videoQueue.close();
    videoQueue = null;
    logger.info('Video queue closed');
  }
}
