/**
 * Purpose: Regression tests for control-batch payload merging.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mergeControlPayload } from './payload-merge.js';
import { ManagerSDK } from './manager-sdk.js';
import { setupManagerSocketListeners } from './manager-sdk/socket-listeners.js';

test('mergeControlPayload shallow merges plain objects', () => {
  const prev = { a: 1, b: 2 };
  const next = { b: 3, c: 4 };
  assert.deepEqual(mergeControlPayload(prev, next), { a: 1, b: 3, c: 4 });
});

test('mergeControlPayload returns next when not plain objects', () => {
  assert.deepEqual(mergeControlPayload({ mode: 'on' }, { a: 1 }), { mode: 'on', a: 1 });
  assert.deepEqual(mergeControlPayload({ a: 1 }, { pattern: [100] }), { a: 1, pattern: [100] });
});

async function flushMicrotasks(): Promise<void> {
  await new Promise<void>((resolve) => queueMicrotask(resolve));
}

function connectFakeSocket(sdk: ManagerSDK): unknown[] {
  const emitted: unknown[] = [];
  (sdk as unknown as { socket: { connected: boolean; emit: (_event: string, message: unknown) => void } }).socket = {
    connected: true,
    emit: (_event: string, message: unknown) => emitted.push(message),
  };
  return emitted;
}

function connectFakeEventSocket(sdk: ManagerSDK): { emitted: unknown[]; triggerMsg: (message: unknown) => void } {
  const emitted: unknown[] = [];
  let msgHandler: ((message: unknown) => void) | null = null;
  (sdk as unknown as {
    socket: {
      connected: boolean;
      emit: (_event: string, message: unknown) => void;
      on: (event: string, handler: (message: unknown) => void) => void;
      io: { on: () => void };
    };
  }).socket = {
    connected: true,
    emit: (_event: string, message: unknown) => emitted.push(message),
    on: (event: string, handler: (message: unknown) => void) => {
      if (event === 'msg') msgHandler = handler;
    },
    io: { on: () => undefined },
  };
  return {
    emitted,
    triggerMsg: (message: unknown) => {
      assert.notEqual(msgHandler, null);
      msgHandler?.(message);
    },
  };
}

test('ManagerSDK sendControl preserves caller scope envelope while flushing a single command', async () => {
  const sdk = new ManagerSDK({
    serverUrl: 'http://localhost:3001',
    commandEnvelope: { actor: 'manager-1', role: 'manager', scopeGroupId: 'stage-left' },
  });
  const emitted = connectFakeSocket(sdk);

  sdk.sendControl({ mode: 'all' }, 'vibrate', { pattern: [100] });
  await flushMicrotasks();

  assert.equal(emitted.length, 1);
  assert.equal((emitted[0] as { scopeGroupId?: string }).scopeGroupId, 'stage-left');
  assert.equal((emitted[0] as { actor?: string }).actor, 'manager-1');
  assert.equal((emitted[0] as { role?: string }).role, 'manager');
  assert.notEqual((emitted[0] as { scopeGroupId?: string }).scopeGroupId, '__system__');
});

test('ManagerSDK sendControl preserves caller scope envelope while flushing a control batch', async () => {
  const sdk = new ManagerSDK({
    serverUrl: 'http://localhost:3001',
    commandEnvelope: { actor: 'operator-2', role: 'manager', scopeGroupId: 'stage-right' },
  });
  const emitted = connectFakeSocket(sdk);

  sdk.sendControl({ mode: 'group', groupId: 'stage-right' }, 'screenColor', { color: '#ffffff' });
  sdk.sendControl({ mode: 'group', groupId: 'stage-right' }, 'vibrate', { pattern: [25] });
  await flushMicrotasks();

  assert.equal(emitted.length, 1);
  assert.equal((emitted[0] as { action?: string }).action, 'custom');
  assert.equal((emitted[0] as { scopeGroupId?: string }).scopeGroupId, 'stage-right');
  assert.equal((emitted[0] as { actor?: string }).actor, 'operator-2');
  assert.equal((emitted[0] as { role?: string }).role, 'manager');
});

test('ManagerSDK scopes group controls to the target group for server policy parity', async () => {
  const sdk = new ManagerSDK({
    serverUrl: 'http://localhost:3001',
    commandEnvelope: { actor: 'operator-display', role: 'manager', scopeGroupId: 'manager-performance' },
  });
  const emitted = connectFakeSocket(sdk);

  sdk.sendControl({ mode: 'group', groupId: 'display' }, 'screenColor', { color: '#6655ff', mode: 'solid' });
  await flushMicrotasks();

  assert.equal(emitted.length, 1);
  assert.equal((emitted[0] as { target?: { mode?: string; groupId?: string } }).target?.mode, 'group');
  assert.equal((emitted[0] as { target?: { groupId?: string } }).target?.groupId, 'display');
  assert.equal((emitted[0] as { scopeGroupId?: string }).scopeGroupId, 'display');
  assert.equal((emitted[0] as { actor?: string }).actor, 'operator-display');
  assert.equal((emitted[0] as { role?: string }).role, 'manager');
});

test('ManagerSDK sendMedia preserves caller scope envelope', () => {
  const sdk = new ManagerSDK({
    serverUrl: 'http://localhost:3001',
    commandEnvelope: { actor: 'media-manager', role: 'manager', scopeGroupId: 'stage-media' },
  });
  const emitted = connectFakeSocket(sdk);

  sdk.sendMedia({ mode: 'group', groupId: 'stage-media' }, 'audio', '/media/demo.mp3', 123);

  assert.equal(emitted.length, 1);
  assert.equal((emitted[0] as { type?: string }).type, 'media');
  assert.equal((emitted[0] as { scopeGroupId?: string }).scopeGroupId, 'stage-media');
  assert.equal((emitted[0] as { actor?: string }).actor, 'media-manager');
  assert.equal((emitted[0] as { role?: string }).role, 'manager');
});

test('ManagerSDK sendPluginControl preserves reclaim command envelope for Group ownership', () => {
  const sdk = new ManagerSDK({
    serverUrl: 'http://localhost:3001',
    commandEnvelope: { actor: 'manager-reclaim', role: 'manager', scopeGroupId: 'stage-left' },
  });
  const emitted = connectFakeSocket(sdk);

  sdk.sendPluginControl({ mode: 'group', groupId: 'stage-left' }, 'node-executor', 'reclaim');

  assert.equal(emitted.length, 1);
  assert.equal((emitted[0] as { type?: string }).type, 'plugin');
  assert.equal((emitted[0] as { command?: string }).command, 'reclaim');
  assert.equal((emitted[0] as { scopeGroupId?: string }).scopeGroupId, 'stage-left');
  assert.equal((emitted[0] as { actor?: string }).actor, 'manager-reclaim');
});

test('ManagerSDK sends semantic graph commands through the live manager channel', () => {
  const sdk = new ManagerSDK({
    serverUrl: 'http://localhost:3001',
    commandEnvelope: { actor: 'semantic-manager', role: 'manager', scopeGroupId: 'stage-left' },
  });
  const emitted = connectFakeSocket(sdk);

  sdk.sendSemanticCommand({
    target: { mode: 'manager' },
    command: {
      kind: 'node.params.update',
      nodeId: 'tone-1',
      param: 'volume',
      value: 0.5,
    },
    requestId: 'semantic-sdk-1',
    dryRun: true,
  });

  assert.equal(emitted.length, 1);
  assert.deepEqual(emitted[0], {
    type: 'semantic',
    version: 1,
    target: { mode: 'manager' },
    actor: 'semantic-manager',
    role: 'manager',
    command: {
      kind: 'node.params.update',
      nodeId: 'tone-1',
      param: 'volume',
      value: 0.5,
    },
    requestId: 'semantic-sdk-1',
    dryRun: true,
    clientTimestamp: (emitted[0] as { clientTimestamp?: number }).clientTimestamp,
  });
});

test('ManagerSDK sends semantic command results through the live manager channel', () => {
  const sdk = new ManagerSDK({ serverUrl: 'http://localhost:3001' });
  const emitted = connectFakeSocket(sdk);

  sdk.sendSemanticResult({
    requestId: 'semantic-result-sdk-1',
    ok: true,
    result: { accepted: true },
    snapshotRevision: 5,
  });

  assert.equal(emitted.length, 1);
  assert.equal((emitted[0] as { type?: string }).type, 'semantic-result');
  assert.equal((emitted[0] as { requestId?: string }).requestId, 'semantic-result-sdk-1');
  assert.equal((emitted[0] as { ok?: boolean }).ok, true);
  assert.equal((emitted[0] as { snapshotRevision?: number }).snapshotRevision, 5);
});

test('ManagerSDK dispatches semantic commands and semantic results to registered handlers', () => {
  const sdk = new ManagerSDK({ serverUrl: 'http://localhost:3001' });
  const { triggerMsg } = connectFakeEventSocket(sdk);
  setupManagerSocketListeners((sdk as unknown as { createSocketListenerHost: () => never }).createSocketListenerHost());
  const semanticCommands: unknown[] = [];
  const semanticResults: unknown[] = [];

  sdk.onSemanticCommand((message) => semanticCommands.push(message));
  sdk.onSemanticResult((message) => semanticResults.push(message));
  triggerMsg({
    type: 'semantic',
    version: 1,
    serverTimestamp: 100,
    target: { mode: 'manager' },
    actor: 'cli',
    role: 'manager',
    command: { kind: 'graph.snapshot' },
    requestId: 'snapshot-1',
  });
  triggerMsg({
    type: 'semantic-result',
    version: 1,
    serverTimestamp: 101,
    requestId: 'snapshot-1',
    ok: true,
    result: { snapshot: { nodes: [], connections: [] } },
    snapshotRevision: 4,
  });

  assert.equal(semanticCommands.length, 1);
  assert.equal((semanticCommands[0] as { requestId?: string }).requestId, 'snapshot-1');
  assert.equal(semanticResults.length, 1);
  assert.equal((semanticResults[0] as { snapshotRevision?: number }).snapshotRevision, 4);
});

test('ManagerSDK scopes plugin controls to the target group for server policy parity', () => {
  const sdk = new ManagerSDK({
    serverUrl: 'http://localhost:3001',
    commandEnvelope: { actor: 'manager-plugin', role: 'manager', scopeGroupId: 'manager-performance' },
  });
  const emitted = connectFakeSocket(sdk);

  sdk.sendPluginControl({ mode: 'group', groupId: 'display' }, 'display-router', 'display-operation', {
    action: 'screenColor',
  });

  assert.equal(emitted.length, 1);
  assert.equal((emitted[0] as { target?: { groupId?: string } }).target?.groupId, 'display');
  assert.equal((emitted[0] as { scopeGroupId?: string }).scopeGroupId, 'display');
  assert.equal((emitted[0] as { actor?: string }).actor, 'manager-plugin');
  assert.equal((emitted[0] as { role?: string }).role, 'manager');
});

test('ManagerSDK does not expose client control transfer lifecycle commands', () => {
  const sdk = new ManagerSDK({
    serverUrl: 'http://localhost:3001',
    commandEnvelope: { actor: 'manager-transfer', role: 'manager', scopeGroupId: 'stage-left' },
  });

  assert.equal('offerClientControlTransfer' in sdk, false);
  assert.equal('revokeClientControlTransfer' in sdk, false);
});

test('ManagerSDK emits partition lifecycle commands through the semantic node-executor bus', () => {
  const sdk = new ManagerSDK({
    serverUrl: 'http://localhost:3001',
    commandEnvelope: { actor: 'manager-partition', role: 'manager', scopeGroupId: 'stage-left' },
  });
  const emitted = connectFakeSocket(sdk);

  sdk.deployPartition({
    groupId: 'stage-left',
    partition: {
      id: 'partition:display',
      nodeIds: ['visual-1'],
      targetPlatform: 'display',
      status: 'draft',
      requiredCapabilities: ['display.render'],
      boundRevision: 8,
    },
    currentRevision: 8,
  });
  sdk.stopPartition({ groupId: 'stage-left', partitionId: 'partition:display', currentRevision: 9 });
  sdk.removePartition({ groupId: 'stage-left', partitionId: 'partition:display', currentRevision: 10 });
  sdk.redeployPartition({ groupId: 'stage-left', partitionId: 'partition:display', currentRevision: 11 });

  assert.equal(emitted.length, 4);
  assert.equal((emitted[0] as { type?: string }).type, 'plugin');
  assert.equal((emitted[0] as { pluginId?: string }).pluginId, 'node-executor');
  assert.equal((emitted[0] as { command?: string }).command, 'deploy');
  assert.deepEqual((emitted[0] as { payload?: unknown }).payload, {
    kind: 'partition-lifecycle',
    operation: 'deploy',
    partition: {
      id: 'partition:display',
      nodeIds: ['visual-1'],
      targetPlatform: 'display',
      status: 'draft',
      requiredCapabilities: ['display.render'],
      boundRevision: 8,
    },
    currentRevision: 8,
  });
  assert.deepEqual(
    emitted.map((message) => (message as { command?: string }).command),
    ['deploy', 'stop', 'remove', 'deploy']
  );
  assert.equal((emitted[0] as { actor?: string }).actor, 'manager-partition');
});

test('ManagerSDK coalesces latest-state controls and flushes the last value after throttle', async () => {
  const sdk = new ManagerSDK({
    serverUrl: 'http://localhost:3001',
    highFreqThrottleMs: 50,
    commandEnvelope: { actor: 'manager-1', role: 'manager', scopeGroupId: 'stage-left' },
  });
  const emitted = connectFakeSocket(sdk);
  (sdk as unknown as { state: { clients: Array<{ clientId: string }> } }).state.clients = Array.from(
    { length: 11 },
    (_, index) => ({ clientId: `client-${index}` })
  );

  sdk.sendControl({ mode: 'group', groupId: 'stage-left' }, 'screenColor', { color: '#111111' });
  await flushMicrotasks();
  sdk.sendControl({ mode: 'group', groupId: 'stage-left' }, 'screenColor', { color: '#222222' });
  sdk.sendControl({ mode: 'group', groupId: 'stage-left' }, 'screenColor', { color: '#333333' });
  await flushMicrotasks();

  assert.equal(emitted.length, 1);
  assert.equal((emitted[0] as { payload?: { color?: string } }).payload?.color, '#111111');

  await new Promise((resolve) => setTimeout(resolve, 70));

  assert.equal(emitted.length, 2);
  assert.equal((emitted[1] as { payload?: { color?: string } }).payload?.color, '#333333');
  assert.equal((sdk as unknown as { getDeliveryMetrics: () => { coalesced: number } }).getDeliveryMetrics().coalesced, 2);
});

test('ManagerSDK does not let latest-state throttling silently drop reliable or scheduled commands', async () => {
  const sdk = new ManagerSDK({
    serverUrl: 'http://localhost:3001',
    highFreqThrottleMs: 50,
    commandEnvelope: { actor: 'manager-1', role: 'manager', scopeGroupId: 'stage-left' },
  });
  const emitted = connectFakeSocket(sdk);
  (sdk as unknown as { state: { clients: Array<{ clientId: string }> } }).state.clients = Array.from(
    { length: 11 },
    (_, index) => ({ clientId: `client-${index}` })
  );

  sdk.sendControl({ mode: 'group', groupId: 'stage-left' }, 'screenColor', { color: '#111111' });
  await flushMicrotasks();
  sdk.sendControl({ mode: 'group', groupId: 'stage-left' }, 'screenColor', { color: '#222222' });
  sdk.sendControl({ mode: 'group', groupId: 'stage-left' }, 'playMedia', { url: '/reliable.mp4' });
  sdk.sendControl({ mode: 'group', groupId: 'stage-left' }, 'vibrate', { pattern: [10] }, 123456);
  await flushMicrotasks();

  const actions = emitted.flatMap((message) => {
    const record = message as { action?: string; payload?: { kind?: string; items?: Array<{ action: string }> } };
    if (record.action === 'custom' && record.payload?.kind === 'control-batch') {
      return record.payload.items?.map((item) => item.action) ?? [];
    }
    return record.action ? [record.action] : [];
  });
  assert.deepEqual(actions, ['screenColor', 'playMedia', 'vibrate']);
});

test('ManagerSDK counts direct custom controls as delivered reliable messages', () => {
  const sdk = new ManagerSDK({
    serverUrl: 'http://localhost:3001',
    commandEnvelope: { actor: 'manager-1', role: 'manager', scopeGroupId: 'stage-left' },
  });
  connectFakeSocket(sdk);

  sdk.sendControl({ mode: 'group', groupId: 'stage-left' }, 'custom', { kind: 'operator-note', note: 'go' });
  sdk.sendControl(
    { mode: 'group', groupId: 'stage-left' },
    'custom',
    { kind: 'control-batch', items: [{ action: 'playMedia', payload: { url: '/a.mp4' } }] }
  );

  assert.equal(sdk.getDeliveryMetrics().delivered, 2);
});
