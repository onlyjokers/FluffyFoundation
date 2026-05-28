// Purpose: Regression tests for Manager asset manifest delivery to runtime clients.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ManagerSDK } from '@shugu/sdk-manager';

import { nodeEngine } from './engine';
import { registerDefaultRuntimeNodes } from './specs/register/default-runtime';
import { state as managerState } from '$lib/stores/manager';
import { setManagerSDK } from '$lib/stores/manager-sdk-access';

registerDefaultRuntimeNodes();
await import('./asset-manifest');

const waitFor = async (predicate: () => boolean, timeoutMs = 1000): Promise<void> => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

test('asset manifest configure targets each managed client group', async () => {
  const sent: Array<{ target: unknown; pluginName: string; command: string; payload: unknown }> = [];
  setManagerSDK({
    sendPluginControl: (target, pluginName, command, payload) => {
      sent.push({ target, pluginName, command, payload });
    },
  } as unknown as ManagerSDK);

  try {
    nodeEngine.loadGraph({
      nodes: [
        {
          id: 'audio',
          type: 'load-audio-from-assets',
          position: { x: 0, y: 0 },
          config: { assetId: 'asset-audio-1' },
          inputValues: {},
          outputValues: {},
        },
      ],
      connections: [],
    });
    managerState.set({
      status: 'connected',
      managerId: 'manager-1',
      clients: [
        { clientId: 'c_1', group: 'audience', connected: true },
        { clientId: 'c_2', group: 'audience', connected: true },
      ],
      selectedClientIds: ['c_1', 'c_2'],
      timeSync: {
        offset: 0,
        samples: [],
        maxSamples: 10,
        initialized: false,
        lastSyncTime: 0,
      },
      error: null,
    });

    await waitFor(() => sent.length >= 1);

    assert.deepEqual(
      sent.map((message) => message.target),
      [
        { mode: 'group', groupId: 'client:c_1' },
        { mode: 'group', groupId: 'client:c_2' },
      ]
    );
    assert.deepEqual(
      sent.map((message) => [message.pluginName, message.command]),
      [
        ['multimedia-core', 'configure'],
        ['multimedia-core', 'configure'],
      ]
    );
  } finally {
    setManagerSDK(null);
    nodeEngine.loadGraph({ nodes: [], connections: [] });
    managerState.set({
      status: 'disconnected',
      managerId: null,
      clients: [],
      selectedClientIds: [],
      timeSync: {
        offset: 0,
        samples: [],
        maxSamples: 10,
        initialized: false,
        lastSyncTime: 0,
      },
      error: null,
    });
  }
});
