import { Router } from 'express';
import * as liveController from './live.controller';
import { authMiddleware } from '../../middleware/auth.middleware';

const router = Router();

// GET /api/live/availability - Check if live streaming is available
router.get('/availability', liveController.checkLiveAvailability);

// GET /api/live - Active streams
router.get('/', liveController.getActiveStreams);

// GET /api/live/turn-credentials - Get TURN credentials (REQUIRED for WebRTC)
router.get('/turn-credentials', authMiddleware, liveController.getTurnCredentials);

// GET /api/live/:id - Get stream
router.get('/:id', liveController.getStreamById);

// POST /api/live - Create stream
router.post('/', authMiddleware, liveController.createStream);

// PATCH /api/live/:id/end - End stream
router.patch('/:id/end', authMiddleware, liveController.endStream);

export default router;
