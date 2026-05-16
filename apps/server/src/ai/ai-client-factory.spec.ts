/**
 * Purpose: Verify AI client selection preserves OpenAI-compatible fallback when the optional pi runtime is unavailable.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import type { OpenAiCompatibleClient } from '@shugu/ai-core';

import { createAiChatClient } from './ai-client-factory.js';

const createStubClient = (label: string): OpenAiCompatibleClient => ({
  describeConfig: () => ({
    baseUrl: label,
    model: label,
    apiKey: '[REDACTED]',
    supportsJsonSchema: true,
    timeoutMs: 1,
  }),
  completeJson: async <T = unknown>() => ({
    raw: { label },
    content: '{"id":"stub","commands":[]}',
    parsed: { id: 'stub', commands: [] } as T,
    request: { url: label, body: {} },
  }),
});

test('falls back to the OpenAI-compatible client when the optional pi runtime cannot load', async () => {
  const openAiClient = createStubClient('openai-fallback');
  const client = await createAiChatClient({
    runtime: 'pi',
    openAiClient: openAiClient as never,
    piClientLoader: async () => null,
  });

  assert.equal(client.describeConfig().baseUrl, 'openai-fallback');
  const completion = await client.completeJson({ messages: [] });
  assert.equal(completion.request.url, 'openai-fallback');
});

test('prefers the optional pi runtime when it loads successfully', async () => {
  const piClient = createStubClient('pi-runtime');
  const openAiClient = createStubClient('openai-fallback');
  const client = await createAiChatClient({
    runtime: 'pi',
    openAiClient: openAiClient as never,
    piClientLoader: async () => piClient as never,
  });

  assert.equal(client.describeConfig().baseUrl, 'pi-runtime');
  const completion = await client.completeJson({ messages: [] });
  assert.equal(completion.request.url, 'pi-runtime');
});
