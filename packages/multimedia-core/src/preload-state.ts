/**
 * Purpose: FF-16 preload state helpers for manifest validation and retry bookkeeping.
 */

import { validateAssetManifest, type AssetError } from '@shugu/protocol';
import { toAssetPreloadError, withAssetTimeout } from './preload-errors.js';
import { parseAssetIdFromRef } from './asset-url-resolver.js';
import type { AssetManifestInput, MultimediaCoreState } from './multimedia-core.js';

export function validateManifestEntries(input: AssetManifestInput): AssetError | null {
  const entries = Array.isArray(input.entries) ? input.entries : [];
  if (entries.length === 0) return null;
  const validation = validateAssetManifest({
    manifestId: input.manifestId,
    updatedAt: input.updatedAt ?? Date.now(),
    assets: entries,
  });
  return validation.ok ? null : validation.errors[0] ?? toAssetPreloadError('manifest', new Error('asset manifest validation failed'));
}

export async function retryAssetPreload(input: {
  assetId: string;
  timeoutMs: number;
  maxRetries: number;
  signal: AbortSignal;
  state: MultimediaCoreState;
  setState: (patch: Partial<MultimediaCoreState>) => void;
  load: () => Promise<number | null>;
}): Promise<number | null> {
  let last: unknown = null;
  for (let attempt = 1; attempt <= input.maxRetries + 1; attempt += 1) {
    input.setState({ attemptsByAsset: { ...input.state.attemptsByAsset, [input.assetId]: attempt } });
    try {
      return await withAssetTimeout(input.load(), { assetId: input.assetId, timeoutMs: input.timeoutMs });
    } catch (err) {
      last = err;
      const assetError = toAssetPreloadError(input.assetId, err);
      input.setState({ lastError: assetError, error: assetError.message });
      if (!assetError.retryable || input.signal.aborted || attempt > input.maxRetries) break;
    }
  }
  throw last;
}

export async function runAssetPreload(input: {
  manifest: AssetManifestInput;
  concurrency: number;
  abort: AbortController;
  runSeq: number;
  getRunSeq: () => number;
  waitForPriorityResume: () => Promise<void>;
  isPriorityFetched: (url: string) => boolean;
  resolveAssetRef: (ref: string) => string;
  ensureCached: (assetId: string, ref: string, signal: AbortSignal) => Promise<number | null>;
  setState: (patch: Partial<MultimediaCoreState>) => void;
}): Promise<void> {
  const { manifest, abort } = input;
  const assets = manifest.assets.slice();
  const total = assets.length;
  if (total === 0) {
    input.setState({ status: 'ready', manifestId: manifest.manifestId, loaded: 0, total: 0, error: null, lastError: null });
    return;
  }
  input.setState({ status: 'loading', manifestId: manifest.manifestId, loaded: 0, total, error: null, lastError: null, attemptsByAsset: {} });
  let nextIndex = 0;
  let loaded = 0;
  const errors: AssetError[] = [];
  const worker = async () => {
    while (!abort.signal.aborted) {
      await input.waitForPriorityResume();
      if (abort.signal.aborted) return;
      const idx = nextIndex; nextIndex += 1;
      if (idx >= assets.length) return;
      const ref = assets[idx];
      const assetId = parseAssetIdFromRef(ref);
      if (!assetId || input.isPriorityFetched(input.resolveAssetRef(ref))) {
        loaded += 1; input.setState({ status: 'loading', manifestId: manifest.manifestId, loaded, total, error: null }); continue;
      }
      try {
        await input.ensureCached(assetId, ref, abort.signal);
        loaded += 1; input.setState({ status: 'loading', manifestId: manifest.manifestId, loaded, total, error: null });
      } catch (err) {
        errors.push(toAssetPreloadError(assetId, err)); return;
      }
    }
  };
  await Promise.all(Array.from({ length: input.concurrency }, () => worker()));
  if (abort.signal.aborted || input.getRunSeq() !== input.runSeq) return;
  if (errors.length > 0) {
    const error = errors[0] ?? toAssetPreloadError('unknown', new Error('asset preload failed'));
    input.setState({ status: 'error', manifestId: manifest.manifestId, loaded, total, error: error.message, lastError: error });
    return;
  }
  input.setState({ status: 'ready', manifestId: manifest.manifestId, loaded: total, total, error: null });
}
