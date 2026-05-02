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
