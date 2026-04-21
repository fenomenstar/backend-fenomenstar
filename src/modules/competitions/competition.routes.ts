import { Router } from 'express';
import * as competitionController from './competition.controller';
import { authMiddleware, requireRole } from '../../middleware/auth.middleware';

const router = Router();

// GET /api/competitions
router.get('/', competitionController.listCompetitions);

// GET /api/competitions/:id
router.get('/:id', competitionController.getCompetitionById);

// POST /api/competitions - Create (brand/admin only)
router.post('/', authMiddleware, requireRole('brand', 'admin'), competitionController.createCompetition);

// POST /api/competitions/:id/join
router.post('/:id/join', authMiddleware, competitionController.joinCompetition);

// GET /api/competitions/:id/videos
router.get('/:id/videos', competitionController.getCompetitionVideos);

// GET /api/competitions/:id/leaderboard
router.get('/:id/leaderboard', competitionController.getCompetitionLeaderboard);

export default router;
