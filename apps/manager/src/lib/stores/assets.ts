/**
 * Purpose: Manager-side asset list cache shared by AssetsManager page and node controls.
 *
 * Single source of truth: always derived from server `GET /api/assets` (write-token protected).
 */

import { writable } from 'svelte/store';

export type AssetKind = 'audio' | 'image' | 'video';

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
};

type AssetsState = {
  status: 'idle' | 'loading' | 'error';
  error: string | null;
  assets: AssetRecord[];
  lastUpdatedAt: number;
};

const storageKeyWriteToken = 'shugu-asset-write-token';
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
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text ? `HTTP ${res.status}: ${text}` : `HTTP ${res.status}`);
  }
  return await res.json();
}

function readWriteToken(): string {
  try {
    return localStorage.getItem(storageKeyWriteToken) ?? '';
  } catch {
    return '';
  }
}

function readServerUrl(): string {
  try {
    return localStorage.getItem(storageKeyServerUrl) ?? '';
  } catch {
    return '';
  }
}

const initial: AssetsState = { status: 'idle', error: null, assets: [], lastUpdatedAt: 0 };
const store = writable<AssetsState>(initial);

let refreshInFlight: Promise<void> | null = null;

async function refresh(opts?: { serverUrl?: string; writeToken?: string }): Promise<void> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    store.update((s) => ({ ...s, status: 'loading', error: null }));
    try {
      const token = typeof opts?.writeToken === 'string' ? opts.writeToken : readWriteToken();
      if (!token) throw new Error('Missing Asset Write Token (set it on the connect screen).');
      const serverUrl = typeof opts?.serverUrl === 'string' ? opts.serverUrl : readServerUrl();
      const url = buildUrl(serverUrl, 'api/assets');
      if (!url) throw new Error('Missing or invalid Server URL.');
      const data = await fetchJson(url, { method: 'GET', headers: { Authorization: `Bearer ${token}` } });
      const record = (data ?? {}) as Record<string, unknown>;
      const assets = Array.isArray(record.assets) ? (record.assets as AssetRecord[]) : [];
      assets.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      store.set({ status: 'idle', error: null, assets, lastUpdatedAt: Date.now() });
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

export const assetsStore = {
  subscribe: store.subscribe,
  refresh,
};
