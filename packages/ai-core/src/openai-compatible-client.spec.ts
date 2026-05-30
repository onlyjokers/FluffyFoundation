/**
 * Purpose: Verify OpenAI-compatible client request URL construction.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createOpenAiCompatibleClient } from './openai-compatible-client';

test('createOpenAiCompatibleClient honors an explicit chat completions URL', async () => {
  const calls: string[] = [];
  const client = createOpenAiCompatibleClient({
    baseUrl: 'https://api.example.test/v1',
    chatCompletionsUrl: 'https://proxy.example.test/openai/chat/completions',
    apiKey: 'test-key',
    model: 'gpt-test',
    fetchImpl: async (input) => {
      calls.push(String(input));
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => '{"choices":[{"message":{"content":"{\\"id\\":\\"ok\\"}"}}]}',
      };
    },
  });

  const completion = await client.completeJson({ messages: [] });

  assert.equal(calls[0], 'https://proxy.example.test/openai/chat/completions');
  assert.equal(completion.request.url, 'https://proxy.example.test/openai/chat/completions');
});

test('createOpenAiCompatibleClient explicitly disables streaming responses', async () => {
  const requestBodies: Array<Record<string, unknown>> = [];
  const client = createOpenAiCompatibleClient({
    baseUrl: 'https://api.example.test/v1',
    apiKey: 'test-key',
    model: 'gpt-test',
    fetchImpl: async (_input, init) => {
      requestBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => '{"choices":[{"message":{"content":"{\\"id\\":\\"ok\\"}"}}]}',
      };
    },
  });

  await client.completeJson({ messages: [] });

  assert.equal(requestBodies[0]?.stream, false);
});

test('createOpenAiCompatibleClient retries empty json_schema responses with json_object mode', async () => {
  const requestBodies: Array<Record<string, unknown>> = [];
  const client = createOpenAiCompatibleClient({
    baseUrl: 'https://api.example.test/v1',
    apiKey: 'test-key',
    model: 'gpt-test',
    supportsJsonSchema: true,
    fetchImpl: async (_input, init) => {
      requestBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
      const body =
        requestBodies.length === 1
          ? '{"choices":[]}'
          : '{"choices":[{"message":{"content":"{\\"id\\":\\"repaired\\"}"}}]}';
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => body,
      };
    },
  });

  const completion = await client.completeJson<{ id: string }>({
    messages: [],
    schema: {
      name: 'agent_plan',
      schema: { type: 'object', properties: { id: { type: 'string' } } },
    },
  });

  assert.equal(requestBodies.length, 2);
  assert.equal(
    (requestBodies[0]?.response_format as Record<string, unknown> | undefined)?.type,
    'json_schema'
  );
  assert.equal(
    (requestBodies[1]?.response_format as Record<string, unknown> | undefined)?.type,
    'json_object'
  );
  assert.equal(requestBodies[0]?.stream, false);
  assert.equal(requestBodies[1]?.stream, false);
  assert.deepEqual(completion.parsed, { id: 'repaired' });
});
