/**
 * Purpose: FF-16 Manager helper for converting asset records into structured manifest entries.
 */

import type { AssetManifestEntry } from '@shugu/protocol';

export type ManifestAssetRecord = {
  id: string;
  kind: 'audio' | 'image' | 'video' | 'model';
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  durationMs?: number;
  width?: number;
  height?: number;
  variants?: unknown[];
  cachePolicy?: unknown;
  permissions?: unknown;
};

export function buildManifestEntries(
  refs: string[],
  recordByAssetId: Map<string, ManifestAssetRecord>,
  assetIdFromRef: (ref: string) => string | null
): AssetManifestEntry[] {
  const entries: AssetManifestEntry[] = [];
  for (const ref of refs) {
    const id = assetIdFromRef(ref);
    if (!id) continue;
    const record = recordByAssetId.get(id);
    if (!record) continue;
    entries.push({
      id,
      checksum: { algorithm: 'sha256', value: record.sha256 },
      mimeType: record.mimeType,
      kind: record.kind,
      sizeBytes: record.sizeBytes,
      ...(typeof record.durationMs === 'number' ? { durationMs: record.durationMs } : {}),
      ...(typeof record.width === 'number' && typeof record.height === 'number'
        ? { dimensions: { width: record.width, height: record.height } }
        : {}),
      variants: Array.isArray(record.variants) ? (record.variants as AssetManifestEntry['variants']) : [],
      cachePolicy: normalizeCachePolicy(record.cachePolicy),
      permissions: normalizePermissions(record.permissions),
    });
  }
  return entries;
}

function normalizeCachePolicy(raw: unknown): AssetManifestEntry['cachePolicy'] {
  if (!raw || typeof raw !== 'object') return { strategy: 'immutable', maxAgeSeconds: 31536000 };
  const record = raw as Record<string, unknown>;
  const strategy = record.strategy;
  if (strategy === 'revalidate' || strategy === 'no-store') {
    return { strategy, ...(typeof record.maxAgeSeconds === 'number' ? { maxAgeSeconds: record.maxAgeSeconds } : {}) };
  }
  return {
    strategy: 'immutable',
    ...(typeof record.maxAgeSeconds === 'number' ? { maxAgeSeconds: record.maxAgeSeconds } : { maxAgeSeconds: 31536000 }),
  };
}

function normalizePermissions(raw: unknown): AssetManifestEntry['permissions'] {
  if (!raw || typeof raw !== 'object') return { scope: 'server-deliverable' };
  const record = raw as Record<string, unknown>;
  if (record.scope === 'local-only') {
    const localOnlyReason =
      typeof record.localOnlyReason === 'string' && record.localOnlyReason.trim()
        ? record.localOnlyReason.trim()
        : 'local media path is not portable across devices';
    return { scope: 'local-only', localOnlyReason };
  }
  return { scope: 'server-deliverable' };
}
