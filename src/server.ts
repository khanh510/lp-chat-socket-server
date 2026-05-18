import express from 'express';
import { createServer } from 'node:http';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { Server, type Namespace, type Socket } from 'socket.io';
import { config } from './config.js';
import { verifyJwt } from './middleware/auth.js';
import { connectedClientsGauge } from './metrics.js';
import { healthRoute } from './routes/health.js';
import { publishRoute } from './routes/publish.js';
import type { JwtClaims, RawBodyRequest } from './types.js';

function hasRoomAccess(claims: JwtClaims, roomId: number): boolean {
  return claims.rooms.includes(roomId);
}

function parseRoomId(value: unknown): number | null {
  const roomId = Number(value);

  return Number.isInteger(roomId) && roomId > 0 ? roomId : null;
}

const app = express();
const typingThrottleMs = 1500;
app.use(
  express.json({
    limit: '256kb',
    verify: (req, _res, buffer) => {
      (req as RawBodyRequest).rawBody = Buffer.from(buffer);
    },
  }),
);

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: config.corsOrigin,
    credentials: config.corsOrigin !== '*',
  },
});

const pub = createClient({ url: config.redisUrl });
const sub = pub.duplicate();
let redisReady = false;

pub.on('error', (error) => {
  redisReady = false;
  console.error('Redis publisher error:', error);
});

sub.on('error', (error) => {
  redisReady = false;
  console.error('Redis subscriber error:', error);
});

await Promise.all([pub.connect(), sub.connect()]);
io.adapter(createAdapter(pub, sub));
redisReady = true;

healthRoute(app, () => redisReady, config.metricsToken);
const chatNamespaces: Namespace[] = [io.of('/'), io.of('/chat')];

function updateConnectedClientsGauge(): void {
  connectedClientsGauge.set(chatNamespaces.reduce((total, namespace) => total + namespace.sockets.size, 0));
}

function bindChatNamespace(namespace: Namespace): void {
  namespace.use(verifyJwt);
  namespace.on('connection', (socket: Socket) => {
    const typingLastSentAt = new Map<number, number>();

    updateConnectedClientsGauge();

    socket.on('subscribe', ({ room_id }: { room_id?: unknown }, ack?: (response: unknown) => void) => {
      const claims = socket.data.claims as JwtClaims;
      const roomId = parseRoomId(room_id);

      if (!roomId || !hasRoomAccess(claims, roomId)) {
        ack?.({ ok: false, error: 'forbidden' });
        return;
      }

      socket.join(`room:${roomId}`);
      ack?.({ ok: true, room_id: roomId });
    });

    socket.on('typing', ({ room_id }: { room_id?: unknown }) => {
      const claims = socket.data.claims as JwtClaims;
      const roomId = parseRoomId(room_id);

      if (!roomId || !hasRoomAccess(claims, roomId)) {
        return;
      }

      const now = Date.now();
      const lastSentAt = typingLastSentAt.get(roomId) || 0;
      if (now - lastSentAt < typingThrottleMs) {
        return;
      }
      typingLastSentAt.set(roomId, now);

      socket.to(`room:${roomId}`).emit('typing', {
        room_id: roomId,
        user_id: claims.sub,
      });
    });

    socket.on('disconnect', () => {
      updateConnectedClientsGauge();
    });
  });
}

chatNamespaces.forEach(bindChatNamespace);
publishRoute(app, chatNamespaces);

httpServer.listen(config.port, () => {
  console.log(`LearnPress chat server listening on :${config.port}`);
});

async function shutdown(): Promise<void> {
  await new Promise<void>((resolve) => {
    httpServer.close(() => resolve());
  });
  await Promise.allSettled([pub.quit(), sub.quit()]);
}

process.on('SIGINT', () => {
  shutdown().finally(() => process.exit(0));
});

process.on('SIGTERM', () => {
  shutdown().finally(() => process.exit(0));
});
