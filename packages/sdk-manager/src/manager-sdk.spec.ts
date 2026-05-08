/**
 * Purpose: Regression tests for control-batch payload merging.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mergeControlPayload } from './payload-merge.js';
import { ManagerSDK } from './manager-sdk.js';

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

test('ManagerSDK emits structured transfer lifecycle commands with manager actor envelope', () => {
  const sdk = new ManagerSDK({
    serverUrl: 'http://localhost:3001',
    commandEnvelope: { actor: 'manager-transfer', role: 'manager', scopeGroupId: 'stage-left' },
  });
  const emitted = connectFakeSocket(sdk);

  sdk.offerClientControlTransfer({ groupId: 'stage-left', targetClientId: 'client-1', ttlMs: 30_000 });
  sdk.revokeClientControlTransfer({ transferId: 'transfer-stage-left-client-1', groupId: 'stage-left' });

  assert.equal(emitted.length, 2);
  assert.deepEqual((emitted[0] as { payload?: unknown }).payload, {
    kind: 'client-control-transfer',
    action: 'offer',
    groupId: 'stage-left',
    targetClientId: 'client-1',
    ttlMs: 30_000,
  });
  assert.equal((emitted[0] as { actor?: string }).actor, 'manager-transfer');
  assert.equal((emitted[0] as { role?: string }).role, 'manager');
  assert.equal((emitted[0] as { scopeGroupId?: string }).scopeGroupId, 'stage-left');
  assert.equal((emitted[1] as { payload?: { action?: string } }).payload?.action, 'revoke');
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
