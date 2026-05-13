// Purpose: tests for patch runtime override/log target routing helpers.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  resolveDeployedLoopClientId,
  selectExecutorLogsTargetId,
} from './patch-override-routing';

test('resolveDeployedLoopClientId finds the client reporting the deployed loop id', () => {
  const statusMap = new Map<string, { loopId?: unknown }>([
    ['client-a', { loopId: 'loop:a' }],
    ['client-b', { loopId: 'loop:b' }],
  ]);

  assert.equal(resolveDeployedLoopClientId(statusMap, 'loop:b'), 'client-b');
  assert.equal(resolveDeployedLoopClientId(statusMap, 'loop:missing'), '');
});

test('selectExecutorLogsTargetId prefers patch target, then selected, then first connected client', () => {
  assert.equal(selectExecutorLogsTargetId(['patch-client'], ['selected-client'], ['first-client']), 'patch-client');
  assert.equal(selectExecutorLogsTargetId([], ['selected-client'], ['first-client']), 'selected-client');
  assert.equal(selectExecutorLogsTargetId([], [], ['first-client']), 'first-client');
  assert.equal(selectExecutorLogsTargetId([], [], []), '');
});
