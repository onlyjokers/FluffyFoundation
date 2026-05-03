/**
 * Purpose: FF-16 contract tests for asset manifest validation and structured asset errors.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createAssetError,
  validateAssetManifest,
  type AssetManifest,
} from './asset-manifest.js';

const validManifest: AssetManifest = {
  manifestId: 'show-a',
  updatedAt: 1710000000000,
  assets: [
    {
      id: 'img-1',
      checksum: { algorithm: 'sha256', value: 'a'.repeat(64) },
      mimeType: 'image/png',
      kind: 'image',
      sizeBytes: 12,
      dimensions: { width: 2, height: 3 },
      variants: [{ id: 'thumb', assetId: 'img-1-thumb', mimeType: 'image/webp', width: 1, height: 1 }],
      cachePolicy: { strategy: 'immutable', maxAgeSeconds: 31536000 },
      permissions: { scope: 'server-deliverable' },
    },
  ],
};

test('validateAssetManifest accepts a complete FF-16 manifest', () => {
  const result = validateAssetManifest(validManifest);

  assert.equal(result.ok, true);
  assert.equal(result.manifest?.assets[0]?.id, 'img-1');
  assert.equal(result.manifest?.assets[0]?.cachePolicy.strategy, 'immutable');
});

test('validateAssetManifest rejects local-only assets without explicit localOnly reason', () => {
  const result = validateAssetManifest({
    ...validManifest,
    assets: [{ ...validManifest.assets[0]!, permissions: { scope: 'local-only' } }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors[0]?.code, 'ASSET_MANIFEST_INVALID');
  assert.match(result.errors[0]?.message ?? '', /localOnlyReason/);
});

test('createAssetError produces actionable missing-asset errors', () => {
  const error = createAssetError({
    code: 'ASSET_NOT_FOUND',
    assetId: 'missing-video',
    message: 'asset missing-video is not in the manifest',
    retryable: false,
    action: 'Upload the asset or remove the reference before show start.',
  });

  assert.deepEqual(error, {
    code: 'ASSET_NOT_FOUND',
    assetId: 'missing-video',
    message: 'asset missing-video is not in the manifest',
    retryable: false,
    action: 'Upload the asset or remove the reference before show start.',
  });
});
