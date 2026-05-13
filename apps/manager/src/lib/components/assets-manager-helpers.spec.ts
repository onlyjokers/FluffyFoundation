import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AssetRecord } from '$lib/stores/assets';
import {
  formatAssetBytes,
  getFileExt,
  getFilteredSortedAssets,
  inferAssetKindFromFileLike,
  parseTagFilter,
  shortAssetId,
} from './assets-manager-helpers';

const baseAsset = (overrides: Partial<AssetRecord>): AssetRecord => ({
  id: 'asset-default',
  kind: 'audio',
  mimeType: 'audio/wav',
  sizeBytes: 1024,
  sha256: 'sha-default',
  originalName: 'Default.wav',
  tags: [],
  description: '',
  createdAt: 100,
  updatedAt: 100,
  variants: [],
  cachePolicy: { strategy: 'immutable' },
  permissions: { scope: 'server-deliverable' },
  ...overrides,
});

test('asset helpers preserve file extension, id, byte, and inferred-kind behavior', () => {
  assert.equal(getFileExt('clip.LOOP.wav?token=1'), 'wav');
  assert.equal(getFileExt('.hidden'), '');
  assert.equal(shortAssetId('abcdef1234567890'), 'abcdef…7890');
  assert.equal(formatAssetBytes(1536), '1.5 KB');
  assert.equal(inferAssetKindFromFileLike({ name: 'poster.webp', type: '' }), 'image');
  assert.equal(inferAssetKindFromFileLike({ name: 'weights.gguf', type: '' }), 'model');
});

test('asset helpers keep query, advanced filters, and kind-grouped sort semantics', () => {
  const assets = [
    baseAsset({
      id: 'audio-old',
      kind: 'audio',
      originalName: 'Kick.wav',
      sha256: 'sha-kick',
      tags: ['loop', 'Drum'],
      createdAt: 10,
      sizeBytes: 3 * 1024 * 1024,
    }),
    baseAsset({
      id: 'image-new',
      kind: 'image',
      mimeType: 'image/png',
      originalName: 'Poster.PNG',
      sha256: 'sha-poster',
      tags: ['visual'],
      createdAt: 30,
      sizeBytes: 2 * 1024 * 1024,
    }),
    baseAsset({
      id: 'audio-new',
      kind: 'audio',
      originalName: 'Bass.wav',
      sha256: 'sha-bass',
      tags: ['Loop'],
      createdAt: 20,
      sizeBytes: 1 * 1024 * 1024,
    }),
  ];

  assert.deepEqual(parseTagFilter('Loop, loop\nDrum'), ['Loop', 'Drum']);

  const filtered = getFilteredSortedAssets(assets, {
    query: 'loop',
    filterKind: 'all',
    filterFileType: 'wav',
    filterTags: 'loop',
    uploadedAfter: '',
    uploadedBefore: '',
    sizeMinMb: '',
    sizeMaxMb: '',
    sortMode: 'kind-newest',
  });

  assert.deepEqual(
    filtered.map((asset) => asset.id),
    ['audio-new', 'audio-old']
  );
});
