/**
 * Purpose: Manager-side registry for browser-local files used by the paired Display (no server upload).
 *
 * This enables "Display only" local nodes to reference files on the same computer as Manager/Display,
 * even when the website is deployed remotely:
 * - Manager picks a file via the browser picker
 * - Graph stores a lightweight ref string: `displayfile:<id>`
 * - When sending a local Display control, Manager registers the file to Display via MessagePort
 * - Display converts `displayfile:<id>` to a `blob:` object URL and plays it
 */

import { get, writable } from 'svelte/store';

export type LocalDisplayMediaKind = 'audio' | 'image' | 'video';

export type LocalDisplayMediaFile = {
  id: string;
  kind: LocalDisplayMediaKind;
  name: string;
  mimeType: string;
  sizeBytes: number;
  lastModified: number;
  file: File;
};

type LocalDisplayMediaState = {
  files: LocalDisplayMediaFile[];
};

const store = writable<LocalDisplayMediaState>({ files: [] });

function createRandomId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  }
  return `${prefix}${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function safeTrim(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKind(kind: unknown): LocalDisplayMediaKind | null {
  const k = safeTrim(kind).toLowerCase();
  if (k === 'audio' || k === 'image' || k === 'video') return k;
  return null;
}

function normalizeFileRef(file: File, kind: LocalDisplayMediaKind): LocalDisplayMediaFile {
  const id = createRandomId('df_');
  const name = safeTrim(file.name) || 'file';
  const mimeType = safeTrim(file.type);
  const sizeBytesRaw = file.size;
  const sizeBytes = typeof sizeBytesRaw === 'number' && Number.isFinite(sizeBytesRaw) ? Math.max(0, sizeBytesRaw) : 0;
  const lastModifiedRaw = file.lastModified;
  const lastModified =
    typeof lastModifiedRaw === 'number' && Number.isFinite(lastModifiedRaw) ? lastModifiedRaw : Date.now();

  return { id, kind, name, mimeType, sizeBytes, lastModified, file };
}

function list(kind?: LocalDisplayMediaKind): LocalDisplayMediaFile[] {
  const files = get(store).files ?? [];
  if (!kind) return files.slice();
  return files.filter((f) => f.kind === kind);
}

function getFileById(id: string): LocalDisplayMediaFile | null {
  const key = safeTrim(id);
  if (!key) return null;
  const files = get(store).files ?? [];
  return files.find((f) => f.id === key) ?? null;
}

function registerFile(file: File, kind: LocalDisplayMediaKind): LocalDisplayMediaFile {
  const entry = normalizeFileRef(file, kind);
  store.update((s) => ({ ...s, files: [entry, ...(s.files ?? [])] }));
  return entry;
}

function removeFile(id: string): void {
  const key = safeTrim(id);
  if (!key) return;
  store.update((s) => ({ ...s, files: (s.files ?? []).filter((f) => f.id !== key) }));
}

export function isDisplayFileRef(value: string): boolean {
  return typeof value === 'string' && value.trim().startsWith('displayfile:');
}

export function parseDisplayFileId(value: string): string | null {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw.startsWith('displayfile:')) return null;
  const rest = raw.slice('displayfile:'.length);
  const id = (rest.split(/[?#]/)[0] ?? '').trim();
  return id ? id : null;
}

export function buildDisplayFileRef(id: string): string {
  return `displayfile:${safeTrim(id)}`;
}

export const localDisplayMediaStore = {
  subscribe: store.subscribe,
  list,
  getFileById,
  registerFile,
  removeFile,
  normalizeKind,
};
