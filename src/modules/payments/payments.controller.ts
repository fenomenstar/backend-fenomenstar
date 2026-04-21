import { NextFunction, Response } from 'express';
import { AuthRequest } from '../../types';
import { BadRequestError } from '../../utils/errors';
import * as paymentsService from './payments.service';

export async function getCatalog(_req: AuthRequest, res: Response, next: NextFunction) {
  try {
    res.json(await paymentsService.getCatalog());
  } catch (error) {
    next(error);
  }
}

export async function getWallet(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new BadRequestError('Oturum gerekli');
    res.json(await paymentsService.getWalletSummary(req.user.userId));
  } catch (error) {
    next(error);
  }
}

export async function createCheckout(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new BadRequestError('Oturum gerekli');
    const result = await paymentsService.createCheckout(req.user.userId, {
      packageId: String(req.body.packageId || ''),
      provider: req.body.provider ? String(req.body.provider) : undefined,
      platform: req.body.platform ? String(req.body.platform) : undefined,
      providerReference: req.body.providerReference ? String(req.body.providerReference) : undefined,
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function verifyGooglePlayPurchase(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new BadRequestError('Oturum gerekli');
    const result = await paymentsService.verifyGooglePlayPurchase(req.user.userId, {
      packageId: req.body.packageId ? String(req.body.packageId) : undefined,
      productId: String(req.body.productId || ''),
      purchaseToken: String(req.body.purchaseToken || ''),
      orderId: req.body.orderId ? String(req.body.orderId) : undefined,
      packageName: req.body.packageName ? String(req.body.packageName) : undefined,
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function processGooglePlayRtdn(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await paymentsService.processGooglePlayRtdn(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function purchaseDoping(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new BadRequestError('Oturum gerekli');
    res.json(await paymentsService.purchaseDoping(req.user.userId, req.params.itemId));
  } catch (error) {
    next(error);
  }
}

export async function sendGift(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new BadRequestError('Oturum gerekli');
    res.status(201).json(
      await paymentsService.sendGift(req.user.userId, {
        recipientId: String(req.body.recipientId || ''),
        giftId: String(req.body.giftId || ''),
        streamId: req.body.streamId ? String(req.body.streamId) : undefined,
        message: req.body.message ? String(req.body.message) : undefined,
      })
    );
  } catch (error) {
    next(error);
  }
}

export async function processWebhook(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const provider = req.params.provider;
    const result = await paymentsService.processWebhook(provider, {
      eventType: req.body.eventType ? String(req.body.eventType) : undefined,
      paymentIntentId: req.body.paymentIntentId ? String(req.body.paymentIntentId) : undefined,
      providerReference: req.body.providerReference ? String(req.body.providerReference) : undefined,
      status: req.body.status ? String(req.body.status) : undefined,
      raw: req.body,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}
