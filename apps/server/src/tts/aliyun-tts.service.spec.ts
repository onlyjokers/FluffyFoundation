/**
 * Purpose: Unit tests for Aliyun TTS request/response handling.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AliyunTtsService } from './aliyun-tts.service.js';

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
