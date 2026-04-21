import { Router } from 'express';
import * as videoController from './video.controller';
import { authMiddleware, optionalAuthMiddleware } from '../../middleware/auth.middleware';
import { rateLimitMiddleware } from '../../middleware/rate-limit.middleware';

const router = Router();

// POST /api/videos/upload-url - Get presigned upload URL
router.post('/upload-url', authMiddleware, rateLimitMiddleware(10, 60), videoController.getUploadUrl);

// POST /api/videos - Create video metadata
router.post('/', authMiddleware, videoController.createVideo);

// PATCH /api/videos/:id/uploaded - Confirm upload complete & trigger processing
router.patch('/:id/uploaded', authMiddleware, videoController.updateVideoAfterUpload);

// GET /api/videos/processing/:jobId - Check processing status
router.get('/processing/:jobId', authMiddleware, videoController.getVideoProcessingStatus);

// GET /api/videos/queue/status - Admin: queue stats
router.get('/queue/status', authMiddleware, videoController.getQueueStatus);

// GET /api/videos/mine - Get authenticated user's videos (all statuses except deleted)
router.get('/mine', authMiddleware, videoController.listMyVideos);

// GET /api/videos - List videos
router.get('/', optionalAuthMiddleware, videoController.listVideos);

// GET /api/videos/featured - Get featured videos
router.get('/featured', videoController.getFeaturedVideos);

// GET /api/videos/:id - Get single video
router.get('/:id', optionalAuthMiddleware, videoController.getVideoById);

// POST /api/videos/:id/vote - Vote/unvote
router.post('/:id/vote', authMiddleware, rateLimitMiddleware(30, 60), videoController.voteVideo);

// POST /api/videos/:id/comments - Add comment
router.post('/:id/comments', authMiddleware, rateLimitMiddleware(20, 60), videoController.addComment);

// GET /api/videos/:id/comments - Get comments
router.get('/:id/comments', videoController.getComments);

// DELETE /api/videos/:id - Delete video
router.delete('/:id', authMiddleware, videoController.deleteVideo);

export default router;
