import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().min(2, 'Ad en az 2 karakter olmali').max(100),
  email: z.string().email('Geçerli bir e-posta adresi girin'),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalı').max(128),
  role: z.enum(['talent', 'viewer', 'brand']).default('viewer'),
  city: z.string().max(100).default(''),
});

export const loginSchema = z.object({
  email: z.string().email('Geçerli bir e-posta adresi girin'),
  password: z.string().min(1, 'Şifre gerekli'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token gerekli'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
