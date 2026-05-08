// Purpose: FF-18 GS-12 tests for Node Graph loop deployment command targets.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createLoopActions, type ManagerSdkLike } from './loop-helpers';
import type { LocalLoop } from '$lib/nodes';
import type { GraphState } from '$lib/nodes/types';

function createHarness() {
  const deployed = new Set<string>();
  const sent: { target: unknown; plugin: string; event: string; payload: Record<string, unknown> }[] = [];
  const sdk: ManagerSdkLike = {
    sendPluginControl: (target, plugin, event, payload) => sent.push({ target, plugin, event, payload }),
    stopSound: () => undefined,
    stopMedia: () => undefined,
    hideImage: () => undefined,
    flashlight: () => undefined,
    screenColor: () => undefined,
  };
  const graph: Pick<GraphState, 'nodes'> = {
    nodes: [
      {
        id: 'client-node',
        type: 'client-object',
        position: { x: 0, y: 0 },
        config: { clientId: 'client-1' },
        inputValues: {},
        outputValues: {},
      },
    ],
  };
  const loop: LocalLoop = {
    id: 'loop:client-node',
    nodeIds: ['client-node', 'sensor-node', 'flashlight-node'],
    connectionIds: [],
    clientsInvolved: ['client-node'],
    requiredCapabilities: ['flashlight', 'sensors'],
  };
  const actions = createLoopActions({
    getSDK: () => sdk,
    getGraphState: () => graph,
    getLocalLoops: () => [loop],
    getDeployedLoopIds: () => deployed,
    getDeployPendingByLoopId: () => new Map(),
    getDeployedLoopClientIdByLoopId: () => new Map(),
    setDeployPendingByLoopId: () => undefined,
    setDeployedLoopClientIdByLoopId: () => undefined,
    markLoopDeployed: (loopId, isDeployed) => {
      if (isDeployed) {
        deployed.add(loopId);
      } else {
        deployed.delete(loopId);
      }
    },
    exportGraphForLoop: () => ({
      graph: { nodes: [], connections: [] },
      meta: {
        loopId: loop.id,
        requiredCapabilities: loop.requiredCapabilities,
        tickIntervalMs: 100,
        protocolVersion: 1,
        executorVersion: 'node-executor-v1',
      },
    }),
    isRunning: () => true,
  });

  return { actions, deployed, loop, sent };
}

test('deployLoop targets the managed client group instead of explicit client IDs', () => {
  const { actions, loop, sent } = createHarness();

  actions.deployLoop(loop);

  assert.equal(sent.length, 2);
  assert.equal(sent[0].plugin, 'node-executor');
  assert.equal(sent[0].event, 'reclaim');
  assert.deepEqual(sent[0].target, { mode: 'group', groupId: 'client:client-1' });
  assert.deepEqual(sent[0].payload, {});
  assert.equal(sent[1].plugin, 'node-executor');
  assert.equal(sent[1].event, 'deploy');
  assert.deepEqual(sent[1].target, { mode: 'group', groupId: 'client:client-1' });
});

test('stopLoop targets the managed client group instead of explicit client IDs', () => {
  const { actions, deployed, loop, sent } = createHarness();
  deployed.add(loop.id);

  actions.stopLoop(loop);

  assert.equal(sent.length, 1);
  assert.equal(sent[0].plugin, 'node-executor');
  assert.equal(sent[0].event, 'stop');
  assert.deepEqual(sent[0].target, { mode: 'group', groupId: 'client:client-1' });
  assert.deepEqual(sent[0].payload, { loopId: loop.id });
  assert.equal(deployed.has(loop.id), false);
});

test('removeLoop targets the managed client group instead of explicit client IDs', () => {
  const { actions, deployed, loop, sent } = createHarness();
  deployed.add(loop.id);

  actions.removeLoop(loop);

  assert.equal(sent.length, 1);
  assert.equal(sent[0].plugin, 'node-executor');
  assert.equal(sent[0].event, 'remove');
  assert.deepEqual(sent[0].target, { mode: 'group', groupId: 'client:client-1' });
  assert.deepEqual(sent[0].payload, { loopId: loop.id });
  assert.equal(deployed.has(loop.id), false);
});

test('stopAndRemoveLoopById targets the managed client group for both commands', () => {
  const { actions, loop, sent } = createHarness();

  actions.stopAndRemoveLoopById(loop.id, 'client-1');

  assert.equal(sent.length, 2);
  assert.deepEqual(
    sent.map((entry) => entry.event),
    ['stop', 'remove']
  );
  assert.deepEqual(
    sent.map((entry) => entry.target),
    [
      { mode: 'group', groupId: 'client:client-1' },
      { mode: 'group', groupId: 'client:client-1' },
    ]
  );
  assert.deepEqual(
    sent.map((entry) => entry.payload),
    [{ loopId: loop.id }, { loopId: loop.id }]
  );
});
