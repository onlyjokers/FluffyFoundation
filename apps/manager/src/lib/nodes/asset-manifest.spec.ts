// Purpose: Regression tests for Manager asset manifest delivery to runtime clients.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ManagerSDK } from '@shugu/sdk-manager';

import { nodeEngine } from './engine';
import { registerDefaultRuntimeNodes } from './specs/register/default-runtime';
import { state as managerState } from '$lib/stores/manager';
import { assetsStore, type AssetRecord } from '$lib/stores/assets';
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

const imageAsset = (sha256: string): AssetRecord => ({
  id: 'asset-image-refresh',
  kind: 'image',
  mimeType: 'image/png',
  sizeBytes: 4,
  sha256,
  originalName: 'image.png',
  createdAt: 100,
  updatedAt: Date.now(),
  variants: [],
  cachePolicy: { strategy: 'revalidate' },
  permissions: { scope: 'server-deliverable' },
});

function firstChecksum(payload: unknown): string | undefined {
  const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const entries = Array.isArray(record.entries) ? record.entries : [];
  return (entries[0] as { checksum?: { value?: string } } | undefined)?.checksum?.value;
}

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

test('asset manifest configure is resent when an existing asset checksum changes', async () => {
  const originalFetch = globalThis.fetch;
  const sent: Array<{ target: unknown; pluginName: string; command: string; payload: unknown }> = [];
  let sha = 'a'.repeat(64);
  setManagerSDK({
    sendPluginControl: (target, pluginName, command, payload) => {
      sent.push({ target, pluginName, command, payload });
    },
  } as unknown as ManagerSDK);
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ assets: [imageAsset(sha)] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;

  try {
    nodeEngine.loadGraph({
      nodes: [
        {
          id: 'image',
          type: 'load-image-from-assets',
          position: { x: 0, y: 0 },
          config: { assetId: 'asset-image-refresh' },
          inputValues: {},
          outputValues: {},
        },
      ],
      connections: [],
    });
    managerState.set({
      status: 'connected',
      managerId: 'manager-1',
      clients: [{ clientId: 'c_manifest_refresh', group: 'audience', connected: true }],
      selectedClientIds: ['c_manifest_refresh'],
      timeSync: {
        offset: 0,
        samples: [],
        maxSamples: 10,
        initialized: false,
        lastSyncTime: 0,
      },
      error: null,
    });

    await assetsStore.refresh({ serverUrl: 'https://server.test' });
    await waitFor(() => sent.some((message) => firstChecksum(message.payload) === sha));
    const firstPayload = sent.find((message) => firstChecksum(message.payload) === sha)
      ?.payload as { manifestId?: string };

    sha = 'b'.repeat(64);
    await assetsStore.refresh({ serverUrl: 'https://server.test' });
    await waitFor(() => sent.some((message) => firstChecksum(message.payload) === sha));
    const secondPayload = sent.find((message) => firstChecksum(message.payload) === sha)
      ?.payload as { manifestId?: string };

    assert.notEqual(secondPayload.manifestId, firstPayload.manifestId);
  } finally {
    globalThis.fetch = originalFetch;
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
