/**
 * Purpose: Regression tests for protocol helpers and target matching.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createControlMessage } from './helpers.js';
import { matchesTarget } from './helpers/matches-target.js';

test('matchesTarget returns true for all mode', () => {
  assert.equal(matchesTarget('c1', { mode: 'all' }), true);
});

test('matchesTarget matches group id', () => {
  assert.equal(matchesTarget('c1', { mode: 'group', groupId: 'g1' }, 'g1'), true);
  assert.equal(matchesTarget('c1', { mode: 'group', groupId: 'g1' }, 'g2'), false);
});

test('createControlMessage fills version + timestamp', () => {
  const message = createControlMessage({ mode: 'all' }, 'vibrate', { durationMs: 100 });
  assert.equal(message.version, 1);
  assert.equal(typeof message.clientTimestamp, 'number');
});
