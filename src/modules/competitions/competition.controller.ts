import { Request, Response, NextFunction } from 'express';
import * as competitionService from './competition.service';
import { BadRequestError } from '../../utils/errors';
import { AuthRequest } from '../../types';

export async function listCompetitions(req: Request, res: Response, next: NextFunction) {
  try {
    const status = req.query.status as string | undefined;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    const competitions = await competitionService.listCompetitions(status, limit, offset);
    res.json(competitions);
  } catch (err) {
    next(err);
  }
}

export async function getCompetitionById(req: Request, res: Response, next: NextFunction) {
  try {
    const competition = await competitionService.getCompetitionById(req.params.id);
    res.json(competition);
  } catch (err) {
    next(err);
  }
}

export async function createCompetition(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new BadRequestError('Oturum gerekli');
    const competition = await competitionService.createCompetition(req.body);
    res.status(201).json(competition);
  } catch (err) {
    next(err);
  }
}

export async function joinCompetition(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new BadRequestError('Oturum gerekli');
    const result = await competitionService.joinCompetition(req.params.id, req.user.userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getCompetitionVideos(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    const videos = await competitionService.getCompetitionVideos(req.params.id, limit, offset);
    res.json(videos);
  } catch (err) {
    next(err);
  }
}

export async function getCompetitionLeaderboard(req: Request, res: Response, next: NextFunction) {
  try {
    const leaderboard = await competitionService.getCompetitionLeaderboard(req.params.id);
    res.json(leaderboard);
  } catch (err) {
    next(err);
  }
}
