/**
 * Purpose: Verify Client AI Agent text input payload normalization.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createAgentTextPayload } from './agent-text.js';

test('createAgentTextPayload trims spoken text into agent-text payloads', () => {
  assert.deepEqual(createAgentTextPayload('  我想去看海  '), {
    kind: 'agent-text',
    text: '我想去看海',
  });
});

test('createAgentTextPayload rejects empty text', () => {
  assert.equal(createAgentTextPayload('   '), null);
});
