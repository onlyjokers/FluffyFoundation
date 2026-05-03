/**
 * Purpose: FF-16 defaults for server-deliverable asset manifest fields.
 */

import type { AssetRecord } from './assets.types.js';

export function defaultAssetVariants(): AssetRecord['variants'] {
  return [];
}

export function defaultAssetCachePolicy(): AssetRecord['cachePolicy'] {
  return { strategy: 'immutable', maxAgeSeconds: 31536000 };
}

export function defaultAssetPermissions(): AssetRecord['permissions'] {
  return { scope: 'server-deliverable' };
}

export function defaultAssetRecordFields(): Pick<AssetRecord, 'variants' | 'cachePolicy' | 'permissions'> {
  return { variants: defaultAssetVariants(), cachePolicy: defaultAssetCachePolicy(), permissions: defaultAssetPermissions() };
}
