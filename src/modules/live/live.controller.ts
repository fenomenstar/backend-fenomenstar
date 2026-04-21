import { Request, Response, NextFunction } from 'express';
import * as liveService from './live.service';
import { BadRequestError } from '../../utils/errors';
import { AuthRequest } from '../../types';

export async function createStream(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new BadRequestError('Oturum gerekli');
    const stream = await liveService.createStream(req.user.userId, req.body);
    res.status(201).json(stream);
  } catch (err) {
    next(err);
  }
}

export async function endStream(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new BadRequestError('Oturum gerekli');
    const stream = await liveService.endStream(req.params.id, req.user.userId);
    res.json(stream);
  } catch (err) {
    next(err);
  }
}

export async function getActiveStreams(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const streams = await liveService.getActiveStreams(limit);
    res.json(streams);
  } catch (err) {
    next(err);
  }
}

export async function getStreamById(req: Request, res: Response, next: NextFunction) {
  try {
    const stream = await liveService.getStreamById(req.params.id);
    res.json(stream);
  } catch (err) {
    next(err);
  }
}

export async function getTurnCredentials(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new BadRequestError('Oturum gerekli');
    const credentials = await liveService.getTurnCredentials(req.user.userId);
    res.json(credentials);
  } catch (err) {
    next(err);
  }
}

export async function checkLiveAvailability(req: Request, res: Response, next: NextFunction) {
  try {
    const available = liveService.isLiveStreamingAvailable();
    res.json({
      available,
      message: available
        ? 'Canlı yayın kullanılabilir.'
        : 'Canlı yayın şu anda kullanılamaz. TURN sunucusu yapılandırılmamış.',
    });
  } catch (err) {
    next(err);
  }
}
