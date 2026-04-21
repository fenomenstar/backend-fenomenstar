import { Response, NextFunction } from 'express';
import { BadRequestError } from '../../utils/errors';
import { AuthRequest } from '../../types';
import {
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../services/notifications.service';

export async function list(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new BadRequestError('Oturum gerekli');

    const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 50);
    const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);
    const notifications = await listNotifications(req.user.userId, limit, offset);

    res.json({
      notifications,
      pagination: {
        limit,
        offset,
        hasMore: notifications.length === limit,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function unreadCount(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new BadRequestError('Oturum gerekli');
    const count = await getUnreadNotificationCount(req.user.userId);
    res.json({ count });
  } catch (err) {
    next(err);
  }
}

export async function markRead(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new BadRequestError('Oturum gerekli');
    const notification = await markNotificationRead(req.user.userId, req.params.id);
    if (!notification) throw new BadRequestError('Bildirim bulunamadi');
    res.json(notification);
  } catch (err) {
    next(err);
  }
}

export async function markAllRead(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new BadRequestError('Oturum gerekli');
    const result = await markAllNotificationsRead(req.user.userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
