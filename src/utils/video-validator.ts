/**
 * Server-side video validation
 * Validates file size, format, codec, and duration
 */
import ffmpeg from 'fluent-ffmpeg';
import { VIDEO_LIMITS } from '../config/constants';
import { BadRequestError } from './errors';
import { logger } from './logger';
import { s3Client } from '../config/storage';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../config/env';
import { Readable } from 'stream';
import fs from 'fs';
import path from 'path';
import os from 'os';

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  videoCodec: string;
  audioCodec: string | null;
  fileSize: number;
  bitrate: number;
  fps: number;
  isValid: boolean;
  errors: string[];
}

/**
 * Probe video file and extract metadata
 */
export function probeVideo(filePath: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        logger.error('FFprobe error:', err);
        reject(new BadRequestError('Video dosyası okunamadı. Geçerli bir video yükleyin.'));
        return;
      }

      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      const audioStream = metadata.streams.find(s => s.codec_type === 'audio');

      if (!videoStream) {
        reject(new BadRequestError('Video akışı bulunamadı. Geçerli bir video dosyası yükleyin.'));
        return;
      }

      const errors: string[] = [];
      const duration = metadata.format.duration || 0;
      const width = videoStream.width || 0;
      const height = videoStream.height || 0;
      const videoCodec = (videoStream.codec_name || '').toLowerCase();
      const audioCodec = audioStream ? (audioStream.codec_name || '').toLowerCase() : null;
      const fileSize = metadata.format.size || 0;
      const bitrate = metadata.format.bit_rate || 0;
      
      // Parse FPS from avg_frame_rate (e.g., "30000/1001")
      let fps = 30;
      if (videoStream.avg_frame_rate) {
        const parts = videoStream.avg_frame_rate.split('/');
        if (parts.length === 2) {
          fps = parseInt(parts[0]) / parseInt(parts[1]);
        } else {
          fps = parseFloat(videoStream.avg_frame_rate);
        }
      }

      // Validate file size
      if (fileSize > VIDEO_LIMITS.MAX_FILE_SIZE) {
        errors.push(`Dosya boyutu cok buyuk. Maksimum: ${VIDEO_LIMITS.MAX_FILE_SIZE / (1024 * 1024)}MB`);
      }

      // Validate duration
      if (duration > VIDEO_LIMITS.MAX_DURATION) {
        errors.push(`Video suresi cok uzun. Maksimum: ${VIDEO_LIMITS.MAX_DURATION} saniye`);
      }
      if (duration < VIDEO_LIMITS.MIN_DURATION) {
        errors.push(`Video suresi cok kisa. Minimum: ${VIDEO_LIMITS.MIN_DURATION} saniye`);
      }

      // Validate resolution
      if (width > VIDEO_LIMITS.MAX_WIDTH || height > VIDEO_LIMITS.MAX_HEIGHT) {
        errors.push(`Cozunurluk cok yuksek. Maksimum: ${VIDEO_LIMITS.MAX_WIDTH}x${VIDEO_LIMITS.MAX_HEIGHT}`);
      }
      if (width < VIDEO_LIMITS.MIN_WIDTH || height < VIDEO_LIMITS.MIN_HEIGHT) {
        errors.push(`Cozunurluk cok dusuk. Minimum: ${VIDEO_LIMITS.MIN_WIDTH}x${VIDEO_LIMITS.MIN_HEIGHT}`);
      }

      // Validate video codec
      const isValidVideoCodec = VIDEO_LIMITS.ALLOWED_VIDEO_CODECS.some(
        codec => videoCodec.includes(codec)
      );
      if (!isValidVideoCodec) {
        errors.push(`Desteklenmeyen video kodek: ${videoCodec}. Desteklenen: H.264, HEVC`);
      }

      // Validate audio codec (if present)
      if (audioCodec && !VIDEO_LIMITS.ALLOWED_AUDIO_CODECS.some(c => audioCodec.includes(c))) {
        errors.push(`Desteklenmeyen ses kodek: ${audioCodec}. Desteklenen: AAC, MP3`);
      }

      resolve({
        duration,
        width,
        height,
        videoCodec,
        audioCodec,
        fileSize,
        bitrate,
        fps,
        isValid: errors.length === 0,
        errors,
      });
    });
  });
}

/**
 * Download file from S3 to temp location for validation
 */
export async function downloadFromS3ToTemp(key: string): Promise<string> {
  const tempDir = os.tmpdir();
  const tempFile = path.join(tempDir, `video_${Date.now()}_${path.basename(key)}`);

  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
  });

  const response = await s3Client.send(command);
  const stream = response.Body as Readable;

  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(tempFile);
    stream.pipe(writeStream);
    writeStream.on('finish', () => resolve(tempFile));
    writeStream.on('error', reject);
  });
}

/**
 * Validate video from S3 key
 */
export async function validateVideoFromS3(key: string): Promise<VideoMetadata> {
  let tempFile: string | null = null;
  
  try {
    tempFile = await downloadFromS3ToTemp(key);
    const metadata = await probeVideo(tempFile);
    
    if (!metadata.isValid) {
      throw new BadRequestError(metadata.errors.join('. '));
    }
    
    return metadata;
  } finally {
    // Cleanup temp file
    if (tempFile && fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}

/**
 * Quick MIME type check from file header (magic bytes)
 */
export function validateMimeType(buffer: Buffer): boolean {
  // MP4/MOV magic bytes
  const mp4Signatures = [
    [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70], // ftyp at offset 4
    [0x00, 0x00, 0x00, 0x1C, 0x66, 0x74, 0x79, 0x70],
    [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70],
  ];

  // Check for 'ftyp' at common offsets
  const ftypOffsets = [4, 8];
  for (const offset of ftypOffsets) {
    if (buffer.length > offset + 4) {
      const slice = buffer.slice(offset, offset + 4).toString('ascii');
      if (slice === 'ftyp') {
        return true;
      }
    }
  }

  return false;
}
