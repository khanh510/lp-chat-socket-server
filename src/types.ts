import type { Request } from 'express';

export interface JwtClaims {
  sub: number;
  rooms: number[];
  iat?: number;
  exp?: number;
}

export interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

export interface PublishBody {
  room_id: number | string;
  event: string;
  payload?: unknown;
}
