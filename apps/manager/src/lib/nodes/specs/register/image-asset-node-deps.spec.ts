/**
 * Purpose: Regression tests for manager-side GPT image asset node dependencies.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createManagerImageAssetNodeDeps } from './image-asset-node-deps';

test('image asset deps posts generation requests with asset write token and refreshes assets', async () => {
  const fetchCalls: Array<{ url: string; init: RequestInit | undefined }> = [];
  let refreshCalls = 0;
  const storage = new Map<string, string>([
    ['shugu-server-url', 'https://localhost:3001'],
    ['shugu-asset-write-token', 'write-token'],
  ]);
  const deps = createManagerImageAssetNodeDeps({
    fetchImpl: async (url, init) => {
      fetchCalls.push({ url: String(url), init });
      return new Response(JSON.stringify({ assetId: 'generated-image', assetRef: 'asset:generated-image' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
    getLocalStorageItem: (key) => storage.get(key) ?? null,
    refreshAssets: async () => {
      refreshCalls += 1;
    },
  });

  const first = deps.getGeneratedImageAsset?.({
    prompt: 'a cybernetic flower',
    image: 'asset:source',
    model: 'gpt-image-2',
    size: '1024x1024',
    quality: 'low',
  });

  assert.equal(first, '');
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, 'https://localhost:3001/api/ai/image/asset');
  assert.equal((fetchCalls[0].init?.headers as Record<string, string>).Authorization, 'Bearer write-token');
  assert.deepEqual(JSON.parse(String(fetchCalls[0].init?.body)), {
    prompt: 'a cybernetic flower',
    image: 'asset:source',
    model: 'gpt-image-2',
    size: '1024x1024',
    quality: 'low',
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  const second = deps.getGeneratedImageAsset?.({
    prompt: 'a cybernetic flower',
    image: 'asset:source',
    model: 'gpt-image-2',
    size: '1024x1024',
    quality: 'low',
  });
  assert.equal(second, 'generated-image');
  assert.equal(refreshCalls, 1);
});

test('image asset deps posts generation requests with manager session cookies when no write token is configured', () => {
  const fetchCalls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const storage = new Map<string, string>([['shugu-server-url', 'https://localhost:3001']]);
  const deps = createManagerImageAssetNodeDeps({
    fetchImpl: async (url, init) => {
      fetchCalls.push({ url: String(url), init });
      return new Response(JSON.stringify({ assetId: 'generated-image' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
    getLocalStorageItem: (key) => storage.get(key) ?? null,
    refreshAssets: async () => {},
  });

  const result = deps.getGeneratedImageAsset?.({
    prompt: 'a cybernetic flower',
    model: 'gpt-image-2',
  });

  assert.equal(result, '');
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, 'https://localhost:3001/api/ai/image/asset');
  assert.equal(fetchCalls[0].init?.credentials, 'include');
  assert.equal((fetchCalls[0].init?.headers as Record<string, string>).Authorization, undefined);
});

test('image asset deps does not request without server URL', () => {
  let fetchCalled = false;
  const deps = createManagerImageAssetNodeDeps({
    fetchImpl: async () => {
      fetchCalled = true;
      throw new Error('fetch should not be called');
    },
    getLocalStorageItem: () => null,
    refreshAssets: async () => {},
  });

  const result = deps.getGeneratedImageAsset?.({
    prompt: 'a cybernetic flower',
    model: 'gpt-image-2',
  });

  assert.equal(result, '');
  assert.equal(fetchCalled, false);
});
