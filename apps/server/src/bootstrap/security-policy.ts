/**
 * Purpose: Centralize FF-04 server boot, manager auth, and CORS fail-closed security policy.
 */
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface.js';

export type ServerSecurityConfig = {
  nodeEnv?: string;
  managerKey?: string;
  managerPassword?: string;
  allowInsecureManager?: string;
  corsOrigins?: string;
  hasHttps: boolean;
};

export type SocketCorsOptions = {
  origin: string[] | string | boolean;
  methods: string[];
  credentials: boolean;
};

export function isProductionLike(nodeEnv: string | undefined): boolean {
  return (nodeEnv ?? '').trim().toLowerCase() === 'production';
}

export function isEnabledFlag(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase());
}

export function parseCorsOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function isLocalAddress(address: string | undefined): boolean {
  const value = (address ?? '').trim().toLowerCase();
  return (
    value === '127.0.0.1' ||
    value === '::1' ||
    value === '::ffff:127.0.0.1' ||
    value === 'localhost'
  );
}

export function isPrivateNetworkAddress(address: string | undefined): boolean {
  const value = (address ?? '').trim().toLowerCase().replace(/^::ffff:/, '');
  if (isLocalAddress(value)) return true;

  const parts = value.split('.');
  if (parts.length !== 4) return false;

  const octets = parts.map((part) => Number.parseInt(part, 10));
  if (octets.some((octet, index) => !Number.isFinite(octet) || String(octet) !== parts[index] || octet < 0 || octet > 255)) {
    return false;
  }

  const [a, b] = octets;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

export function canGrantInsecureLocalManager(opts: {
  nodeEnv?: string;
  allowInsecureManager?: string;
  address?: string;
}): boolean {
  return (
    !isProductionLike(opts.nodeEnv) &&
    isEnabledFlag(opts.allowInsecureManager) &&
    isLocalAddress(opts.address)
  );
}

export function resolveManagerRole(opts: {
  requestedRole: string | undefined;
  expectedManagerKey?: string;
  requestedManagerKey?: string;
  allowInsecureManager?: string;
  nodeEnv?: string;
  address?: string;
}): 'manager' | 'client' {
  if (opts.requestedRole !== 'manager') return 'client';

  const expectedManagerKey = (opts.expectedManagerKey ?? '').trim();
  const requestedManagerKey = (opts.requestedManagerKey ?? '').trim();
  if (expectedManagerKey && requestedManagerKey === expectedManagerKey) return 'manager';

  if (
    !expectedManagerKey &&
    !isProductionLike(opts.nodeEnv) &&
    isPrivateNetworkAddress(opts.address)
  ) return 'manager';

  return 'client';
}

export function validateServerSecurityConfig(config: ServerSecurityConfig): void {
  if (!isProductionLike(config.nodeEnv)) return;

  if (!(config.managerPassword ?? '').trim() && !(config.managerKey ?? '').trim()) {
    throw new Error(
      'Production boot denied: SHUGU_MANAGER_PASSWORD must be configured for Manager sessions, or SHUGU_MANAGER_KEY must be configured for legacy clients.'
    );
  }

  if (isEnabledFlag(config.allowInsecureManager)) {
    throw new Error('Production boot denied: SHUGU_ALLOW_INSECURE_MANAGER is local/dev only.');
  }

  const origins = parseCorsOrigins(config.corsOrigins);
  if (origins.length === 0 || origins.includes('*')) {
    throw new Error(
      'Production boot denied: SHUGU_CORS_ORIGINS must list explicit origins; wildcard CORS is not allowed.'
    );
  }

  if (!config.hasHttps) {
    throw new Error(
      'Production boot denied: HTTPS certificates are required; HTTP fallback is local/dev only.'
    );
  }
}

export function createHttpCorsOptions(config: ServerSecurityConfig): CorsOptions {
  validateServerSecurityConfig(config);
  const production = isProductionLike(config.nodeEnv);
  const origins = parseCorsOrigins(config.corsOrigins);

  return {
    origin: production ? origins : origins.length > 0 ? origins : true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    allowedHeaders: ['Range', 'If-None-Match', 'Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Range', 'Accept-Ranges', 'ETag', 'Content-Length', 'Content-Type'],
  };
}

export function createSocketCorsOptions(config: ServerSecurityConfig): SocketCorsOptions {
  validateServerSecurityConfig(config);
  const production = isProductionLike(config.nodeEnv);
  const origins = parseCorsOrigins(config.corsOrigins);

  return {
    origin: production ? origins : origins.length > 0 ? origins : true,
    methods: ['GET', 'POST'],
    credentials: true,
  };
}
