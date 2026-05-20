// Purpose: Regression tests for Manager-side pending semantic command protection.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createServerSemanticSyncState } from './server-semantic-sync-state';

test('server semantic sync state coalesces pending node value commands by node', () => {
  const state = createServerSemanticSyncState({ ttlMs: 1_000, now: () => 100 });

  state.trackPendingCommand('r1', {
    type: 'node.params.update',
    nodeId: 'n1',
    params: { gain: 1, pan: 0 },
  });
  state.trackPendingCommand('r2', {
    type: 'node.params.update',
    nodeId: 'n1',
    params: { gain: 2 },
  });
  state.trackPendingCommand('r3', {
    type: 'node.inputs.update',
    nodeId: 'n1',
    inputValues: { value: 42 },
  });

  assert.deepEqual(state.getPendingCommands(), [
    { type: 'node.params.update', nodeId: 'n1', params: { gain: 2, pan: 0 } },
    { type: 'node.inputs.update', nodeId: 'n1', inputValues: { value: 42 } },
  ]);
});

test('server semantic sync state expires pending commands after ttl', () => {
  let now = 100;
  const state = createServerSemanticSyncState({ ttlMs: 50, now: () => now });

  state.trackPendingCommand('r1', {
    type: 'node.params.update',
    nodeId: 'n1',
    params: { gain: 1 },
  });

  assert.equal(state.getPendingCommands().length, 1);
  now = 200;
  assert.deepEqual(state.getPendingCommands(), []);
});
