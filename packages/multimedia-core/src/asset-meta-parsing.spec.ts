/**
 * Purpose: Regression tests for asset metadata parsing helpers.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  parseAssetMetaResponse,
  parseAssetShaResponse,
  parseStoredManifest,
} from './asset-meta-parsing.js';

test('parseAssetShaResponse returns trimmed sha when present', () => {
  assert.equal(parseAssetShaResponse({ sha256: ' abc ' }), 'abc');
  assert.equal(parseAssetShaResponse({ sha256: '' }), null);
});

test('parseAssetMetaResponse returns nulls for invalid shape', () => {
  assert.deepEqual(parseAssetMetaResponse({}), {
    sha256: null,
    mimeType: null,
    sizeBytes: null,
  });
});

test('parseAssetMetaResponse returns typed values', () => {
  assert.deepEqual(parseAssetMetaResponse({ sha256: 'a', mimeType: 'image/png', sizeBytes: 12 }), {
    sha256: 'a',
    mimeType: 'image/png',
    sizeBytes: 12,
  });
});

test('parseStoredManifest returns null for invalid input', () => {
  assert.equal(parseStoredManifest(null), null);
  assert.equal(parseStoredManifest({}), null);
});

test('parseStoredManifest returns normalized manifest', () => {
  const parsed = parseStoredManifest({ manifestId: 'm1', assets: ['a', 2], updatedAt: 123 });
  assert.deepEqual(parsed, { manifestId: 'm1', assets: ['a', '2'], updatedAt: 123 });
});
