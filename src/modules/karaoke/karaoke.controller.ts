import { Request, Response, NextFunction } from 'express';
import * as karaokeService from './karaoke.service';
import { AuthRequest } from '../../types';
import { BadRequestError } from '../../utils/errors';

export async function listTracks(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const q = req.query.q as string | undefined;
    const tracks = await karaokeService.listTracks(q, limit);
    res.json({ tracks });
  } catch (err) {
    next(err);
  }
}

export async function getTrack(req: Request, res: Response, next: NextFunction) {
  try {
    const track = await karaokeService.getTrackById(req.params.id);
    res.json({ track });
  } catch (err) {
    next(err);
  }
}

export async function createMix(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new BadRequestError('Oturum gerekli');
    const videoId = req.body?.videoId as string | undefined;
    const trackId = req.body?.trackId as string | undefined;
    if (!videoId || !trackId) {
      throw new BadRequestError('videoId ve trackId gerekli');
    }

    const result = await karaokeService.createCleanMix({
      userId: req.user.userId,
      videoId,
      trackId,
      vocalVolume: req.body?.vocalVolume,
      backingVolume: req.body?.backingVolume,
      syncOffsetMs: req.body?.syncOffsetMs,
      countInMs: req.body?.countInMs,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
}
