import { Router } from 'express';
import * as userController from './user.controller';
import { authMiddleware, optionalAuthMiddleware } from '../../middleware/auth.middleware';

const router = Router();

// GET /api/users/search
router.get('/search', userController.searchUsers);

// GET /api/users/talents
router.get('/talents', userController.listTalents);

// GET /api/users/leaderboard
router.get('/leaderboard', userController.getLeaderboard);

// GET /api/users/me/blocked
router.get('/me/blocked', authMiddleware, userController.listBlockedUsers);

// GET /api/users/:id
router.get('/:id', optionalAuthMiddleware, userController.getUserById);

// PATCH /api/users/me
router.patch('/me', authMiddleware, userController.updateProfile);

// POST /api/users/:id/follow
router.post('/:id/follow', authMiddleware, userController.followUser);
router.post('/:id/block', authMiddleware, userController.blockUser);
router.delete('/:id/block', authMiddleware, userController.unblockUser);

export default router;
