/**
 * Purpose: Display runtime store (MultimediaCore + action dispatch).
 *
 * Phase 2 scope:
 * - Full-screen player state (video/image/screenColor overlay)
 * - Control action dispatch (subset: showImage/hideImage/playMedia/stopMedia/screenColor)
 * - Query parsing + initialization (serverUrl / assetReadToken / pairToken)
 *
 * Phase 3 scope:
 * - Server mode transport (Socket.io via ClientSDK) with `group=display`
 * - Receive control/plugin/media messages and execute
 * - Send a one-shot "ready" custom sensor message to managers via server
 *
 * Phase 4 scope:
 * - Local mode transport (MessagePort) with origin/token validation
 * - Local priority with timeout fallback to Server mode
 */

import { writable, derived } from 'svelte/store';
import {
  MultimediaCore,
  toneAudioEngine,
  type MultimediaCoreState,
  type MediaEngineState,
  type MediaFit,
} from '@shugu/multimedia-core';
import {
  PROTOCOL_VERSION,
  type ControlAction,
  type ControlPayload,
  type ControlMessage,
  type PluginControlMessage,
  type PluginCommand,
  type MediaMetaMessage,
  type PlayMediaPayload,
  type ScreenColorPayload,
  type ShowImagePayload,
  type TargetSelector,
} from '@shugu/protocol';
import type { GraphChange } from '@shugu/node-core';
import { ClientSDK, NodeExecutor, type NodeCommand, type ClientState, type ClientIdentity } from '@shugu/sdk-client';
import { applyGraphChangesToExecutor } from './graph-change-consumer';

export type DisplayInitConfig = {
  serverUrl: string;
  assetReadToken?: string | null;
  pairToken?: string | null;
};

export type ScreenOverlayState = {
  visible: boolean;
  color: string;
  opacity: number;
};

type MediaClipParams = {
  baseUrl: string;
  startSec: number;
  endSec: number;
  loop: boolean | null;
  play: boolean | null;
  reverse: boolean | null;
  cursorSec: number | null;
  sourceNodeId: string | null;
  fit: MediaFit | null;
};

// Some browsers can be flaky about updating large data URLs repeatedly via `<img src="data:...">`.
// Convert data-image URLs into Blob object URLs to ensure refresh + reduce retained base64 strings.
let activeImageObjectUrl: string | null = null;
const IMAGE_OBJECT_URL_REVOKE_DELAY_MS = 800; // allow the fade-out transition to finish
let lastControlLogAt = 0;
const LOCAL_PLUGIN_TARGET: TargetSelector = { mode: 'all' };

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

const createLocalPluginMessage = (
  command: PluginCommand,
  payload?: Record<string, unknown>
): PluginControlMessage => ({
  type: 'plugin',
  from: 'manager',
  target: LOCAL_PLUGIN_TARGET,
  pluginId: 'node-executor',
  command,
  payload,
  version: PROTOCOL_VERSION,
  serverTimestamp: Date.now(),
});

function isDataImageUrl(url: string): boolean {
  return url.startsWith('data:image/');
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  if (typeof dataUrl !== 'string') return null;
  if (!dataUrl.startsWith('data:')) return null;

  const comma = dataUrl.indexOf(',');
  if (comma < 0) return null;

  const meta = dataUrl.slice(5, comma); // strip "data:"
  const data = dataUrl.slice(comma + 1);

  const parts = meta.split(';').map((s) => s.trim()).filter(Boolean);
  const mime = parts[0] && parts[0].includes('/') ? parts[0] : 'application/octet-stream';
  const isBase64 = parts.includes('base64');

  try {
    if (!isBase64) {
      const decoded = decodeURIComponent(data);
      return new Blob([decoded], { type: mime });
    }

    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

function scheduleRevokeObjectUrl(url: string): void {
  if (!url) return;
  if (typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return;
  setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }, IMAGE_OBJECT_URL_REVOKE_DELAY_MS);
}

function normalizeImageUrlForDisplay(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    clearActiveImageObjectUrl();
    return url;
  }

  if (!isDataImageUrl(trimmed)) {
    clearActiveImageObjectUrl();
    return trimmed;
  }

  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    clearActiveImageObjectUrl();
    return trimmed;
  }

  const blob = dataUrlToBlob(trimmed);
  if (!blob) {
    clearActiveImageObjectUrl();
    return trimmed;
  }

  const objectUrl = URL.createObjectURL(blob);
  const prev = activeImageObjectUrl;
  activeImageObjectUrl = objectUrl;
  if (prev) scheduleRevokeObjectUrl(prev);
  return objectUrl;
}

function clearActiveImageObjectUrl(): void {
  const prev = activeImageObjectUrl;
  activeImageObjectUrl = null;
  if (prev) scheduleRevokeObjectUrl(prev);
}

function parseMediaClipParams(raw: string): MediaClipParams {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      baseUrl: '',
      startSec: 0,
      endSec: -1,
      loop: null,
      play: null,
      reverse: null,
      cursorSec: null,
      sourceNodeId: null,
      fit: null,
    };
  }

  const hashIndex = trimmed.indexOf('#');
  if (hashIndex < 0) {
    return {
      baseUrl: trimmed,
      startSec: 0,
      endSec: -1,
      loop: null,
      play: null,
      reverse: null,
      cursorSec: null,
      sourceNodeId: null,
      fit: null,
    };
  }

  const baseUrl = trimmed.slice(0, hashIndex).trim();
  const hash = trimmed.slice(hashIndex + 1);
  const params = new URLSearchParams(hash);

  const toNumber = (value: string | null, fallback: number): number => {
    if (value == null) return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };

  const toBoolean = (value: string | null, fallback: boolean): boolean => {
    if (value == null) return fallback;
    const normalized = value.trim().toLowerCase();
    if (!normalized) return fallback;
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    const n = Number(normalized);
    if (Number.isFinite(n)) return n >= 0.5;
    return fallback;
  };

  const tRaw = params.get('t');
  let startSec = 0;
  let endSec = -1;
  if (tRaw !== null) {
    const parts = tRaw.split(',');
    const startCandidate = parts[0]?.trim() ?? '';
    const endCandidate = parts[1]?.trim() ?? '';
    startSec = toNumber(startCandidate || null, 0);
    if (parts.length > 1) {
      endSec = endCandidate ? toNumber(endCandidate, -1) : -1;
    }
  }

  const loopRaw = params.get('loop');
  const playRaw = params.get('play');
  const reverseRaw = params.get('rev');
  const cursorRaw = params.get('p');
  const nodeRaw = params.get('node');
  const fitRaw = params.get('fit');

  const cursorParsed = cursorRaw === null ? null : toNumber(cursorRaw, -1);
  const cursorSec = cursorParsed !== null && Number.isFinite(cursorParsed) && cursorParsed >= 0 ? cursorParsed : null;

  const fit = (() => {
    if (fitRaw === null) return null;
    const normalized = fitRaw.trim().toLowerCase();
    if (normalized === 'fit-screen' || normalized === 'fitscreen' || normalized === 'fullscreen')
      return 'fit-screen';
    if (normalized === 'cover') return 'cover';
    if (normalized === 'fill' || normalized === 'stretch') return 'fill';
    if (normalized === 'contain') return 'contain';
    return null;
  })();

  return {
    baseUrl,
    startSec: Number.isFinite(startSec) ? startSec : 0,
    endSec: Number.isFinite(endSec) ? endSec : -1,
    loop: loopRaw === null ? null : toBoolean(loopRaw, false),
    play: playRaw === null ? null : toBoolean(playRaw, true),
    reverse: reverseRaw === null ? null : toBoolean(reverseRaw, false),
    cursorSec,
    sourceNodeId: typeof nodeRaw === 'string' && nodeRaw.trim() ? nodeRaw.trim() : null,
    fit,
  };
}

const DEFAULT_SERVER_URL = 'https://localhost:3001';

let multimediaCore: MultimediaCore | null = null;
let mediaUnsub: (() => void) | null = null;
let coreUnsub: (() => void) | null = null;

let sdk: ClientSDK | null = null;
let sdkUnsub: (() => void) | null = null;
let controlUnsub: (() => void) | null = null;
let pluginUnsub: (() => void) | null = null;
let mediaMsgUnsub: (() => void) | null = null;

export function reportNodeMediaStarted(nodeId: string, nodeType = 'load-video-from-assets'): void {
  const id = typeof nodeId === 'string' ? nodeId.trim() : '';
  if (!id) return;

  // Local paired mode: report via MessagePort back to the Manager.
  if (transportDecision === 'local' && localPort) {
    try {
      localPort.postMessage({
        type: 'shugu:display:node-media',
        event: 'started',
        nodeId: id,
        nodeType,
        at: Date.now(),
      });
    } catch {
      // ignore
    }
    return;
  }

  if (!sdk) return;
  const state = sdk.getState();
  if (state.status !== 'connected' || !state.clientId) return;

  try {
    sdk.sendSensorData(
      'custom',
      { kind: 'node-media', event: 'started', nodeId: id, nodeType },
      { trackLatest: false }
    );
  } catch {
    // ignore
  }
}
let nodeExecutor: NodeExecutor | null = null;

let localPort: MessagePort | null = null;
let windowPairListener: ((event: MessageEvent) => void) | null = null;
let pairTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
let transportDecision: 'uninitialized' | 'pending' | 'local' | 'server' = 'uninitialized';

type LocalDisplayMediaKind = 'audio' | 'image' | 'video';
type LocalDisplayMediaEntry = {
  id: string;
  kind: LocalDisplayMediaKind;
  name: string;
  file: File;
  objectUrl: string;
};

// Local-only media registry (Manager ↔ Display same machine via MessagePort).
const displayLocalMedia = new Map<string, LocalDisplayMediaEntry>();
const LOCAL_MEDIA_BROADCAST_CHANNEL = 'shugu:display:local-media';
const warnedMissingDisplayLocalMedia = new Set<string>();

type LocalMediaBroadcastMessage = {
  type: 'shugu:display:local-media';
  command: 'register' | 'clear';
  payload?: Record<string, unknown>;
};

let localMediaBroadcast: BroadcastChannel | null = null;

function startLocalMediaBroadcast(): void {
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

    const command = msg.command;
    if (command === 'clear') {
      clearDisplayLocalMedia();
      return;
    }
    if (command === 'register') {
      registerDisplayLocalMedia(msg.payload ?? undefined);
    }
  };
}

function stopLocalMediaBroadcast(): void {
  if (!localMediaBroadcast) return;
  try {
    localMediaBroadcast.onmessage = null;
    localMediaBroadcast.close();
  } catch {
    // ignore
  }
  localMediaBroadcast = null;
}

function parseDisplayFileId(raw: string): string | null {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s.startsWith('displayfile:')) return null;
  const rest = s.slice('displayfile:'.length);
  const id = (rest.split(/[?#]/)[0] ?? '').trim();
  return id ? id : null;
}

function resolveDisplayFileUrl(raw: string): string | null {
  const id = parseDisplayFileId(raw);
  if (!id) return null;
  return displayLocalMedia.get(id)?.objectUrl ?? null;
}

function clearDisplayLocalMedia(): void {
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

function registerDisplayLocalMedia(payload: Record<string, unknown> | undefined): void {
  const id = typeof payload?.id === 'string' ? payload.id.trim() : '';
  if (!id) return;

  const kindRaw = typeof payload?.kind === 'string' ? payload.kind.trim().toLowerCase() : '';
  const kind: LocalDisplayMediaKind =
    kindRaw === 'audio' || kindRaw === 'image' || kindRaw === 'video' ? (kindRaw as LocalDisplayMediaKind) : 'video';

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

export const runtime = writable<{
  serverUrl: string;
  assetReadToken: string;
  pairToken: string;
}>({
  serverUrl: DEFAULT_SERVER_URL,
  assetReadToken: '',
  pairToken: '',
});

export const mode = writable<'uninitialized' | 'local-pending' | 'local' | 'server'>('uninitialized');

export const serverState = writable<ClientState>({
  status: 'disconnected',
  clientId: null,
  timeSync: {
    offset: 0,
    samples: [],
    maxSamples: 10,
    initialized: false,
    lastSyncTime: 0,
  },
  error: null,
});

export const coreState = writable<MultimediaCoreState>({
  status: 'idle',
  manifestId: null,
  loaded: 0,
  total: 0,
  error: null,
  updatedAt: Date.now(),
});

export const videoState = writable<MediaEngineState['video']>({
  url: null,
  sourceNodeId: null,
  playing: false,
  muted: true,
  loop: false,
  volume: 1,
  startSec: 0,
  endSec: -1,
  cursorSec: -1,
  reverse: false,
  fit: 'contain',
});

export const imageState = writable<MediaEngineState['image']>({
  url: null,
  visible: false,
  duration: undefined,
  fit: 'contain',
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  opacity: 1,
});

export const screenOverlay = writable<ScreenOverlayState>({
  visible: false,
  color: '#000000',
  opacity: 0,
});

export const isReady = derived(coreState, ($coreState) => $coreState.status === 'ready');

export const readyOnce = writable<{
  ready: boolean;
  at: number | null;
  manifestId: string | null;
  reportedToServer: boolean;
  reportedToLocal: boolean;
}>({
  ready: false,
  at: null,
  manifestId: null,
  reportedToServer: false,
  reportedToLocal: false,
});

export const audioState = writable(toneAudioEngine.getStatus());

export async function enableAudio(): Promise<{ enabled: boolean; error?: string } | null> {
  const result = await toneAudioEngine.start();
  audioState.set(toneAudioEngine.getStatus());

  if (result.enabled) {
    const loopId = nodeExecutor?.getStatus?.().loopId ?? null;
    if (loopId) {
      nodeExecutor?.handlePluginControl(createLocalPluginMessage('start', { loopId }));
    }
  }

  return result;
}

const DISPLAY_DEVICE_ID_STORAGE_KEY = 'shugu-display-device-id';
const DISPLAY_INSTANCE_ID_STORAGE_KEY = 'shugu-display-instance-id';
const DISPLAY_CLIENT_ID_STORAGE_KEY = 'shugu-display-client-id';

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

function getOrCreateDisplayIdentity(): ClientIdentity | null {
  if (typeof window === 'undefined') return null;

  const deviceId = getOrCreateStorageId(window.localStorage, DISPLAY_DEVICE_ID_STORAGE_KEY, 'd_');
  const instanceId = getOrCreateStorageId(window.sessionStorage, DISPLAY_INSTANCE_ID_STORAGE_KEY, 'i_');

  const storedClientId = window.sessionStorage.getItem(DISPLAY_CLIENT_ID_STORAGE_KEY);
  const clientId = storedClientId && storedClientId.trim() ? storedClientId : deviceId;
  window.sessionStorage.setItem(DISPLAY_CLIENT_ID_STORAGE_KEY, clientId);

  return { deviceId, instanceId, clientId };
}

function persistAssignedClientId(assignedClientId: string): void {
  if (typeof window === 'undefined') return;
  if (!assignedClientId) return;
  const current = window.sessionStorage.getItem(DISPLAY_CLIENT_ID_STORAGE_KEY);
  if (current === assignedClientId) return;
  window.sessionStorage.setItem(DISPLAY_CLIENT_ID_STORAGE_KEY, assignedClientId);
}

function teardownServerTransport(): void {
  mediaMsgUnsub?.();
  mediaMsgUnsub = null;

  pluginUnsub?.();
  pluginUnsub = null;

  controlUnsub?.();
  controlUnsub = null;

  sdkUnsub?.();
  sdkUnsub = null;

  nodeExecutor?.destroy();
  nodeExecutor = null;

  sdk?.disconnect();
  sdk = null;

  serverState.set({
    status: 'disconnected',
    clientId: null,
    timeSync: {
      offset: 0,
      samples: [],
      maxSamples: 10,
      initialized: false,
      lastSyncTime: 0,
    },
    error: null,
  });
}

function teardownLocalTransport(): void {
  if (pairTimeoutHandle) {
    clearTimeout(pairTimeoutHandle);
    pairTimeoutHandle = null;
  }

  if (typeof window !== 'undefined' && windowPairListener) {
    window.removeEventListener('message', windowPairListener);
  }
  windowPairListener = null;

  if (localPort) {
    try {
      localPort.onmessage = null;
      localPort.close();
    } catch {
      // ignore
    }
  }
  localPort = null;

  transportDecision = 'uninitialized';
  clearDisplayLocalMedia();
}

function isAllowedManagerOrigin(origin: string): boolean {
  if (!origin) return false;
  if (typeof window === 'undefined') return false;

  const allowed = new Set<string>([
    // Dev: Manager runs on a dedicated Vite port.
    'https://localhost:5173',
    'https://127.0.0.1:5173',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ]);

  try {
    const url = new URL(window.location.origin);
    url.port = '5173';
    allowed.add(url.origin);
    // When Manager and Display are deployed under the same origin (e.g. /manager + /display), allow same-origin pairing.
    allowed.add(window.location.origin);
  } catch {
    // ignore
  }

  // Dev convenience: allow Manager to pair from the same hostname (any port).
  // This keeps local MessagePort pairing working in e2e/dev runs where Manager is started on a non-default port.
  if (import.meta.env.DEV) {
    try {
      const sender = new URL(origin);
      const display = new URL(window.location.origin);

      if (sender.protocol === display.protocol && sender.hostname === display.hostname) return true;

      const hostPair = new Set([sender.hostname, display.hostname]);
      if (sender.protocol === display.protocol && hostPair.has('localhost') && hostPair.has('127.0.0.1')) return true;
    } catch {
      // ignore
    }
  }

  return allowed.has(origin);
}

export function initializeDisplay(config: DisplayInitConfig): void {
  startLocalMediaBroadcast();
  const serverUrl = config.serverUrl?.trim() ? config.serverUrl.trim() : DEFAULT_SERVER_URL;
  const assetReadToken = config.assetReadToken?.trim() ? config.assetReadToken.trim() : '';
  const pairToken = config.pairToken?.trim() ? config.pairToken.trim() : '';
  runtime.set({ serverUrl, assetReadToken, pairToken });
  mode.set(pairToken ? 'local-pending' : 'server');
  readyOnce.set({ ready: false, at: null, manifestId: null, reportedToServer: false, reportedToLocal: false });
  audioState.set(toneAudioEngine.getStatus());

  let readySent = false;
  let readyReportedToLocal = false;
  let readyReportedToServer = false;
  let readyAt: number | null = null;
  let readyManifestId: string | null = null;

  const reportReadyIfPossible = () => {
    if (!readySent) return;

    if (transportDecision === 'local' && localPort) {
      if (readyReportedToLocal) return;
      try {
        localPort.postMessage({
          type: 'shugu:display:ready',
          manifestId: readyManifestId,
          at: readyAt,
        });
        if (import.meta.env.DEV) {
          console.info('[Display] ready -> local', { manifestId: readyManifestId, at: readyAt });
        }
        readyReportedToLocal = true;
        readyOnce.set({
          ready: true,
          at: readyAt,
          manifestId: readyManifestId,
          reportedToServer: readyReportedToServer,
          reportedToLocal: true,
        });
      } catch {
        if (import.meta.env.DEV) {
          console.warn('[Display] ready -> local failed');
        }
      }
      return;
    }

    if (transportDecision !== 'server' || !sdk) return;
    if (readyReportedToServer) return;

    const state = sdk.getState();
    if (state.status !== 'connected' || !state.clientId) return;

    try {
      sdk.sendSensorData(
        'custom',
        {
          kind: 'display',
          event: 'ready',
          manifestId: readyManifestId,
          at: readyAt,
        },
        { trackLatest: false }
      );
      readyReportedToServer = true;
      readyOnce.set({
        ready: true,
        at: readyAt,
        manifestId: readyManifestId,
        reportedToServer: true,
        reportedToLocal: readyReportedToLocal,
      });
    } catch {
      // ignore
    }
  };

  multimediaCore?.destroy();
  multimediaCore = new MultimediaCore({
    serverUrl,
    assetReadToken: assetReadToken || null,
    autoStart: true,
    concurrency: 16,
  });

  coreUnsub?.();
  coreUnsub = multimediaCore.subscribeState((s) => {
    coreState.set(s);
    if (!readySent && s.status === 'ready') {
      readySent = true;
      readyAt = Date.now();
      readyManifestId = s.manifestId;
      if (import.meta.env.DEV) {
        console.info('[Display] multimediaCore ready', { manifestId: readyManifestId });
      }
      readyOnce.set({
        ready: true,
        at: readyAt,
        manifestId: readyManifestId,
        reportedToServer: false,
        reportedToLocal: false,
      });
      reportReadyIfPossible();
    }
  });

  mediaUnsub?.();
  mediaUnsub = multimediaCore.media.subscribeState((s: MediaEngineState) => {
    videoState.set(s.video);
    imageState.set(s.image);
  });

  teardownLocalTransport();
  teardownServerTransport();

  const handleAssetManifest = (payload: Record<string, unknown> | undefined) => {
    const snapshot = payload ?? {};
    const manifestId = typeof snapshot.manifestId === 'string' ? snapshot.manifestId : '';
    const assets = Array.isArray(snapshot.assets) ? snapshot.assets.map(String) : [];
    const updatedAtRaw = snapshot.updatedAt;
    const updatedAt =
      typeof updatedAtRaw === 'number' && Number.isFinite(updatedAtRaw) ? updatedAtRaw : undefined;
    if (!manifestId) return;
    multimediaCore?.setAssetManifest({ manifestId, assets, updatedAt });
  };

  const identity = getOrCreateDisplayIdentity();
  sdk = new ClientSDK({
    serverUrl,
    identity: identity ?? undefined,
    query: { group: 'display' },
  });

  sdkUnsub = sdk.onStateChange((s) => {
    serverState.set(s);
    if (s.clientId) {
      persistAssignedClientId(s.clientId);
    }
    reportReadyIfPossible();
  });

  controlUnsub = sdk.onControl((message: ControlMessage) => {
    // If we later pair locally (MessagePort), keep the server connection but ignore server control messages.
    if (transportDecision !== 'server') return;
    const offset = sdk?.getOffset?.() ?? 0;
    const executeAtLocal =
      typeof message.executeAt === 'number' && Number.isFinite(message.executeAt) ? message.executeAt - offset : undefined;
    executeControl(message.action, message.payload, executeAtLocal);
  });

  nodeExecutor?.destroy();
  nodeExecutor = new NodeExecutor(
    sdk,
    (cmd: NodeCommand) => {
      const offset = sdk?.getOffset?.() ?? 0;
      const executeAtLocal =
        typeof cmd.executeAt === 'number' && Number.isFinite(cmd.executeAt) ? cmd.executeAt - offset : undefined;
      executeControl(cmd.action, cmd.payload, executeAtLocal);
    },
    {
      resolveAssetRef: (ref: string) => {
        const resolvedDisplayUrl = resolveDisplayFileUrl(ref);
        if (resolvedDisplayUrl) return resolvedDisplayUrl;

        const displayFileId = parseDisplayFileId(ref);
        if (displayFileId) {
          if (!warnedMissingDisplayLocalMedia.has(displayFileId)) {
            warnedMissingDisplayLocalMedia.add(displayFileId);
            console.warn('[Display] missing display-local file registration:', ref);
          }
          return '';
        }

        return multimediaCore?.resolveAssetRef(ref) ?? ref;
      },
    }
  );

  pluginUnsub = sdk.onPluginControl((message: PluginControlMessage) => {
    // If we later pair locally (MessagePort), keep the server connection but ignore server plugin messages.
    if (transportDecision !== 'server') return;
    if (message.pluginId === 'node-executor') {
      if (message.command === 'graph-changes') {
        const payloadRecord = asRecord(message.payload);
        const rawChanges = payloadRecord?.changes;
        const changes = Array.isArray(rawChanges) ? (rawChanges as GraphChange[]) : [];
        applyGraphChangesToExecutor(nodeExecutor, changes);
        return;
      }
      nodeExecutor?.handlePluginControl(message);
      return;
    }

    if (message.pluginId === 'multimedia-core' && message.command === 'configure') {
      handleAssetManifest(message.payload);
      return;
    }

    console.info('[Display] plugin noop:', message.pluginId, message.command);
  });

  mediaMsgUnsub = sdk.onMedia((message: MediaMetaMessage) => {
    // If we later pair locally (MessagePort), keep the server connection but ignore server media messages.
    if (transportDecision !== 'server') return;
    const options = message.options ?? {};
    const payload: PlayMediaPayload = {
      url: message.url,
      mediaType: message.mediaType,
      loop: options.loop,
      volume: options.volume,
      muted: message.mediaType === 'video' ? true : undefined,
    };

    const offset = sdk?.getOffset?.() ?? 0;
    const executeAtLocal = typeof message.executeAt === 'number' ? message.executeAt - offset : undefined;
    executeControl('playMedia', payload, executeAtLocal);
  });

  const enterServerMode = () => {
    if (transportDecision !== 'pending' && transportDecision !== 'uninitialized') return;
    transportDecision = 'server';
    mode.set('server');

    if (pairTimeoutHandle) {
      clearTimeout(pairTimeoutHandle);
      pairTimeoutHandle = null;
    }

    if (import.meta.env.DEV) {
      console.info('[Display] transport -> server (pair timeout fallback)');
    }
    sdk?.connect();
  };

  if (!pairToken) {
    transportDecision = 'uninitialized';
    enterServerMode();
    return;
  }

  transportDecision = 'pending';

  const onLocalPortMessage = (event: MessageEvent) => {
    const data = event.data as unknown;
    if (!data || typeof data !== 'object') return;

    const type = (data as { type?: unknown }).type;
    if (type === 'shugu:display:control') {
      const action = (data as { action?: unknown }).action;
      const payload = (data as { payload?: unknown }).payload;
      const executeAtLocalRaw = (data as { executeAtLocal?: unknown }).executeAtLocal;
      const executeAtLocal =
        typeof executeAtLocalRaw === 'number' && Number.isFinite(executeAtLocalRaw) ? executeAtLocalRaw : undefined;
      if (typeof action !== 'string') return;
      executeControl(action as ControlAction, (payload ?? {}) as ControlPayload, executeAtLocal);
      return;
    }

    if (type === 'shugu:display:plugin') {
      const pluginId = (data as { pluginId?: unknown }).pluginId;
      const command = (data as { command?: unknown }).command;
      const payload = (data as { payload?: unknown }).payload;

      if (pluginId === 'node-executor' && typeof command === 'string') {
        if (command === 'graph-changes') {
          const payloadRecord = asRecord(payload);
          const rawChanges = payloadRecord?.changes;
          const changes = Array.isArray(rawChanges) ? (rawChanges as GraphChange[]) : [];
          applyGraphChangesToExecutor(nodeExecutor, changes);
          return;
        }
        const pluginPayload = asRecord(payload) ?? undefined;
        nodeExecutor?.handlePluginControl(createLocalPluginMessage(command as PluginCommand, pluginPayload));
        return;
      }

      if (pluginId === 'local-media' && command === 'register') {
        registerDisplayLocalMedia((payload ?? undefined) as Record<string, unknown> | undefined);
        return;
      }

      if (pluginId === 'local-media' && command === 'clear') {
        clearDisplayLocalMedia();
        return;
      }

      if (pluginId !== 'multimedia-core' || command !== 'configure') {
        console.info('[Display] local plugin noop:', pluginId, command);
        return;
      }
      if (import.meta.env.DEV) {
        const snapshot = asRecord(payload);
        const manifestId = typeof snapshot?.manifestId === 'string' ? snapshot.manifestId : null;
        const assetsCount = Array.isArray(snapshot?.assets) ? snapshot.assets.length : null;
        console.info('[Display] local manifest configure', { manifestId, assetsCount });
      }
      handleAssetManifest((payload ?? undefined) as Record<string, unknown> | undefined);
      return;
    }

    console.info('[Display] local message noop:', type);
  };

  const enterLocalMode = (port: MessagePort) => {
    if (transportDecision !== 'pending' && transportDecision !== 'server') return;
    transportDecision = 'local';
    mode.set('local');

    if (pairTimeoutHandle) {
      clearTimeout(pairTimeoutHandle);
      pairTimeoutHandle = null;
    }
    if (typeof window !== 'undefined' && windowPairListener) {
      window.removeEventListener('message', windowPairListener);
      windowPairListener = null;
    }

    localPort = port;
    localPort.onmessage = onLocalPortMessage;
    try {
      localPort.start();
    } catch {
      // ignore
    }

    if (import.meta.env.DEV) {
      console.info('[Display] transport -> local (paired via MessagePort)');
    }
    reportReadyIfPossible();
  };

  windowPairListener = (event: MessageEvent) => {
    // Allow late local pairing even after server fallback so the Manager's "Reconnect" can recover.
    if (transportDecision === 'local') return;
    if (!isAllowedManagerOrigin(event.origin)) {
      if (import.meta.env.DEV) {
        const data = asRecord(event.data);
        if (data?.type === 'shugu:display:pair') console.warn('[Display] pair rejected (origin)', event.origin);
      }
      return;
    }

    const data = event.data as unknown;
    if (!data || typeof data !== 'object') return;

    const type = (data as { type?: unknown }).type;
    if (type !== 'shugu:display:pair') return;

    const token = (data as { token?: unknown }).token;
    if (typeof token !== 'string' || token !== pairToken) {
      if (import.meta.env.DEV) console.warn('[Display] pair rejected (token mismatch)');
      return;
    }

    const port = event.ports?.[0];
    if (!port) {
      if (import.meta.env.DEV) console.warn('[Display] pair rejected (missing MessagePort)');
      return;
    }

    enterLocalMode(port);
  };

  window.addEventListener('message', windowPairListener);

  // Phase 4: Local priority. If pairing fails (no opener / slow load / origin mismatch), fallback to Server mode.
  pairTimeoutHandle = setTimeout(() => {
    if (transportDecision !== 'pending') return;
    enterServerMode();
  }, 1200);
}

export function destroyDisplay(): void {
  clearActiveImageObjectUrl();
  coreUnsub?.();
  coreUnsub = null;

  mediaUnsub?.();
  mediaUnsub = null;

  multimediaCore?.destroy();
  multimediaCore = null;

  teardownLocalTransport();
  teardownServerTransport();
  stopLocalMediaBroadcast();
}

function setScreenColor(payload: ScreenColorPayload): void {
  const color = typeof payload.color === 'string' && payload.color.trim() ? payload.color.trim() : '#000000';
  const opacityRaw = payload.opacity ?? 1;
  const opacity =
    typeof opacityRaw === 'number' && Number.isFinite(opacityRaw) ? Math.max(0, Math.min(1, opacityRaw)) : 1;

  screenOverlay.set({
    visible: opacity > 0,
    color,
    opacity,
  });
}

function executeNow(action: ControlAction, payload: ControlPayload): void {
  switch (action) {
    case 'showImage': {
      const imagePayload = payload as ShowImagePayload;
      const clip = typeof imagePayload.url === 'string' ? parseMediaClipParams(imagePayload.url) : null;
      const baseUrl = clip ? clip.baseUrl : String(imagePayload.url ?? '');
      const resolvedDisplayUrl = resolveDisplayFileUrl(baseUrl);
      if (parseDisplayFileId(baseUrl) && !resolvedDisplayUrl) {
        console.warn('[Display] missing display-local file registration:', baseUrl);
        return;
      }
      const fit = clip?.fit ?? null;
      const url = normalizeImageUrlForDisplay(resolvedDisplayUrl ?? baseUrl);
      if (import.meta.env.DEV) {
        const now = Date.now();
        if (now - lastControlLogAt >= 500) {
          lastControlLogAt = now;
          console.info('[Display] showImage', {
            dataUrl: isDataImageUrl(baseUrl),
            urlChars: baseUrl.length,
            fit,
          });
        }
      }
      multimediaCore?.media.showImage({
        url,
        duration: imagePayload.duration,
        ...(fit === null ? {} : { fit }),
      });
      return;
    }

    case 'hideImage':
      clearActiveImageObjectUrl();
      if (import.meta.env.DEV) {
        const now = Date.now();
        if (now - lastControlLogAt >= 500) {
          lastControlLogAt = now;
          console.info('[Display] hideImage');
        }
      }
      multimediaCore?.media.hideImage();
      return;

    case 'playMedia': {
      const mediaPayload = payload as PlayMediaPayload;
      const clip = typeof mediaPayload.url === 'string' ? parseMediaClipParams(mediaPayload.url) : null;
      const baseUrl = clip ? clip.baseUrl : mediaPayload.url;
      const url = typeof baseUrl === 'string' ? baseUrl : String(baseUrl ?? '');
      const resolvedDisplayUrl = resolveDisplayFileUrl(url);
      if (parseDisplayFileId(url) && !resolvedDisplayUrl) {
        console.warn('[Display] missing display-local file registration:', url);
        return;
      }

      const resolvedUrlString = resolvedDisplayUrl ?? url;
      const isVideo =
        mediaPayload.mediaType === 'video' ||
        Boolean(parseDisplayFileId(url)) ||
        /\.(mp4|webm|mov|avi|mkv|m4v)$/i.test(resolvedUrlString);

      if (!isVideo) {
        console.info('[Display] playMedia(audio) noop:', mediaPayload.url);
        return;
      }

      const loop = clip?.loop ?? mediaPayload.loop ?? false;
      const playing = clip?.play ?? Boolean(resolvedUrlString);
      const startSec = clip ? Math.max(0, clip.startSec) : 0;
      const endSec = clip ? clip.endSec : -1;
      const cursorSec = clip?.cursorSec ?? -1;
      const reverse = clip?.reverse ?? false;
      const fit = clip?.fit ?? null;

      multimediaCore?.media.playVideo({
        url: resolvedUrlString,
        sourceNodeId: clip?.sourceNodeId ?? null,
        muted: mediaPayload.muted ?? true,
        loop,
        volume: mediaPayload.volume ?? 1,
        playing,
        startSec,
        endSec,
        cursorSec,
        reverse,
        ...(fit === null ? {} : { fit }),
      });
      return;
    }

    case 'stopMedia':
      multimediaCore?.media.stopVideo();
      return;

    case 'screenColor': {
      const colorPayload = payload as ScreenColorPayload;
      setScreenColor(colorPayload);
      return;
    }

    default:
      console.info('[Display] noop action:', action, payload);
  }
}

export function executeControl(action: ControlAction, payload: ControlPayload, executeAtLocal?: number): void {
  if (typeof executeAtLocal === 'number' && Number.isFinite(executeAtLocal)) {
    const delay = executeAtLocal - Date.now();
    if (delay > 0) {
      setTimeout(() => executeNow(action, payload), delay);
      return;
    }
  }

  executeNow(action, payload);
}
