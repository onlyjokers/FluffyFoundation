// Purpose: Regression coverage for explicit semantic sync from client picker user actions.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readable } from 'svelte/store';

import { createClientSelectionBinding } from './client-selection-binding';
import type { GraphState, NodeInstance } from '$lib/nodes/types';

const clientNode = (): NodeInstance => ({
  id: 'client-node',
  type: 'client-loader',
  position: { x: 0, y: 0 },
  config: { clientId: 'client-a' },
  inputValues: { index: 1, range: 1 },
  outputValues: {},
});

function createHarness() {
  const node = clientNode();
  const graph: GraphState = {
    nodes: [node],
    connections: [],
  };
  const configPatches: Array<Record<string, unknown>> = [];
  const inputPatches: Array<Record<string, unknown>> = [];
  const reconcileCalls: string[] = [];

  const binding = createClientSelectionBinding({
    nodeEngine: {
      getNode: () => node,
      getLastComputedInputs: () => null,
      updateNodeConfig: (_nodeId, patch) => {
        configPatches.push(patch);
        node.config = { ...(node.config ?? {}), ...patch };
      },
      updateNodeInputValue: (_nodeId, portId, value) => {
        inputPatches.push({ [portId]: value });
        node.inputValues = { ...(node.inputValues ?? {}), [portId]: value };
      },
      tickTime: { set: () => undefined },
    },
    graphStateStore: readable(graph),
    getGraphState: () => graph,
    managerState: readable({
      clients: [
        { clientId: 'client-a', group: 'audience', connected: true },
        { clientId: 'client-b', group: 'audience', connected: true },
      ],
    }),
    sensorData: readable(new Map()),
    getAreaPlugin: () => null,
    getNodeMap: () => new Map(),
    sendNodeOverride: () => undefined,
    sendSemanticNodeParams: (_nodeId, patch) => configPatches.push({ semantic: patch }),
    sendSemanticNodeInputs: (_nodeId, patch) => inputPatches.push({ semantic: patch }),
    schedulePatchReconcile: (reason) => reconcileCalls.push(reason),
  });

  return { binding, configPatches, inputPatches, reconcileCalls };
}

test('client picker user selection dispatches semantic config and input updates', async () => {
  const { binding, configPatches, inputPatches } = createHarness();

  await binding.applyClientNodeSelection('client-node', { clientId: 'client-b' });

  assert.deepEqual(inputPatches, [{ range: 2 }, { semantic: { range: 2 } }]);
  assert.deepEqual(configPatches, []);
});

test('client input auto sync does not dispatch semantic commands', () => {
  const { binding, inputPatches } = createHarness();

  binding.syncClientNodesFromInputs();

  assert.deepEqual(inputPatches, []);
});

test('client picker user selection immediately reconciles patch routing', async () => {
  const { binding, reconcileCalls } = createHarness();

  await binding.applyClientNodeSelection('client-node', { clientId: 'client-b' });

  assert.deepEqual(reconcileCalls, ['client-selection']);
});

test('client loader loadAll input syncs output values to every audience client', () => {
  const node = clientNode();
  node.inputValues = { loadAll: true, index: 2, range: 1, random: false };
  const graph: GraphState = { nodes: [node], connections: [] };
  const bindingWithLoadAll = createClientSelectionBinding({
    nodeEngine: {
      getNode: () => node,
      getLastComputedInputs: () => null,
      updateNodeConfig: (_nodeId, patch) => {
        node.config = { ...(node.config ?? {}), ...patch };
      },
      updateNodeInputValue: (_nodeId, portId, value) => {
        node.inputValues = { ...(node.inputValues ?? {}), [portId]: value };
      },
      tickTime: { set: () => undefined },
    },
    graphStateStore: readable(graph),
    getGraphState: () => graph,
    managerState: readable({
      clients: [
        { clientId: 'client-a', group: 'audience', connected: true },
        { clientId: 'client-b', group: 'audience', connected: true },
      ],
    }),
    sensorData: readable(new Map()),
    getAreaPlugin: () => null,
    getNodeMap: () => new Map(),
    sendNodeOverride: () => undefined,
  });

  bindingWithLoadAll.syncClientNodesFromInputs();

  assert.deepEqual(node.outputValues.indexs, ['client-a', 'client-b']);
  assert.equal(node.outputValues.number, 2);
  assert.deepEqual(node.outputValues.client, {
    clientId: 'client-a',
    clientIds: ['client-a', 'client-b'],
    sensors: null,
  });
});
