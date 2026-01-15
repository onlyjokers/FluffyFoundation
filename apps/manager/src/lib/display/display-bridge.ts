/**
 * Purpose: Local Display bridge (Manager ↔ Display) using MessageChannel/MessagePort.
 *
 * Phase 4 scope:
 * - Open Display window with `pairToken/server/assetReadToken` query params
 * - Pair via `window.postMessage` and transfer a dedicated `MessagePort`
 * - Send local control/plugin/manifest messages to Display
 * - Receive one-shot `shugu:display:ready` from Display
 *
 * Phase 5 will wire this into Manager UI (DisplayPanel).
 *
 * Phase 6 scope:
 * - After pairing, immediately send latest asset-manifest to Display via MessagePort
 * - Subscribe to manifest updates and push updates to the paired Display (still no extra ready; Display enforces readyOnce)
 */

import { get, writable } from 'svelte/store';
import type { ControlAction, ControlPayload } from '@shugu/protocol';
import { getLatestManifest, subscribeLatestManifest, type AssetManifest } from '$lib/nodes/asset-manifest-store';
import { localDisplayMediaStore, parseDisplayFileId } from '$lib/stores/local-display-media';

export type DisplayBridgeStatus = 'idle' | 'opening' | 'pairing' | 'connected' | 'closed' | 'error';

export type DisplayBridgeState = {
  status: DisplayBridgeStatus;
  displayUrl: string | null;
  displayOrigin: string | null;
  pairToken: string | null;
  ready: boolean;
  readyAt: number | null;
  readyManifestId: string | null;
  error: string | null;
};

export const displayBridgeState = writable<DisplayBridgeState>({
  status: 'idle',
  displayUrl: null,
  displayOrigin: null,
  pairToken: null,
  ready: false,
  readyAt: null,
  readyManifestId: null,
  error: null,
});

export type DisplayBridgeNodeMediaEvent = {
  event: 'started' | 'ended';
  nodeId: string;
  nodeType?: string;
  at: number;
};

// Latest node-media telemetry event from the paired Display (local MessagePort mode).
export const displayBridgeNodeMedia = writable<DisplayBridgeNodeMediaEvent | null>(null);

type DisplayPairMessage = {
  type: 'shugu:display:pair';
  token: string;
  managerOrigin: string;
  serverUrl: string;
  assetReadToken?: string;
};

type DisplayControlMessage = {
  type: 'shugu:display:control';
  action: ControlAction;
  payload: ControlPayload;
  executeAtLocal?: number;
};

type DisplayPluginMessage = {
  type: 'shugu:display:plugin';
  pluginId: string;
  command: string;
  payload?: Record<string, unknown>;
};

export type AssetManifestSnapshot = {
  manifestId: string;
  assets: string[];
  updatedAt?: number;
};

type DisplayReadyMessage = {
  type: 'shugu:display:ready';
  manifestId?: string | null;
  at?: number | null;
};

type DisplayNodeMediaMessage = {
  type: 'shugu:display:node-media';
  event: 'started' | 'ended';
  nodeId: string;
  nodeType?: string | null;
  at?: number | null;
};

const DISPLAY_DEV_PORT = 5175;
const DEFAULT_SERVER_PORT = 3001;
const ASSET_READ_TOKEN_STORAGE_KEY = 'shugu-asset-read-token';
const DISPLAY_BASE_PATH = '/display';
const LOCAL_MEDIA_BROADCAST_CHANNEL = 'shugu:display:local-media';
const LOCAL_MEDIA_BROADCAST_DEDUP_MS = 1500;

let displayWindow: Window | null = null;
let controlPort: MessagePort | null = null;
let closeWatchTimer: ReturnType<typeof setInterval> | null = null;
let manifestUnsub: (() => void) | null = null;
let lastManifestIdSentToLocal: string | null = null;
let registeredDisplayFileIds = new Set<string>();
let localMediaBroadcast: BroadcastChannel | null = null;
const localMediaBroadcastLastSentById = new Map<string, number>();

type LocalMediaBroadcastMessage = {
  type: 'shugu:display:local-media';
  command: 'register' | 'clear';
  payload?: Record<string, unknown>;
};

function getLocalMediaBroadcast(): BroadcastChannel | null {
  if (typeof window === 'undefined') return null;
  if (typeof BroadcastChannel === 'undefined') return null;
  if (localMediaBroadcast) return localMediaBroadcast;

  try {
    localMediaBroadcast = new BroadcastChannel(LOCAL_MEDIA_BROADCAST_CHANNEL);
  } catch {
    localMediaBroadcast = null;
  }
  return localMediaBroadcast;
}

function broadcastLocalMedia(command: LocalMediaBroadcastMessage['command'], payload?: Record<string, unknown>): void {
  const channel = getLocalMediaBroadcast();
  if (!channel) return;

  const message: LocalMediaBroadcastMessage = {
    type: 'shugu:display:local-media',
    command,
    ...(payload ? { payload } : {}),
  };

  try {
    channel.postMessage(message);
  } catch (error) {
    console.warn('[display-bridge] BroadcastChannel postMessage failed:', error);
  }
}

function collectDisplayFileRefsDeep(value: unknown): string[] {
  const refs = new Set<string>();
  const visited = new WeakSet<object>();

  const walk = (current: unknown, depth: number) => {
    if (depth > 8) return;
    if (typeof current === 'string') {
      if (current.trim().startsWith('displayfile:')) refs.add(current.trim());
      return;
    }
    if (!current || typeof current !== 'object') return;
    if (visited.has(current)) return;
    visited.add(current);

    if (Array.isArray(current)) {
      for (const item of current) walk(item, depth + 1);
      return;
    }

    for (const item of Object.values(current as Record<string, unknown>)) {
      walk(item, depth + 1);
    }
  };

  walk(value, 0);
  return Array.from(refs);
}

/**
 * Ensure Display-local files referenced by `displayfile:<id>` are registered on Display.
 *
 * - Paired mode: sends `local-media/register` via MessagePort (no server upload).
 * - Fallback mode: broadcasts the `File` over `BroadcastChannel` (same origin + same browser profile).
 */
export function ensureDisplayLocalFilesRegisteredFromValue(value: unknown): void {
  const refs = collectDisplayFileRefsDeep(value);
  if (refs.length === 0) return;
  ensureDisplayLocalFilesRegistered(refs);
}

export function ensureDisplayLocalFilesRegistered(refs: string[]): void {
  const now = Date.now();
  const ids = new Set<string>();

  for (const raw of refs ?? []) {
    const ref = typeof raw === 'string' ? raw.trim() : '';
    if (!ref) continue;

    const displayFileId = parseDisplayFileId(ref);
    if (!displayFileId || ids.has(displayFileId)) continue;
    ids.add(displayFileId);

    const entry = localDisplayMediaStore.getFileById(displayFileId);
    if (!entry?.file) {
      console.warn('[display-bridge] missing local display file for ref:', ref);
      continue;
    }

    // Paired local MessagePort mode.
    if (controlPort && !registeredDisplayFileIds.has(displayFileId)) {
      sendPlugin('local-media', 'register', {
        id: entry.id,
        kind: entry.kind,
        name: entry.name,
        mimeType: entry.mimeType,
        sizeBytes: entry.sizeBytes,
        lastModified: entry.lastModified,
        file: entry.file,
      });
      registeredDisplayFileIds.add(displayFileId);
    }

    // Same-origin BroadcastChannel fallback (works even when Display isn't paired).
    const lastSentAt = localMediaBroadcastLastSentById.get(displayFileId) ?? 0;
    if (now - lastSentAt < LOCAL_MEDIA_BROADCAST_DEDUP_MS) continue;
    localMediaBroadcastLastSentById.set(displayFileId, now);
    broadcastLocalMedia('register', {
      id: entry.id,
      kind: entry.kind,
      name: entry.name,
      mimeType: entry.mimeType,
      sizeBytes: entry.sizeBytes,
      lastModified: entry.lastModified,
      file: entry.file,
    });
  }
}

function createRandomToken(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  }
  return `${prefix}${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
}

function getDefaultDisplayUrl(): URL {
  const base = new URL(window.location.origin);
  // In dev, Display runs on a dedicated Vite port. In production, it is served under `DISPLAY_BASE_PATH` on the same origin.
  if (import.meta.env.DEV) {
    base.port = String(DISPLAY_DEV_PORT);
  }
  base.pathname = DISPLAY_BASE_PATH;
  base.search = '';
  base.hash = '';
  return base;
}

function getDefaultServerUrl(): string {
  const saved = window.localStorage.getItem('shugu-server-url');
  if (saved && saved.trim()) return saved.trim();
  // When deployed behind HTTPS reverse-proxy, default to same-origin and rely on Nginx to proxy `/socket.io` + `/api/*`.
  if (window.location.protocol === 'https:' && window.location.port === '') {
    return window.location.origin;
  }
  return `https://${window.location.hostname}:${DEFAULT_SERVER_PORT}`;
}

function getDefaultAssetReadToken(): string {
  const saved = window.localStorage.getItem(ASSET_READ_TOKEN_STORAGE_KEY);
  return saved && saved.trim() ? saved.trim() : '';
}

function stopCloseWatch(): void {
  if (closeWatchTimer) {
    clearInterval(closeWatchTimer);
    closeWatchTimer = null;
  }
}

function teardownPort(): void {
  // Best-effort: clear any long-lived effects so an unpaired Display doesn't stay "stuck" showing old content.
  if (controlPort) {
    try {
      const cleanup: DisplayControlMessage[] = [
        { type: 'shugu:display:control', action: 'stopMedia', payload: {} },
        { type: 'shugu:display:control', action: 'hideImage', payload: {} },
        {
          type: 'shugu:display:control',
          action: 'screenColor',
          payload: { color: '#000000', opacity: 0, mode: 'solid' } as ControlPayload,
        },
      ];
      for (const msg of cleanup) controlPort.postMessage(msg);
    } catch {
      // ignore
    }
  }

  if (manifestUnsub) {
    manifestUnsub();
    manifestUnsub = null;
  }
  lastManifestIdSentToLocal = null;
  registeredDisplayFileIds.clear();
  localMediaBroadcastLastSentById.clear();
  displayBridgeNodeMedia.set(null);

  if (!controlPort) return;
  try {
    controlPort.onmessage = null;
    controlPort.close();
  } catch {
    // ignore
  }
  controlPort = null;
}

export function teardownDisplayBridge(): void {
  stopCloseWatch();
  teardownPort();
  displayWindow = null;

  displayBridgeState.set({
    status: 'idle',
    displayUrl: null,
    displayOrigin: null,
    pairToken: null,
    ready: false,
    readyAt: null,
    readyManifestId: null,
    error: null,
  });
}

function ensureCloseWatch(): void {
  stopCloseWatch();
  closeWatchTimer = setInterval(() => {
    if (displayWindow && displayWindow.closed) {
      teardownPort();
      displayWindow = null;
      displayBridgeState.update((s) => ({
        ...s,
        status: 'closed',
      }));
      stopCloseWatch();
    }
  }, 350);
}

function handlePortMessage(event: MessageEvent): void {
  const data = event.data as unknown;
  if (!data || typeof data !== 'object') return;

  const type = (data as { type?: unknown }).type;
  if (type === 'shugu:display:node-media') {
    const msg = data as DisplayNodeMediaMessage;
    const nodeId = typeof msg.nodeId === 'string' ? msg.nodeId.trim() : '';
    const eventType = typeof msg.event === 'string' ? msg.event : '';
    if (!nodeId || (eventType !== 'started' && eventType !== 'ended')) return;

    const at = typeof msg.at === 'number' && Number.isFinite(msg.at) ? msg.at : Date.now();
    const nodeType = typeof msg.nodeType === 'string' ? msg.nodeType : undefined;
    displayBridgeNodeMedia.set({
      event: eventType as 'started' | 'ended',
      nodeId,
      ...(nodeType ? { nodeType } : {}),
      at,
    });
    return;
  }

  if (type !== 'shugu:display:ready') return;

  const ready = data as DisplayReadyMessage;
  const at = typeof ready.at === 'number' && Number.isFinite(ready.at) ? ready.at : Date.now();
  const manifestId = typeof ready.manifestId === 'string' ? ready.manifestId : null;

  displayBridgeState.update((s) => ({
    ...s,
    status: s.status === 'error' ? s.status : 'connected',
    ready: true,
    readyAt: at,
    readyManifestId: manifestId,
  }));
}

function sendLatestManifestToLocal(manifest: AssetManifest | null): void {
  if (!manifest) return;
  if (!controlPort) return;
  if (lastManifestIdSentToLocal === manifest.manifestId) return;
  sendManifest(manifest);
  lastManifestIdSentToLocal = manifest.manifestId;
}

function startManifestSync(): void {
  if (manifestUnsub) {
    manifestUnsub();
    manifestUnsub = null;
  }

  sendLatestManifestToLocal(getLatestManifest());
  manifestUnsub = subscribeLatestManifest((manifest) => {
    sendLatestManifestToLocal(manifest);
  });
}

export function openDisplay(options?: {
  displayUrl?: string;
  serverUrl?: string;
  assetReadToken?: string | null;
}): void {
  if (typeof window === 'undefined') return;

  if (displayWindow && !displayWindow.closed) {
    try {
      displayWindow.close();
    } catch {
      // ignore
    }
  }
  stopCloseWatch();
  displayWindow = null;
  teardownPort();

  const serverUrl = options?.serverUrl?.trim() ? options.serverUrl.trim() : getDefaultServerUrl();
  const assetReadToken =
    options?.assetReadToken != null ? String(options.assetReadToken ?? '') : getDefaultAssetReadToken();
  const pairToken = createRandomToken('pt_');

  const displayUrl = (() => {
    if (options?.displayUrl?.trim()) return new URL(options.displayUrl.trim());
    return getDefaultDisplayUrl();
  })();

  displayUrl.searchParams.set('pairToken', pairToken);
  displayUrl.searchParams.set('server', serverUrl);
  if (assetReadToken.trim()) {
    displayUrl.searchParams.set('assetReadToken', assetReadToken.trim());
  }

  displayBridgeState.set({
    status: 'opening',
    displayUrl: displayUrl.toString(),
    displayOrigin: displayUrl.origin,
    pairToken,
    ready: false,
    readyAt: null,
    readyManifestId: null,
    error: null,
  });

  displayWindow = window.open(displayUrl.toString(), '_blank');
  if (!displayWindow) {
    displayBridgeState.update((s) => ({ ...s, status: 'error', error: 'Popup blocked: window.open returned null' }));
    return;
  }

  ensureCloseWatch();

  // Pair after a short delay to reduce the chance that Display misses the initial postMessage listener.
  setTimeout(() => {
    pairDisplay({ serverUrl, assetReadToken, tokenOverride: pairToken, displayOrigin: displayUrl.origin });
  }, 250);
}

export function pairDisplay(options?: {
  serverUrl?: string;
  assetReadToken?: string | null;
  tokenOverride?: string;
  displayOrigin?: string;
}): void {
  if (typeof window === 'undefined') return;
  if (!displayWindow || displayWindow.closed) {
    displayBridgeState.update((s) => ({ ...s, status: 'error', error: 'Display window not open' }));
    return;
  }

  teardownPort();

  const stateSnapshot = get(displayBridgeState);
  const displayUrl = stateSnapshot.displayUrl ? new URL(stateSnapshot.displayUrl) : null;
  const serverUrlFromState = displayUrl?.searchParams.get('server')?.trim() ?? '';
  const serverUrl = options?.serverUrl?.trim()
    ? options.serverUrl.trim()
    : serverUrlFromState || getDefaultServerUrl();

  const assetReadToken =
    options?.assetReadToken != null ? String(options.assetReadToken ?? '') : getDefaultAssetReadToken();

  const token = options?.tokenOverride?.trim()
    ? options.tokenOverride.trim()
    : stateSnapshot.pairToken ?? createRandomToken('pt_');

  const displayOrigin = options?.displayOrigin?.trim()
    ? options.displayOrigin.trim()
    : stateSnapshot.displayOrigin ?? getDefaultDisplayUrl().origin;

  const channel = new MessageChannel();
  controlPort = channel.port1;
  controlPort.onmessage = handlePortMessage;
  controlPort.start();

  const message: DisplayPairMessage = {
    type: 'shugu:display:pair',
    token,
    managerOrigin: window.location.origin,
    serverUrl,
    ...(assetReadToken.trim() ? { assetReadToken: assetReadToken.trim() } : {}),
  };

  try {
    displayWindow.postMessage(message, displayOrigin, [channel.port2]);
    displayBridgeState.update((s) => ({
      ...s,
      status: 'connected',
      pairToken: token,
      displayOrigin,
      error: null,
    }));
    // New local session: clear any previous display-local file registry on the Display side.
    registeredDisplayFileIds.clear();
    sendPlugin('local-media', 'clear');
    broadcastLocalMedia('clear');
    startManifestSync();
  } catch (error) {
    teardownPort();
    displayBridgeState.update((s) => ({
      ...s,
      status: 'error',
      error: error instanceof Error ? error.message : 'postMessage failed',
    }));
  }
}

export function closeDisplay(): void {
  try {
    displayWindow?.close();
  } catch {
    // ignore
  }
  teardownDisplayBridge();
  displayBridgeState.update((s) => ({ ...s, status: 'closed' }));
}

export function sendControl(action: ControlAction, payload: ControlPayload, executeAtLocal?: number): void {
  if (!controlPort) return;

  // If the payload references a Display-local file, register it first via MessagePort (no server upload).
  ensureDisplayLocalFilesRegisteredFromValue(payload);

  const message: DisplayControlMessage = {
    type: 'shugu:display:control',
    action,
    payload,
    ...(typeof executeAtLocal === 'number' && Number.isFinite(executeAtLocal) ? { executeAtLocal } : {}),
  };
  try {
    controlPort.postMessage(message);
  } catch {
    // ignore
  }
}

export function sendPlugin(pluginId: string, command: string, payload?: Record<string, unknown>): void {
  if (!controlPort) return;
  const message: DisplayPluginMessage = {
    type: 'shugu:display:plugin',
    pluginId,
    command,
    ...(payload ? { payload } : {}),
  };
  try {
    controlPort.postMessage(message);
  } catch {
    // ignore
  }
}

export function sendManifest(manifest: AssetManifestSnapshot): void {
  sendPlugin('multimedia-core', 'configure', {
    manifestId: manifest.manifestId,
    assets: manifest.assets,
    ...(typeof manifest.updatedAt === 'number' && Number.isFinite(manifest.updatedAt)
      ? { updatedAt: manifest.updatedAt }
      : {}),
  });
}
