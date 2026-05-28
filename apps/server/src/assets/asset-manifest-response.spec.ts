/**
 * Purpose: FF-16 tests for server asset manifest projection and actionable missing-asset responses.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { StoredAssetRecord } from './assets.types.js';
import {
  toAssetManifest,
  toMissingAssetErrorBody,
  cacheControlForAsset,
} from './asset-manifest-response.js';

const baseStoredAsset: StoredAssetRecord = {
  id: 'asset-image',
  kind: 'image',
  mimeType: 'image/png',
  sizeBytes: 4,
  sha256: 'd'.repeat(64),
  originalName: 'fixture.png',
  createdAt: 1710000000000,
  updatedAt: 1710000000000,
  durationMs: 1200,
  width: 2,
  height: 3,
  variants: [
    { id: 'thumb', assetId: 'asset-image-thumb', mimeType: 'image/webp', width: 1, height: 1 },
  ],
  cachePolicy: { strategy: 'revalidate', maxAgeSeconds: 60 },
  permissions: { scope: 'server-deliverable', roles: ['manager'] },
  source: 'manager-upload',
  autoDiscardable: false,
  storageBackend: 'localfs',
  storageKey: 'd'.repeat(64),
};

test('toAssetManifest projects stored records into the stable FF-16 manifest contract', () => {
  const manifest = toAssetManifest('show-assets', [baseStoredAsset], 1710000001111);

  assert.deepEqual(manifest, {
    manifestId: 'show-assets',
    updatedAt: 1710000001111,
    assets: [
      {
        id: 'asset-image',
        checksum: { algorithm: 'sha256', value: 'd'.repeat(64) },
        mimeType: 'image/png',
        kind: 'image',
        sizeBytes: 4,
        durationMs: 1200,
        dimensions: { width: 2, height: 3 },
        variants: [
          {
            id: 'thumb',
            assetId: 'asset-image-thumb',
            mimeType: 'image/webp',
            width: 1,
            height: 1,
          },
        ],
        cachePolicy: { strategy: 'revalidate', maxAgeSeconds: 60 },
        permissions: { scope: 'server-deliverable', roles: ['manager'] },
      },
    ],
  });
});

test('cacheControlForAsset follows each asset cache policy', () => {
  assert.equal(cacheControlForAsset(baseStoredAsset), 'public, max-age=60');
  assert.equal(
    cacheControlForAsset({
      ...baseStoredAsset,
      cachePolicy: { strategy: 'immutable', maxAgeSeconds: 10 },
    }),
    'public, max-age=10, immutable'
  );
  assert.equal(
    cacheControlForAsset({ ...baseStoredAsset, cachePolicy: { strategy: 'no-store' } }),
    'no-store'
  );
});

test('toMissingAssetErrorBody returns an actionable structured asset error', () => {
  assert.deepEqual(toMissingAssetErrorBody('missing-audio'), {
    error: {
      code: 'ASSET_NOT_FOUND',
      assetId: 'missing-audio',
      message: 'asset missing-audio is not stored by the asset service',
      retryable: false,
      action: 'Upload the asset, refresh the manifest, or remove the reference before show start.',
    },
  });
});
