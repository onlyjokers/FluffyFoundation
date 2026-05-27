/**
 * Purpose: Regression tests for manager-side TTS audio asset node dependencies.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createManagerAudioAssetNodeDeps } from './audio-asset-node-deps';

const request = {
  nodeId: 'tts',
  signature: 'tts-signature',
  text: 'hello',
  model: 'qwen3-tts-flash',
  voice: 'Cherry',
  languageType: 'Chinese',
  instructions: '',
  optimizeInstructions: false,
};

test('TTS asset deps allow retrying the same signature after a failed request', async () => {
  const fetchCalls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const storage = new Map<string, string>([['shugu-server-url', 'https://localhost:3001']]);
  const deps = createManagerAudioAssetNodeDeps({
    fetchImpl: async (url, init) => {
      fetchCalls.push({ url: String(url), init });
      if (fetchCalls.length === 1) {
        return new Response(JSON.stringify({ message: 'provider failed' }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ assetId: 'asset-tts-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
    getLocalStorageItem: (key) => storage.get(key) ?? null,
    refreshAssets: async () => {},
  });

  assert.equal(deps.getTtsAudioAsset?.(request), '');
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(deps.getTtsAudioAsset?.(request), '');
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(deps.getTtsAudioAsset?.(request), 'asset-tts-1');
  assert.equal(fetchCalls.length, 2);
  assert.equal(fetchCalls[0].url, 'https://localhost:3001/api/tts/asset');
  assert.equal(fetchCalls[0].init?.credentials, 'include');
  assert.deepEqual(JSON.parse(String(fetchCalls[0].init?.body)), {
    text: 'hello',
    model: 'qwen3-tts-flash',
    voice: 'Cherry',
    languageType: 'Chinese',
    instructions: '',
    optimizeInstructions: false,
  });
});
