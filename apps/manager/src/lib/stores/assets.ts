/**
 * Purpose: Manager-side asset list cache shared by AssetsManager page and node controls.
 *
 * Single source of truth: always derived from server `GET /api/assets` (Manager session protected).
 */

import { writable } from 'svelte/store';

export type AssetKind = 'audio' | 'image' | 'video' | 'model';
export type AssetSource = 'manager-upload' | 'ai-image' | 'tts' | 'recording' | 'import' | 'unknown';

export type AssetUsage = {
  totalBytes: number;
  discardableBytes: number;
  protectedBytes: number;
  maxTotalBytes: number;
};

export type AssetSettings = {
  maxTotalBytes: number;
};

export type AssetRecord = {
  id: string;
  kind: AssetKind;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  originalName: string;
  tags?: string[];
  description?: string;
  createdAt: number;
  updatedAt: number;
  durationMs?: number;
  width?: number;
  height?: number;
  variants: {
    id: string;
    assetId: string;
    mimeType: string;
    width?: number;
    height?: number;
    durationMs?: number;
  }[];
  cachePolicy: {
    strategy: 'immutable' | 'revalidate' | 'no-store';
    maxAgeSeconds?: number;
  };
  permissions: {
    scope: 'server-deliverable' | 'local-only';
    localOnlyReason?: string;
    roles?: string[];
  };
  source?: AssetSource;
  autoDiscardable?: boolean;
  pinned?: boolean;
};

type AssetsState = {
  status: 'idle' | 'loading' | 'error';
  error: string | null;
  assets: AssetRecord[];
  usage: AssetUsage;
  settings: AssetSettings;
  lastUpdatedAt: number;
};

const storageKeyServerUrl = 'shugu-server-url';

function buildUrl(serverUrl: string, path: string): string | null {
  const baseRaw = serverUrl.trim();
  if (!baseRaw) return null;
  try {
    const base = baseRaw.endsWith('/') ? baseRaw : `${baseRaw}/`;
    return new URL(path, base).toString();
  } catch {
    return null;
  }
}

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(url, { ...init, credentials: 'include' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text ? `HTTP ${res.status}: ${text}` : `HTTP ${res.status}`);
  }
  return await res.json();
}

function readServerUrl(): string {
  try {
    return localStorage.getItem(storageKeyServerUrl) ?? '';
  } catch {
    return '';
  }
}

const defaultMaxTotalBytes = 20 * 1024 * 1024 * 1024;
const defaultUsage: AssetUsage = {
  totalBytes: 0,
  discardableBytes: 0,
  protectedBytes: 0,
  maxTotalBytes: defaultMaxTotalBytes,
};
const defaultSettings: AssetSettings = { maxTotalBytes: defaultMaxTotalBytes };
const initial: AssetsState = {
  status: 'idle',
  error: null,
  assets: [],
  usage: defaultUsage,
  settings: defaultSettings,
  lastUpdatedAt: 0,
};
const store = writable<AssetsState>(initial);

let refreshInFlight: Promise<void> | null = null;

async function refresh(opts?: { serverUrl?: string }): Promise<void> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    store.update((s) => ({ ...s, status: 'loading', error: null }));
    try {
      const serverUrl = typeof opts?.serverUrl === 'string' ? opts.serverUrl : readServerUrl();
      const url = buildUrl(serverUrl, 'api/assets');
      if (!url) throw new Error('Missing or invalid Server URL.');
      const data = await fetchJson(url, {
        method: 'GET',
        credentials: 'include',
      });
      const record = (data ?? {}) as Record<string, unknown>;
      const assets = Array.isArray(record.assets) ? (record.assets as AssetRecord[]) : [];
      const usage = normalizeUsage(record.usage);
      const settings = normalizeSettings(record.settings);
      assets.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      store.set({ status: 'idle', error: null, assets, usage, settings, lastUpdatedAt: Date.now() });
    } catch (err) {
      store.update((s) => ({
        ...s,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

function normalizePositiveNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function normalizeNonNegativeNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function normalizeUsage(value: unknown): AssetUsage {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const maxTotalBytes = normalizePositiveNumber(record.maxTotalBytes, defaultMaxTotalBytes);
  return {
    totalBytes: normalizeNonNegativeNumber(record.totalBytes),
    discardableBytes: normalizeNonNegativeNumber(record.discardableBytes),
    protectedBytes: normalizeNonNegativeNumber(record.protectedBytes),
    maxTotalBytes,
  };
}

function normalizeSettings(value: unknown): AssetSettings {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return { maxTotalBytes: normalizePositiveNumber(record.maxTotalBytes, defaultMaxTotalBytes) };
}

async function updateSettings(
  settings: Partial<AssetSettings>,
  opts?: { serverUrl?: string }
): Promise<void> {
  const serverUrl = typeof opts?.serverUrl === 'string' ? opts.serverUrl : readServerUrl();
  const url = buildUrl(serverUrl, 'api/assets/settings');
  if (!url) throw new Error('Missing or invalid Server URL.');
  const data = await fetchJson(url, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  const record = (data ?? {}) as Record<string, unknown>;
  const usage = normalizeUsage(record.usage);
  const nextSettings = normalizeSettings(record.settings);
  store.update((state) => ({
    ...state,
    usage,
    settings: nextSettings,
    error: null,
    lastUpdatedAt: Date.now(),
  }));
}

export const assetsStore = {
  subscribe: store.subscribe,
  refresh,
  updateSettings,
};
