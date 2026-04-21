import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';

import { env, logConfig } from './config/env';
import { testConnection } from './config/database';
import { configureFfmpeg } from './config/ffmpeg';
import { logger, requestIdMiddleware, requestLoggerMiddleware } from './utils/logger';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { rateLimitMiddleware } from './middleware/rate-limit.middleware';
import { initSentry, sentryRequestHandler, sentryTracingHandler, sentryErrorHandler, flushSentry } from './config/sentry';

// Routes
import authRoutes from './modules/auth/auth.routes';
import userRoutes from './modules/users/user.routes';
import videoRoutes from './modules/videos/video.routes';
import competitionRoutes from './modules/competitions/competition.routes';
import liveRoutes from './modules/live/live.routes';
import adminRoutes from './modules/admin/admin.routes';
import searchRoutes from './modules/search/search.routes';
import notificationRoutes from './modules/notifications/notifications.routes';
import reportRoutes from './modules/reports/report.routes';
import brandsRoutes from './modules/brands/brands.routes';
import karaokeRoutes from './modules/karaoke/karaoke.routes';
import paymentsRoutes from './modules/payments/payments.routes';

// WebSocket signaling
import { setupSignalingServer } from './modules/live/signaling';

// Video processing queue
import { setupVideoProcessor, closeQueue } from './workers/video-queue';

// Redis
import { getRedis, closeRedis } from './config/redis';

const app = express();
const server = createServer(app);

// ===== SENTRY INIT (must be first) =====
initSentry(app);

// ===== CORE MIDDLEWARE =====
app.use(sentryRequestHandler());
app.use(sentryTracingHandler());
app.use(helmet({
  contentSecurityPolicy: env.NODE_ENV === 'production',
}));
app.use(cors({ 
  origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(','),
  credentials: true,
  exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ===== REQUEST TRACKING =====
app.use(requestIdMiddleware);
app.use(requestLoggerMiddleware);

// ===== GLOBAL RATE LIMIT =====
app.use(rateLimitMiddleware(200, 60));

// ===== HEALTH CHECK =====
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: env.APP_VERSION,
    environment: env.NODE_ENV,
    uptime: Math.floor(process.uptime()),
  });
});

// ===== READINESS CHECK =====
app.get('/ready', async (_req, res) => {
  try {
    // Check database
    await testConnection();
    
    // Check Redis
    const redis = getRedis();
    await redis.ping();
    
    res.json({ status: 'ready' });
  } catch (err) {
    res.status(503).json({ status: 'not ready', error: (err as Error).message });
  }
});

// ===== API ROUTES =====
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/competitions', competitionRoutes);
app.use('/api/live', liveRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/brands', brandsRoutes);
app.use('/api/karaoke', karaokeRoutes);
app.use('/api/payments', paymentsRoutes);

// ===== ERROR HANDLING =====
app.use(notFoundHandler);
app.use(sentryErrorHandler());
app.use(errorHandler);

// ===== START SERVER =====
async function start() {
  try {
    // Log configuration
    logConfig();

    // Configure ffmpeg/ffprobe binaries (static fallback)
    configureFfmpeg();
    
    // Test database connection
    await testConnection();
    logger.info('Database connected');

    // Initialize Redis connection
    getRedis();
    logger.info('Redis connection initialized');

    // Setup video processing queue
    setupVideoProcessor();
    logger.info('Video processing queue started');

    // Setup WebSocket signaling server
    setupSignalingServer(server);
    logger.info('WebSocket signaling server started');

    server.listen(parseInt(env.PORT), '0.0.0.0', () => {
      logger.info(`Server started`, {
        port: env.PORT,
        environment: env.NODE_ENV,
        nodeVersion: process.version,
      });
      console.log(`\n🚀 Server running at http://localhost:${env.PORT}`);
      console.log(`   Health: http://localhost:${env.PORT}/health`);
      console.log(`   API: http://localhost:${env.PORT}/api`);
      console.log(`   WebSocket: ws://localhost:${env.PORT}/ws\n`);
    });
  } catch (err) {
    logger.error('Failed to start server', { error: (err as Error).message, stack: (err as Error).stack });
    process.exit(1);
  }
}

start();

// ===== GRACEFUL SHUTDOWN =====
const gracefulShutdown = async (signal: string) => {
  logger.info(`${signal} received, starting graceful shutdown...`);
  
  // Stop accepting new connections
  server.close(async () => {
    logger.info('HTTP server closed');
    
    try {
      // Close video processing queue
      await closeQueue();
      logger.info('Video queue closed');
      
      // Close Redis connection
      await closeRedis();
      logger.info('Redis closed');
      
      // Flush Sentry events
      await flushSentry();
      logger.info('Sentry flushed');
      
      logger.info('Graceful shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error('Error during shutdown', { error: (err as Error).message });
      process.exit(1);
    }
  });

  // Force close after 30 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ===== UNHANDLED ERRORS =====
process.on('unhandledRejection', (reason: any) => {
  logger.error('Unhandled Rejection', { reason: reason?.message || reason });
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  // Give time for logging then exit
  setTimeout(() => process.exit(1), 1000);
});

export { app, server };
