import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from './env';
import { generateId } from '../utils/crypto';
import fs from 'fs/promises';

const s3ClientConfig: ConstructorParameters<typeof S3Client>[0] = {
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT || undefined,
  forcePathStyle: true,
};

if (env.S3_ACCESS_KEY && env.S3_SECRET_KEY) {
  s3ClientConfig.credentials = {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  };
}

const s3Client = new S3Client(s3ClientConfig);

export interface PresignedUploadResult {
  uploadUrl: string;
  key: string;
  publicUrl: string;
}

export interface StorageAdapter {
  generateUploadUrl(
    userId: string,
    fileType: 'video' | 'thumbnail' | 'avatar',
    contentType: string,
    fileExtension?: string
  ): Promise<PresignedUploadResult>;
  generateSignedViewUrl(key: string, expiresIn?: number): Promise<string>;
  deleteFile(key: string): Promise<void>;
}

/**
 * Generate a presigned URL for direct upload from mobile client
 */
export async function generateUploadUrl(
  userId: string,
  fileType: 'video' | 'thumbnail' | 'avatar',
  contentType: string,
  fileExtension: string = 'mp4'
): Promise<PresignedUploadResult> {
  const fileId = generateId();
  const key = `${fileType}s/${userId}/${fileId}.${fileExtension}`;

  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 hour

  const publicUrl = env.S3_PUBLIC_URL
    ? `${env.S3_PUBLIC_URL}/${key}`
    : `${env.S3_ENDPOINT}/${env.S3_BUCKET}/${key}`;

  return { uploadUrl, key, publicUrl };
}

/**
 * Generate a presigned URL for secure video access (signed URL for playback)
 */
export async function generateSignedViewUrl(key: string, expiresIn: number = 3600): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Delete a file from storage
 */
export async function deleteFile(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
  });

  await s3Client.send(command);
}

export async function uploadLocalFile(
  localPath: string,
  key: string,
  contentType: string = 'video/mp4'
): Promise<{ key: string; publicUrl: string }> {
  const body = await fs.readFile(localPath);
  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    ContentType: contentType,
    Body: body,
  });

  await s3Client.send(command);

  const publicUrl = env.S3_PUBLIC_URL
    ? `${env.S3_PUBLIC_URL}/${key}`
    : `${env.S3_ENDPOINT}/${env.S3_BUCKET}/${key}`;

  return { key, publicUrl };
}

export const storageAdapter: StorageAdapter = {
  generateUploadUrl,
  generateSignedViewUrl,
  deleteFile,
};

export { s3Client };
