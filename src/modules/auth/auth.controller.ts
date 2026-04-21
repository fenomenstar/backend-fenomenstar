import { Request, Response, NextFunction } from 'express';
import * as authService from './auth.service';
import { registerSchema, loginSchema, refreshSchema } from './auth.schema';
import { BadRequestError } from '../../utils/errors';
import { AuthRequest } from '../../types';

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.errors[0].message);
    }

    const result = await authService.register(parsed.data);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.errors[0].message);
    }

    const result = await authService.login(parsed.data);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Refresh token gerekli');
    }

    const result = await authService.refreshTokens(parsed.data.refreshToken);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function logout(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    // Get access token from header
    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;
    
    // Get refresh token from body
    const { refreshToken } = req.body;
    
    if (accessToken) {
      await authService.logout(accessToken, refreshToken);
    }
    
    res.json({ message: 'Başarıyla çıkış yapıldı' });
  } catch (err) {
    next(err);
  }
}

export async function me(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      throw new BadRequestError('Kullanıcı bilgisi bulunamadı');
    }
    const user = await authService.getMe(req.user.userId);
    res.json(user);
  } catch (err) {
    next(err);
  }
}
