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

test('TTS asset deps can peek completed requests without starting a fetch', async () => {
  const fetchCalls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const storage = new Map<string, string>([['shugu-server-url', 'https://localhost:3001']]);
  const isolatedRequest = {
    ...request,
    nodeId: 'tts-peek',
    signature: 'tts-peek-signature',
  };
  const deps = createManagerAudioAssetNodeDeps({
    fetchImpl: async (url, init) => {
      fetchCalls.push({ url: String(url), init });
      return new Response(JSON.stringify({ assetId: 'asset-tts-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
    getLocalStorageItem: (key) => storage.get(key) ?? null,
    refreshAssets: async () => {},
  });

  assert.equal(deps.peekTtsAudioAsset?.(isolatedRequest), '');
  assert.equal(fetchCalls.length, 0);

  assert.equal(deps.getTtsAudioAsset?.(isolatedRequest), '');
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(deps.peekTtsAudioAsset?.(isolatedRequest), 'asset-tts-1');
  assert.equal(fetchCalls.length, 1);
});

test('TTS asset deps notify when a generated asset becomes ready', async () => {
  const readyAssets: string[] = [];
  const storage = new Map<string, string>([['shugu-server-url', 'https://localhost:3001']]);
  const isolatedRequest = {
    ...request,
    nodeId: 'tts-ready',
    signature: 'tts-ready-signature',
  };
  const deps = createManagerAudioAssetNodeDeps({
    fetchImpl: async () =>
      new Response(JSON.stringify({ assetId: 'asset-tts-ready' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    getLocalStorageItem: (key) => storage.get(key) ?? null,
    refreshAssets: async () => {},
    onAssetReady: (assetId) => {
      readyAssets.push(assetId);
    },
  });

  assert.equal(deps.getTtsAudioAsset?.(isolatedRequest), '');
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(readyAssets, ['asset-tts-ready']);
  assert.equal(deps.peekTtsAudioAsset?.(isolatedRequest), 'asset-tts-ready');
});

test('STT deps request transcription text and notify when ready', async () => {
  const readyAssets: string[] = [];
  const fetchCalls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const storage = new Map<string, string>([['shugu-server-url', 'https://localhost:3001']]);
  const deps = createManagerAudioAssetNodeDeps({
    fetchImpl: async (url, init) => {
      fetchCalls.push({ url: String(url), init });
      return new Response(JSON.stringify({ text: 'recognized speech' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
    getLocalStorageItem: (key) => storage.get(key) ?? null,
    refreshAssets: async () => {},
    onAssetReady: (assetId) => {
      readyAssets.push(assetId);
    },
  });

  const sttRequest = {
    nodeId: 'stt',
    signature: 'stt-signature',
    assetId: 'recording-1',
    model: 'qwen3-asr-flash',
  };

  assert.equal(deps.getSpeechToText?.(sttRequest), '');
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(deps.peekSpeechToText?.(sttRequest), 'recognized speech');
  assert.deepEqual(readyAssets, ['stt:stt']);
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, 'https://localhost:3001/api/stt/transcribe');
  assert.deepEqual(JSON.parse(String(fetchCalls[0].init?.body)), {
    assetId: 'recording-1',
    model: 'qwen3-asr-flash',
  });
});
