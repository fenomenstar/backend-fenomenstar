# Dockerfile for FenomenStar Backend

# ===== BUILD STAGE =====
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (cache layer)
COPY package*.json ./
RUN npm ci && npm cache clean --force

# Copy source and build
COPY . .
RUN npm run build && npm prune --omit=dev

# ===== PRODUCTION STAGE =====
FROM node:20-alpine AS production

# Install FFmpeg for video processing
RUN apk add --no-cache ffmpeg

# Create non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

WORKDIR /app

# Copy built files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Create logs directory
RUN mkdir -p logs && chown -R appuser:appgroup logs

# Switch to non-root user
USER appuser

# Environment
ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

EXPOSE 3000

CMD ["node", "dist/index.js"]
