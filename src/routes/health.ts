import type { Express, Request, Response } from 'express';
import { register } from '../metrics.js';

export function healthRoute(app: Express, redisReady: () => boolean): void {
  app.get('/healthz', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      redis: redisReady(),
      uptime: process.uptime(),
    });
  });

  app.get('/metrics', async (_req: Request, res: Response) => {
    res.set('Content-Type', register.contentType);
    res.send(await register.metrics());
  });
}
