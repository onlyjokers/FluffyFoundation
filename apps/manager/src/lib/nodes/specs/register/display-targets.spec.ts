/**
 * Purpose: Regression tests for Display node target resolution.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveDisplayNodeTargets, sendDisplayNodeCommand } from './display-targets';

const clients = [
  { clientId: 'phone-a', group: 'audience' },
  { clientId: 'display-1', group: 'display' },
  { clientId: 'display-2', group: 'display' },
  { clientId: 'display-3', group: 'display', connected: false },
];

test('resolveDisplayNodeTargets selects multiple connected displays from index and range', () => {
  const result = resolveDisplayNodeTargets({
    nodeId: 'display-node',
    clients,
    node: { inputValues: { index: 1, range: 2, random: false } },
    graph: { connections: [] },
  });

  assert.deepEqual(result, { explicit: true, ids: ['display-1', 'display-2'] });
});

test('resolveDisplayNodeTargets switches to the configured display id', () => {
  const result = resolveDisplayNodeTargets({
    nodeId: 'display-node',
    clients,
    node: { config: { displayId: 'display-2' }, inputValues: { index: 1, range: 2 } },
    graph: { connections: [] },
  });

  assert.deepEqual(result, { explicit: true, ids: ['display-2'] });
});

test('resolveDisplayNodeTargets falls back to every connected display when no routing input is set', () => {
  const result = resolveDisplayNodeTargets({
    nodeId: 'display-node',
    clients,
    node: { inputValues: {} },
    graph: { connections: [] },
  });

  assert.deepEqual(result, { explicit: false, ids: ['display-1', 'display-2'] });
});

test('sendDisplayNodeCommand routes explicit display targets through display operations', () => {
  const emitted: unknown[] = [];
  const result = sendDisplayNodeCommand({
    nodeId: 'display-node',
    action: 'screenColor',
    payload: { color: '#000000', opacity: 1, mode: 'solid' },
    clients,
    node: { config: { displayId: 'display-2' }, inputValues: {} },
    graph: { connections: [] },
    sendLocalControl: () => emitted.push('local'),
    sendDisplayOperation: (operation) => emitted.push(operation),
  });

  assert.deepEqual(result, { route: 'remote', explicit: true, ids: ['display-2'] });
  assert.equal(emitted.length, 1);
  assert.deepEqual((emitted[0] as { target?: { mode?: string; displayId?: string } }).target, {
    mode: 'displayId',
    displayId: 'display-2',
  });
});

test('sendDisplayNodeCommand routes range-based display selection to multiple display operations', () => {
  const emitted: unknown[] = [];
  const result = sendDisplayNodeCommand({
    nodeId: 'display-node',
    action: 'showText',
    payload: { text: 'hello' },
    clients,
    node: { inputValues: { index: 1, range: 2, random: false } },
    graph: { connections: [] },
    sendLocalControl: () => emitted.push('local'),
    sendDisplayOperation: (operation) => emitted.push(operation),
  });

  assert.deepEqual(result, { route: 'remote', explicit: true, ids: ['display-1', 'display-2'] });
  assert.equal(emitted.length, 2);
  assert.deepEqual(
    (emitted[0] as { target?: { mode?: string; displayId?: string } }).target,
    { mode: 'displayId', displayId: 'display-1' }
  );
  assert.deepEqual(
    (emitted[1] as { target?: { mode?: string; displayId?: string } }).target,
    { mode: 'displayId', displayId: 'display-2' }
  );
});

test('sendDisplayNodeCommand keeps implicit routing on the local display transport', () => {
  const emitted: unknown[] = [];
  const result = sendDisplayNodeCommand({
    nodeId: 'display-node',
    action: 'playMedia',
    payload: { url: '/demo.mp4' },
    clients,
    node: { inputValues: {} },
    graph: { connections: [] },
    sendLocalControl: (action, payload, executeAt) => emitted.push({ action, payload, executeAt }),
  });

  assert.deepEqual(result, { route: 'local', explicit: false, ids: ['display-1', 'display-2'] });
  assert.deepEqual(emitted, [
    {
      action: 'playMedia',
      payload: { url: '/demo.mp4' },
      executeAt: undefined,
    },
  ]);
});
