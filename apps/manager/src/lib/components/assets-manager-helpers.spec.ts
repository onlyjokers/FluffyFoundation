import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AssetRecord } from '$lib/stores/assets';
import {
  formatAssetBytes,
  formatAssetSourceLabel,
  formatCapacityPercent,
  getFileExt,
  getFilteredSortedAssets,
  inferAssetKindFromFileLike,
  parseTagFilter,
  pruneAssetSelection,
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
  assert.equal(formatCapacityPercent(5, 10), 50);
  assert.equal(formatCapacityPercent(5, 0), 0);
  assert.equal(formatAssetSourceLabel('ai-image'), 'AI Image');
  assert.equal(formatAssetSourceLabel('manager-upload'), 'Manager Upload');
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

test('asset helper prunes stale selected asset ids after refresh', () => {
  const next = pruneAssetSelection(new Set(['keep', 'deleted', 'also-keep']), [
    baseAsset({ id: 'keep' }),
    baseAsset({ id: 'also-keep' }),
  ]);

  assert.deepEqual(Array.from(next), ['keep', 'also-keep']);
});

test('asset helper keeps selected asset set identity when no ids are stale', () => {
  const selected = new Set(['keep']);
  const next = pruneAssetSelection(selected, [baseAsset({ id: 'keep' })]);

  assert.equal(next, selected);
});
