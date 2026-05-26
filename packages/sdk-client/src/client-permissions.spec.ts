/**
 * Purpose: Regression coverage for client permission snapshot reporting.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ClientSDK } from './client-sdk.js';

test('ClientSDK emits client permission snapshots as system messages', () => {
  const sdk = new ClientSDK({ serverUrl: 'http://localhost:3001' });
  const emitted: unknown[] = [];

  (
    sdk as unknown as {
      socket: { connected: boolean; emit: (event: string, message: unknown) => void };
      state: { clientId: string | null; status: string };
    }
  ).socket = {
    connected: true,
    emit: (event, message) => emitted.push({ event, message }),
  };
  (
    sdk as unknown as {
      state: { clientId: string | null; status: string };
    }
  ).state = {
    clientId: 'client-1',
    status: 'connected',
    timeSync: sdk.getState().timeSync,
    error: null,
  } as never;

  sdk.sendClientPermissions({
    microphone: 'granted',
    motion: 'denied',
    camera: 'pending',
  });

  assert.equal(emitted.length, 1);
  assert.deepEqual(emitted[0], {
    event: 'msg',
    message: {
      type: 'system',
      version: 1,
      action: 'clientPermissions',
      payload: {
        permissions: {
          microphone: 'granted',
          motion: 'denied',
          camera: 'pending',
        },
      },
      clientTimestamp: (emitted[0] as { message: { clientTimestamp: number } }).message.clientTimestamp,
    },
  });
});

test('ClientSDK emits boolean variable updates with target client ids', () => {
  const sdk = new ClientSDK({ serverUrl: 'http://localhost:3001' });
  const emitted: unknown[] = [];

  (
    sdk as unknown as {
      socket: { connected: boolean; emit: (event: string, message: unknown) => void };
      state: { clientId: string | null; status: string };
    }
  ).socket = {
    connected: true,
    emit: (event, message) => emitted.push({ event, message }),
  };
  (
    sdk as unknown as {
      state: { clientId: string | null; status: string };
    }
  ).state = {
    clientId: 'client-1',
    status: 'connected',
    timeSync: sdk.getState().timeSync,
    error: null,
  } as never;

  sdk.sendBooleanVariableUpdates({ visible: true }, ['client-b', 'client-a', 'client-a']);

  assert.equal(emitted.length, 1);
  assert.deepEqual(emitted[0], {
    event: 'msg',
    message: {
      type: 'system',
      version: 1,
      action: 'booleanVariables.update',
      payload: {
        updates: { visible: true },
        clientIds: ['client-a', 'client-b'],
      },
      clientTimestamp: (emitted[0] as { message: { clientTimestamp: number } }).message.clientTimestamp,
    },
  });
});
