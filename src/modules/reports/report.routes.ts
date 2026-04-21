import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { submitReport } from './report.controller';

const router = Router();

router.post('/', authMiddleware, submitReport);

export default router;
