/**
 * Purpose: Verify recent AI conversation trimming can use LangChain when available and falls back safely.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { trimRecentConversationMessages, type RecentConversationMessage } from './ai-recent-message-trimmer.js';

test('trimRecentConversationMessages keeps newest messages within character budget', async () => {
  const messages: RecentConversationMessage[] = [
    { role: 'user', content: 'old '.repeat(100) },
    { role: 'assistant', content: 'middle '.repeat(100) },
    { role: 'user', content: 'new request' },
  ];

  const trimmed = await trimRecentConversationMessages(messages, { maxChars: 80, importImpl: async () => ({}) });

  assert.deepEqual(trimmed, [{ role: 'user', content: 'new request' }]);
});

test('trimRecentConversationMessages delegates to LangChain trimMessages when available', async () => {
  const messages: RecentConversationMessage[] = [{ role: 'user', content: 'hello' }];
  const trimmed = await trimRecentConversationMessages(messages, {
    maxChars: 80,
    importImpl: async () => ({
      trimMessages: async (input: unknown[]) => input.slice(-1),
    }),
  });

  assert.deepEqual(trimmed, messages);
});
