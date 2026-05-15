import { createHmac } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { io, type Socket } from 'socket.io-client';

const serverUrl = process.env.LOAD_SERVER_URL || 'http://127.0.0.1:3010';
const socketUrl = process.env.LOAD_SOCKET_URL || serverUrl;
const publishUrl = process.env.LOAD_PUBLISH_URL || serverUrl;
const jwtSecret = process.env.JWT_SECRET || 'change-me';
const wpSharedSecret = process.env.WP_SHARED_SECRET || 'change-me';
const roomId = Number(process.env.LOAD_ROOM_ID || '1');
const clientCount = Number(process.env.LOAD_CLIENTS || '25');
const durationSeconds = Number(process.env.LOAD_DURATION_SECONDS || '10');
const publishRatePerSecond = Number(process.env.LOAD_RATE_PER_SECOND || '5');

function sign(rawBody: string): string {
  return createHmac('sha256', wpSharedSecret).update(rawBody).digest('base64');
}

function percentile(values: number[], target: number): number {
  if (values.length === 0) {
    return 0;
  }

  const index = Math.ceil((target / 100) * values.length) - 1;
  return values[Math.min(Math.max(index, 0), values.length - 1)];
}

async function connectClient(index: number, latencies: number[]): Promise<Socket> {
  const token = jwt.sign(
    {
      sub: index + 1,
      rooms: [roomId],
    },
    jwtSecret,
    {
      algorithm: 'HS256',
      expiresIn: '10m',
    },
  );

  const socket = io(socketUrl, {
    auth: { token },
    transports: ['websocket'],
  });

  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });

  await new Promise<void>((resolve, reject) => {
    socket.emit('subscribe', { room_id: roomId }, (response: { ok?: boolean; error?: string }) => {
      if (response?.ok) {
        resolve();
        return;
      }

      reject(new Error(response?.error || 'subscribe failed'));
    });
  });

  socket.on('load.message', (payload: { sent_at?: number }) => {
    if (typeof payload.sent_at === 'number') {
      latencies.push(Date.now() - payload.sent_at);
    }
  });

  return socket;
}

async function publish(sequence: number): Promise<void> {
  const body = JSON.stringify({
    room_id: roomId,
    event: 'load.message',
    payload: {
      sequence,
      sent_at: Date.now(),
    },
  });

  const response = await fetch(`${publishUrl}/publish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Signature': sign(Buffer.from(body).toString()),
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`publish failed: ${response.status}`);
  }
}

const latencies: number[] = [];
const clients = await Promise.all(Array.from({ length: clientCount }, (_value, index) => connectClient(index, latencies)));
const totalMessages = durationSeconds * publishRatePerSecond;
const intervalMs = 1000 / publishRatePerSecond;

for (let sequence = 1; sequence <= totalMessages; sequence++) {
  await publish(sequence);
  await new Promise((resolve) => setTimeout(resolve, intervalMs));
}

await new Promise((resolve) => setTimeout(resolve, 1000));
clients.forEach((socket) => socket.disconnect());

latencies.sort((left, right) => left - right);

console.log(`clients=${clientCount}`);
console.log(`server_url=${serverUrl}`);
console.log(`socket_url=${socketUrl}`);
console.log(`publish_url=${publishUrl}`);
console.log(`publish_rate_per_second=${publishRatePerSecond}`);
console.log(`duration_seconds=${durationSeconds}`);
console.log(`deliveries=${latencies.length}`);
console.log(`p50_ms=${percentile(latencies, 50)}`);
console.log(`p95_ms=${percentile(latencies, 95)}`);
