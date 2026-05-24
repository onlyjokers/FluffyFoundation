/**
 * Purpose: Manager-side transport for asset-first TTS and audio Drop Box nodes.
 */
import { assetsStore } from '$lib/stores/assets';
import type { AudioAssetNodeDeps } from '@shugu/node-core';

type AssetRequestState = {
  signature: string;
  assetId: string;
  inFlight: boolean;
  errorSignature: string | null;
};

const ttsStates = new Map<string, AssetRequestState>();
const uploadStates = new Map<string, AssetRequestState>();
const referenceStates = new Map<string, AssetRequestState>();

function readLocalStorage(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function buildUrl(path: string): string | null {
  const serverUrl = readLocalStorage('shugu-server-url').trim();
  if (!serverUrl) return null;
  try {
    const base = serverUrl.endsWith('/') ? serverUrl : `${serverUrl}/`;
    return new URL(path, base).toString();
  } catch {
    return null;
  }
}

function writeTokenHeader(): Record<string, string> {
  const token = readLocalStorage('shugu-asset-write-token').trim();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchJson(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, init);
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

export function createManagerAudioAssetNodeDeps(): AudioAssetNodeDeps {
  return {
    getTtsAudioAsset: (request) => {
      const state = stateFor(ttsStates, request.nodeId, request.signature);
      if (state.assetId || state.inFlight || state.errorSignature === request.signature) return state.assetId;
      const url = buildUrl('api/tts/asset');
      if (!url) return '';
      state.inFlight = true;
      void fetchJson(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...writeTokenHeader() },
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
            void assetsStore.refresh();
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
      const url = buildUrl('api/assets/drop-box/audio');
      if (!url) return request.assetId;
      state.inFlight = true;
      state.assetId = request.assetId;
      void fetchJson(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...writeTokenHeader() },
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
      const url = buildUrl(`api/assets/drop-box/audio/reference${buildReferenceQuery(request)}`);
      if (!url) return '';
      state.inFlight = true;
      void fetchJson(url, { method: 'GET', headers: writeTokenHeader() })
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
  };
}
