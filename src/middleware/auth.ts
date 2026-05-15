import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Socket } from 'socket.io';
import { config } from '../config.js';
import type { JwtClaims, RawBodyRequest } from '../types.js';

function normalizeRooms(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((roomId) => Number(roomId))
    .filter((roomId) => Number.isInteger(roomId) && roomId > 0);
}

export function verifyJwt(socket: Socket, next: (err?: Error) => void): void {
  const token =
    typeof socket.handshake.auth?.token === 'string'
      ? socket.handshake.auth.token
      : typeof socket.handshake.query?.token === 'string'
        ? socket.handshake.query.token
        : '';

  if (!token) {
    next(new Error('auth token required'));
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret, {
      algorithms: ['HS256'],
    });

    if (typeof decoded !== 'object' || decoded === null) {
      throw new Error('invalid token claims');
    }

    const subject = Number(decoded.sub);
    const rooms = normalizeRooms((decoded as jwt.JwtPayload).rooms);

    if (!Number.isInteger(subject) || subject <= 0 || rooms.length === 0) {
      throw new Error('invalid token claims');
    }

    const claims: JwtClaims = {
      sub: subject,
      rooms,
      iat: typeof decoded.iat === 'number' ? decoded.iat : undefined,
      exp: typeof decoded.exp === 'number' ? decoded.exp : undefined,
    };

    socket.data.claims = claims;
    next();
  } catch (error) {
    next(error instanceof Error ? error : new Error('invalid token'));
  }
}

function getSignatureValue(headerValue: string | string[] | undefined): string {
  const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  return (value || '').replace(/^sha256=/i, '').trim();
}

function decodeSignature(value: string): Buffer | null {
  if (/^[a-f0-9]{64}$/i.test(value)) {
    return Buffer.from(value, 'hex');
  }

  if (!/^[a-z0-9+/]+={0,2}$/i.test(value)) {
    return null;
  }

  const decoded = Buffer.from(value, 'base64');
  return decoded.length === 32 ? decoded : null;
}

export function signRawBody(rawBody: Buffer, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('base64');
}

export function hmacVerifyMiddleware(req: RawBodyRequest, res: Response, next: NextFunction): void {
  const rawBody = req.rawBody;
  const provided = getSignatureValue(req.header('X-Signature') || req.header('x-signature'));

  if (!rawBody || !provided) {
    res.status(401).json({ ok: false, error: 'signature required' });
    return;
  }

  const expectedBuffer = createHmac('sha256', config.wpSharedSecret).update(rawBody).digest();
  const providedBuffer = decodeSignature(provided);

  if (!providedBuffer || expectedBuffer.length !== providedBuffer.length || !timingSafeEqual(expectedBuffer, providedBuffer)) {
    res.status(401).json({ ok: false, error: 'invalid signature' });
    return;
  }

  next();
}
