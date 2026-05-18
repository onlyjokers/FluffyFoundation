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
import { MultimediaCore, toneAudioEngine, type MultimediaCoreState, type MediaEngineState } from '@shugu/multimedia-core';
import type { ControlAction, ControlPayload, PluginCommand } from '@shugu/protocol';
import type { VisualSceneLayerItem } from '@shugu/protocol';
import type { GraphChange } from '@shugu/node-core';
import { ClientSDK, NodeExecutor, type ClientState } from '@shugu/sdk-client';
import { applyGraphChangesToExecutor } from './graph-change-consumer';
import {
  createClearedDisplayScreenOverlayState,
  type ScreenOverlayState,
} from './display-screen-overlay';
import {
  createClearedDisplayTextOverlayState,
  type TextOverlayState,
} from './display-text-overlay';
import { createDisplayControlExecutor } from './display/control-executor';
import { applyDisplayAssetManifest } from './display-asset-manifest';
import {
  clearActiveImageObjectUrl,
} from './display/image-object-url';
import {
  clearDisplayLocalMedia,
  registerDisplayLocalMedia,
  resolveDisplayFileUrl,
  startLocalMediaBroadcast,
  stopLocalMediaBroadcast,
  warnMissingDisplayLocalMedia,
} from './display/local-media';
import { createLocalPluginMessage, isAllowedManagerOrigin } from './display/local-pairing';
import { createDisplayServerTransport } from './display/server-transport';
import { shouldConnectDisplayServerPresence, type DisplayTransportDecision } from './display/transport-mode';

export type DisplayInitConfig = {
  serverUrl: string;
  assetReadToken?: string | null;
  pairToken?: string | null;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

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
let transportDecision: DisplayTransportDecision = 'uninitialized';

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
  lastError: null,
  attemptsByAsset: {},
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

export const audioPlaybackState = writable<MediaEngineState['audio']>({ url: null, playing: false, loop: false, volume: 1 });

export const screenOverlay = writable<ScreenOverlayState>(createClearedDisplayScreenOverlayState());
export const textOverlay = writable<TextOverlayState>(createClearedDisplayTextOverlayState());
export const visualScenes = writable<VisualSceneLayerItem[]>([]);

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

    if (transportDecision === 'local' && localPort && !readyReportedToLocal) {
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
    }

    if (!shouldConnectDisplayServerPresence(transportDecision) || !sdk) return;
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
    audioPlaybackState.set(s.audio);
  });

  teardownLocalTransport();
  teardownServerTransport();

  const serverTransport = createDisplayServerTransport({
    serverUrl,
    serverState,
    getTransportDecision: () => transportDecision,
    getMultimediaCore: () => multimediaCore,
    executeControl,
    reportReadyIfPossible,
  });
  sdk = serverTransport.sdk;
  nodeExecutor?.destroy();
  nodeExecutor = serverTransport.nodeExecutor;
  sdkUnsub = serverTransport.unsubs.sdk;
  controlUnsub = serverTransport.unsubs.control;
  pluginUnsub = serverTransport.unsubs.plugin;
  mediaMsgUnsub = serverTransport.unsubs.media;

  const connectServerPresenceIfNeeded = () => {
    if (!shouldConnectDisplayServerPresence(transportDecision)) return;
    sdk?.connect();
  };

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
    connectServerPresenceIfNeeded();
  };

  if (!pairToken) {
    transportDecision = 'uninitialized';
    enterServerMode();
    return;
  }

  transportDecision = 'pending';
  connectServerPresenceIfNeeded();

  const onLocalPortMessage = (event: MessageEvent) => {
    const data = event.data as unknown;
    if (!data || typeof data !== 'object') return;

    const type = (data as { type?: unknown }).type;
    if (type === 'shugu:display:control') {
      const message = (data as { message?: unknown }).message;
      const action =
        message && typeof message === 'object'
          ? (message as { action?: unknown }).action
          : (data as { action?: unknown }).action;
      const payload =
        message && typeof message === 'object'
          ? (message as { payload?: unknown }).payload
          : (data as { payload?: unknown }).payload;
      const executeAtLocalRaw = (data as { executeAtLocal?: unknown }).executeAtLocal;
      const executeAtLocal =
        typeof executeAtLocalRaw === 'number' && Number.isFinite(executeAtLocalRaw) ? executeAtLocalRaw : undefined;
      if (typeof action !== 'string') return;
      executeControl(action as ControlAction, (payload ?? {}) as ControlPayload, executeAtLocal);
      return;
    }

    if (type === 'shugu:display:plugin') {
      const message = (data as { message?: unknown }).message;
      const pluginId =
        message && typeof message === 'object'
          ? (message as { pluginId?: unknown }).pluginId
          : (data as { pluginId?: unknown }).pluginId;
      const command =
        message && typeof message === 'object'
          ? (message as { command?: unknown }).command
          : (data as { command?: unknown }).command;
      const payload =
        message && typeof message === 'object'
          ? (message as { payload?: unknown }).payload
          : (data as { payload?: unknown }).payload;

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
      applyDisplayAssetManifest((payload ?? undefined) as Record<string, unknown> | undefined, () => multimediaCore);
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
    connectServerPresenceIfNeeded();
    reportReadyIfPossible();
  };

  windowPairListener = (event: MessageEvent) => {
    // Allow late local pairing even after server fallback so the Manager's "Reconnect" can recover.
    if (transportDecision === 'local') return;
    if (!isAllowedManagerOrigin(event.origin, import.meta.env.DEV)) {
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

const controlExecutor = createDisplayControlExecutor({
  getMultimediaCore: () => multimediaCore,
  getNodeExecutor: () => nodeExecutor,
  screenOverlay,
  textOverlay,
  visualScenes,
  isDev: import.meta.env.DEV,
});

export function executeControl(action: ControlAction, payload: ControlPayload, executeAtLocal?: number): void {
  controlExecutor.executeControl(action, payload, executeAtLocal);
}
