import { z } from 'zod';
import { VIDEO_LIMITS } from '../../config/constants';

export const createVideoSchema = z.object({
  title: z.string()
    .min(1, 'Baslik gerekli')
    .max(200, 'Baslik en fazla 200 karakter olabilir')
    .transform(s => s.trim()),
  description: z.string()
    .max(1000, 'Aciklama en fazla 1000 karakter olabilir')
    .default('')
    .transform(s => s.trim()),
  category: z.string()
    .min(1, 'Kategori gerekli')
    .max(50, 'Kategori en fazla 50 karakter olabilir'),
  competition_id: z.string().uuid('Gecersiz yarisma ID').optional().nullable(),
  // Client provides these but we validate on server after upload
  duration: z.number().int().min(0).max(VIDEO_LIMITS.MAX_DURATION).default(0),
  width: z.number().int().min(0).max(VIDEO_LIMITS.MAX_WIDTH).default(0),
  height: z.number().int().min(0).max(VIDEO_LIMITS.MAX_HEIGHT).default(0),
  file_size: z.number().int().min(0).max(VIDEO_LIMITS.MAX_FILE_SIZE).default(0),
});

export const uploadUrlSchema = z.object({
  contentType: z.string()
    .refine(
      (ct) => VIDEO_LIMITS.ALLOWED_MIME_TYPES.includes(ct) || ct === 'image/jpeg' || ct === 'image/png',
      { message: 'Desteklenmeyen dosya tipi. MP4, MOV veya M4V yükleyin.' }
    )
    .default('video/mp4'),
  fileExtension: z.string()
    .refine(
      (ext) => ['mp4', 'mov', 'm4v', 'jpg', 'jpeg', 'png'].includes(ext.toLowerCase()),
      { message: 'Desteklenmeyen dosya uzantisi' }
    )
    .default('mp4'),
  type: z.enum(['video', 'thumbnail']).default('video'),
});

export const updateVideoAfterUploadSchema = z.object({
  video_url: z.string().url('Gecersiz video URL'),
  video_key: z.string().min(1, 'Video key gerekli'),
  thumbnail: z.string().url('Gecersiz thumbnail URL').optional().nullable(),
  thumbnail_key: z.string().optional().nullable(),
  // If client provides estimated metadata, we validate it
  estimated_size: z.number().int().min(0).max(VIDEO_LIMITS.MAX_FILE_SIZE).optional(),
});

export const listVideosSchema = z.object({
  sort: z.enum(['newest', 'most_voted', 'most_viewed']).default('newest'),
  category: z.string().max(50).optional(),
  competition_id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
  status: z.enum(['pending', 'processing', 'ready', 'failed']).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().max(100).optional().transform(s => s?.trim()),
});

export const commentSchema = z.object({
  text: z.string()
    .min(1, 'Yorum bos olamaz')
    .max(500, 'Yorum en fazla 500 karakter olabilir')
    .transform(s => s.trim()),
});

export type CreateVideoInput = z.infer<typeof createVideoSchema>;
export type ListVideosInput = z.infer<typeof listVideosSchema>;
export type UpdateVideoAfterUploadInput = z.infer<typeof updateVideoAfterUploadSchema>;
