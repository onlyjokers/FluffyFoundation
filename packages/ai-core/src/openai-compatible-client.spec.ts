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
