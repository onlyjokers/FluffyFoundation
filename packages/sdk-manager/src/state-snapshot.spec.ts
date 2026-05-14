/**
 * Purpose: FF-06 tests for manager state snapshot reconciliation.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ManagerSDK } from './manager-sdk.js';

function managerState(sdk: ManagerSDK) {
  return sdk.getState();
}

test('ManagerSDK adopts server control-plane snapshot selection and state strategy', () => {
  const sdk = new ManagerSDK({ serverUrl: 'http://localhost:3001' });

  (
    sdk as unknown as {
      handleSystemMessage: (message: unknown) => void;
    }
  ).handleSystemMessage({
    type: 'system',
    version: 1,
    serverTimestamp: 123,
    action: 'clientList',
    payload: {
      clients: [
        { clientId: 'client-1', connectedAt: 10, selected: false },
        { clientId: 'client-2', connectedAt: 11, selected: false },
      ],
      stateStrategy: { mode: 'single-server' },
      controlPlane: {
        strategy: 'single-server',
        selection: {
          selectedClientIds: ['client-2'],
          revision: 4,
        },
        ownership: {
          default: {
            owner: 'server-process',
            selectedClientIds: ['client-2'],
          },
        },
      },
    },
  });

  assert.deepEqual(managerState(sdk).stateStrategy, { mode: 'single-server' });
  assert.deepEqual(managerState(sdk).selectedClientIds, ['client-2']);
  assert.equal(managerState(sdk).controlPlane?.selection.revision, 4);
});

test('ManagerSDK rejects silent ownership divergence between clients and control-plane snapshot', () => {
  const sdk = new ManagerSDK({ serverUrl: 'http://localhost:3001' });

  (
    sdk as unknown as {
      handleSystemMessage: (message: unknown) => void;
    }
  ).handleSystemMessage({
    type: 'system',
    version: 1,
    serverTimestamp: 123,
    action: 'clientList',
    payload: {
      clients: [{ clientId: 'client-1', connectedAt: 10, selected: true }],
      stateStrategy: { mode: 'single-server' },
      controlPlane: {
        strategy: 'single-server',
        selection: {
          selectedClientIds: [],
          revision: 5,
        },
        ownership: {},
      },
    },
  });

  assert.equal(managerState(sdk).error, 'Control-plane snapshot divergence: selected clients differ from registry clients.');
  assert.deepEqual(managerState(sdk).selectedClientIds, []);
});

test('ManagerSDK applies incremental client presence while full list update is delayed', () => {
  const sdk = new ManagerSDK({ serverUrl: 'http://localhost:3001' });

  (
    sdk as unknown as {
      handleSystemMessage: (message: unknown) => void;
    }
  ).handleSystemMessage({
    type: 'system',
    version: 1,
    serverTimestamp: 456,
    action: 'clientJoined',
    payload: {
      clientId: 'client-joined',
    },
  });

  assert.deepEqual(managerState(sdk).clients, [
    {
      clientId: 'client-joined',
      connectedAt: 456,
      connected: true,
      selected: false,
    },
  ]);

  (
    sdk as unknown as {
      handleSystemMessage: (message: unknown) => void;
    }
  ).handleSystemMessage({
    type: 'system',
    version: 1,
    serverTimestamp: 789,
    action: 'clientLeft',
    payload: {
      clientId: 'client-joined',
    },
  });

  assert.deepEqual(managerState(sdk).clients, []);
});
