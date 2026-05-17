/**
 * Purpose: Verify AI client selection preserves OpenAI-compatible fallback when the optional pi runtime is unavailable.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import type { OpenAiCompatibleClient } from '@shugu/ai-core';

import { createAiChatClient, createFallbackAwareAiClient, fallbackModelsFromEnv } from './ai-client-factory.js';

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

const createEmptyClient = (label: string): OpenAiCompatibleClient => ({
  describeConfig: () => ({
    baseUrl: label,
    model: label,
    apiKey: '[REDACTED]',
    supportsJsonSchema: true,
    timeoutMs: 1,
  }),
  completeJson: async <T = unknown>() => ({
    raw: { choices: [] },
    content: '',
    parsed: null,
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

test('falls back to a later model when the primary model returns an empty completion', async () => {
  const client = createFallbackAwareAiClient({
    primaryModel: 'gpt-5.5',
    fallbackModels: ['gpt-5.5-openai-compact'],
    createClient: (model) =>
      model === 'gpt-5.5'
        ? createEmptyClient('gpt-5.5')
        : createStubClient('gpt-5.5-openai-compact'),
  });

  const completion = await client.completeJson({ messages: [] });
  assert.equal(completion.request.url, 'gpt-5.5-openai-compact');
  assert.equal(completion.content, '{"id":"stub","commands":[]}');
});

test('empty SHUGU_AI_OPENAI_MODEL_FALLBACKS disables automatic model fallback', () => {
  const previous = process.env.SHUGU_AI_OPENAI_MODEL_FALLBACKS;
  process.env.SHUGU_AI_OPENAI_MODEL_FALLBACKS = '';
  try {
    assert.deepEqual(fallbackModelsFromEnv('gpt-5.5'), []);
  } finally {
    if (previous === undefined) {
      delete process.env.SHUGU_AI_OPENAI_MODEL_FALLBACKS;
    } else {
      process.env.SHUGU_AI_OPENAI_MODEL_FALLBACKS = previous;
    }
  }
});
