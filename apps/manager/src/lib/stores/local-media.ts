/**
 * Purpose: Manager-side cache + validation helpers for Local Media (server-local files).
 *
 * Backed by server `GET /api/local-media` + `POST /api/local-media/validate` (write-token protected).
 * This enables "Load * From Local(Display only)" nodes to pick/validate absolute file paths
 * without uploading anything to the Asset Service.
 */

import { writable } from 'svelte/store';

export type LocalMediaKind = 'audio' | 'image' | 'video';

export type LocalMediaFile = {
  path: string;
  label: string;
  kind: LocalMediaKind;
  mimeType: string;
  sizeBytes: number;
  modifiedAt: number;
  etag?: string;
};

type LocalMediaState = {
  status: 'idle' | 'loading' | 'error';
  error: string | null;
  files: LocalMediaFile[];
  roots: string[];
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

const initial: LocalMediaState = { status: 'idle', error: null, files: [], roots: [], lastUpdatedAt: 0 };
const store = writable<LocalMediaState>(initial);

let refreshInFlight: Promise<void> | null = null;

async function refresh(): Promise<void> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    store.update((s) => ({ ...s, status: 'loading', error: null }));
    try {
      const token = readWriteToken();
      if (!token) throw new Error('Missing Asset Write Token (set it on the connect screen).');
      const serverUrl = readServerUrl();
      const url = buildUrl(serverUrl, 'api/local-media');
      if (!url) throw new Error('Missing or invalid Server URL.');
      const data = await fetchJson(url, { method: 'GET', headers: { Authorization: `Bearer ${token}` } });
      const record = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : null;
      const files = Array.isArray(record?.files) ? (record.files as LocalMediaFile[]) : [];
      const roots = Array.isArray(record?.roots) ? record.roots.map(String) : [];
      files.sort((a, b) => (Number(b?.modifiedAt ?? 0) || 0) - (Number(a?.modifiedAt ?? 0) || 0));
      store.set({ status: 'idle', error: null, files, roots, lastUpdatedAt: Date.now() });
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

async function validatePath(path: string, kind: LocalMediaKind): Promise<LocalMediaFile> {
  const token = readWriteToken();
  if (!token) throw new Error('Missing Asset Write Token (set it on the connect screen).');
  const serverUrl = readServerUrl();
  const url = buildUrl(serverUrl, 'api/local-media/validate');
  if (!url) throw new Error('Missing or invalid Server URL.');
  const data = await fetchJson(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, kind }),
  });
  const record = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : null;
  const file =
    record?.file && typeof record.file === 'object' && record.file !== null
      ? (record.file as Record<string, unknown>)
      : null;
  return {
    path: String(file?.path ?? ''),
    label: String(file?.path ?? ''),
    kind: kind,
    mimeType: String(file?.mimeType ?? ''),
    sizeBytes: typeof file?.sizeBytes === 'number' ? file.sizeBytes : 0,
    modifiedAt: typeof file?.modifiedAt === 'number' ? file.modifiedAt : Date.now(),
    ...(typeof file?.etag === 'string' ? { etag: file.etag } : {}),
  };
}

export const localMediaStore = {
  subscribe: store.subscribe,
  refresh,
  validatePath,
};
