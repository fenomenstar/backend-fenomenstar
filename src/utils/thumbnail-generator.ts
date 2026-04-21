/**
 * Real thumbnail generation using FFmpeg
 */
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { VIDEO_LIMITS } from '../config/constants';
import { logger } from './logger';
import { s3Client } from '../config/storage';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../config/env';
import { generateId } from './crypto';

export interface ThumbnailResult {
  key: string;
  publicUrl: string;
  width: number;
  height: number;
}

/**
 * Generate thumbnail from video file
 */
export function generateThumbnailFromFile(
  videoPath: string,
  outputPath: string,
  timestamp: number = VIDEO_LIMITS.THUMBNAIL_TIMESTAMP,
  width: number = VIDEO_LIMITS.THUMBNAIL_WIDTH
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .seekInput(timestamp)
      .frames(1)
      .size(`${width}x?`) // Maintain aspect ratio
      .outputOptions([
        '-q:v', '2', // High quality JPEG
        '-f', 'image2',
      ])
      .output(outputPath)
      .on('start', (cmd) => {
        logger.debug('FFmpeg thumbnail command:', cmd);
      })
      .on('end', () => {
        logger.info('Thumbnail generated:', outputPath);
        resolve();
      })
      .on('error', (err) => {
        logger.error('Thumbnail generation failed:', err);
        reject(err);
      })
      .run();
  });
}

/**
 * Generate multiple thumbnails at different timestamps
 */
export function generateThumbnailsFromFile(
  videoPath: string,
  outputDir: string,
  count: number = 3,
  duration: number
): Promise<string[]> {
  const timestamps: number[] = [];
  const interval = duration / (count + 1);
  
  for (let i = 1; i <= count; i++) {
    timestamps.push(Math.floor(interval * i));
  }

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({
        count,
        folder: outputDir,
        filename: 'thumb_%i.jpg',
        size: `${VIDEO_LIMITS.THUMBNAIL_WIDTH}x?`,
      })
      .on('end', () => {
        const files = timestamps.map((_, i) => path.join(outputDir, `thumb_${i + 1}.jpg`));
        resolve(files);
      })
      .on('error', reject);
  });
}

/**
 * Upload thumbnail to S3
 */
export async function uploadThumbnailToS3(
  filePath: string,
  userId: string
): Promise<ThumbnailResult> {
  const fileId = generateId();
  const key = `thumbnails/${userId}/${fileId}.jpg`;

  const fileBuffer = fs.readFileSync(filePath);

  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    Body: fileBuffer,
    ContentType: 'image/jpeg',
    CacheControl: 'max-age=31536000', // 1 year cache
  });

  await s3Client.send(command);

  const publicUrl = env.S3_PUBLIC_URL
    ? `${env.S3_PUBLIC_URL}/${key}`
    : `${env.S3_ENDPOINT}/${env.S3_BUCKET}/${key}`;

  // Get dimensions from the generated file
  const sizeMatch = filePath.match(/(\d+)x(\d+)/);
  const width = sizeMatch ? parseInt(sizeMatch[1]) : VIDEO_LIMITS.THUMBNAIL_WIDTH;
  const height = sizeMatch ? parseInt(sizeMatch[2]) : Math.floor(VIDEO_LIMITS.THUMBNAIL_WIDTH * 16 / 9);

  return {
    key,
    publicUrl,
    width,
    height,
  };
}

/**
 * Complete flow: Download video from S3, generate thumbnail, upload to S3
 */
export async function generateAndUploadThumbnail(
  videoKey: string,
  userId: string,
  duration: number
): Promise<ThumbnailResult> {
  const tempDir = os.tmpdir();
  const videoPath = path.join(tempDir, `video_${Date.now()}.mp4`);
  const thumbPath = path.join(tempDir, `thumb_${Date.now()}.jpg`);

  try {
    // Download video from S3
    const { downloadFromS3ToTemp } = await import('./video-validator');
    const downloadedPath = await downloadFromS3ToTemp(videoKey);
    fs.renameSync(downloadedPath, videoPath);

    // Generate thumbnail at optimal timestamp (avoid black frames)
    const timestamp = Math.min(VIDEO_LIMITS.THUMBNAIL_TIMESTAMP, duration / 2);
    await generateThumbnailFromFile(videoPath, thumbPath, timestamp);

    // Upload to S3
    const result = await uploadThumbnailToS3(thumbPath, userId);

    return result;
  } finally {
    // Cleanup temp files
    if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
    if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
  }
}
