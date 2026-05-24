// Purpose: Verify NodeCanvas lifecycle subscriptions bridge local graph edits to server semantic commands.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writable } from 'svelte/store';

import {
  bindGraphStateSubscription,
  bindLocalSemanticGraphChangeSubscription,
  bindManagerClientSubscription,
} from './subscriptions';

test('bindLocalSemanticGraphChangeSubscription does not mirror graph-change echoes into semantic commands', () => {
  const graphChanges = writable<unknown[]>([]);
  const params: unknown[] = [];
  const inputs: unknown[] = [];

  const unsubscribe = bindLocalSemanticGraphChangeSubscription({
    graphChangesStore: graphChanges,
    canvasCommands: {
      setNodeParams: (nodeId, patch) => {
        params.push({ nodeId, patch });
        return true;
      },
      setNodeInputs: (nodeId, patch) => {
        inputs.push({ nodeId, patch });
        return true;
      },
    },
    isSyncingGraph: () => false,
  });

  graphChanges.set([
    { type: 'update-node-config', nodeId: 'n1', config: { value: 9 } },
    { type: 'update-node-input-values', nodeId: 'n1', inputValues: { value: 10 } },
  ]);

  unsubscribe?.();
  assert.deepEqual(params, []);
  assert.deepEqual(inputs, []);
});

test('bindLocalSemanticGraphChangeSubscription ignores changes caused by server graph sync', () => {
  const graphChanges = writable<unknown[]>([]);
  const params: unknown[] = [];

  const unsubscribe = bindLocalSemanticGraphChangeSubscription({
    graphChangesStore: graphChanges,
    canvasCommands: {
      setNodeParams: (nodeId, patch) => {
        params.push({ nodeId, patch });
        return true;
      },
    },
    isSyncingGraph: () => true,
  });

  graphChanges.set([{ type: 'update-node-config', nodeId: 'n1', config: { value: 9 } }]);

  unsubscribe?.();
  assert.deepEqual(params, []);
});

test('bindLocalSemanticGraphChangeSubscription ignores stale changes replayed on initial subscription', () => {
  const graphChanges = writable<unknown[]>([
    { type: 'update-node-config', nodeId: 'n1', config: { value: 9 } },
  ]);
  const params: unknown[] = [];

  const unsubscribe = bindLocalSemanticGraphChangeSubscription({
    graphChangesStore: graphChanges,
    canvasCommands: {
      setNodeParams: (nodeId, patch) => {
        params.push({ nodeId, patch });
        return true;
      },
    },
    isSyncingGraph: () => false,
  });

  assert.deepEqual(params, []);

  graphChanges.set([{ type: 'update-node-config', nodeId: 'n1', config: { value: 10 } }]);

  unsubscribe?.();
  assert.deepEqual(params, []);
});

test('bindGraphStateSubscription syncs the view but suppresses graph-derived writes while server semantic sync is applying', () => {
  const graphState = writable({ nodes: [], connections: [] });
  const graphSyncCalls: unknown[] = [];
  const patchRuntimeCalls: string[] = [];

  const unsubscribe = bindGraphStateSubscription({
    graphStateStore: graphState,
    graphSync: { schedule: (state: unknown) => graphSyncCalls.push(state) },
    groupController: { reconcileGraphNodes: () => [] },
    groupPortNodesController: {
      removeGroupPortNodesForGroupIds: () => 0,
      scheduleNormalizeProxies: () => patchRuntimeCalls.push('normalize'),
    },
    patchRuntime: { onGraphStateChanged: () => patchRuntimeCalls.push('patch') },
    syncCustomGateInputs: () => patchRuntimeCalls.push('gate'),
    rehydrateExpandedCustomFrames: () => patchRuntimeCalls.push('rehydrate'),
    isApplyingServerSemanticSnapshot: () => true,
  });

  graphState.set({
    nodes: [{ id: 'n1', type: 'number', position: { x: 0, y: 0 }, config: {}, inputValues: {}, outputValues: {} }],
    connections: [],
  });

  unsubscribe?.();
  assert.equal(graphSyncCalls.length, 2);
  assert.deepEqual(patchRuntimeCalls, []);
});

test('bindGraphStateSubscription skips patch reconcile for param-only graph updates', () => {
  const graphState = writable({
    nodes: [
      {
        id: 'n1',
        type: 'number',
        position: { x: 0, y: 0 },
        config: { value: 1 },
        inputValues: {},
        outputValues: {},
      },
    ],
    connections: [],
  });
  const patchRuntimeCalls: string[] = [];

  const unsubscribe = bindGraphStateSubscription({
    graphStateStore: graphState,
    graphSync: { schedule: () => undefined },
    groupController: { reconcileGraphNodes: () => [] },
    groupPortNodesController: {
      removeGroupPortNodesForGroupIds: () => 0,
      scheduleNormalizeProxies: () => patchRuntimeCalls.push('normalize'),
    },
    patchRuntime: { onGraphStateChanged: () => patchRuntimeCalls.push('patch') },
    syncCustomGateInputs: () => undefined,
    rehydrateExpandedCustomFrames: () => undefined,
    isApplyingServerSemanticSnapshot: () => false,
  });
  patchRuntimeCalls.length = 0;

  graphState.set({
    nodes: [
      {
        id: 'n1',
        type: 'number',
        position: { x: 0, y: 0 },
        config: { value: 2 },
        inputValues: {},
        outputValues: {},
      },
    ],
    connections: [],
  });

  unsubscribe?.();
  assert.deepEqual(patchRuntimeCalls, []);
});

test('bindGraphStateSubscription reconciles patch runtime when custom node gate config changes', () => {
  const graphState = writable({
    nodes: [
      {
        id: 'custom-1',
        type: 'custom:def-1',
        position: { x: 0, y: 0 },
        config: {
          customNode: {
            definitionId: 'def-1',
            groupId: 'group-1',
            role: 'mother',
            manualGate: false,
            internal: { nodes: [], connections: [] },
          },
        },
        inputValues: { gate: false },
        outputValues: {},
      },
    ],
    connections: [],
  });
  const patchRuntimeCalls: string[] = [];

  const unsubscribe = bindGraphStateSubscription({
    graphStateStore: graphState,
    graphSync: { schedule: () => undefined },
    groupController: { reconcileGraphNodes: () => [] },
    groupPortNodesController: {
      removeGroupPortNodesForGroupIds: () => 0,
      scheduleNormalizeProxies: () => patchRuntimeCalls.push('normalize'),
    },
    patchRuntime: { onGraphStateChanged: () => patchRuntimeCalls.push('patch') },
    syncCustomGateInputs: () => undefined,
    rehydrateExpandedCustomFrames: () => undefined,
    isApplyingServerSemanticSnapshot: () => false,
  });
  patchRuntimeCalls.length = 0;

  graphState.set({
    nodes: [
      {
        id: 'custom-1',
        type: 'custom:def-1',
        position: { x: 0, y: 0 },
        config: {
          customNode: {
            definitionId: 'def-1',
            groupId: 'group-1',
            role: 'mother',
            manualGate: true,
            internal: { nodes: [], connections: [] },
          },
        },
        inputValues: { gate: true },
        outputValues: {},
      },
    ],
    connections: [],
  });

  unsubscribe?.();
  assert.deepEqual(patchRuntimeCalls, ['patch']);
});

test('bindManagerClientSubscription refreshes graph runtime when client permissions change', () => {
  const managerState = writable({
    clients: [
      {
        clientId: 'client-a',
        group: 'audience',
        connected: true,
        permissions: { camera: 'denied' },
      },
    ],
  });
  const graphState = writable({ nodes: [], connections: [] });
  const graphSyncCalls: unknown[] = [];
  const reconcileCalls: string[] = [];
  let syncClientNodeCalls = 0;

  const unsubscribe = bindManagerClientSubscription({
    managerState,
    graphStateStore: graphState,
    graphSync: { schedule: (state: unknown) => graphSyncCalls.push(state) },
    nodeEngine: {
      getNode: () => null,
      updateNodeConfig: () => undefined,
      tickTime: { set: () => undefined },
    },
    schedulePatchReconcile: (reason: string) => reconcileCalls.push(reason),
    syncClientNodesFromInputs: () => {
      syncClientNodeCalls += 1;
    },
  });

  graphSyncCalls.length = 0;
  reconcileCalls.length = 0;
  syncClientNodeCalls = 0;

  managerState.set({
    clients: [
      {
        clientId: 'client-a',
        group: 'audience',
        connected: true,
        permissions: { camera: 'granted' },
      },
    ],
  });

  unsubscribe?.();
  assert.deepEqual(reconcileCalls, ['manager-state']);
  assert.equal(graphSyncCalls.length, 1);
  assert.equal(syncClientNodeCalls, 1);
});

test('bindManagerClientSubscription refreshes graph runtime when client url session changes', () => {
  const managerState = writable({
    clients: [
      {
        clientId: 'client-a',
        group: 'audience',
        connected: true,
        urlSessionId: 'session-a',
      },
    ],
  });
  const graphState = writable({ nodes: [], connections: [] });
  const graphSyncCalls: unknown[] = [];
  const reconcileCalls: string[] = [];
  let syncClientNodeCalls = 0;

  const unsubscribe = bindManagerClientSubscription({
    managerState,
    graphStateStore: graphState,
    graphSync: { schedule: (state: unknown) => graphSyncCalls.push(state) },
    nodeEngine: {
      getNode: () => null,
      updateNodeConfig: () => undefined,
      tickTime: { set: () => undefined },
    },
    schedulePatchReconcile: (reason: string) => reconcileCalls.push(reason),
    syncClientNodesFromInputs: () => {
      syncClientNodeCalls += 1;
    },
  });

  graphSyncCalls.length = 0;
  reconcileCalls.length = 0;
  syncClientNodeCalls = 0;

  managerState.set({
    clients: [
      {
        clientId: 'client-a',
        group: 'audience',
        connected: true,
        urlSessionId: 'session-b',
      },
    ],
  });

  unsubscribe?.();
  assert.deepEqual(reconcileCalls, ['manager-state']);
  assert.equal(graphSyncCalls.length, 1);
  assert.equal(syncClientNodeCalls, 1);
});
