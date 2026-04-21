// Production-critical video validation constants
export const VIDEO_LIMITS = {
  MAX_FILE_SIZE: 200 * 1024 * 1024, // 200 MB
  MAX_DURATION: 180, // 3 minutes in seconds
  MIN_DURATION: 1, // 1 second minimum
  MAX_WIDTH: 3840, // 4K
  MAX_HEIGHT: 2160, // 4K
  MIN_WIDTH: 320,
  MIN_HEIGHT: 240,
  ALLOWED_MIME_TYPES: ['video/mp4', 'video/quicktime', 'video/x-m4v'],
  ALLOWED_VIDEO_CODECS: ['h264', 'avc1', 'hevc', 'h265'],
  ALLOWED_AUDIO_CODECS: ['aac', 'mp4a', 'mp3'],
  THUMBNAIL_TIMESTAMP: 1, // Generate at 1 second
  THUMBNAIL_WIDTH: 480,
  THUMBNAIL_QUALITY: 80,
};

export const QUEUE_NAMES = {
  VIDEO_PROCESSING: 'video-processing',
  THUMBNAIL_GENERATION: 'thumbnail-generation',
  VIDEO_TRANSCODING: 'video-transcoding',
};

export const REDIS_KEYS = {
  RATE_LIMIT_PREFIX: 'rl:',
  TOKEN_BLACKLIST_PREFIX: 'bl:',
  VIDEO_PROCESSING_PREFIX: 'vp:',
};
