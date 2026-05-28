/**
 * Purpose: Unit tests for Aliyun DashScope recorded speech recognition requests.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AliyunSttService } from './aliyun-stt.service.js';

test('AliyunSttService sends audio bytes to qwen3-asr-flash as a base64 data URL and returns recognized text', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const service = new AliyunSttService({
    env: {
      DASHSCOPE_API_KEY: 'sk-test',
      SHUGU_STT_MODEL: 'qwen3-asr-flash',
    },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          output: {
            choices: [{ message: { content: [{ text: '你好世界' }] } }],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    },
  });

  const result = await service.transcribe({
    audioBytes: Buffer.from('audio-data'),
    mimeType: 'audio/webm',
  });

  assert.equal(result.text, '你好世界');
  assert.equal(result.taskId, '');
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'
  );
  assert.equal((calls[0].init?.headers as Record<string, string>).Authorization, 'Bearer sk-test');
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
    model: 'qwen3-asr-flash',
    input: {
      messages: [
        {
          role: 'user',
          content: [
            { audio: `data:audio/webm;base64,${Buffer.from('audio-data').toString('base64')}` },
          ],
        },
      ],
    },
  });
});

test('AliyunSttService rejects empty audio bytes before calling DashScope', async () => {
  const service = new AliyunSttService({
    env: { DASHSCOPE_API_KEY: 'sk-test' },
    fetchImpl: async () => {
      throw new Error('fetch should not be called');
    },
  });

  await assert.rejects(
    () => service.transcribe({ audioBytes: new Uint8Array(), mimeType: 'audio/webm' }),
    /audio bytes are required/
  );
});
