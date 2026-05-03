/**
 * Purpose: FF-15 Manager SDK tests for Display routing/status APIs.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createDisplayOperation } from '@shugu/protocol';
import { ManagerSDK } from './manager-sdk.js';

function connectFakeSocket(sdk: ManagerSDK): unknown[] {
  const emitted: unknown[] = [];
  (sdk as unknown as { socket: { connected: boolean; emit: (_event: string, message: unknown) => void } }).socket = {
    connected: true,
    emit: (_event: string, message: unknown) => emitted.push(message),
  };
  return emitted;
}

test('ManagerSDK emits Display operations with semantic route targets and ack correlation', () => {
  const sdk = new ManagerSDK({
    serverUrl: 'http://localhost:3001',
    commandEnvelope: { actor: 'manager-display', role: 'manager', scopeGroupId: 'gallery' },
  });
  const emitted = connectFakeSocket(sdk);
  const operation = createDisplayOperation({
    operationId: 'op-sdk',
    target: { mode: 'displayGroup', groupId: 'gallery' },
    action: 'screenColor',
    payload: { color: '#abcdef' },
  });

  sdk.sendDisplayOperation(operation);

  assert.equal(emitted.length, 1);
  assert.equal((emitted[0] as { type?: string }).type, 'plugin');
  assert.equal((emitted[0] as { pluginId?: string }).pluginId, 'display-router');
  assert.equal((emitted[0] as { command?: string }).command, 'display-operation');
  assert.deepEqual((emitted[0] as { payload?: unknown }).payload, operation);
});
