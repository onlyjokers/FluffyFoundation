/**
 * Purpose: Normalize asset metadata responses into safe typed objects.
 */
export type ParsedAssetMeta = {
  sha256: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
};

export type ParsedAssetManifest = {
  manifestId: string;
  assets: string[];
  updatedAt: number;
};

export function parseAssetShaResponse(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const raw = (value as { sha256?: unknown }).sha256;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

export function parseAssetMetaResponse(value: unknown): ParsedAssetMeta {
  if (!value || typeof value !== 'object') {
    return { sha256: null, mimeType: null, sizeBytes: null };
  }
  const raw = value as { sha256?: unknown; mimeType?: unknown; sizeBytes?: unknown };
  const shaRaw = typeof raw.sha256 === 'string' ? raw.sha256.trim() : '';
  const mimeRaw = typeof raw.mimeType === 'string' ? raw.mimeType.trim() : '';
  const sizeRaw = raw.sizeBytes;
  const sizeBytes = typeof sizeRaw === 'number' && Number.isFinite(sizeRaw) ? Math.max(0, sizeRaw) : null;
  return {
    sha256: shaRaw || null,
    mimeType: mimeRaw || null,
    sizeBytes,
  };
}

export function parseStoredManifest(value: unknown): ParsedAssetManifest | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as { manifestId?: unknown; assets?: unknown; updatedAt?: unknown };
  const manifestId = typeof raw.manifestId === 'string' ? raw.manifestId : '';
  if (!manifestId) return null;
  const assets = Array.isArray(raw.assets) ? raw.assets.map(String) : [];
  const updatedAtRaw = raw.updatedAt;
  const updatedAt = typeof updatedAtRaw === 'number' && Number.isFinite(updatedAtRaw) ? updatedAtRaw : Date.now();
  return { manifestId, assets, updatedAt };
}
