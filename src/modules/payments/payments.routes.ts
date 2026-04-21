import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import * as paymentsController from './payments.controller';

const router = Router();

router.get('/catalog', paymentsController.getCatalog);
router.get('/wallet', authMiddleware, paymentsController.getWallet);
router.post('/checkout', authMiddleware, paymentsController.createCheckout);
router.post('/google/verify', authMiddleware, paymentsController.verifyGooglePlayPurchase);
router.post('/google/rtdn', paymentsController.processGooglePlayRtdn);
router.post('/doping/:itemId/purchase', authMiddleware, paymentsController.purchaseDoping);
router.post('/gifts/send', authMiddleware, paymentsController.sendGift);
router.post('/webhooks/:provider', paymentsController.processWebhook);

export default router;
