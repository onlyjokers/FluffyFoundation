/**
 * Purpose: Local display media registry shared through BroadcastChannel and MessagePort payloads.
 */
export type LocalDisplayMediaKind = 'audio' | 'image' | 'video';

type LocalDisplayMediaEntry = {
  id: string;
  kind: LocalDisplayMediaKind;
  name: string;
  file: File;
  objectUrl: string;
};

type LocalMediaBroadcastMessage = {
  type: 'shugu:display:local-media';
  command: 'register' | 'clear';
  payload?: Record<string, unknown>;
};

const LOCAL_MEDIA_BROADCAST_CHANNEL = 'shugu:display:local-media';
const displayLocalMedia = new Map<string, LocalDisplayMediaEntry>();
const warnedMissingDisplayLocalMedia = new Set<string>();

let localMediaBroadcast: BroadcastChannel | null = null;

export function startLocalMediaBroadcast(): void {
  if (typeof window === 'undefined') return;
  if (typeof BroadcastChannel === 'undefined') return;
  if (localMediaBroadcast) return;

  try {
    localMediaBroadcast = new BroadcastChannel(LOCAL_MEDIA_BROADCAST_CHANNEL);
  } catch {
    localMediaBroadcast = null;
    return;
  }

  localMediaBroadcast.onmessage = (event: MessageEvent) => {
    const msg = event.data as Partial<LocalMediaBroadcastMessage> | null;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type !== 'shugu:display:local-media') return;

    if (msg.command === 'clear') {
      clearDisplayLocalMedia();
      return;
    }
    if (msg.command === 'register') {
      registerDisplayLocalMedia(msg.payload ?? undefined);
    }
  };
}

export function stopLocalMediaBroadcast(): void {
  if (!localMediaBroadcast) return;
  try {
    localMediaBroadcast.onmessage = null;
    localMediaBroadcast.close();
  } catch {
    // ignore
  }
  localMediaBroadcast = null;
}

export function parseDisplayFileId(raw: string): string | null {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s.startsWith('displayfile:')) return null;
  const rest = s.slice('displayfile:'.length);
  const id = (rest.split(/[?#]/)[0] ?? '').trim();
  return id ? id : null;
}

export function resolveDisplayFileUrl(raw: string): string | null {
  const id = parseDisplayFileId(raw);
  if (!id) return null;
  return displayLocalMedia.get(id)?.objectUrl ?? null;
}

export function clearDisplayLocalMedia(): void {
  for (const entry of displayLocalMedia.values()) {
    try {
      URL.revokeObjectURL(entry.objectUrl);
    } catch {
      // ignore
    }
  }
  displayLocalMedia.clear();
  warnedMissingDisplayLocalMedia.clear();
}

export function warnMissingDisplayLocalMedia(id: string): void {
  if (warnedMissingDisplayLocalMedia.has(id)) return;
  warnedMissingDisplayLocalMedia.add(id);
  console.warn('[Display] missing display-local file registration:', id);
}

export function registerDisplayLocalMedia(payload: Record<string, unknown> | undefined): void {
  const id = typeof payload?.id === 'string' ? payload.id.trim() : '';
  if (!id) return;

  const kindRaw = typeof payload?.kind === 'string' ? payload.kind.trim().toLowerCase() : '';
  const kind: LocalDisplayMediaKind =
    kindRaw === 'audio' || kindRaw === 'image' || kindRaw === 'video'
      ? (kindRaw as LocalDisplayMediaKind)
      : 'video';

  const fileRaw = payload?.file ?? null;
  if (!(fileRaw instanceof Blob)) return;

  const file = fileRaw instanceof File ? fileRaw : new File([fileRaw], `displayfile-${id}`);
  const name =
    typeof payload?.name === 'string' && payload.name.trim() ? payload.name.trim() : file.name;

  const existing = displayLocalMedia.get(id);
  if (existing) {
    try {
      URL.revokeObjectURL(existing.objectUrl);
    } catch {
      // ignore
    }
  }

  const objectUrl = URL.createObjectURL(file);
  displayLocalMedia.set(id, { id, kind, name, file, objectUrl });
}
