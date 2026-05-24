/**
 * Purpose: Regression tests for Display node target resolution.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  resetDisplayNodeRouteStateForTests,
  resolveDisplayNodeTargets,
  sendDisplayNodeCommand,
} from './display-targets';

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
    computedInputs: { index: 1, range: 2, random: false },
    graph: { connections: [] },
  });

  assert.deepEqual(result, { explicit: true, ids: ['display-1', 'display-2'] });
});

test('resolveDisplayNodeTargets switches to the configured display id', () => {
  const result = resolveDisplayNodeTargets({
    nodeId: 'display-node',
    clients,
    node: { config: { displayId: 'display-2' }, inputValues: {} },
    graph: { connections: [] },
  });

  assert.deepEqual(result, { explicit: true, ids: ['display-2'] });
});

test('resolveDisplayNodeTargets lets explicit routing inputs override the configured display id', () => {
  const result = resolveDisplayNodeTargets({
    nodeId: 'display-node',
    clients,
    node: { config: { displayId: 'display-2' }, inputValues: { index: 1, range: 1 } },
    computedInputs: { index: 1 },
    graph: {
      connections: [
        {
          targetNodeId: 'display-node',
          targetPortId: 'index',
        },
      ],
    },
  });

  assert.deepEqual(result, { explicit: true, ids: ['display-1'] });
});

test('resolveDisplayNodeTargets lets local index and range inputs override the configured display id', () => {
  const result = resolveDisplayNodeTargets({
    nodeId: 'display-node',
    clients,
    node: { config: { displayId: 'display-2' }, inputValues: { index: 1, range: 2 } },
    graph: { connections: [] },
  });

  assert.deepEqual(result, { explicit: true, ids: ['display-1', 'display-2'] });
});

test('resolveDisplayNodeTargets clamps local index and range to connected display count', () => {
  const result = resolveDisplayNodeTargets({
    nodeId: 'display-node',
    clients,
    node: { inputValues: { index: 99, range: 99 } },
    graph: { connections: [] },
  });

  assert.deepEqual(result, { explicit: true, ids: ['display-2', 'display-1'] });
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
    computedInputs: { index: 1, range: 2, random: false },
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

test('sendDisplayNodeCommand clears displays removed from an explicit showText route', () => {
  resetDisplayNodeRouteStateForTests();
  const emitted: Array<{ action?: string; target?: { displayId?: string } }> = [];

  sendDisplayNodeCommand({
    nodeId: 'display-node',
    action: 'showText',
    payload: { text: 'first' },
    clients,
    node: { inputValues: { index: 1, range: 1, random: false } },
    computedInputs: { index: 1, range: 1, random: false },
    graph: { connections: [] },
    sendLocalControl: () => emitted.push({ action: 'local' }),
    sendDisplayOperation: (operation) => emitted.push(operation),
  });

  sendDisplayNodeCommand({
    nodeId: 'display-node',
    action: 'showText',
    payload: { text: 'second' },
    clients,
    node: { inputValues: { index: 2, range: 1, random: false } },
    computedInputs: { index: 2, range: 1, random: false },
    graph: { connections: [] },
    sendLocalControl: () => emitted.push({ action: 'local' }),
    sendDisplayOperation: (operation) => emitted.push(operation),
  });

  assert.deepEqual(
    emitted.map((operation) => ({
      action: operation.action,
      displayId: operation.target?.displayId,
    })),
    [
      { action: 'showText', displayId: 'display-1' },
      { action: 'hideText', displayId: 'display-1' },
      { action: 'showText', displayId: 'display-2' },
    ]
  );
});

test('sendDisplayNodeCommand clears previous long-lived action on a kept display before another action takes over', () => {
  resetDisplayNodeRouteStateForTests();
  const emitted: Array<{ action?: string; target?: { displayId?: string } }> = [];
  const base = {
    nodeId: 'display-node',
    clients,
    node: { inputValues: { index: 1, range: 1, random: false } },
    computedInputs: { index: 1, range: 1, random: false },
    graph: { connections: [] },
    activeActions: new Set(['showText' as const]),
    sendLocalControl: () => emitted.push({ action: 'local' }),
    sendDisplayOperation: (operation: (typeof emitted)[number]) => emitted.push(operation),
  };

  sendDisplayNodeCommand({
    ...base,
    action: 'showText',
    payload: { text: 'caption' },
  });

  sendDisplayNodeCommand({
    ...base,
    activeActions: new Set(['showImage' as const]),
    action: 'showImage',
    payload: { url: '/next.png' },
  });

  assert.deepEqual(
    emitted.map((operation) => ({
      action: operation.action,
      displayId: operation.target?.displayId,
    })),
    [
      { action: 'showText', displayId: 'display-1' },
      { action: 'hideText', displayId: 'display-1' },
      { action: 'showImage', displayId: 'display-1' },
    ]
  );
});

test('sendDisplayNodeCommand clears each long-lived Display action when the route moves', () => {
  resetDisplayNodeRouteStateForTests();
  const emitted: Array<{ action?: string; payload?: unknown; target?: { displayId?: string } }> = [];

  const base = {
    nodeId: 'display-node',
    clients,
    graph: { connections: [] },
    sendLocalControl: () => emitted.push({ action: 'local' }),
    sendDisplayOperation: (operation: (typeof emitted)[number]) => emitted.push(operation),
  };

  sendDisplayNodeCommand({
    ...base,
    action: 'visualScenes',
    payload: { scenes: [{ type: 'box', color: '#ffffff' }] },
    node: { inputValues: { index: 1, range: 1, random: false } },
    computedInputs: { index: 1, range: 1, random: false },
  });

  sendDisplayNodeCommand({
    ...base,
    action: 'visualEffects',
    payload: { effects: [{ type: 'ascii', cellSize: 11 }] },
    node: { inputValues: { index: 1, range: 1, random: false } },
    computedInputs: { index: 1, range: 1, random: false },
  });

  sendDisplayNodeCommand({
    ...base,
    action: 'visualScenes',
    payload: { scenes: [{ type: 'box', color: '#00ff00' }] },
    node: { inputValues: { index: 2, range: 1, random: false } },
    computedInputs: { index: 2, range: 1, random: false },
  });

  sendDisplayNodeCommand({
    ...base,
    action: 'visualEffects',
    payload: { effects: [{ type: 'ascii', cellSize: 11 }] },
    node: { inputValues: { index: 2, range: 1, random: false } },
    computedInputs: { index: 2, range: 1, random: false },
  });

  assert.deepEqual(
    emitted.map((operation) => ({
      action: operation.action,
      payload: operation.payload,
      displayId: operation.target?.displayId,
    })),
    [
      {
        action: 'visualScenes',
        payload: { scenes: [{ type: 'box', color: '#ffffff' }] },
        displayId: 'display-1',
      },
      {
        action: 'visualEffects',
        payload: { effects: [{ type: 'ascii', cellSize: 11 }] },
        displayId: 'display-1',
      },
      { action: 'visualScenes', payload: { scenes: [] }, displayId: 'display-1' },
      { action: 'visualEffects', payload: { effects: [] }, displayId: 'display-1' },
      {
        action: 'visualScenes',
        payload: { scenes: [{ type: 'box', color: '#00ff00' }] },
        displayId: 'display-2',
      },
      {
        action: 'visualEffects',
        payload: { effects: [{ type: 'ascii', cellSize: 11 }] },
        displayId: 'display-2',
      },
    ]
  );
});

test('sendDisplayNodeCommand clears prior explicit Display actions before returning to local routing', () => {
  resetDisplayNodeRouteStateForTests();
  const emitted: Array<{ action?: string; payload?: unknown; target?: { displayId?: string } }> = [];

  sendDisplayNodeCommand({
    nodeId: 'display-node',
    action: 'visualScenes',
    payload: { scenes: [{ type: 'box', color: '#ffffff' }] },
    clients,
    node: { inputValues: { index: 1, range: 1, random: false } },
    computedInputs: { index: 1, range: 1, random: false },
    graph: { connections: [] },
    sendLocalControl: () => emitted.push({ action: 'local' }),
    sendDisplayOperation: (operation) => emitted.push(operation),
  });

  sendDisplayNodeCommand({
    nodeId: 'display-node',
    action: 'visualScenes',
    payload: { scenes: [{ type: 'box', color: '#00ff00' }] },
    clients,
    node: { inputValues: {} },
    graph: { connections: [] },
    sendLocalControl: (action, payload) => emitted.push({ action, payload }),
    sendDisplayOperation: (operation) => emitted.push(operation),
  });

  assert.deepEqual(
    emitted.map((operation) => ({
      action: operation.action,
      payload: operation.payload,
      displayId: operation.target?.displayId,
    })),
    [
      {
        action: 'visualScenes',
        payload: { scenes: [{ type: 'box', color: '#ffffff' }] },
        displayId: 'display-1',
      },
      { action: 'visualScenes', payload: { scenes: [] }, displayId: 'display-1' },
      {
        action: 'visualScenes',
        payload: { scenes: [{ type: 'box', color: '#00ff00' }] },
        displayId: undefined,
      },
    ]
  );
});
