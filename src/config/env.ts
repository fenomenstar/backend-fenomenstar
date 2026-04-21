import dotenv from 'dotenv';
import { z } from 'zod';
import crypto from 'crypto';

dotenv.config();

// Minimum 64 characters for production security
const MIN_SECRET_LENGTH = 64;

// Helper to generate secure secrets
function generateSecureSecret(): string {
  return crypto.randomBytes(48).toString('base64');
}

const envSchema = z.object({
  // ===== SERVER =====
  PORT: z.string().default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // ===== DATABASE =====
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL URL'),
  DATABASE_POOL_MIN: z.coerce.number().int().min(1).default(2),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).default(20),
  
  // ===== REDIS =====
  REDIS_URL: z.string().default('redis://localhost:6379'),
  
  // ===== JWT =====
  JWT_SECRET: z.string().min(MIN_SECRET_LENGTH, {
    message: `JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters`,
  }),
  JWT_REFRESH_SECRET: z.string().min(MIN_SECRET_LENGTH, {
    message: `JWT_REFRESH_SECRET must be at least ${MIN_SECRET_LENGTH} characters`,
  }),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  
  // ===== S3 / CLOUDFLARE R2 =====
  S3_ENDPOINT: z.string().url('S3_ENDPOINT must be a valid URL').optional().or(z.literal('')),
  S3_REGION: z.string().default('auto'),
  S3_ACCESS_KEY: z.string().optional().or(z.literal('')),
  S3_SECRET_KEY: z.string().optional().or(z.literal('')),
  S3_BUCKET: z.string().default('fenomenstar-media'),
  S3_PUBLIC_URL: z.string().url().optional().or(z.literal('')),
  
  // ===== WEBRTC / TURN =====
  TURN_SECRET: z.string().optional().or(z.literal('')),
  TURN_SERVER: z.string().optional().or(z.literal('')),
  TURN_PROVIDER: z.enum(['static', 'cloudflare']).default('static'),
  CLOUDFLARE_TURN_KEY_ID: z.string().optional().or(z.literal('')),
  CLOUDFLARE_TURN_API_TOKEN: z.string().optional().or(z.literal('')),
  
  // ===== MONITORING =====
  SENTRY_DSN: z.string().url('SENTRY_DSN must be a valid URL').optional().or(z.literal('')),
  SENTRY_ENVIRONMENT: z.string().default('development'),
  SENTRY_RELEASE: z.string().optional(),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),

  // ===== GOOGLE PLAY BILLING =====
  GOOGLE_PLAY_PACKAGE_NAME: z.string().optional().or(z.literal('')),
  GOOGLE_PLAY_PROJECT_ID: z.string().optional().or(z.literal('')),
  GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL: z.string().email().optional().or(z.literal('')),
  GOOGLE_PLAY_PRIVATE_KEY: z.string().optional().or(z.literal('')),
  GOOGLE_PLAY_ENABLE_RTDN: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .default('false'),
  
  // ===== CORS =====
  CORS_ORIGIN: z.string().default('*'),
  
  // ===== APP =====
  APP_NAME: z.string().default('FenomenStar'),
  APP_VERSION: z.string().default('1.0.0'),

  // ===== SUPABASE AUTH =====
  USE_SUPABASE_AUTH: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .default('false'),
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL').optional().or(z.literal('')),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().or(z.literal('')),

  // ===== MODERATION =====
  MODERATION_PROVIDER: z.enum(['local', 'huggingface']).default('local'),
  HUGGINGFACE_API_KEY: z.string().optional().or(z.literal('')),
  HUGGINGFACE_MODERATION_MODEL: z.string().default('facebook/roberta-hate-speech-dynabench-r4-target'),
  HUGGINGFACE_EMBEDDING_MODEL: z.string().default('intfloat/multilingual-e5-large'),

  // ===== PLAY REVIEW / SEEDING =====
  PLAY_REVIEW_TEST_EMAIL: z.string().email().default('fenomenstar_user_review@fenomenstar.com'),
  PLAY_REVIEW_TEST_PASSWORD: z.string().min(8).optional().or(z.literal('')),
  PLAY_REVIEW_TEST_NAME: z.string().default('FenomenStar Review User'),
  PLAY_REVIEW_TEST_ROLE: z.enum(['talent', 'viewer', 'brand', 'admin']).default('viewer'),
});

// Pre-process environment variables for development
function preprocessEnv() {
  const env = { ...process.env };
  
  // In development, auto-generate secrets if not provided
  if (env.NODE_ENV !== 'production') {
    if (!env.JWT_SECRET || env.JWT_SECRET.length < MIN_SECRET_LENGTH) {
      env.JWT_SECRET = generateSecureSecret();
      console.warn('⚠️  Generated temporary JWT_SECRET for development');
    }
    if (!env.JWT_REFRESH_SECRET || env.JWT_REFRESH_SECRET.length < MIN_SECRET_LENGTH) {
      env.JWT_REFRESH_SECRET = generateSecureSecret();
      console.warn('⚠️  Generated temporary JWT_REFRESH_SECRET for development');
    }
    if (!env.DATABASE_URL) {
      env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/fenomenstar';
    }
  }
  
  return env;
}

const processedEnv = preprocessEnv();
const parsed = envSchema.safeParse(processedEnv);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  const errors = parsed.error.flatten().fieldErrors;
  Object.entries(errors).forEach(([key, messages]) => {
    console.error(`  ${key}: ${messages?.join(', ')}`);
  });
  
  if (process.env.NODE_ENV === 'production') {
    console.error('\n🔒 Production requires all environment variables to be properly configured.');
    console.error('Generate secrets with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64\'))"');
    process.exit(1);
  }
  
  throw new Error('Invalid environment configuration');
}

// Validate secret strength in production
if (parsed.data.NODE_ENV === 'production') {
  const weakPatterns = ['change-this', 'secret', 'password', '123456', 'default', 'example'];
  const secrets = [parsed.data.JWT_SECRET, parsed.data.JWT_REFRESH_SECRET];
  
  for (const secret of secrets) {
    const lower = secret.toLowerCase();
    for (const pattern of weakPatterns) {
      if (lower.includes(pattern)) {
        console.error('❌ SECURITY ERROR: Secrets contain weak/default patterns');
        process.exit(1);
      }
    }
  }
}

export const env = parsed.data;
export { generateSecureSecret };

// Log configuration summary (non-sensitive)
export function logConfig(): void {
  console.log('\n📋 Configuration:');
  console.log(`  Environment: ${env.NODE_ENV}`);
  console.log(`  Port: ${env.PORT}`);
  console.log(`  Database: ${env.DATABASE_URL.replace(/\/\/.*@/, '//*****@')}`);
  console.log(`  Redis: ${env.REDIS_URL}`);
  console.log(`  S3 Bucket: ${env.S3_BUCKET}`);
  console.log(`  TURN Server: ${env.TURN_SERVER ? 'Configured' : 'Not configured'}`);
  console.log(`  TURN Provider: ${env.TURN_PROVIDER}`);
  console.log(`  Google Play Billing: ${env.GOOGLE_PLAY_PACKAGE_NAME && env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_PLAY_PRIVATE_KEY ? 'Configured' : 'Not configured'}`);
  console.log(`  Sentry: ${env.SENTRY_DSN ? 'Configured' : 'Not configured'}`);
  console.log(`  Supabase Auth: ${env.USE_SUPABASE_AUTH ? 'Enabled' : 'Disabled'}`);
  console.log(`  Moderation: ${env.MODERATION_PROVIDER}`);
  console.log(`  Embeddings: ${env.HUGGINGFACE_EMBEDDING_MODEL}`);
  console.log(`  Play Review User: ${env.PLAY_REVIEW_TEST_EMAIL}`);
  console.log(`  Log Level: ${env.LOG_LEVEL}`);
  console.log('');
}
