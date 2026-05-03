/**
 * Purpose: Convert stored Asset Service records into FF-16 manifest and structured error responses.
 */

import {
  createAssetError,
  type AssetError,
  type AssetManifest,
  type AssetPermissions,
} from '@shugu/protocol';
import type { StoredAssetRecord } from './assets.types.js';

export type MissingAssetErrorBody = { error: AssetError };

export function toAssetManifest(
  manifestId: string,
  assets: StoredAssetRecord[],
  updatedAt = Date.now()
): AssetManifest {
  return {
    manifestId,
    updatedAt,
    assets: assets.map((asset) => ({
      id: asset.id,
      checksum: { algorithm: 'sha256', value: asset.sha256 },
      mimeType: asset.mimeType,
      kind: asset.kind,
      sizeBytes: asset.sizeBytes,
      ...(typeof asset.durationMs === 'number' ? { durationMs: asset.durationMs } : {}),
      ...(typeof asset.width === 'number' && typeof asset.height === 'number'
        ? { dimensions: { width: asset.width, height: asset.height } }
        : {}),
      variants: asset.variants,
      cachePolicy: asset.cachePolicy,
      permissions: toAssetPermissions(asset),
    })),
  };
}

function toAssetPermissions(asset: StoredAssetRecord): AssetPermissions {
  if (asset.permissions.scope === 'local-only') {
    return {
      scope: 'local-only',
      localOnlyReason:
        asset.permissions.localOnlyReason ?? 'Local-only asset is not portable across clients.',
      ...(asset.permissions.roles ? { roles: asset.permissions.roles } : {}),
    };
  }
  return {
    scope: 'server-deliverable',
    ...(asset.permissions.roles ? { roles: asset.permissions.roles } : {}),
  };
}

export function cacheControlForAsset(asset: Pick<StoredAssetRecord, 'cachePolicy'>): string {
  const policy = asset.cachePolicy;
  if (policy.strategy === 'no-store') return 'no-store';
  const maxAge = Math.max(0, Math.floor(policy.maxAgeSeconds ?? 0));
  if (policy.strategy === 'immutable') return `public, max-age=${maxAge}, immutable`;
  return `public, max-age=${maxAge}`;
}

export function toMissingAssetErrorBody(assetId: string): MissingAssetErrorBody {
  return {
    error: createAssetError({
      code: 'ASSET_NOT_FOUND',
      assetId,
      message: `asset ${assetId} is not stored by the asset service`,
      retryable: false,
      action: 'Upload the asset, refresh the manifest, or remove the reference before show start.',
    }),
  };
}
