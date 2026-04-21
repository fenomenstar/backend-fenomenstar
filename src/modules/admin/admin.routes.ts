import { Router } from 'express';
import * as adminController from './admin.controller';
import { authMiddleware, requireRole } from '../../middleware/auth.middleware';

const router = Router();

// All admin routes require admin role
router.use(authMiddleware, requireRole('admin'));

// GET /api/admin/dashboard
router.get('/dashboard', adminController.getDashboard);

// GET /api/admin/users
router.get('/users', adminController.listUsers);

// PATCH /api/admin/videos/:id/featured
router.patch('/videos/:id/featured', adminController.toggleFeatured);

// GET /api/admin/videos/moderation?status=pending,failed
router.get('/videos/moderation', adminController.listModerationQueue);

// PATCH /api/admin/videos/:id/moderation { action: 'approve' | 'reject' }
router.patch('/videos/:id/moderation', adminController.moderateVideo);

// DELETE /api/admin/users/:id
router.delete('/users/:id', adminController.deactivateUser);

// GET /api/admin/reports
router.get('/reports', adminController.listReports);

// PATCH /api/admin/reports/:id
router.patch('/reports/:id', adminController.updateReportStatus);

// GET /api/admin/blocks
router.get('/blocks', adminController.listBlocks);

export default router;
