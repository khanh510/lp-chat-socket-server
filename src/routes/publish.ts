import type { Express, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import type { Namespace } from 'socket.io';
import { config } from '../config.js';
import { hmacVerifyMiddleware } from '../middleware/auth.js';
import { publishCounter, publishLatencyHistogram } from '../metrics.js';
import type { PublishBody } from '../types.js';

const eventNamePattern = /^[a-z][a-z0-9._:-]{0,80}$/i;
const allowedEvents = new Set(['message.new', 'message.updated', 'message.deleted', 'typing', 'presence']);

function parsePublishBody(body: unknown): PublishBody | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }

  const candidate = body as Partial<PublishBody>;
  const roomId = Number(candidate.room_id);

  if (!Number.isInteger(roomId) || roomId <= 0) {
    return null;
  }

  if (
    typeof candidate.event !== 'string' ||
    !eventNamePattern.test(candidate.event) ||
    !allowedEvents.has(candidate.event)
  ) {
    return null;
  }

  const ts = Number(candidate.ts);
  const now = Math.floor(Date.now() / 1000);

  if (
    !Number.isInteger(ts) ||
    ts <= 0 ||
    Math.abs(now - ts) > config.publishMaxClockSkewSeconds
  ) {
    return null;
  }

  return {
    room_id: roomId,
    event: candidate.event,
    ts,
    payload: candidate.payload ?? {},
  };
}

export function publishRoute(app: Express, namespaces: Namespace[]): void {
  const limiter = rateLimit({
    windowMs: config.publishRateLimitWindowMs,
    limit: config.publishRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.post('/publish', hmacVerifyMiddleware, limiter, (req: Request, res: Response) => {
    const parsed = parsePublishBody(req.body);

    if (!parsed) {
      res.status(400).json({ ok: false, error: 'invalid publish payload' });
      return;
    }

    const endTimer = publishLatencyHistogram.startTimer({ event: parsed.event });
    namespaces.forEach((namespace) => {
      namespace.to(`room:${parsed.room_id}`).emit(parsed.event, parsed.payload);
    });
    publishCounter.inc({ event: parsed.event });
    endTimer();

    res.json({ ok: true });
  });
}
