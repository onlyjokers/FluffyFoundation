/**
 * Purpose: Unit tests for TTS request handling and persisted audio asset storage.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { AliyunTtsService } from './aliyun-tts.service.js';
import { AssetsService } from '../assets/assets.service.js';

test('AliyunTtsService posts Qwen3-TTS payload and returns the audio URL', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const service = new AliyunTtsService({
    env: {
      DASHSCOPE_API_KEY: 'sk-test',
      SHUGU_TTS_MODEL: 'qwen3-tts-flash',
      SHUGU_TTS_VOICE: 'Cherry',
    },
    fetchImpl: async (url, init) => {
      assert.ok(init, 'expected request init');
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          output: { audio: { url: 'https://dashscope-result.example/audio.wav' } },
          usage: { input_characters: 2 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    },
  });

  const result = await service.synthesize({
    text: '你好',
    model: '',
    voice: '',
    languageType: 'Chinese',
  });

  assert.equal(result.url, 'https://dashscope-result.example/audio.wav');
  assert.equal(result.mimeType, 'audio/wav');
  assert.deepEqual(result.usage, { input_characters: 2 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer sk-test');
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    model: 'qwen3-tts-flash',
    input: {
      text: '你好',
      voice: 'Cherry',
      language_type: 'Chinese',
    },
  });
});

test('AliyunTtsService rejects missing API key before calling upstream', async () => {
  const service = new AliyunTtsService({
    env: {},
    fetchImpl: async () => {
      throw new Error('fetch should not be called');
    },
  });

  await assert.rejects(
    () => service.synthesize({ text: 'hello' }),
    /DASHSCOPE_API_KEY is not configured/
  );
});

test('AliyunTtsService rejects empty text before calling upstream', async () => {
  const service = new AliyunTtsService({
    env: { DASHSCOPE_API_KEY: 'sk-test' },
    fetchImpl: async () => {
      throw new Error('fetch should not be called');
    },
  });

  await assert.rejects(
    () => service.synthesize({ text: '   ' }),
    /TTS text is required/
  );
});

test('AliyunTtsService uses a custom TTS endpoint when configured', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const service = new AliyunTtsService({
    env: {
      DASHSCOPE_API_KEY: 'sk-test',
      DASHSCOPE_TTS_API_URL: 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
    },
    fetchImpl: async (url, init) => {
      assert.ok(init, 'expected request init');
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ output: { audio: { url: 'https://example.com/audio.wav' } } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  await service.synthesize({ text: 'hello' });

  assert.equal(
    calls[0].url,
    'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'
  );
});

test('AliyunTtsService stores synthesized audio as a deduped asset', async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'shugu-tts-asset-'));
  const previousEnv = {
    ASSET_DATA_DIR: process.env.ASSET_DATA_DIR,
    ASSET_DB_PATH: process.env.ASSET_DB_PATH,
    ASSET_MAX_BYTES: process.env.ASSET_MAX_BYTES,
  };
  process.env.ASSET_DATA_DIR = path.join(tmp, 'assets');
  process.env.ASSET_DB_PATH = path.join(tmp, 'assets-index.json');
  process.env.ASSET_MAX_BYTES = String(1024 * 1024);

  try {
    const audioBytes = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]);
    let upstreamCalls = 0;
    const assets = new AssetsService();
    await assets.init();
    const service = new AliyunTtsService({
      env: {
        DASHSCOPE_API_KEY: 'sk-test',
        SHUGU_TTS_MODEL: 'qwen3-tts-flash',
        SHUGU_TTS_VOICE: 'Cherry',
      },
      fetchImpl: async (url, init) => {
        upstreamCalls += 1;
        if (String(url).includes('dashscope.aliyuncs.com')) {
          assert.ok(init, 'expected DashScope request init');
          return new Response(
            JSON.stringify({
              output: { audio: { url: 'https://dashscope-result.example/audio.wav' } },
              usage: { input_characters: 2 },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        assert.equal(String(url), 'https://dashscope-result.example/audio.wav');
        return new Response(audioBytes, { status: 200, headers: { 'Content-Type': 'audio/wav' } });
      },
    });

    const first = await service.synthesizeAsset({ text: '你好' }, assets);
    const second = await service.synthesizeAsset({ text: '你好' }, assets);

    assert.equal(first.asset.id, second.asset.id);
    assert.equal(first.deduped, false);
    assert.equal(second.deduped, true);
    assert.equal(first.asset.kind, 'audio');
    assert.equal(first.asset.mimeType, 'audio/wav');
    assert.equal(first.asset.originalName, 'tts-qwen3-tts-flash-Cherry.wav');
    assert.equal(upstreamCalls, 2, 'same TTS signature should avoid a second upstream call');
  } finally {
    if (previousEnv.ASSET_DATA_DIR === undefined) delete process.env.ASSET_DATA_DIR;
    else process.env.ASSET_DATA_DIR = previousEnv.ASSET_DATA_DIR;
    if (previousEnv.ASSET_DB_PATH === undefined) delete process.env.ASSET_DB_PATH;
    else process.env.ASSET_DB_PATH = previousEnv.ASSET_DB_PATH;
    if (previousEnv.ASSET_MAX_BYTES === undefined) delete process.env.ASSET_MAX_BYTES;
    else process.env.ASSET_MAX_BYTES = previousEnv.ASSET_MAX_BYTES;
    await fsp.rm(tmp, { recursive: true, force: true });
  }
});
