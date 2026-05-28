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

test('image asset deps stores stable asset ids from versioned asset refs', async () => {
  const storage = new Map<string, string>([['shugu-server-url', 'https://localhost:3001']]);
  const deps = createManagerImageAssetNodeDeps({
    fetchImpl: async () =>
      new Response(JSON.stringify({ assetRef: 'asset:generated-image?v=4#fit=cover' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    getLocalStorageItem: (key) => storage.get(key) ?? null,
    refreshAssets: async () => {},
  });
  const request = {
    prompt: 'a cybernetic flower',
    model: 'gpt-image-2',
  };

  assert.equal(deps.getGeneratedImageAsset?.(request), '');
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(deps.peekGeneratedImageAsset?.(request), 'generated-image');
  assert.equal(deps.getGeneratedImageAsset?.(request), 'generated-image');
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

test('image asset deps force option posts a fresh request for the same signature', async () => {
  const fetchCalls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const storage = new Map<string, string>([['shugu-server-url', 'https://localhost:3001']]);
  const deps = createManagerImageAssetNodeDeps({
    fetchImpl: async (url, init) => {
      fetchCalls.push({ url: String(url), init });
      const assetId = `generated-image-${fetchCalls.length}`;
      return new Response(JSON.stringify({ assetId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
    getLocalStorageItem: (key) => storage.get(key) ?? null,
    refreshAssets: async () => {},
  });
  const request = {
    prompt: 'a cybernetic flower',
    model: 'gpt-image-2',
  };

  assert.equal(deps.getGeneratedImageAsset?.(request), '');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(deps.getGeneratedImageAsset?.(request), 'generated-image-1');

  assert.equal(deps.getGeneratedImageAsset?.(request, { force: true }), '');
  assert.equal(fetchCalls.length, 2);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(deps.getGeneratedImageAsset?.(request), 'generated-image-2');
});

test('image asset deps tracks async generation jobs by request id', async () => {
  let resolveFirst: ((response: Response) => void) | null = null;
  let resolveSecond: ((response: Response) => void) | null = null;
  const fetchCalls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const storage = new Map<string, string>([['shugu-server-url', 'https://localhost:3001']]);
  const deps = createManagerImageAssetNodeDeps({
    fetchImpl: async (url, init) => {
      fetchCalls.push({ url: String(url), init });
      return new Promise<Response>((resolve) => {
        if (fetchCalls.length === 1) resolveFirst = resolve;
        else resolveSecond = resolve;
      });
    },
    getLocalStorageItem: (key) => storage.get(key) ?? null,
    refreshAssets: async () => {},
  });
  const request = {
    prompt: 'a cybernetic flower',
    model: 'gpt-image-2',
  };

  assert.equal(deps.getGeneratedImageAsset?.(request, { requestId: 'job-1', force: true }), '');
  assert.equal(deps.getGeneratedImageAsset?.(request, { requestId: 'job-1' }), '');
  assert.equal(fetchCalls.length, 1);

  assert.equal(deps.getGeneratedImageAsset?.(request, { requestId: 'job-2', force: true }), '');
  assert.equal(fetchCalls.length, 2);

  resolveSecond?.(
    new Response(JSON.stringify({ assetId: 'generated-image-2' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  );
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(deps.peekGeneratedImageAsset?.(request, { requestId: 'job-1' }), '');
  assert.equal(deps.peekGeneratedImageAsset?.(request, { requestId: 'job-2' }), 'generated-image-2');

  resolveFirst?.(
    new Response(JSON.stringify({ assetId: 'generated-image-1' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  );
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(deps.peekGeneratedImageAsset?.(request, { requestId: 'job-1' }), 'generated-image-1');
  assert.equal(deps.peekGeneratedImageAsset?.(request, { requestId: 'job-2' }), 'generated-image-2');
});

test('image asset deps notifies when an async generation job becomes ready', async () => {
  const readyAssets: string[] = [];
  const events: string[] = [];
  const storage = new Map<string, string>([['shugu-server-url', 'https://localhost:3001']]);
  const deps = createManagerImageAssetNodeDeps({
    fetchImpl: async () =>
      new Response(JSON.stringify({ assetId: 'generated-image-ready' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    getLocalStorageItem: (key) => storage.get(key) ?? null,
    refreshAssets: async () => {
      events.push('refresh');
    },
    onAssetReady: (assetId) => {
      readyAssets.push(assetId);
      events.push(`ready:${assetId}`);
    },
  });

  assert.equal(
    deps.getGeneratedImageAsset?.(
      {
        prompt: 'a cybernetic flower',
        model: 'gpt-image-2',
      },
      { requestId: 'job-ready', force: true }
    ),
    ''
  );
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(readyAssets, ['generated-image-ready']);
  assert.deepEqual(events, ['ready:generated-image-ready', 'refresh']);
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
