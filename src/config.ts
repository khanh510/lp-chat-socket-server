import 'dotenv/config';

export interface AppConfig {
  port: number;
  redisUrl: string;
  jwtSecret: string;
  wpSharedSecret: string;
  corsOrigin: string;
  publishRateLimitWindowMs: number;
  publishRateLimitMax: number;
  publishMaxClockSkewSeconds: number;
  metricsToken: string;
}

function readRequired(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  if (process.env.NODE_ENV === 'production' && value === 'change-me') {
    throw new Error(`${name} must be changed for production`);
  }

  return value;
}

function readInteger(name: string, fallback: number): number {
  const raw = process.env[name];

  if (!raw) {
    return fallback;
  }

  const value = Number(raw);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}

export const config: AppConfig = {
  port: readInteger('PORT', 3010),
  redisUrl: process.env.REDIS_URL?.trim() || 'redis://127.0.0.1:6380',
  jwtSecret: readRequired('JWT_SECRET'),
  wpSharedSecret: readRequired('WP_SHARED_SECRET'),
  corsOrigin: process.env.CORS_ORIGIN?.trim() || '*',
  publishRateLimitWindowMs: readInteger('PUBLISH_RATE_LIMIT_WINDOW_MS', 60_000),
  publishRateLimitMax: readInteger('PUBLISH_RATE_LIMIT_MAX', 120),
  publishMaxClockSkewSeconds: readInteger('PUBLISH_MAX_CLOCK_SKEW_SECONDS', 300),
  metricsToken: process.env.METRICS_TOKEN?.trim() || '',
};
