import { z } from 'zod';

export const createReportSchema = z.object({
  targetType: z.enum(['user', 'video', 'comment', 'chat']),
  targetId: z.string().uuid('Geçersiz hedef ID'),
  reason: z.string().min(2, 'Sebep gerekli').max(80, 'Sebep çok uzun').transform((value) => value.trim()),
  details: z.string().max(1000, 'Detay çok uzun').optional().default('').transform((value) => value.trim()),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;
