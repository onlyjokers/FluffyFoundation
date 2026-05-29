/**
 * Purpose: Verify bounded durable AI memory recall and safe graceful fallback.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAiDurableMemory,
  createMem0DurableMemoryProvider,
  type AiDurableMemoryProvider,
} from './ai-durable-memory.js';

test('durable memory recall bounds item count and text length', async () => {
  const provider: AiDurableMemoryProvider = {
    search: async () => [
      { id: 'm1', text: 'a'.repeat(50), score: 0.9 },
      { id: 'm2', text: 'b'.repeat(50), score: 0.8 },
      { id: 'm3', text: 'c'.repeat(50), score: 0.7 },
    ],
    add: async () => undefined,
  };
  const memory = createAiDurableMemory({ provider, recallLimit: 2, itemMaxChars: 24 });

  const recalled = await memory.recall({ targetSpaceId: 'ai-space:agent', query: 'hello' });

  assert.equal(recalled.enabled, true);
  assert.equal(recalled.authority, 'advisory');
  assert.equal(recalled.items.length, 2);
  assert.equal(recalled.items[0].text.length <= 24, true);
  assert.match(recalled.items[0].text, /\[truncated/);
});

test('durable memory degrades to empty advisory memory when provider fails', async () => {
  const memory = createAiDurableMemory({
    provider: {
      search: async () => {
        throw new Error('offline');
      },
      add: async () => undefined,
    },
  });

  const recalled = await memory.recall({ targetSpaceId: 'ai-space:agent', query: 'hello' });

  assert.equal(recalled.enabled, false);
  assert.deepEqual(recalled.items, []);
  assert.equal(recalled.error, 'offline');
});

test('mem0 provider adapts OSS Memory search and add APIs', async () => {
  const calls: unknown[] = [];
  class Memory {
    async search(query: string, options: Record<string, unknown>) {
      calls.push(['search', query, options]);
      return [{ id: 'one', memory: 'remember this', score: 0.8 }];
    }
    async add(text: string, options: Record<string, unknown>) {
      calls.push(['add', text, options]);
    }
  }
  const provider = await createMem0DurableMemoryProvider(async () => ({ Memory }));

  assert.ok(provider);
  assert.deepEqual(await provider.search({ targetSpaceId: 'ai-space:agent', query: 'hello', limit: 3 }), [
    { id: 'one', text: 'remember this', score: 0.8, metadata: undefined },
  ]);
  await provider.add({ targetSpaceId: 'ai-space:agent', text: 'summary', metadata: { kind: 'turn' } });
  assert.deepEqual(calls, [
    ['search', 'hello', { user_id: 'ai-space:agent', limit: 3 }],
    ['add', 'summary', { user_id: 'ai-space:agent', metadata: { kind: 'turn' } }],
  ]);
});
