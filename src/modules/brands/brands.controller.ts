import { Request, Response, NextFunction } from 'express';
import * as brandsService from './brands.service';

export async function listBrands(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const brands = await brandsService.listBrands(limit);
    res.json({ brands });
  } catch (err) {
    next(err);
  }
}
