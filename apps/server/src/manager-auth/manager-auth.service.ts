/**
 * Purpose: Server-side Manager login and signed long-lived session cookies.
 */
import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

export const MANAGER_SESSION_COOKIE = 'shugu_manager_session';
const DEFAULT_USERS = ['Eureka', 'Starno', 'VKong'];
const DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const REFRESH_WINDOW_MS = 5 * 24 * 60 * 60 * 1000;

type LoginInput = {
  username: string;
  password: string;
};

type ManagerAuthOptions = {
  env?: Partial<NodeJS.ProcessEnv>;
  now?: () => number;
};

type SessionPayload = {
  user: string;
  exp: number;
};

type VerifyResult =
  | { ok: true; user: string; shouldRefresh: boolean; cookie?: string }
  | { ok: false; reason: 'missing-session' | 'invalid-session' | 'expired-session' };

function parseUsers(value: string | undefined): string[] {
  const users = (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return users.length > 0 ? users : DEFAULT_USERS;
}

function encodeBase64Url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function decodeBase64Url(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function parseCookieHeader(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq) !== name) continue;
    return decodeURIComponent(trimmed.slice(eq + 1));
  }
  return null;
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

@Injectable()
export class ManagerAuthService {
  private env: Partial<NodeJS.ProcessEnv>;
  private now: () => number;

  constructor() {
    this.env = process.env;
    this.now = Date.now;
  }

  static forTest(options: ManagerAuthOptions = {}): ManagerAuthService {
    const service = new ManagerAuthService();
    service.env = options.env ?? process.env;
    service.now = options.now ?? Date.now;
    return service;
  }

  login(input: LoginInput): { ok: true; user: string; cookie: string } | { ok: false; reason: 'invalid-credentials' } {
    const username = input.username.trim();
    const password = input.password;
    const expectedPassword = this.env.SHUGU_MANAGER_PASSWORD?.trim() ?? '';
    const users = parseUsers(this.env.SHUGU_MANAGER_USERS);

    if (!username || !users.includes(username) || !expectedPassword || password !== expectedPassword) {
      return { ok: false, reason: 'invalid-credentials' };
    }

    return { ok: true, user: username, cookie: this.createSessionCookie(username) };
  }

  verifyCookieHeader(header: string | undefined): VerifyResult {
    const raw = parseCookieHeader(header, MANAGER_SESSION_COOKIE);
    if (!raw) return { ok: false, reason: 'missing-session' };
    const [payloadEncoded, signature] = raw.split('.');
    if (!payloadEncoded || !signature) return { ok: false, reason: 'invalid-session' };
    if (!safeEqual(this.sign(payloadEncoded), signature)) return { ok: false, reason: 'invalid-session' };

    let payload: SessionPayload;
    try {
      payload = JSON.parse(decodeBase64Url(payloadEncoded)) as SessionPayload;
    } catch {
      return { ok: false, reason: 'invalid-session' };
    }

    if (!payload.user || !Number.isFinite(payload.exp)) return { ok: false, reason: 'invalid-session' };
    if (payload.exp <= this.now()) return { ok: false, reason: 'expired-session' };

    const shouldRefresh = payload.exp - this.now() <= REFRESH_WINDOW_MS;
    return {
      ok: true,
      user: payload.user,
      shouldRefresh,
      ...(shouldRefresh ? { cookie: this.createSessionCookie(payload.user) } : {}),
    };
  }

  createClearCookie(): string {
    return `${MANAGER_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${this.secureSuffix()}`;
  }

  createSessionCookie(user: string): string {
    const payload = encodeBase64Url(JSON.stringify({ user, exp: this.now() + DEFAULT_MAX_AGE_MS }));
    const value = `${payload}.${this.sign(payload)}`;
    return `${MANAGER_SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(DEFAULT_MAX_AGE_MS / 1000)}${this.secureSuffix()}`;
  }

  private sign(payloadEncoded: string): string {
    return createHmac('sha256', this.sessionSecret()).update(payloadEncoded).digest('base64url');
  }

  private sessionSecret(): string {
    return this.env.SHUGU_MANAGER_SESSION_SECRET?.trim() || this.env.SHUGU_MANAGER_PASSWORD?.trim() || 'shugu-dev-manager-session';
  }

  private secureSuffix(): string {
    return this.env.NODE_ENV === 'production' ? '; Secure' : '';
  }
}
