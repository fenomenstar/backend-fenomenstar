import { Router } from 'express';
import * as authController from './auth.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { rateLimitMiddleware } from '../../middleware/rate-limit.middleware';

const router = Router();

// POST /api/auth/register
router.post('/register', rateLimitMiddleware(5, 60), authController.register);

// POST /api/auth/login
router.post('/login', rateLimitMiddleware(10, 60), authController.login);

// POST /api/auth/refresh
router.post('/refresh', rateLimitMiddleware(20, 60), authController.refresh);

// POST /api/auth/logout
router.post('/logout', authMiddleware, authController.logout);

// GET /api/auth/me
router.get('/me', authMiddleware, authController.me);

export default router;
