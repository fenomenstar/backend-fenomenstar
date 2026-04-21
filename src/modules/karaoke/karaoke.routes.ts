import { Router } from 'express';
import * as karaokeController from './karaoke.controller';
import { authMiddleware } from '../../middleware/auth.middleware';

const router = Router();

router.get('/tracks', karaokeController.listTracks);
router.get('/tracks/:id', karaokeController.getTrack);
router.post('/mix', authMiddleware, karaokeController.createMix);

export default router;
