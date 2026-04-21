import { Request, Response, NextFunction } from 'express';
import * as videoService from './video.service';
import { createVideoSchema, uploadUrlSchema, listVideosSchema, commentSchema, updateVideoAfterUploadSchema } from './video.schema';
import { BadRequestError } from '../../utils/errors';
import { AuthRequest } from '../../types';
import { addVideoToQueue, getJobStatus, getQueueStats } from '../../workers/video-queue';
import { VIDEO_LIMITS } from '../../config/constants';
import { logger } from '../../utils/logger';

export async function getUploadUrl(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new BadRequestError('Oturum gerekli');

    const parsed = uploadUrlSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.errors[0].message);

    const result = await videoService.getUploadUrl(
      req.user.userId,
      parsed.data.contentType,
      parsed.data.fileExtension,
      parsed.data.type
    );

    // Include limits in response for client-side validation
    res.json({
      ...result,
      limits: {
        maxFileSize: VIDEO_LIMITS.MAX_FILE_SIZE,
        maxDuration: VIDEO_LIMITS.MAX_DURATION,
        allowedTypes: VIDEO_LIMITS.ALLOWED_MIME_TYPES,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function createVideo(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new BadRequestError('Oturum gerekli');

    const parsed = createVideoSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.errors[0].message);

    // Pre-validation: Check if provided file_size exceeds limit
    if (parsed.data.file_size > VIDEO_LIMITS.MAX_FILE_SIZE) {
      throw new BadRequestError(
        `Dosya boyutu çok büyük. Maksimum: ${VIDEO_LIMITS.MAX_FILE_SIZE / (1024 * 1024)} MB`
      );
    }

    // Pre-validation: Check duration
    if (parsed.data.duration > VIDEO_LIMITS.MAX_DURATION) {
      throw new BadRequestError(
        `Video süresi çok uzun. Maksimum: ${VIDEO_LIMITS.MAX_DURATION} saniye`
      );
    }

    const video = await videoService.createVideo(req.user.userId, parsed.data);
    res.status(201).json(video);
  } catch (err) {
    next(err);
  }
}

export async function updateVideoAfterUpload(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new BadRequestError('Oturum gerekli');

    const parsed = updateVideoAfterUploadSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.errors[0].message);

    const { video_url, video_key, thumbnail, thumbnail_key, estimated_size } = parsed.data;

    // Quick size check if client provides estimate
    if (estimated_size && estimated_size > VIDEO_LIMITS.MAX_FILE_SIZE) {
      throw new BadRequestError(
        `Dosya boyutu çok büyük. Maksimum: ${VIDEO_LIMITS.MAX_FILE_SIZE / (1024 * 1024)} MB`
      );
    }

    // Update video with upload info
    const video = await videoService.updateVideoAfterUpload(
      req.params.id,
      req.user.userId,
      { video_url, video_key, thumbnail: thumbnail || undefined, thumbnail_key: thumbnail_key || undefined }
    );

    // Add to processing queue for validation and thumbnail generation.
    // If queue is unavailable, do not fail upload request.
    try {
      const job = await addVideoToQueue({
        videoId: video.id,
        videoKey: video_key,
        userId: req.user.userId,
        skipValidation: false,
      });

      res.json({
        ...video,
        processingJobId: job.id,
        message: 'Video işleniyor. Doğrulama ve küçük görsel üretimi devam ediyor.',
      });
      return;
    } catch (queueError: any) {
      logger.error('Video queue add failed, applying fallback ready status', {
        videoId: video.id,
        error: queueError?.message,
      });

      const fallbackVideo = await videoService.markVideoReadyWithoutProcessing(video.id, req.user.userId);
      res.status(202).json({
        ...fallbackVideo,
        processingJobId: null,
        warning: 'Video yüklendi ancak işleme servisi şu an kullanılamıyor.',
        message: 'Video yayına alındı. Küçük görsel daha sonra oluşabilir.',
      });
    }
  } catch (err) {
    next(err);
  }
}

export async function getVideoProcessingStatus(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { jobId } = req.params;
    const status = await getJobStatus(jobId);

    if (!status) {
      throw new BadRequestError('İşleme görevi bulunamadı');
    }

    res.json(status);
  } catch (err) {
    next(err);
  }
}

export async function getQueueStatus(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    // Only admins can see queue stats
    if (req.user?.role !== 'admin') {
      throw new BadRequestError('Yetki yetersiz');
    }

    const stats = await getQueueStats();
    res.json(stats);
  } catch (err) {
    next(err);
  }
}

export async function listVideos(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = listVideosSchema.safeParse(req.query);
    if (!parsed.success) throw new BadRequestError(parsed.error.errors[0].message);

    const viewerId = (req as AuthRequest).user?.userId ?? null;
    const videos = await videoService.listVideos(parsed.data, viewerId);

    // Return with pagination info
    res.json({
      videos,
      pagination: {
        limit: parsed.data.limit,
        offset: parsed.data.offset,
        hasMore: videos.length === parsed.data.limit,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function listMyVideos(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new BadRequestError('Oturum gerekli');
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    const videos = await videoService.listMyVideos(req.user.userId, limit, offset);
    res.json({
      videos,
      pagination: { limit, offset, hasMore: videos.length === limit },
    });
  } catch (err) {
    next(err);
  }
}

export async function getVideoById(req: Request, res: Response, next: NextFunction) {
  try {
    const viewerId = (req as AuthRequest).user?.userId ?? null;
    const video = await videoService.getVideoById(req.params.id, viewerId);

    // Generate signed URL for secure playback
    let signedUrl = null;
    if (video.video_key) {
      signedUrl = await videoService.getSignedVideoUrl(video.video_key);
    }

    res.json({ ...video, signed_video_url: signedUrl });
  } catch (err) {
    next(err);
  }
}

export async function voteVideo(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new BadRequestError('Oturum gerekli');
    const result = await videoService.voteVideo(req.user.userId, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function addComment(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new BadRequestError('Oturum gerekli');

    const parsed = commentSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.errors[0].message);

    const comment = await videoService.addComment(req.user.userId, req.params.id, parsed.data.text);
    res.status(201).json(comment);
  } catch (err) {
    next(err);
  }
}

export async function getComments(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    const comments = await videoService.getComments(req.params.id, limit, offset);
    res.json({
      comments,
      pagination: { limit, offset, hasMore: comments.length === limit },
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteVideo(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new BadRequestError('Oturum gerekli');
    const result = await videoService.deleteVideo(req.params.id, req.user.userId, req.user.role);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getFeaturedVideos(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 20);
    const videos = await videoService.getFeaturedVideos(limit);
    res.json(videos);
  } catch (err) {
    next(err);
  }
}
