import type { Express, Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { register } from '../metrics.js';

function bearerToken(req: Request): string {
  const header = req.header('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);

  return match ? match[1].trim() : '';
}

function tokenMatches(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}

export function healthRoute(app: Express, redisReady: () => boolean, metricsToken = ''): void {
  app.get('/healthz', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      redis: redisReady(),
      uptime: process.uptime(),
    });
  });

  app.get('/metrics', async (req: Request, res: Response) => {
    if (metricsToken && !tokenMatches(bearerToken(req), metricsToken)) {
      res.status(401).json({ ok: false, error: 'metrics token required' });
      return;
    }

    res.set('Content-Type', register.contentType);
    res.send(await register.metrics());
  });
}
