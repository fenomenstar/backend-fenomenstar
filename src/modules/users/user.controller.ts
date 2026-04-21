import { Request, Response, NextFunction } from 'express';
import * as userService from './user.service';
import { BadRequestError } from '../../utils/errors';
import { AuthRequest } from '../../types';

export async function getUserById(req: Request, res: Response, next: NextFunction) {
  try {
    const viewerId = (req as AuthRequest).user?.userId ?? null;
    const user = await userService.getUserById(req.params.id, viewerId);
    res.json(user);
  } catch (err) {
    next(err);
  }
}

export async function updateProfile(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new BadRequestError('Oturum gerekli');
    const user = await userService.updateUser(req.user.userId, req.body);
    res.json(user);
  } catch (err) {
    next(err);
  }
}

export async function followUser(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new BadRequestError('Oturum gerekli');
    const result = await userService.followUser(req.user.userId, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getLeaderboard(req: Request, res: Response, next: NextFunction) {
  try {
    const period = (req.query.period as string) || 'all';
    const limit = parseInt(req.query.limit as string) || 50;
    const leaderboard = await userService.getLeaderboard(period, limit);
    res.json(leaderboard);
  } catch (err) {
    next(err);
  }
}

export async function searchUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const q = req.query.q as string;
    if (!q) throw new BadRequestError('Arama sorgusu gerekli');
    const users = await userService.searchUsers(q);
    res.json(users);
  } catch (err) {
    next(err);
  }
}

export async function listTalents(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const users = await userService.listTalents(limit);
    res.json(users);
  } catch (err) {
    next(err);
  }
}

export async function blockUser(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new BadRequestError('Oturum gerekli');
    const result = await userService.blockUser(req.user.userId, req.params.id);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function unblockUser(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new BadRequestError('Oturum gerekli');
    const result = await userService.unblockUser(req.user.userId, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function listBlockedUsers(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new BadRequestError('Oturum gerekli');
    const users = await userService.listBlockedUsers(req.user.userId);
    res.json(users);
  } catch (err) {
    next(err);
  }
}
