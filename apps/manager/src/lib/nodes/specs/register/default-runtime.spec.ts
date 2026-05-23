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

test('manager default runtime sends updated synth commands through managed client group target', async () => {
  const sent: SentControl[] = [];
  const previousState = get(state);
  state.set({
    ...previousState,
    status: 'connected',
    clients: [{ clientId: 'client-a', connected: true, group: 'client:client-a' }],
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
        id: 'client',
        type: 'client-object',
        position: { x: 0, y: 0 },
        config: { clientId: 'client-a' },
        inputValues: { index: 1, range: 1, random: false },
        outputValues: {},
      },
    ],
    connections: [
      {
        id: 'c1',
        sourceNodeId: 'synth',
        sourcePortId: 'cmd',
        targetNodeId: 'client',
        targetPortId: 'in',
      },
    ],
  });

  try {
    runtime.start();
    await waitFor(() => sent.some((entry) => entry.payload.frequency === 440));

    const synth = runtime.getNode('synth');
    assert.ok(synth);
    synth.inputValues.frequency = 880;

    await waitFor(() => sent.some((entry) => entry.payload.frequency === 880));
  } finally {
    runtime.stop();
    setManagerSDK(null);
    state.set(previousState);
  }

  const updated = sent.find((entry) => entry.payload.frequency === 880);
  assert.ok(updated);
  assert.deepEqual(updated.target, { mode: 'group', groupId: 'client:client-a' });
  assert.equal(updated.action, 'modulateSoundUpdate');
});

test('manager default runtime filters clients by permission snapshots', () => {
  const previousState = get(state);
  state.set({
    ...previousState,
    status: 'connected',
    clients: [
      {
        clientId: 'client-a',
        connected: true,
        group: 'client:client-a',
        connectedAt: 1,
        permissions: { microphone: 'granted', motion: 'granted' },
      },
      {
        clientId: 'client-b',
        connected: true,
        group: 'client:client-b',
        connectedAt: 2,
        permissions: { microphone: 'granted', motion: 'denied' },
      },
      {
        clientId: 'display-1',
        connected: true,
        group: 'display',
        connectedAt: 3,
        permissions: { microphone: 'granted', motion: 'granted' },
      },
    ],
    selectedClientIds: [],
  });

  try {
    const def = nodeRegistry.get('client-permission-filter');
    assert.ok(def);
    assert.deepEqual(
      def.process(
        {},
        { microphone: true, motion: true, matchMode: 'all' },
        { nodeId: 'filter', time: 0, deltaTime: 0 }
      ),
      { indexs: ['client-a'], number: 1, rejectedIndexs: ['client-b'] }
    );
  } finally {
    state.set(previousState);
  }
});
