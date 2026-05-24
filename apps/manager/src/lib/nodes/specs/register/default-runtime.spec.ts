// Purpose: Regression coverage for manager-side default runtime command routing.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { get } from 'svelte/store';
import { NodeRuntime } from '@shugu/node-core';
import type { ControlAction, ControlPayload, TargetSelector } from '@shugu/protocol';

import { nodeRegistry } from '../../registry';
import { state } from '$lib/stores/manager';
import { setManagerSDK } from '$lib/stores/manager-sdk-access';
import { registerDefaultRuntimeNodes } from './default-runtime';

registerDefaultRuntimeNodes();

test('manager runtime registry includes Arduino UNO plugin nodes', () => {
  const pwm = nodeRegistry.get('plugin:arduino-uno:pwm');
  const digital = nodeRegistry.get('plugin:arduino-uno:digital');

  assert.equal(pwm?.label, 'Uno Pwm');
  assert.equal(digital?.label, 'Uno Number');
  assert.equal(pwm?.metadata?.permissions.includes('hardware:serial'), true);
});

type SentControl = {
  target: TargetSelector;
  action: ControlAction;
  payload: ControlPayload;
  executeAt?: number;
};

const waitFor = async (predicate: () => boolean, timeoutMs = 600): Promise<void> => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

test('manager client loader selects a client collection and executor routes commands', async () => {
  const sent: SentControl[] = [];
  const previousState = get(state);
  state.set({
    ...previousState,
    status: 'connected',
    clients: [
      { clientId: 'client-a', connected: true, group: 'client:client-a' },
      { clientId: 'client-b', connected: true, group: 'client:client-b' },
    ],
    selectedClientIds: [],
  });
  setManagerSDK({
    sendControl: (target: TargetSelector, action: ControlAction, payload: ControlPayload, executeAt?: number) => {
      sent.push({ target, action, payload, executeAt });
    },
  } as never);

  const runtime = new NodeRuntime(nodeRegistry);
  runtime.loadGraph({
    nodes: [
      {
        id: 'synth',
        type: 'proc-synth-update',
        position: { x: 0, y: 0 },
        config: {},
        inputValues: { active: true, frequency: 440, volume: 0.7, waveform: 'square', durationMs: 200 },
        outputValues: {},
      },
      {
        id: 'loader',
        type: 'client-loader',
        position: { x: 0, y: 0 },
        config: {},
        inputValues: { index: 1, range: 2, random: false },
        outputValues: {},
      },
      {
        id: 'executor',
        type: 'client-executor',
        position: { x: 0, y: 0 },
        config: {},
        inputValues: {},
        outputValues: {},
      },
    ],
    connections: [
      {
        id: 'c1',
        sourceNodeId: 'synth',
        sourcePortId: 'cmd',
        targetNodeId: 'executor',
        targetPortId: 'in',
      },
      {
        id: 'c2',
        sourceNodeId: 'loader',
        sourcePortId: 'client',
        targetNodeId: 'executor',
        targetPortId: 'client',
      },
    ],
  });

  try {
    runtime.start();
    await waitFor(() => sent.filter((entry) => entry.payload.frequency === 440).length >= 2);

    const synth = runtime.getNode('synth');
    assert.ok(synth);
    synth.inputValues.frequency = 880;

    await waitFor(() => sent.filter((entry) => entry.payload.frequency === 880).length >= 2);
  } finally {
    runtime.stop();
    setManagerSDK(null);
    state.set(previousState);
  }

  const updated = sent.filter((entry) => entry.payload.frequency === 880);
  assert.equal(updated.length, 2);
  assert.deepEqual(
    updated.map((entry) => entry.target),
    [{ mode: 'group', groupId: 'client:client-a' }, { mode: 'group', groupId: 'client:client-b' }]
  );
  assert.ok(updated.every((entry) => entry.action === 'modulateSoundUpdate'));
});

test('manager default runtime registers client loader and executor nodes', () => {
  const previousState = get(state);
  state.set({
    ...previousState,
    status: 'connected',
    clients: [
      { clientId: 'client-a', connected: true, group: 'client:client-a', connectedAt: 1 },
    ],
    selectedClientIds: [],
  });

  try {
    assert.equal(nodeRegistry.get('client-object'), undefined);
    assert.equal(nodeRegistry.get('client-loader')?.label, 'Client Loader');
    assert.equal(nodeRegistry.get('client-executor')?.label, 'Client Executor');
    assert.equal(nodeRegistry.get('url-session')?.label, 'URL Session');
    assert.equal(nodeRegistry.get('url-to-qr-generator')?.label, 'URL to QR Generator');
    assert.equal(nodeRegistry.get('client-url-session-filter')?.label, 'Client Filter for URL Session');
  } finally {
    state.set(previousState);
  }
});

test('manager default runtime filters clients by url session id', () => {
  const previousState = get(state);
  state.set({
    ...previousState,
    status: 'connected',
    clients: [
      { clientId: 'client-a', connected: true, group: 'client:client-a', connectedAt: 1, urlSessionId: 'session-a' },
      { clientId: 'client-b', connected: true, group: 'client:client-b', connectedAt: 2, urlSessionId: 'session-b' },
    ],
    selectedClientIds: [],
  });

  try {
    const node = nodeRegistry.get('client-url-session-filter');
    assert.ok(node);
    const result = node.process(
      { sessionId: 'session-a' },
      {},
      { nodeId: 'filter', time: 0, deltaTime: 0 }
    );
    assert.deepEqual(result.indexs, ['client-a']);
    assert.deepEqual(result.rejectedIndexs, ['client-b']);
    assert.equal((result.client as { clientId?: string }).clientId, 'client-a');
  } finally {
    state.set(previousState);
  }
});
