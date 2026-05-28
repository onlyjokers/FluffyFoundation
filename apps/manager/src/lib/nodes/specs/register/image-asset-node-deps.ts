/**
 * Purpose: Manager-side deps for AI image generation nodes that persist results into Asset Service.
 */
import type { GeneratedImageAssetRequest, ImageAssetNodeDeps } from '@shugu/node-core';

type ManagerImageAssetDepsOptions = {
  fetchImpl?: typeof fetch;
  getLocalStorageItem?: (key: string) => string | null;
  refreshAssets?: () => Promise<void>;
  onAssetReady?: (assetId: string) => void;
};

type CacheEntry = {
  status: 'pending' | 'ready' | 'error';
  assetId: string;
  error: string | null;
};

const STORAGE_SERVER_URL = 'shugu-server-url';
const STORAGE_WRITE_TOKEN = 'shugu-asset-write-token';

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

function buildUrl(serverUrl: string): string | null {
  const trimmed = serverUrl.trim();
  if (!trimmed) return null;
  try {
    const base = trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
    return new URL('api/ai/image/asset', base).toString();
  } catch {
    return null;
  }
}

function requestSignature(request: GeneratedImageAssetRequest): string {
  return JSON.stringify({
    prompt: request.prompt ?? '',
    image: request.image ?? '',
    model: request.model ?? '',
    size: request.size ?? '',
    quality: request.quality ?? '',
  });
}

function normalizeAssetId(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const withoutPrefix = trimmed.startsWith('asset:') ? trimmed.slice('asset:'.length).trim() : trimmed;
  return withoutPrefix.split(/[?#]/)[0]?.trim() ?? '';
}

export function createManagerImageAssetNodeDeps(
  options: ManagerImageAssetDepsOptions = {}
): ImageAssetNodeDeps {
  const fetchImpl = options.fetchImpl ?? fetch;
  const getLocalStorageItem = options.getLocalStorageItem ?? readLocalStorageItem;
  const refreshAssets = options.refreshAssets ?? refreshAssetsStore;
  const onAssetReady = options.onAssetReady;
  const cache = new Map<string, CacheEntry>();
  const jobCache = new Map<string, CacheEntry & { signature: string }>();

  const startRequest = (
    signature: string,
    request: GeneratedImageAssetRequest,
    requestId?: string
  ): void => {
    const serverUrl = getLocalStorageItem(STORAGE_SERVER_URL) ?? '';
    const url = buildUrl(serverUrl);
    const token = getLocalStorageItem(STORAGE_WRITE_TOKEN) ?? '';
    if (!url) return;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const pendingEntry = { status: 'pending' as const, assetId: '', error: null };
    if (requestId) jobCache.set(requestId, { ...pendingEntry, signature });
    else cache.set(signature, pendingEntry);

    void fetchImpl(url, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify(request),
    })
      .then(async (response) => {
        if (!response.ok) {
          const text = await response.text().catch(() => '');
          throw new Error(text ? `HTTP ${response.status}: ${text}` : `HTTP ${response.status}`);
        }
        return (await response.json()) as Record<string, unknown>;
      })
      .then(async (payload) => {
        const assetId =
          normalizeAssetId(payload.assetId) ||
          normalizeAssetId(payload.assetRef) ||
          normalizeAssetId((payload.asset as Record<string, unknown> | undefined)?.id);
        if (!assetId) throw new Error('image generation response missing assetId');
        const readyEntry = { status: 'ready' as const, assetId, error: null };
        cache.set(signature, readyEntry);
        if (requestId) jobCache.set(requestId, { ...readyEntry, signature });
        onAssetReady?.(assetId);
        await refreshAssets().catch(() => undefined);
        globalThis.setTimeout(() => {
          globalThis.dispatchEvent?.(
            new CustomEvent('shugu-ai-image-asset-ready', { detail: { assetId } })
          );
        }, 0);
      })
      .catch((err) => {
        const errorEntry = {
          status: 'error',
          assetId: '',
          error: err instanceof Error ? err.message : String(err),
        } as const;
        if (requestId) jobCache.set(requestId, { ...errorEntry, signature });
        else cache.set(signature, errorEntry);
      });
  };

  return {
    peekGeneratedImageAsset: (request, options) => {
      const requestId = options?.requestId?.trim() ?? '';
      if (requestId) {
        const job = jobCache.get(requestId);
        return job?.status === 'ready' ? job.assetId : '';
      }
      const signature = requestSignature(request);
      const cached = cache.get(signature);
      return cached?.status === 'ready' ? cached.assetId : '';
    },
    getGeneratedImageAsset: (request, options) => {
      const prompt = request.prompt?.trim() ?? '';
      if (!prompt) return '';
      const signature = requestSignature(request);
      const requestId = options?.requestId?.trim() ?? '';
      if (requestId) {
        const cached = jobCache.get(requestId);
        if (cached?.status === 'ready') return cached.assetId;
        if (cached?.status === 'pending') return '';
        startRequest(signature, request, requestId);
        return '';
      }

      const cached = cache.get(signature);
      if (options?.force) {
        if (cached?.status === 'pending') return '';
        startRequest(signature, request);
        return '';
      }
      if (cached?.status === 'ready') return cached.assetId;
      if (cached?.status === 'pending') return '';
      startRequest(signature, request);
      return '';
    },
  };
}
