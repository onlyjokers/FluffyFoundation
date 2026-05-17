/**
 * Purpose: Verify the OpenAI-compatible AI client builds the right request, redacts secrets, and parses JSON output.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createOpenAiCompatibleClient } from '../dist-ai-core/index.js';

const baseConfig = {
  baseUrl: 'https://code.b886.top/v1',
  apiKey: 'sk-test-secret-123',
  model: 'gpt-5.5',
};

test('createOpenAiCompatibleClient posts gpt-5.5 to chat completions with schema mode and redacted logging', async () => {
  const calls = [];
  const logs = [];
  const client = createOpenAiCompatibleClient({
    ...baseConfig,
    fetchImpl: async (url, init) => {
      calls.push({
        url,
        init: {
          ...init,
          body: typeof init?.body === 'string' ? init.body : String(init?.body ?? ''),
        },
      });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: '{"ok":true,"message":"hello"}' } }],
        }),
        text: async () => '{"choices":[{"message":{"content":"{\\"ok\\":true,\\"message\\":\\"hello\\"}"}}]}',
      };
    },
    logger: (event) => logs.push(event),
  });

  const result = await client.completeJson({
    messages: [{ role: 'user', content: 'Say hello' }],
    schema: {
      name: 'ai_reply',
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean' },
          message: { type: 'string' },
        },
        required: ['ok', 'message'],
      },
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://code.b886.top/v1/chat/completions');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer sk-test-secret-123');
  assert.equal(JSON.parse(calls[0].init.body).model, 'gpt-5.5');
  assert.deepEqual(JSON.parse(calls[0].init.body).messages, [{ role: 'user', content: 'Say hello' }]);
  assert.deepEqual(JSON.parse(calls[0].init.body).response_format, {
    type: 'json_schema',
    json_schema: {
      name: 'ai_reply',
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean' },
          message: { type: 'string' },
        },
        required: ['ok', 'message'],
      },
      strict: true,
    },
  });
  assert.deepEqual(result.parsed, { ok: true, message: 'hello' });
  assert.equal(JSON.stringify(logs).includes('sk-test-secret-123'), false);
});

test('createOpenAiCompatibleClient falls back to plain JSON parsing when schema mode is disabled', async () => {
  const calls = [];
  const client = createOpenAiCompatibleClient({
    ...baseConfig,
    supportsJsonSchema: false,
    fetchImpl: async (url, init) => {
      calls.push({
        url,
        init: {
          ...init,
          body: typeof init?.body === 'string' ? init.body : String(init?.body ?? ''),
        },
      });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: '{"status":"fallback","count":2}' } }],
        }),
        text: async () => '{"choices":[{"message":{"content":"{\\"status\\":\\"fallback\\",\\"count\\":2}"}}]}',
      };
    },
  });

  const result = await client.completeJson({
    messages: [{ role: 'user', content: 'Return JSON only' }],
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0].init.body).response_format, { type: 'json_object' });
  assert.deepEqual(result.parsed, { status: 'fallback', count: 2 });
});

test('createOpenAiCompatibleClient parses SSE chat completion chunks into final JSON content', async () => {
  const client = createOpenAiCompatibleClient({
    ...baseConfig,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token d in JSON at position 0');
      },
      text: async () =>
        [
          'data: {"choices":[{"delta":{"content":"{\\"commands\\":"}}]}',
          '',
          'data: {"choices":[{"delta":{"content":"[]"}}]}',
          '',
          'data: {"choices":[{"delta":{"content":"}"}}]}',
          '',
          'data: [DONE]',
          '',
        ].join('\n'),
    }),
  });

  const result = await client.completeJson({
    messages: [{ role: 'user', content: 'Return a command plan' }],
  });

  assert.equal(result.content, '{"commands":[]}');
  assert.deepEqual(result.parsed, { commands: [] });
});
