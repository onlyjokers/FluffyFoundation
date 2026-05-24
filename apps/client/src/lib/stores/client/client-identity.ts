/**
 * Client identity helper (device/session IDs persisted in storage).
 */

import type { ClientIdentity } from '@shugu/sdk-client';

const DEVICE_ID_STORAGE_KEY = 'shugu-device-id';
const INSTANCE_ID_STORAGE_KEY = 'shugu-client-instance-id';
const CLIENT_ID_STORAGE_KEY = 'shugu-client-id';
const URL_SESSION_ID_STORAGE_KEY = 'shugu-url-session-id';

function createRandomId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  }
  return `${prefix}${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function getOrCreateStorageId(storage: Storage, key: string, prefix: string): string {
  const existing = storage.getItem(key);
  if (existing && existing.trim()) return existing;
  const id = createRandomId(prefix);
  storage.setItem(key, id);
  return id;
}

function sanitizeUrlSessionId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 80) return null;
  return /^[a-zA-Z0-9_-]+$/.test(trimmed) ? trimmed : null;
}

function readUrlSessionIdFromLocation(href: string): string | null {
  try {
    const url = new URL(href);
    const fromQuery =
      sanitizeUrlSessionId(url.searchParams.get('sessionId')) ??
      sanitizeUrlSessionId(url.searchParams.get('urlSessionId')) ??
      sanitizeUrlSessionId(url.searchParams.get('sessionld'));
    if (fromQuery) return fromQuery;

    const pathMatch = url.pathname.match(/(?:^|\/)(?:sessionId|urlSessionId|sessionld)=([^/?#]+)/);
    return sanitizeUrlSessionId(pathMatch?.[1] ? decodeURIComponent(pathMatch[1]) : null);
  } catch {
    return null;
  }
}

function resolveUrlSessionId(win: Window): string | undefined {
  const fromUrl = readUrlSessionIdFromLocation(win.location.href);

  if (fromUrl) {
    win.localStorage.setItem(URL_SESSION_ID_STORAGE_KEY, fromUrl);
    return fromUrl;
  }

  const stored = sanitizeUrlSessionId(win.localStorage.getItem(URL_SESSION_ID_STORAGE_KEY));
  return stored ?? undefined;
}

export function getOrCreateClientIdentity(): ClientIdentity | null {
  if (typeof window === 'undefined') return null;

  const deviceId = getOrCreateStorageId(window.localStorage, DEVICE_ID_STORAGE_KEY, 'c_');
  const instanceId = getOrCreateStorageId(window.sessionStorage, INSTANCE_ID_STORAGE_KEY, 'i_');
  const urlSessionId = resolveUrlSessionId(window);

  const storedClientId = window.sessionStorage.getItem(CLIENT_ID_STORAGE_KEY);
  const clientId = storedClientId && storedClientId.trim() ? storedClientId : deviceId;
  window.sessionStorage.setItem(CLIENT_ID_STORAGE_KEY, clientId);

  return { deviceId, instanceId, clientId, ...(urlSessionId ? { urlSessionId } : {}) };
}

export function persistAssignedClientId(assignedClientId: string): void {
  if (typeof window === 'undefined') return;
  if (!assignedClientId) return;
  const current = window.sessionStorage.getItem(CLIENT_ID_STORAGE_KEY);
  if (current === assignedClientId) return;
  window.sessionStorage.setItem(CLIENT_ID_STORAGE_KEY, assignedClientId);
}
