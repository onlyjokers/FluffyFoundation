/**
 * Purpose: Manager-side transport for asset-first TTS and audio Drop Box nodes.
 */
import type { AudioAssetNodeDeps } from '@shugu/node-core';

type ManagerAudioAssetDepsOptions = {
  fetchImpl?: typeof fetch;
  getLocalStorageItem?: (key: string) => string | null;
  refreshAssets?: () => Promise<void>;
  onAssetReady?: (assetId: string) => void;
};

type AssetRequestState = {
  signature: string;
  assetId: string;
  inFlight: boolean;
  errorSignature: string | null;
};

const ttsStates = new Map<string, AssetRequestState>();
const uploadStates = new Map<string, AssetRequestState>();
const referenceStates = new Map<string, AssetRequestState>();
const sttStates = new Map<string, AssetRequestState & { text: string }>();

async function refreshAssetsStore(): Promise<void> {
  const mod = await import('../../../stores/assets');
  await mod.assetsStore.refresh();
}

function readLocalStorageItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function buildUrl(path: string, serverUrl: string): string | null {
  if (!serverUrl) return null;
  try {
    const base = serverUrl.endsWith('/') ? serverUrl : `${serverUrl}/`;
    return new URL(path, base).toString();
  } catch {
    return null;
  }
}

async function fetchJson(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit
): Promise<Record<string, unknown>> {
  const response = await fetchImpl(url, { ...init, credentials: 'include' });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(body ? `HTTP ${response.status}: ${body}` : `HTTP ${response.status}`);
  }
  const json = await response.json().catch(() => ({}));
  return json && typeof json === 'object' ? (json as Record<string, unknown>) : {};
}

function stateFor(map: Map<string, AssetRequestState>, nodeId: string, signature: string): AssetRequestState {
  let state = map.get(nodeId);
  if (!state || state.signature !== signature) {
    state = { signature, assetId: '', inFlight: false, errorSignature: null };
    map.set(nodeId, state);
  }
  return state;
}

function sttStateFor(nodeId: string, signature: string): AssetRequestState & { text: string } {
  let state = sttStates.get(nodeId);
  if (!state || state.signature !== signature) {
    state = { signature, assetId: '', text: '', inFlight: false, errorSignature: null };
    sttStates.set(nodeId, state);
  }
  return state;
}

function extractAssetId(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  const direct = record.assetId;
  if (typeof direct === 'string') return direct.trim();
  const entry = record.entry && typeof record.entry === 'object' ? (record.entry as Record<string, unknown>) : null;
  if (typeof entry?.assetId === 'string') return entry.assetId.trim();
  const asset = record.asset && typeof record.asset === 'object' ? (record.asset as Record<string, unknown>) : null;
  if (typeof asset?.id === 'string') return asset.id.trim();
  return '';
}

function extractText(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  return typeof record.text === 'string' ? record.text.trim() : '';
}

function buildReferenceQuery(request: {
  name?: string;
  index?: number;
  latest?: boolean;
}): string {
  const params = new URLSearchParams();
  if (request.name) params.set('name', request.name);
  if (typeof request.index === 'number' && Number.isFinite(request.index) && request.index >= 0) {
    params.set('index', String(Math.floor(request.index)));
  }
  if (typeof request.latest === 'boolean') params.set('latest', request.latest ? '1' : '0');
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function createManagerAudioAssetNodeDeps(
  options: ManagerAudioAssetDepsOptions = {}
): AudioAssetNodeDeps {
  const fetchImpl = options.fetchImpl ?? fetch;
  const getLocalStorageItem = options.getLocalStorageItem ?? readLocalStorageItem;
  const refreshAssets = options.refreshAssets ?? refreshAssetsStore;
  const onAssetReady = options.onAssetReady;

  return {
    peekTtsAudioAsset: (request) => {
      const state = stateFor(ttsStates, request.nodeId, request.signature);
      return state.assetId;
    },
    getTtsAudioAsset: (request) => {
      const state = stateFor(ttsStates, request.nodeId, request.signature);
      if (state.assetId || state.inFlight) return state.assetId;
      const url = buildUrl('api/tts/asset', getLocalStorageItem('shugu-server-url')?.trim() ?? '');
      if (!url) return '';
      state.inFlight = true;
      void fetchJson(fetchImpl, url, {
        method: 'POST',
        // Use the same Manager session cookie auth path as the rest of the manager asset APIs.
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: request.text,
          model: request.model,
          voice: request.voice,
          languageType: request.languageType,
          instructions: request.instructions,
          optimizeInstructions: request.optimizeInstructions,
        }),
      })
        .then((json) => {
          const assetId = extractAssetId(json);
          if (assetId) {
            state.assetId = assetId;
            state.errorSignature = null;
            onAssetReady?.(assetId);
            void refreshAssets();
          }
        })
        .catch((error) => {
          state.errorSignature = request.signature;
          console.warn('[manager-audio-assets] TTS asset generation failed', error);
        })
        .finally(() => {
          state.inFlight = false;
        });
      return state.assetId;
    },
    uploadAudioToDropBox: (request) => {
      const state = stateFor(uploadStates, request.nodeId, request.signature);
      if (state.inFlight || state.errorSignature === request.signature) return request.assetId;
      const url = buildUrl('api/assets/drop-box/audio', getLocalStorageItem('shugu-server-url')?.trim() ?? '');
      if (!url) return request.assetId;
      state.inFlight = true;
      state.assetId = request.assetId;
      void fetchJson(fetchImpl, url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId: request.assetId,
          ...(request.name ? { name: request.name } : {}),
        }),
      })
        .then((json) => {
          const assetId = extractAssetId(json);
          if (assetId) state.assetId = assetId;
          state.errorSignature = null;
        })
        .catch((error) => {
          state.errorSignature = request.signature;
          console.warn('[manager-audio-assets] audio drop box upload failed', error);
        })
        .finally(() => {
          state.inFlight = false;
        });
      return request.assetId;
    },
    referenceAudioFromDropBox: (request) => {
      if (request.assetId) return request.assetId;
      const state = stateFor(referenceStates, request.nodeId, request.signature);
      if (state.assetId || state.inFlight || state.errorSignature === request.signature) return state.assetId;
      const url = buildUrl(
        `api/assets/drop-box/audio/reference${buildReferenceQuery(request)}`,
        getLocalStorageItem('shugu-server-url')?.trim() ?? ''
      );
      if (!url) return '';
      state.inFlight = true;
      void fetchJson(fetchImpl, url, { method: 'GET' })
        .then((json) => {
          const assetId = extractAssetId(json);
          if (assetId) {
            state.assetId = assetId;
            state.errorSignature = null;
          }
        })
        .catch((error) => {
          state.errorSignature = request.signature;
          console.warn('[manager-audio-assets] audio drop box reference failed', error);
        })
        .finally(() => {
          state.inFlight = false;
        });
      return state.assetId;
    },
    peekSpeechToText: (request) => {
      const state = sttStateFor(request.nodeId, request.signature);
      return state.text;
    },
    getSpeechToText: (request) => {
      const state = sttStateFor(request.nodeId, request.signature);
      if (state.text || state.inFlight) return state.text;
      const url = buildUrl('api/stt/transcribe', getLocalStorageItem('shugu-server-url')?.trim() ?? '');
      if (!url) return '';
      state.inFlight = true;
      state.assetId = request.assetId;
      void fetchJson(fetchImpl, url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId: request.assetId,
          model: request.model,
        }),
      })
        .then((json) => {
          const text = extractText(json);
          if (text) {
            state.text = text;
            state.errorSignature = null;
            onAssetReady?.(`stt:${request.nodeId}`);
          }
        })
        .catch((error) => {
          state.errorSignature = request.signature;
          console.warn('[manager-audio-assets] STT transcription failed', error);
        })
        .finally(() => {
          state.inFlight = false;
        });
      return state.text;
    },
  };
}
