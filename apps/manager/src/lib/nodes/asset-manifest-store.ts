/**
 * Purpose: Shared latest asset-manifest snapshot for Manager.
 *
 * Used by:
 * - `apps/manager/src/lib/nodes/asset-manifest.ts` (graph scan + server push)
 * - Local Display bridge (Phase 6): send manifest over MessagePort after pairing
 */

import { get, writable } from 'svelte/store';

export type AssetManifest = {
  manifestId: string;
  assets: string[];
  updatedAt: number;
  entries?: unknown[];
};

export const assetManifestStore = writable<AssetManifest | null>(null);

export function setLatestManifest(manifest: AssetManifest | null): void {
  assetManifestStore.set(manifest);
}

export function getLatestManifest(): AssetManifest | null {
  return get(assetManifestStore);
}

export function subscribeLatestManifest(cb: (manifest: AssetManifest | null) => void): () => void {
  return assetManifestStore.subscribe(cb);
}
