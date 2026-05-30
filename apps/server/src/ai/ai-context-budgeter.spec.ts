/**
 * Purpose: Verify AI prompt block budgeting keeps authority context while compacting advisory context.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyAiContextBudget,
  buildPromptMessagesFromBlocks,
  type AiPromptBlock,
} from './ai-context-budgeter.js';

test('applyAiContextBudget preserves must-keep blocks and emits compression notice under budget pressure', () => {
  const blocks: AiPromptBlock[] = [
    { id: 'system', role: 'system', priority: 'must', content: 'system rules' },
    { id: 'protocol', role: 'user', priority: 'must', content: 'protocol rules' },
    { id: 'targetSpace', role: 'user', priority: 'must', content: { targetSpaceId: 'ai-space:agent' } },
    { id: 'event', role: 'user', priority: 'must', content: { type: 'client.text.final', text: 'go' } },
    { id: 'semanticSnapshot', role: 'user', priority: 'high', content: { nodes: [{ id: 'node:1' }] } },
    { id: 'durableMemory', role: 'user', priority: 'low', content: { items: ['x'.repeat(2000)] } },
    { id: 'recentConversation', role: 'user', priority: 'low', content: { turns: ['y'.repeat(2000)] } },
  ];

  const result = applyAiContextBudget(blocks, { maxChars: 700 });

  assert.equal(result.blocks.some((block) => block.id === 'system'), true);
  assert.equal(result.blocks.some((block) => block.id === 'protocol'), true);
  assert.equal(result.blocks.some((block) => block.id === 'targetSpace'), true);
  assert.equal(result.blocks.some((block) => block.id === 'event'), true);
  assert.equal(result.blocks.some((block) => block.id === 'compressionNotice'), true);
  assert.equal(result.dropped.some((item) => item.id === 'durableMemory'), true);
  assert.ok(result.totalChars <= 700);
});

test('applyAiContextBudget keeps the default prompt under the provider-safe character budget', () => {
  const blocks: AiPromptBlock[] = [
    { id: 'system', role: 'system', priority: 'must', content: 'system rules' },
    { id: 'protocol', role: 'user', priority: 'must', content: 'protocol rules' },
    { id: 'targetSpace', role: 'user', priority: 'must', content: { targetSpaceId: 'ai-space:agent' } },
    { id: 'event', role: 'user', priority: 'must', content: { type: 'client.text.final', text: 'go' } },
    { id: 'snapshot', role: 'user', priority: 'high', content: { nodes: [{ id: 'node:1' }] } },
    { id: 'capabilityManifest', role: 'user', priority: 'medium', content: { manifest: 'x'.repeat(60_000) } },
    { id: 'memory', role: 'user', priority: 'low', content: { turns: ['y'.repeat(10_000)] } },
  ];

  const result = applyAiContextBudget(blocks);

  assert.ok(result.totalChars <= 50_000);
});

test('buildPromptMessagesFromBlocks keeps block order and stringifies structured content', () => {
  const messages = buildPromptMessagesFromBlocks([
    { id: 'system', role: 'system', priority: 'must', content: 'system rules' },
    { id: 'event', role: 'user', priority: 'must', content: { kind: 'event', type: 'display.ready' } },
  ]);

  assert.deepEqual(messages.map((message) => message.role), ['system', 'user']);
  assert.equal(messages[0].content, 'system rules');
  assert.equal(messages[1].content.includes('"kind":"event"'), true);
});
