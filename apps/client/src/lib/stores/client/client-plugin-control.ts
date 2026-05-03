/**
 * Purpose: FF-16 client plugin-control helpers for asset manifest configuration.
 */

import type { MultimediaCore } from '@shugu/multimedia-core';

type AnyRecord = Record<string, unknown>;

export function applyMultimediaManifestPayload(
  payload: AnyRecord | undefined,
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
