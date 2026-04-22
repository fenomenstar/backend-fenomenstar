import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { verifyAccessToken } from '../auth/jwt.service';
import { updateViewerCount, likeStream } from './live.service';
import { logger } from '../../utils/logger';
import { moderateTextContent } from '../../services/moderation.service';

interface SignalingClient {
  ws: WebSocket;
  userId: string;
  userName: string;
  role: 'broadcaster' | 'viewer';
  streamId?: string;
}

// Room = streamId -> { broadcaster, viewers[] }
interface Room {
  broadcaster: SignalingClient | null;
  viewers: Map<string, SignalingClient>;
}

const rooms = new Map<string, Room>();
const recentChatMessages = new Map<string, number[]>();
const MAX_CHAT_MESSAGES_PER_WINDOW = 5;
const CHAT_WINDOW_MS = 10000;
const MAX_CHAT_LENGTH = 300;

function getChatRateLimitKey(streamId: string, userId: string) {
  return `${streamId}:${userId}`;
}

function isChatRateLimited(streamId: string, userId: string) {
  const key = getChatRateLimitKey(streamId, userId);
  const now = Date.now();
  const recent = (recentChatMessages.get(key) ?? []).filter((timestamp) => now - timestamp < CHAT_WINDOW_MS);
  recent.push(now);
  recentChatMessages.set(key, recent);
  return recent.length > MAX_CHAT_MESSAGES_PER_WINDOW;
}

function getOrCreateRoom(streamId: string): Room {
  if (!rooms.has(streamId)) {
    rooms.set(streamId, { broadcaster: null, viewers: new Map() });
  }
  return rooms.get(streamId)!;
}

function broadcastToRoom(streamId: string, message: object, excludeUserId?: string) {
  const room = rooms.get(streamId);
  if (!room) return;

  const data = JSON.stringify(message);

  if (room.broadcaster && room.broadcaster.userId !== excludeUserId) {
    room.broadcaster.ws.send(data);
  }

  room.viewers.forEach((viewer) => {
    if (viewer.userId !== excludeUserId) {
      viewer.ws.send(data);
    }
  });
}

export function setupSignalingServer(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket, req) => {
    let client: SignalingClient | null = null;

    ws.on('message', async (rawMessage: Buffer) => {
      try {
        const message = JSON.parse(rawMessage.toString());

        switch (message.type) {
          // ===== AUTH =====
          case 'auth': {
            try {
              const payload = verifyAccessToken(message.token);
              client = {
                ws,
                userId: payload.userId,
                userName: message.userName || 'Anonim',
                role: 'viewer',
              };
              ws.send(JSON.stringify({ type: 'auth_success', userId: payload.userId }));
            } catch {
              ws.send(JSON.stringify({ type: 'auth_error', message: 'Geçersiz token' }));
              ws.close();
            }
            break;
          }

          // ===== JOIN STREAM =====
          case 'join_stream': {
            if (!client) { ws.send(JSON.stringify({ type: 'error', message: 'Oturum gerekli' })); return; }

            const streamId = message.streamId;
            const isBroadcaster = message.isBroadcaster === true;
            client.streamId = streamId;

            const room = getOrCreateRoom(streamId);

            if (isBroadcaster) {
              client.role = 'broadcaster';
              room.broadcaster = client;
              logger.info(`Broadcaster ${client.userId} joined stream ${streamId}`);
            } else {
              client.role = 'viewer';
              room.viewers.set(client.userId, client);
              await updateViewerCount(streamId, 1);

              // Notify broadcaster that a new viewer joined
              if (room.broadcaster) {
                room.broadcaster.ws.send(JSON.stringify({
                  type: 'viewer_joined',
                  viewerId: client.userId,
                  viewerName: client.userName,
                  viewerCount: room.viewers.size,
                }));
              }

              logger.info(`Viewer ${client.userId} joined stream ${streamId}, total: ${room.viewers.size}`);
            }

            // Send current viewer count
            ws.send(JSON.stringify({
              type: 'stream_info',
              streamId,
              viewerCount: room.viewers.size,
              isBroadcasterOnline: !!room.broadcaster,
            }));
            break;
          }

          // ===== WebRTC SIGNALING =====
          case 'offer': {
            if (!client?.streamId) return;
            const room = rooms.get(client.streamId);
            if (!room) return;

            // Broadcaster sends offer to specific viewer
            const targetViewer = room.viewers.get(message.targetId);
            if (targetViewer) {
              targetViewer.ws.send(JSON.stringify({
                type: 'offer',
                sdp: message.sdp,
                broadcasterId: client.userId,
              }));
            }
            break;
          }

          case 'answer': {
            if (!client?.streamId) return;
            const room = rooms.get(client.streamId);
            if (!room || !room.broadcaster) return;

            // Viewer sends answer to broadcaster
            room.broadcaster.ws.send(JSON.stringify({
              type: 'answer',
              sdp: message.sdp,
              viewerId: client.userId,
            }));
            break;
          }

          case 'ice_candidate': {
            if (!client?.streamId) return;
            const room = rooms.get(client.streamId);
            if (!room) return;

            if (message.targetId) {
              // Send to specific target
              const target = message.targetId === room.broadcaster?.userId
                ? room.broadcaster
                : room.viewers.get(message.targetId);

              if (target) {
                target.ws.send(JSON.stringify({
                  type: 'ice_candidate',
                  candidate: message.candidate,
                  fromId: client.userId,
                }));
              }
            } else {
              // Broadcast to all in room except sender
              broadcastToRoom(client.streamId, {
                type: 'ice_candidate',
                candidate: message.candidate,
                fromId: client.userId,
              }, client.userId);
            }
            break;
          }

          // ===== CHAT =====
          case 'chat_message': {
            if (!client?.streamId) return;
            const text = typeof message.text === 'string' ? message.text.trim() : '';

            if (!text) {
              ws.send(JSON.stringify({ type: 'chat_rejected', message: 'Boş mesaj gönderilemez' }));
              return;
            }

            if (text.length > MAX_CHAT_LENGTH) {
              ws.send(JSON.stringify({ type: 'chat_rejected', message: 'Mesaj cok uzun' }));
              return;
            }

            if (isChatRateLimited(client.streamId, client.userId)) {
              ws.send(JSON.stringify({ type: 'chat_rejected', message: 'Çok hızlı mesaj gönderiyorsun' }));
              return;
            }

            const moderation = await moderateTextContent(undefined, text);
            if (!moderation.allow) {
              ws.send(JSON.stringify({
                type: 'chat_rejected',
                message: moderation.reason || 'Mesaj moderasyon kontrolune takildi',
              }));
              return;
            }

            broadcastToRoom(client.streamId, {
              type: 'chat_message',
              userId: client.userId,
              userName: client.userName,
              text,
              timestamp: Date.now(),
            });
            break;
          }

          // ===== LIKE =====
          case 'like': {
            if (!client?.streamId) return;
            await likeStream(client.streamId);

            broadcastToRoom(client.streamId, {
              type: 'like',
              userId: client.userId,
              userName: client.userName,
            });
            break;
          }

          // ===== END STREAM =====
          case 'end_stream': {
            if (!client?.streamId) return;

            broadcastToRoom(client.streamId, {
              type: 'stream_ended',
              streamId: client.streamId,
            });

            rooms.delete(client.streamId);
            break;
          }

          default:
            ws.send(JSON.stringify({ type: 'error', message: `Bilinmeyen mesaj tipi: ${message.type}` }));
        }
      } catch (err) {
        logger.error('WebSocket message error:', err);
        ws.send(JSON.stringify({ type: 'error', message: 'Mesaj isleme hatasi' }));
      }
    });

    ws.on('close', async () => {
      if (!client?.streamId) return;

      const room = rooms.get(client.streamId);
      if (!room) return;

      if (client.role === 'broadcaster') {
        // Broadcaster left - notify all viewers
        broadcastToRoom(client.streamId, {
          type: 'broadcaster_disconnected',
          streamId: client.streamId,
        }, client.userId);
        rooms.delete(client.streamId);
        logger.info(`Broadcaster ${client.userId} left stream ${client.streamId}`);
      } else {
        // Viewer left
        room.viewers.delete(client.userId);
        await updateViewerCount(client.streamId, -1);

        if (room.broadcaster) {
          room.broadcaster.ws.send(JSON.stringify({
            type: 'viewer_left',
            viewerId: client.userId,
            viewerCount: room.viewers.size,
          }));
        }
        logger.info(`Viewer ${client.userId} left stream ${client.streamId}, remaining: ${room.viewers.size}`);
      }
    });

    ws.on('error', (err) => {
      logger.error('WebSocket error:', err);
    });
  });

  logger.info('WebSocket signaling server initialized on /ws');
  return wss;
}
