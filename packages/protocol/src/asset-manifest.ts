/**
 * Purpose: FF-16 asset manifest and structured asset/readiness error contracts.
 */

export type AssetKind = 'audio' | 'image' | 'video' | 'model';
export type AssetChecksum = { algorithm: 'sha256'; value: string };
export type AssetCachePolicy = {
  strategy: 'immutable' | 'revalidate' | 'no-store';
  maxAgeSeconds?: number;
};
export type AssetPermissions =
  | { scope: 'server-deliverable'; roles?: string[] }
  | { scope: 'local-only'; localOnlyReason: string; roles?: string[] };

export type AssetVariant = {
  id: string;
  assetId: string;
  mimeType: string;
  width?: number;
  height?: number;
  durationMs?: number;
};

export type AssetManifestEntry = {
  id: string;
  checksum: AssetChecksum;
  mimeType: string;
  kind: AssetKind;
  sizeBytes: number;
  durationMs?: number;
  dimensions?: { width: number; height: number };
  variants: AssetVariant[];
  cachePolicy: AssetCachePolicy;
  permissions: AssetPermissions;
};

export type AssetManifest = {
  manifestId: string;
  updatedAt: number;
  assets: AssetManifestEntry[];
};

export type AssetErrorCode =
  | 'ASSET_MANIFEST_INVALID'
  | 'ASSET_NOT_FOUND'
  | 'ASSET_PRELOAD_TIMEOUT'
  | 'ASSET_PRELOAD_FAILED'
  | 'ASSET_PERMISSION_DENIED'
  | 'ASSET_LOCAL_ONLY';

export type AssetError = {
  code: AssetErrorCode;
  assetId?: string;
  message: string;
  retryable: boolean;
  action: string;
};

export type AssetManifestValidationResult =
  | { ok: true; manifest: AssetManifest; errors: [] }
  | { ok: false; manifest?: undefined; errors: AssetError[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isAssetKind(value: unknown): value is AssetKind {
  return value === 'audio' || value === 'image' || value === 'video' || value === 'model';
}

function isSha256(value: unknown): boolean {
  return typeof value === 'string' && /^[a-fA-F0-9]{64}$/.test(value.trim());
}

export function createAssetError(input: AssetError): AssetError {
  return {
    code: input.code,
    ...(input.assetId ? { assetId: input.assetId } : {}),
    message: input.message,
    retryable: input.retryable,
    action: input.action,
  };
}

export function validateAssetManifest(input: unknown): AssetManifestValidationResult {
  const errors: AssetError[] = [];
  if (!isRecord(input)) {
    return {
      ok: false,
      errors: [
        createManifestError('asset manifest must be an object', 'Regenerate the manifest with manifestId, updatedAt, and assets.'),
      ],
    };
  }

  const manifestId = typeof input.manifestId === 'string' ? input.manifestId.trim() : '';
  const updatedAt = typeof input.updatedAt === 'number' && Number.isFinite(input.updatedAt) ? input.updatedAt : 0;
  const rawAssets = Array.isArray(input.assets) ? input.assets : null;

  if (!manifestId) errors.push(createManifestError('asset manifest is missing manifestId'));
  if (!updatedAt) errors.push(createManifestError('asset manifest is missing updatedAt'));
  if (!rawAssets) errors.push(createManifestError('asset manifest assets must be an array'));

  const assets: AssetManifestEntry[] = [];
  for (const raw of rawAssets ?? []) {
    const record = isRecord(raw) ? raw : {};
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    const kind = record.kind;
    const checksum = isRecord(record.checksum) ? record.checksum : {};
    const permissions = isRecord(record.permissions) ? record.permissions : {};
    const scope = permissions.scope;
    const variants = Array.isArray(record.variants) ? (record.variants as AssetVariant[]) : [];
    const startErrorCount = errors.length;

    if (!id) errors.push(createManifestError('asset entry is missing id'));
    if (!isRecord(record.checksum) || checksum.algorithm !== 'sha256' || !isSha256(checksum.value)) {
      errors.push(createManifestError(`asset ${id || '(unknown)'} requires sha256 checksum`));
    }
    if (typeof record.mimeType !== 'string' || !record.mimeType.trim()) {
      errors.push(createManifestError(`asset ${id || '(unknown)'} requires mimeType`));
    }
    if (!isAssetKind(kind)) errors.push(createManifestError(`asset ${id || '(unknown)'} requires kind`));
    if (typeof record.sizeBytes !== 'number' || !Number.isFinite(record.sizeBytes) || record.sizeBytes < 0) {
      errors.push(createManifestError(`asset ${id || '(unknown)'} requires sizeBytes`));
    }
    if (scope === 'local-only') {
      const reason = typeof permissions.localOnlyReason === 'string' ? permissions.localOnlyReason.trim() : '';
      if (!reason) errors.push(createManifestError(`asset ${id || '(unknown)'} local-only permission requires localOnlyReason`));
    } else if (scope !== 'server-deliverable') {
      errors.push(createManifestError(`asset ${id || '(unknown)'} requires permissions.scope`));
    }
    if (!isRecord(record.cachePolicy)) errors.push(createManifestError(`asset ${id || '(unknown)'} requires cachePolicy`));

    if (errors.length === startErrorCount) {
      assets.push({
        id,
        checksum: { algorithm: 'sha256', value: String(checksum.value).trim().toLowerCase() },
        mimeType: String(record.mimeType).trim(),
        kind: kind as AssetKind,
        sizeBytes: record.sizeBytes as number,
        ...(typeof record.durationMs === 'number' ? { durationMs: record.durationMs } : {}),
        ...(isRecord(record.dimensions) &&
        typeof record.dimensions.width === 'number' &&
        typeof record.dimensions.height === 'number'
          ? { dimensions: { width: record.dimensions.width, height: record.dimensions.height } }
          : {}),
        variants,
        cachePolicy: record.cachePolicy as AssetCachePolicy,
        permissions: permissions as AssetPermissions,
      });
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, manifest: { manifestId, updatedAt, assets }, errors: [] };
}

function createManifestError(message: string, action = 'Fix the asset manifest before arming preload/readiness.'): AssetError {
  return createAssetError({
    code: 'ASSET_MANIFEST_INVALID',
    message,
    retryable: false,
    action,
  });
}
