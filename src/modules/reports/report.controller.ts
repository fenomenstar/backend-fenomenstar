import { Response, NextFunction } from 'express';
import { BadRequestError } from '../../utils/errors';
import { AuthRequest } from '../../types';
import { createReportSchema } from './report.schema';
import { createReport } from './report.service';

export async function submitReport(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new BadRequestError('Oturum gerekli');

    const parsed = createReportSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.errors[0].message);

    const result = await createReport(req.user.userId, parsed.data);
    res.status(result.alreadyReported ? 200 : 201).json(result);
  } catch (err) {
    next(err);
  }
}
