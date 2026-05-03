/**
 * Purpose: FF-16 Display helper for applying structured multimedia asset manifests.
 */

import type { MultimediaCore } from '@shugu/multimedia-core';

export function applyDisplayAssetManifest(
  payload: Record<string, unknown> | undefined,
  getMultimediaCore: () => MultimediaCore | null
): void {
  const snapshot = payload ?? {};
  const manifestId = typeof snapshot.manifestId === 'string' ? snapshot.manifestId : '';
  const assets = Array.isArray(snapshot.assets) ? snapshot.assets.map(String) : [];
  const entries = Array.isArray(snapshot.entries) ? snapshot.entries : [];
  const updatedAt =
    typeof snapshot.updatedAt === 'number' && Number.isFinite(snapshot.updatedAt) ? snapshot.updatedAt : undefined;
  if (!manifestId) return;
  getMultimediaCore()?.setAssetManifest({ manifestId, assets, entries, updatedAt });
}
