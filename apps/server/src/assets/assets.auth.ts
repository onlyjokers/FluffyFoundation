/**
 * Purpose: Low-latency bearer-token auth helpers for Asset Service endpoints.
 */

import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { getQueryString } from '../utils/request-utils.js';

type HeaderRequest = Pick<Request, 'header' | 'query'>;

function parseBearerToken(req: HeaderRequest): string | null {
  const header = req.header('authorization') ?? req.header('Authorization');
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1]?.trim();
  return token ? token : null;
}

function parseQueryToken(req: HeaderRequest): string | null {
  return getQueryString(req.query, 'token') ?? getQueryString(req.query, 'access_token');
}

function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export function requireAssetReadAuth(req: HeaderRequest, expectedToken: string | null): void {
  // Public-read by default: if ASSET_READ_TOKEN is not configured, allow all read requests.
  // This matches the common pattern: write protected, read public.
  if (!expectedToken) return;

  const token = parseBearerToken(req) ?? parseQueryToken(req);
  if (!token || !constantTimeEqual(token, expectedToken)) {
    throw new UnauthorizedException('invalid asset read token');
  }
}

export function requireAssetWriteAuth(req: HeaderRequest, expectedToken: string | null): void {
  if (!expectedToken) {
    throw new ServiceUnavailableException(
      'asset service auth is not configured (ASSET_WRITE_TOKEN)'
    );
  }
  const token = parseBearerToken(req);
  if (!token || !constantTimeEqual(token, expectedToken)) {
    throw new UnauthorizedException('invalid asset write token');
  }
}
