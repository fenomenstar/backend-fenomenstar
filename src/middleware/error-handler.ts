import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    // Operational errors - expected
    if (err.statusCode >= 500) {
      logger.error(`${err.code}: ${err.message}`, { stack: err.stack, path: req.path });
    }

    res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
    });
    return;
  }

  // Unexpected errors
  logger.error('Unhandled error:', { message: err.message, stack: err.stack, path: req.path });

  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'Bir hata oluştu. Lütfen tekrar deneyin.',
  });
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `${req.method} ${req.path} bulunamadı`,
  });
}
