import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import * as notificationsController from './notifications.controller';

const router = Router();

router.get('/', authMiddleware, notificationsController.list);
router.get('/unread-count', authMiddleware, notificationsController.unreadCount);
router.patch('/read-all', authMiddleware, notificationsController.markAllRead);
router.patch('/:id/read', authMiddleware, notificationsController.markRead);

export default router;
