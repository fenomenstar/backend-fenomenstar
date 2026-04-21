import { Request, Response, NextFunction } from 'express';
import * as adminService from './admin.service';
import { BadRequestError } from '../../utils/errors';

export async function getDashboard(req: Request, res: Response, next: NextFunction) {
  try {
    const dashboard = await adminService.getDashboard();
    res.json(dashboard);
  } catch (err) {
    next(err);
  }
}

export async function listUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const role = req.query.role as string | undefined;
    const users = await adminService.listUsers(limit, offset, role);
    res.json(users);
  } catch (err) {
    next(err);
  }
}

export async function toggleFeatured(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await adminService.toggleFeatured(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function deactivateUser(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await adminService.deactivateUser(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function listModerationQueue(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    const statusQuery = (req.query.status as string) || 'pending,failed';
    const statuses = statusQuery
      .split(',')
      .map((s) => s.trim())
      .filter((s) => ['pending', 'processing', 'failed'].includes(s)) as Array<
      'pending' | 'processing' | 'failed'
    >;

    const videos = await adminService.listVideosForModeration(
      statuses.length ? statuses : ['pending', 'failed'],
      limit,
      offset
    );
    res.json(videos);
  } catch (err) {
    next(err);
  }
}

export async function moderateVideo(req: Request, res: Response, next: NextFunction) {
  try {
    const action = req.body?.action as 'approve' | 'reject' | undefined;
    if (!action || !['approve', 'reject'].includes(action)) {
      throw new BadRequestError('action approve veya reject olmali');
    }

    const result = await adminService.setVideoModerationStatus(req.params.id, action);
    if (!result) throw new BadRequestError('Video bulunamadi');
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function listReports(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    const statusQuery = (req.query.status as string) || 'open,reviewing';
    const statuses = statusQuery
      .split(',')
      .map((s) => s.trim())
      .filter((s) => ['open', 'reviewing', 'resolved', 'dismissed'].includes(s)) as Array<
      'open' | 'reviewing' | 'resolved' | 'dismissed'
    >;
    const reports = await adminService.listReports(statuses.length ? statuses : ['open', 'reviewing'], limit, offset);
    res.json(reports);
  } catch (err) {
    next(err);
  }
}

export async function updateReportStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const status = req.body?.status as 'reviewing' | 'resolved' | 'dismissed' | undefined;
    if (!status || !['reviewing', 'resolved', 'dismissed'].includes(status)) {
      throw new BadRequestError('status reviewing, resolved veya dismissed olmali');
    }
    const result = await adminService.setReportStatus(req.params.id, status);
    if (!result) throw new BadRequestError('Rapor bulunamadi');
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function listBlocks(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    const blocks = await adminService.listBlocks(limit, offset);
    res.json(blocks);
  } catch (err) {
    next(err);
  }
}
