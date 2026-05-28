/**
 * Purpose: MultimediaCore — client-side runtime for assets (resolve + preload + cache + readiness state).
 *
 * This is framework-agnostic (no Svelte). Apps should bridge state into UI/stores if needed.
 */

import { AssetMetaStore } from './indexeddb.js';
import { parseAssetMetaResponse, parseAssetShaResponse, parseStoredManifest } from './asset-meta-parsing.js';
import { normalizeAssetRef, resolveAssetRefToUrl } from './asset-url-resolver.js';
import { MediaEngine } from './media-engine.js';
import { retryAssetPreload, runAssetPreload, validateManifestEntries } from './preload-state.js';
import type { AssetError } from '@shugu/protocol';

export type MultimediaCoreStatus = 'idle' | 'loading' | 'ready' | 'error';

export type MultimediaCoreState = {
  status: MultimediaCoreStatus;
  manifestId: string | null;
  loaded: number;
  total: number;
  error: string | null;
  lastError: AssetError | null;
  attemptsByAsset: Record<string, number>;
  updatedAt: number;
};

export type AssetManifestInput = {
  manifestId: string;
  assets: string[];
  entries?: unknown[];
  updatedAt?: number;
};

export type MultimediaCoreConfig = {
  serverUrl: string;
  assetReadToken?: string | null;
  /**
   * Cache Storage bucket name.
   * Must be stable across reloads so we can reuse cached responses.
   */
  cacheName?: string;
  /**
   * Max concurrent downloads.
   * Keep modest for audience clients to avoid impacting realtime controls.
   * Display app may choose a higher value for aggressive preloading.
   */
  concurrency?: number;
  timeoutMs?: number;
  maxRetries?: number;
  /**
   * Load & start preloading the last manifest immediately.
   */
  autoStart?: boolean;
};

type StateListener = (state: MultimediaCoreState) => void;

const LAST_MANIFEST_KEY = 'shugu-last-asset-manifest-v1';
const MAX_CONCURRENCY = 32;

function normalizeEtag(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const noWeak = trimmed.startsWith('W/') ? trimmed.slice(2).trim() : trimmed;
  const unquoted = noWeak.replace(/^"(.+)"$/, '$1');
  return unquoted || null;
}

function toInt(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

type AssetMeta = {
  sha256: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
};

function canUseCacheStorage(): boolean {
  return typeof caches !== 'undefined' && typeof caches.open === 'function';
}

function extractAssetVersions(entries: unknown[]): Map<string, string> {
  const versions = new Map<string, string>();
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    const checksum = record.checksum && typeof record.checksum === 'object'
      ? (record.checksum as Record<string, unknown>)
      : null;
    const value = typeof checksum?.value === 'string' ? checksum.value.trim() : '';
    if (id && value) versions.set(id, value);
  }
  return versions;
}

export class MultimediaCore {
  private readonly meta = new AssetMetaStore();
  private readonly listeners = new Set<StateListener>();
  private readonly cacheName: string;
  private readonly concurrency: number;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private abort: AbortController | null = null;
  private runSeq = 0;

  private serverUrl: string;
  private assetReadToken: string | null;

  private manifest: AssetManifestInput | null = null;
  private assetVersionById = new Map<string, string>();
  private rawImageRef: string | null = null;
  readonly media: MediaEngine;
  private state: MultimediaCoreState = {
    status: 'idle',
    manifestId: null,
    loaded: 0,
    total: 0,
    error: null,
    lastError: null,
    attemptsByAsset: {},
    updatedAt: Date.now(),
  };

  // Priority fetch: pause background preload when an asset is urgently needed.
  private priorityPauseSignal: AbortController | null = null;
  private priorityResumeResolvers: (() => void)[] = [];
  private priorityFetchedUrls = new Set<string>();

  constructor(config: MultimediaCoreConfig) {
    this.serverUrl = config.serverUrl;
    this.assetReadToken = config.assetReadToken?.trim() ? config.assetReadToken.trim() : null;
    this.cacheName = config.cacheName ?? 'shugu-assets-v1';
    this.concurrency = Math.max(1, Math.min(MAX_CONCURRENCY, Math.floor(config.concurrency ?? 4)));
    this.timeoutMs = Math.max(1, Math.floor(config.timeoutMs ?? 30000));
    this.maxRetries = Math.max(0, Math.floor(config.maxRetries ?? 2));

    this.media = new MediaEngine({
      resolveUrl: (url, kind) => {
        if (kind === 'image') this.rawImageRef = url;
        return this.resolveAssetRef(url);
      },
    });

    this.loadLastManifest();
    if (config.autoStart) {
      void this.preloadNow('startup');
    }
  }

  destroy(): void {
    this.abort?.abort();
    this.abort = null;
    this.listeners.clear();
  }

  subscribeState(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  getState(): MultimediaCoreState {
    return this.state;
  }

  setServerUrl(serverUrl: string): void {
    this.serverUrl = serverUrl;
  }

  setAssetReadToken(token: string | null): void {
    this.assetReadToken = token?.trim() ? token.trim() : null;
  }

  setAssetManifest(manifest: AssetManifestInput): void {
    const id = manifest.manifestId?.trim();
    if (!id) return;
    const assets = Array.isArray(manifest.assets) ? manifest.assets.map(String) : [];
    const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
    const manifestError = validateManifestEntries({ manifestId: id, assets, entries, updatedAt: manifest.updatedAt });
    if (manifestError) {
      this.setState({
        status: 'error',
        manifestId: id,
        loaded: 0,
        total: assets.length,
        error: manifestError.message,
        lastError: manifestError,
      });
      return;
    }
    if (this.manifest && this.manifest.manifestId === id) return;
    const previousResolvedImageUrl = this.media.getState().image.url;
    this.assetVersionById = extractAssetVersions(entries);
    this.manifest = { manifestId: id, assets, entries, updatedAt: manifest.updatedAt ?? Date.now() };
    this.refreshCurrentImageRef(previousResolvedImageUrl);
    this.persistLastManifest();
    void this.preloadNow('manifest-update');
  }

  resolveAssetRef(ref: string): string {
    return resolveAssetRefToUrl(this.withManifestVersion(ref), {
      serverUrl: this.serverUrl,
      readToken: this.assetReadToken,
    });
  }

  private withManifestVersion(ref: string): string {
    const trimmed = typeof ref === 'string' ? ref.trim() : '';
    if (!trimmed) return ref;
    const hashIndex = trimmed.indexOf('#');
    const hash = hashIndex >= 0 ? trimmed.slice(hashIndex) : '';
    const withoutHash = hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed;
    if (withoutHash.includes('?')) return ref;
    const normalized = normalizeAssetRef(withoutHash);
    if (!normalized) return ref;
    const assetId = normalized.slice('asset:'.length).trim();
    const version = assetId ? this.assetVersionById.get(assetId) : '';
    return version ? `${withoutHash}?v=${encodeURIComponent(version)}${hash}` : ref;
  }

  private refreshCurrentImageRef(previousResolvedImageUrl: string | null): void {
    const raw = this.rawImageRef;
    if (!raw) return;
    const current = this.media.getState().image;
    if (!current.visible || !current.url) return;
    const nextResolved = this.resolveAssetRef(raw);
    if (!nextResolved || nextResolved === previousResolvedImageUrl) return;
    this.media.showImage({
      url: raw,
      duration: current.duration,
      fit: current.fit,
      scale: current.scale,
      offsetX: current.offsetX,
      offsetY: current.offsetY,
      opacity: current.opacity,
    });
  }

  /**
   * Fetch an asset with priority. Checks CacheAPI first; if not cached,
   * pauses background preload, fetches the asset, caches it, then resumes.
   * Use this from tone-adapter instead of raw `fetch` for audio assets.
   */
  async prioritizeFetch(url: string): Promise<Response> {
    const cache = canUseCacheStorage() ? await caches.open(this.cacheName) : null;
    const cacheKey = new Request(url, { method: 'GET' });

    // Check cache first.
    if (cache) {
      const cached = await cache.match(cacheKey);
      if (cached) {
        console.log(`[asset] priorityFetch cache hit: ${url}`);
        return cached;
      }
    }

    console.log(`[asset] priorityFetch cache miss, fetching: ${url}`);

    // Pause background preload.
    if (this.abort && !this.abort.signal.aborted) {
      console.log('[asset] priorityFetch pausing background preload');
      this.priorityPauseSignal = new AbortController();
      // We don't abort the main preload, but workers will wait on priorityPauseSignal.
    }

    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`prioritizeFetch failed (${res.status})`);
      }

      // Cache the response.
      if (cache) {
        await cache.put(cacheKey, res.clone());
      }
      this.priorityFetchedUrls.add(url);

      console.log(`[asset] priorityFetch complete: ${url}`);
      return res;
    } finally {
      // Resume background preload.
      if (this.priorityPauseSignal) {
        console.log('[asset] priorityFetch resuming background preload');
        // Resolve any waiting workers.
        for (const resolve of this.priorityResumeResolvers) {
          try {
            resolve();
          } catch {
            // ignore
          }
        }
        this.priorityResumeResolvers = [];
        this.priorityPauseSignal = null;
      }
    }
  }

  /**
   * Check if a URL was already fetched via prioritizeFetch.
   */
  isPriorityFetched(url: string): boolean {
    return this.priorityFetchedUrls.has(url);
  }

  private resolveAssetMetaUrl(assetId: string): string | null {
    const base = (() => {
      try {
        return new URL(this.serverUrl).origin;
      } catch {
        return null;
      }
    })();
    if (!base) return null;
    const url = new URL(`/api/assets/${encodeURIComponent(assetId)}`, base);
    const token = typeof this.assetReadToken === 'string' && this.assetReadToken.trim() ? this.assetReadToken.trim() : null;
    if (token) url.searchParams.set('token', token);
    return url.toString();
  }

  private async fetchAssetSha256(assetId: string, signal: AbortSignal): Promise<string | null> {
    const url = this.resolveAssetMetaUrl(assetId);
    if (!url) return null;
    try {
      const res = await fetch(url, { method: 'GET', signal });
      if (!res.ok) return null;
      const json = (await res.json()) as unknown;
      return parseAssetShaResponse(json);
    } catch {
      return null;
    }
  }

  private async fetchAssetMeta(assetId: string, signal: AbortSignal): Promise<AssetMeta> {
    const url = this.resolveAssetMetaUrl(assetId);
    if (!url) return { sha256: null, mimeType: null, sizeBytes: null };
    const res = await fetch(url, { method: 'GET', signal });
    if (!res.ok) throw new Error(`asset metadata failed (${res.status})`);
    const json = (await res.json()) as unknown;
    return parseAssetMetaResponse(json);
  }

  async preloadNow(reason: 'startup' | 'manifest-update' | 'manual' = 'manual'): Promise<void> {
    const manifest = this.manifest;
    if (!manifest) return;
    this.abort?.abort();
    const abort = new AbortController();
    this.abort = abort;
    const runId = ++this.runSeq;
    await runAssetPreload({
      manifest, concurrency: this.concurrency, abort, runSeq: runId, getRunSeq: () => this.runSeq,
      waitForPriorityResume: () => this.waitForPriorityResume(), isPriorityFetched: (url) => this.priorityFetchedUrls.has(url),
      resolveAssetRef: (ref) => this.resolveAssetRef(ref), ensureCached: (assetId, ref, signal) => this.ensureCachedWithRetry(assetId, ref, signal),
      setState: (patch) => this.setState(patch),
    });
    if (!abort.signal.aborted && this.runSeq === runId) console.log(`[asset] preload ${this.state.status} manifest=${manifest.manifestId}`);
  }

  private async waitForPriorityResume(): Promise<void> {
    if (!this.priorityPauseSignal) return;
    await new Promise<void>((resolve) => this.priorityResumeResolvers.push(resolve));
  }

  private async ensureCachedWithRetry(assetId: string, ref: string, signal: AbortSignal): Promise<number | null> {
    return retryAssetPreload({
      assetId,
      signal,
      timeoutMs: this.timeoutMs,
      maxRetries: this.maxRetries,
      state: this.state,
      setState: (patch) => this.setState(patch),
      load: () => this.ensureCached(assetId, ref, signal),
    });
  }

  private async ensureCached(assetId: string, ref: string, signal: AbortSignal): Promise<number | null> {
    const url = this.resolveAssetRef(ref);
    const cache = canUseCacheStorage() ? await caches.open(this.cacheName) : null;
    const cacheKey = new Request(url, { method: 'GET' });

    // Fast path: if we have valid local metadata and cached content, skip all network requests.
    const localMeta = await this.meta.get(assetId);
    if (localMeta && localMeta.etag) {
      const cached = cache ? await cache.match(cacheKey) : null;
      // For videos we don't store in CacheAPI, but we track via localMeta.
      // If localMeta exists and was verified recently (within 24h), trust it.
      const MAX_META_AGE_MS = 24 * 60 * 60 * 1000;
      const isRecentlyVerified = localMeta.verifiedAt && (Date.now() - localMeta.verifiedAt) < MAX_META_AGE_MS;

      if (isRecentlyVerified && (cached || localMeta.sizeBytes !== null)) {
        // Already have valid data, skip network validation.
        return localMeta.sizeBytes ?? null;
      }
    }

    const cached = cache ? await cache.match(cacheKey) : null;

    // Metadata sha256 (baseline consistency check): prefer service-provided sha256.
    // This also guards against "same URL but different content" by requiring ETag === sha256.
    const meta = await this.fetchAssetMeta(assetId, signal);
    const sha256 = meta.sha256;

    const head = await fetch(url, { method: 'HEAD', signal });
    if (!head.ok) throw new Error(`HEAD failed (${head.status})`);

    const etag = normalizeEtag(head.headers.get('etag'));
    const sizeBytes = toInt(head.headers.get('content-length'));

    if (sha256 && etag && sha256 !== etag) {
      // Treat this as invalid/untrusted cache; force a re-fetch below.
      // (Future improvement: allow other ETag strategies by versioning this check.)
      console.warn(`[asset] etag/sha256 mismatch asset:${assetId} etag=${etag} sha256=${sha256}`);
    }

    const isMetaValid =
      Boolean(localMeta && localMeta.etag && etag && localMeta.etag === etag) &&
      (localMeta?.sizeBytes ?? null) === (sizeBytes ?? null);
    const hasCachedContent = Boolean(cached);

    // Baseline validation: require ETag to match sha256 when sha256 is available.
    const shaValid = sha256 && etag ? sha256 === etag : true;
    if (isMetaValid && hasCachedContent && shaValid) return meta.sizeBytes ?? sizeBytes ?? null;

    const isVideo = Boolean(meta.mimeType && meta.mimeType.toLowerCase().startsWith('video/'));
    const isImage = Boolean(meta.mimeType && meta.mimeType.toLowerCase().startsWith('image/'));

    // For very large files (> 100 MB), still do lightweight warm-up to avoid blocking.
    const MAX_FULL_PRELOAD_BYTES = 100 * 1024 * 1024;
    const shouldFullPreload = (meta.sizeBytes ?? sizeBytes ?? 0) < MAX_FULL_PRELOAD_BYTES;

    if (isVideo && !shouldFullPreload) {
      // For very large videos, do a lightweight warm-up: confirm headers and preheat the first chunk.
      console.log(`[asset] preload skipping large video (${(meta.sizeBytes ?? sizeBytes ?? 0) / 1024 / 1024}MB): ${assetId}`);
      try {
        const range = await fetch(url, { method: 'GET', signal, headers: { Range: 'bytes=0-65535' } });
        if (range.ok) {
          // Consume a small body so the request actually happens (some browsers defer).
          await range.arrayBuffer().catch(() => undefined);
        }
      } catch {
        // Ignore warm-up errors; HEAD/GET at playback time will surface real issues.
      }
    } else {
      // Full preload for audio, images, and reasonably-sized videos.
      // This populates the HTTP cache so <video>/<img> elements can use it.
      const res = await fetch(url, { method: 'GET', signal });
      if (!res.ok) throw new Error(`GET failed (${res.status})`);

      // Cache to CacheAPI as well for audio prioritizeFetch.
      if (cache && !isVideo) {
        await cache.put(cacheKey, res.clone());
      }
      // For videos, just consume the body to ensure HTTP cache is populated.
      if (isVideo || isImage) {
        await res.arrayBuffer().catch(() => undefined);
      }
    }

    await this.meta.put({
      assetId,
      sha256,
      etag,
      sizeBytes,
      verifiedAt: Date.now(),
    });

    return meta.sizeBytes ?? sizeBytes ?? null;
  }

  private setState(patch: Partial<MultimediaCoreState>): void {
    const next: MultimediaCoreState = { ...this.state, ...patch, updatedAt: Date.now() };
    this.state = next;
    for (const listener of this.listeners) {
      try {
        listener(next);
      } catch {
        // ignore
      }
    }
  }

  private loadLastManifest(): void {
    if (typeof localStorage === 'undefined') return;
    if (typeof localStorage.getItem !== 'function') return;
    const raw = localStorage.getItem(LAST_MANIFEST_KEY);
    if (!raw) return;
    try {
      const parsed = parseStoredManifest(JSON.parse(raw));
      if (!parsed) return;
      this.assetVersionById = extractAssetVersions(parsed.entries);
      this.manifest = { manifestId: parsed.manifestId, assets: parsed.assets, entries: parsed.entries, updatedAt: parsed.updatedAt };
    } catch {
      // ignore
    }
  }

  private persistLastManifest(): void {
    if (typeof localStorage === 'undefined') return;
    if (typeof localStorage.setItem !== 'function') return;
    if (!this.manifest) return;
    try {
      localStorage.setItem(LAST_MANIFEST_KEY, JSON.stringify(this.manifest));
    } catch {
      // ignore
    }
  }
}
